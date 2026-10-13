// Eszköz-regisztráló segéd: jogosultság, idempotencia, naplózás, egységes hiba és progress egy helyen,
// hogy a szerverek eszközei csak az üzleti logikát tartalmazzák.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { CallToolResult, ServerNotification, ServerRequest, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { hibaEredmeny, McpHiba, vartlanHiba } from './hiba'
import { eredmenyMentese, korabbiEredmeny } from './idempotencia'
import { RISK_META, ROLES, type Risk, type Role } from './kanonikus'
import { bemenetKivonat, naploz } from './naplo'

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>

export type Hivo = { clientId: string; role: Role; transport: 'http' | 'stdio' }

export type EszkozKontextus = {
  hivo: Hivo
  /** progress értesítés a kliensnek (ha kért ilyet) – hosszú műveleteknél */
  progress: (progress: number, total?: number, message?: string) => Promise<void>
  signal: AbortSignal
}

/** A hívó azonosítása: HTTP-n a token (req.auth), stdio-n a környezet (MCP_STDIO_ROLE, alapból viewer). */
export function hivoAzonositas(extra: Extra): Hivo {
  const auth = extra.authInfo
  if (auth) {
    const role = (ROLES as readonly string[]).includes(auth.scopes[0]) ? (auth.scopes[0] as Role) : 'viewer'
    return { clientId: auth.clientId, role, transport: 'http' }
  }
  const role = process.env.MCP_STDIO_ROLE ?? 'viewer'
  return {
    clientId: process.env.MCP_STDIO_CLIENT ?? 'stdio',
    role: (ROLES as readonly string[]).includes(role) ? (role as Role) : 'viewer',
    transport: 'stdio',
  }
}

export function jogosult(hivo: Hivo, roles: readonly Role[]): boolean {
  return hivo.role === 'admin' || roles.includes(hivo.role)
}

export function szerepkorHiba(roles: readonly Role[]): McpHiba {
  return new McpHiba('FORBIDDEN', `Ehhez a művelethez nincs jogosultságod (szükséges szerepkör: ${roles.join(', ')}).`, {
    details: { requiredRoles: roles },
  })
}

type Shape = z.ZodRawShape

export type EszkozDef<I extends Shape, O extends Shape> = {
  /** angol, pont nélküli név (modellfüggetlenség) */
  name: string
  /** magyar megjelenítendő név */
  title: string
  /** angol, rövid leírás a modellnek */
  description: string
  input: I
  output: O
  annotations: ToolAnnotations
  /** kockázati osztály – a 15. fázis jóváhagyási kapuja ebből dönt (_meta["donki/risk"]) */
  risk: Risk
  roles: readonly Role[]
  /** rövid magyar összefoglaló a strukturált eredmény mellé */
  summary: (out: z.infer<z.ZodObject<O>>) => string
  run: (args: z.infer<z.ZodObject<I>>, ctx: EszkozKontextus) => Promise<z.infer<z.ZodObject<O>>>
}

export function eszkoz<I extends Shape, O extends Shape>(server: McpServer, szerverNev: string, def: EszkozDef<I, O>) {
  const callback = async (args: z.infer<z.ZodObject<I>>, extra: Extra): Promise<CallToolResult> => {
    const kezdet = Date.now()
    const hivo = hivoAzonositas(extra)
    let eredmeny: CallToolResult
    let hibakod: string | null = null

    try {
      if (!jogosult(hivo, def.roles)) throw szerepkorHiba(def.roles)

      const kulcs =
        typeof (args as Record<string, unknown>).idempotencyKey === 'string'
          ? { server: szerverNev, tool: def.name, client_id: hivo.clientId, idempotency_key: String((args as Record<string, unknown>).idempotencyKey) }
          : null
      const korabbi = kulcs ? await korabbiEredmeny(kulcs) : null

      if (korabbi) {
        eredmeny = korabbi as CallToolResult
      } else {
        const ctx: EszkozKontextus = {
          hivo,
          signal: extra.signal,
          progress: async (progress, total, message) => {
            const token = extra._meta?.progressToken
            if (token === undefined) return
            await extra.sendNotification({
              method: 'notifications/progress',
              params: { progressToken: token, progress, ...(total !== undefined ? { total } : {}), ...(message ? { message } : {}) },
            })
          },
        }
        const out = await def.run(args, ctx)
        eredmeny = { content: [{ type: 'text', text: def.summary(out) }], structuredContent: out as Record<string, unknown> }
        if (kulcs) await eredmenyMentese(kulcs, eredmeny as Record<string, unknown>)
      }
    } catch (e) {
      const hiba = e instanceof McpHiba ? e : vartlanHiba(e, szerverNev)
      hibakod = hiba.code
      eredmeny = hibaEredmeny(hiba)
    }

    await naploz({
      server: szerverNev,
      tool: def.name,
      client_id: hivo.clientId,
      role: hivo.role,
      transport: hivo.transport,
      input_summary: bemenetKivonat(args as Record<string, unknown>),
      ok: hibakod === null,
      error_code: hibakod,
      duration_ms: Date.now() - kezdet,
      response_bytes: Buffer.byteLength(JSON.stringify(eredmeny)),
    })
    return eredmeny
  }

  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      outputSchema: def.output,
      annotations: def.annotations,
      _meta: { [RISK_META]: def.risk },
    },
    callback as never
  )
}
