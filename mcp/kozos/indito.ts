// Szerver indítása a két szabványos MCP átvitellel:
//   stdio            – helyi kliensek (Claude Desktop/Code, saját helyi ágens): `… --stdio`
//   Streamable HTTP  – hálózati elérés: http://127.0.0.1:<port>/mcp, Bearer tokennel
// A HTTP rész a hivatalos SDK példája (simpleStreamableHttp) szerinti munkamenet-kezelést követi.

import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { ROLES } from './kanonikus'
import { log } from './kornyezet'

type Tokenek = Map<string, { role: string; clientId: string }>

/** MCP_TOKENS="token:szerepkor:kliens,token2:szerepkor2:kliens2" */
function tokenekBetoltese(): Tokenek {
  const map: Tokenek = new Map()
  for (const elem of (process.env.MCP_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [token, role, clientId] = elem.split(':')
    if (!token || !(ROLES as readonly string[]).includes(role)) {
      log(`ervenytelen MCP_TOKENS elem kihagyva (szerepkor: ${role})`)
      continue
    }
    map.set(token, { role, clientId: clientId || role })
  }
  return map
}

function jsonRpcHiba(res: Response, status: number, message: string) {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null })
}

export async function inditas(opts: { nev: string; port: number; letrehoz: () => McpServer }) {
  if (process.argv.includes('--stdio')) {
    await opts.letrehoz().connect(new StdioServerTransport())
    log(`${opts.nev}: stdio atvitel, szerepkor: ${process.env.MCP_STDIO_ROLE ?? 'viewer'}`)
    return
  }

  // --port=NNNN: felülírja az alapértelmezett portot (pl. a füstteszt saját példányához)
  const portArg = process.argv.find((a) => a.startsWith('--port='))
  const port = portArg ? Number(portArg.slice(7)) : opts.port

  const tokenek = tokenekBetoltese()
  if (tokenek.size === 0) log('FIGYELEM: nincs MCP_TOKENS – HTTP-n senki nem tud csatlakozni')

  const app = createMcpExpressApp({ host: '127.0.0.1' })

  // Hitelesítés: Bearer token → szerepkör; a req.auth-ot a transport továbbadja az eszközöknek (extra.authInfo)
  app.use('/mcp', (req: Request & { auth?: AuthInfo }, res: Response, next: NextFunction) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
    const t = m ? tokenek.get(m[1]) : undefined
    if (!m || !t) {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'unauthorized', message: 'Hiányzó vagy érvénytelen hozzáférési token.' })
      return
    }
    req.auth = { token: m[1], clientId: t.clientId, scopes: [t.role] }
    next()
  })

  const munkamenetek = new Map<string, StreamableHTTPServerTransport>()

  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    try {
      const meglevo = sessionId ? munkamenetek.get(sessionId) : undefined
      if (meglevo) {
        await meglevo.handleRequest(req, res, req.body)
        return
      }
      if (sessionId) return jsonRpcHiba(res, 404, 'Session not found')
      if (!isInitializeRequest(req.body)) return jsonRpcHiba(res, 400, 'Bad Request: No valid session ID provided')

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          munkamenetek.set(sid, transport)
        },
      })
      transport.onclose = () => {
        if (transport.sessionId) munkamenetek.delete(transport.sessionId)
      }
      await opts.letrehoz().connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (e) {
      log('HTTP keres hiba:', e instanceof Error ? e.message : e)
      if (!res.headersSent) jsonRpcHiba(res, 500, 'Internal server error')
    }
  })

  // GET: SSE értesítési csatorna, DELETE: munkamenet lezárása
  const munkamenetKezelo = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const transport = sessionId ? munkamenetek.get(sessionId) : undefined
    if (!transport) return jsonRpcHiba(res, sessionId ? 404 : 400, sessionId ? 'Session not found' : 'Missing session ID')
    await transport.handleRequest(req, res)
  }
  app.get('/mcp', munkamenetKezelo)
  app.delete('/mcp', munkamenetKezelo)

  app.listen(port, '127.0.0.1', () => {
    log(`${opts.nev}: Streamable HTTP – http://127.0.0.1:${port}/mcp (${tokenek.size} token)`)
  })
}
