// Kis HTTP-hosztoló a független rendszerekhez (15. fázis). A meglévő route handlereket (web szabványú
// Request → Response, ahogy a Next.js-ben voltak) a Node beépített http szerverén futtatja, így a handlerek
// kódja nem változik. Minden rendszer kap egy GET /health végpontot és egy egyszerű ütemezőt a háttérmunkához
// (ezek korábban pg_cron jobok voltak az adatbázisban).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

type Ctx = { params: Promise<Record<string, string | string[]>> }
export type Handler = (req: Request, ctx: Ctx) => Promise<Response> | Response

export type Utvonal = {
  method: 'GET' | 'POST'
  /** pl. '/api/legacy/billing', '/api/legacy/orders/_engine/:action', '/api/legacy/orders/*path' */
  minta: string
  handler: Handler
}

type Feladat = { nev: string; utolsoFutas: string | null; utolsoHiba: string | null; futasok: number }

export type RendszerOpciok = {
  rendszer: string
  /** megjelenített név (az irányítópultnak) */
  nev: string
  port: number
  utvonalak: Utvonal[]
  /** egészség-ellenőrzések: dobjon kivételt, ha a függőség nem elérhető */
  ellenorzesek?: Record<string, () => Promise<void>>
}

const VERZIO = process.env.RENDSZER_VERZIO ?? '15.0.0'
const indulas = Date.now()
const feladatok = new Map<string, Feladat>()

export function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args)
}

function illeszt(minta: string, ut: string): Record<string, string | string[]> | null {
  const m = minta.split('/').filter(Boolean)
  const u = ut.split('/').filter(Boolean)
  const params: Record<string, string | string[]> = {}
  for (let i = 0; i < m.length; i++) {
    if (m[i].startsWith('*')) {
      if (i >= u.length) return null
      params[m[i].slice(1)] = u.slice(i).map(decodeURIComponent)
      return params
    }
    if (i >= u.length) return null
    if (m[i].startsWith(':')) params[m[i].slice(1)] = decodeURIComponent(u[i])
    else if (m[i] !== u[i]) return null
  }
  return m.length === u.length ? params : null
}

async function torzs(req: IncomingMessage): Promise<Buffer> {
  const darabok: Buffer[] = []
  for await (const d of req) darabok.push(d as Buffer)
  return Buffer.concat(darabok)
}

async function valaszKiir(res: ServerResponse, r: Response) {
  const fejlecek: Record<string, string> = {}
  r.headers.forEach((v, k) => (fejlecek[k] = v))
  res.writeHead(r.status, fejlecek)
  res.end(Buffer.from(await r.arrayBuffer()))
}

async function egeszseg(o: RendszerOpciok): Promise<Response> {
  const checks: Record<string, { ok: boolean; ms: number; hiba?: string }> = {}
  for (const [nev, fn] of Object.entries(o.ellenorzesek ?? {})) {
    const k = Date.now()
    try {
      await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('idotullepes')), 3000))])
      checks[nev] = { ok: true, ms: Date.now() - k }
    } catch (e) {
      checks[nev] = { ok: false, ms: Date.now() - k, hiba: e instanceof Error ? e.message : String(e) }
    }
  }
  const ok = Object.values(checks).every((c) => c.ok)
  return Response.json(
    { status: ok ? 'ok' : 'degraded', system: o.rendszer, name: o.nev, version: VERZIO, uptimeS: Math.round((Date.now() - indulas) / 1000), checks, jobs: [...feladatok.values()] },
    { status: ok ? 200 : 503 }
  )
}

export function inditas(o: RendszerOpciok) {
  const szerver = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      if (req.method === 'GET' && url.pathname === '/health') return await valaszKiir(res, await egeszseg(o))

      for (const u of o.utvonalak) {
        if (u.method !== req.method) continue
        const params = illeszt(u.minta, url.pathname)
        if (!params) continue
        const body = req.method === 'GET' ? undefined : await torzs(req)
        const keres = new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body: body?.length ? new Uint8Array(body) : undefined })
        return await valaszKiir(res, await u.handler(keres, { params: Promise.resolve(params) }))
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found\n')
    } catch (e) {
      log(`[${o.rendszer}] kezeletlen hiba:`, e instanceof Error ? (e.stack ?? e.message) : e)
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Internal error\n')
    }
  })
  szerver.listen(o.port, '0.0.0.0', () => log(`[${o.rendszer}] ${o.nev} – figyel: :${o.port}`))

  const leallas = () => {
    log(`[${o.rendszer}] leallas`)
    szerver.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGTERM', leallas)
  process.on('SIGINT', leallas)
}

/** Ismétlődő háttérfeladat (a korábbi pg_cron jobok helyett). Egyszerre egy futás; a hibát naplózza, nem áll le. */
export function utemez(nev: string, ms: number, fn: () => Promise<unknown>) {
  const f: Feladat = { nev, utolsoFutas: null, utolsoHiba: null, futasok: 0 }
  feladatok.set(nev, f)
  let fut = false
  const kor = async () => {
    if (fut) return
    fut = true
    try {
      await fn()
      f.utolsoHiba = null
    } catch (e) {
      f.utolsoHiba = e instanceof Error ? e.message : String(e)
      log(`[${nev}] hiba:`, f.utolsoHiba)
    } finally {
      f.utolsoFutas = new Date().toISOString()
      f.futasok++
      fut = false
    }
  }
  setInterval(() => void kor(), ms)
  void kor()
}

/** Napi feladat egy adott UTC időpontban (pl. a számlázó éjszakai lejárat-jelölése, 02:15). */
export function naponta(nev: string, oraUtc: number, percUtc: number, fn: () => Promise<unknown>) {
  let utolsoNap = ''
  utemez(nev, 60_000, async () => {
    const most = new Date()
    const nap = most.toISOString().slice(0, 10)
    if (nap !== utolsoNap && (most.getUTCHours() > oraUtc || (most.getUTCHours() === oraUtc && most.getUTCMinutes() >= percUtc))) {
      utolsoNap = nap
      await fn()
    }
  })
}

/** A rendszer saját PostgREST-jének elérhetősége (egészség-ellenőrzéshez). */
export async function restPing(urlValtozo: string) {
  const url = process.env[urlValtozo]
  if (!url) throw new Error(`nincs ${urlValtozo}`)
  const r = await fetch(`${url}/`, { method: 'HEAD' })
  if (r.status >= 500) throw new Error(`HTTP ${r.status}`)
}
