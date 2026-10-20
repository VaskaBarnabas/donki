/* eslint-disable @typescript-eslint/no-explicit-any -- a füsttesztek típus nélküli JSON válaszokat vizsgálnak */
// Közös segédek az MCP füsttesztekhez (13–14. fázis): saját szerverpéldány külön porton ideiglenes tokenekkel,
// kliens szerepkörönként, eszközhívás kanonikus hibakiolvasással, ellenőrzés és naplóellenőrzés.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { hibaKiolvasas } from '../../mcp/kozos/hiba'
import { adat, MCP_NATIV_KORNYEZET } from './rendszerek'

export { env } from './rendszerek'
/** Útválasztó adatkliens (15. fázis): .schema('mcp') → az MCP réteg saját adatbázisa, .schema('orders') → a rendeléskezelőé stb. */
export const supabase = adat()

export const ROLES = ['viewer', 'sales', 'logistics', 'finance', 'sales_manager'] as const
export type Role = (typeof ROLES)[number]
const TOKEN = Object.fromEntries(ROLES.map((r) => [r, randomBytes(24).toString('hex')])) as Record<Role, string>

// ---------------------------------------------------------------- ellenőrzés

let failed = 0
let osszes = 0
let lepes = 0
export function check(name: string, ok: boolean, detail: unknown) {
  osszes++
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 600)}`}`)
}
export function szakasz(cim: string) {
  console.log(`\n${++lepes}. ${cim}`)
}
export function zaras(kezdet: number, sikerSzoveg: string): never {
  console.log(`\n(${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  console.log(failed === 0 ? `${sikerSzoveg} (${osszes}/${osszes})` : `${failed} / ${osszes} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

/** Kulcssorrendtől független JSON (a jsonb-ben tárolt idempotens válasz kulcsait a Postgres átrendezi). */
export function kanonJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))
}

/** Egyik szöveg sem tartalmazhat legacy formátumot: raktári cikkszám mező, vevőkód, vesszős összeg, pontozott dátum, legacy állapotnév. */
export function legacyNyom(v: unknown): string[] {
  const s = JSON.stringify(v)
  const minta: [string, RegExp][] = [
    ['VEVO-kód', /VEVO-\d+/],
    ['vesszős összeg', /"\d+,\d{2}"/],
    ['YYYY.MM.DD dátum', /"\d{4}\.\d{2}\.\d{2}"/],
    ['legacy állapot', /"(PISZKOZAT|JOVAHAGYASRA_VAR|ROGZITETT|TELJESITES_ALATT|SZAMLAZVA|LEZART|NYITOTT|FOLYAMATBAN|KESZLET|CSERE|JAVITAS)"/],
    ['legacy mezőnév', /"(cikk|keszlet|szabad|foglalt|raktari_kod|partner_id|order_no|vevo_kod|amountMinor|PartnerTaxNumber)"/],
  ]
  return minta.filter(([, re]) => re.test(s)).map(([n]) => n)
}

// ---------------------------------------------------------------- MCP kliens

export type Eredmeny = { ok: boolean; data: Record<string, any>; error: Record<string, any> | undefined; text: string }

let naplozott = 0
export const naplozottHivasok = () => naplozott

export async function hiv(
  c: Client,
  name: string,
  args: Record<string, unknown>,
  opts: { onprogress?: (p: { progress: number; message?: string }) => void; naplo?: boolean } = {}
): Promise<Eredmeny> {
  if (opts.naplo !== false) naplozott++
  const r = await c.callTool({ name, arguments: args }, undefined, {
    timeout: 180_000,
    resetTimeoutOnProgress: true,
    ...(opts.onprogress ? { onprogress: opts.onprogress } : {}),
  })
  const sc = (r.structuredContent ?? {}) as Record<string, any>
  const text = ((r.content as { type: string; text?: string }[]) ?? [])[0]?.text ?? ''
  return { ok: !r.isError, data: sc, error: r.isError ? (hibaKiolvasas(r) ?? undefined) : undefined, text }
}

export type Szerver = { nev: string; url: string; kliensNev: (r: string) => string; folyamat: ChildProcess; kliens: (r: Role) => Promise<Client>; stdio: (role: string) => Promise<Client>; leallit: () => void }

/** Egy domain szerver saját példánya a megadott porton, ideiglenes tokenekkel (a .env.local MCP_TOKENS-étől függetlenül). */
export async function szerverInditas(nev: string, port: number, kliensElotag: string): Promise<Szerver> {
  const kliensNev = (r: string) => `${kliensElotag}-${r}`
  const folyamat = spawn('node_modules/.bin/tsx', [`mcp/servers/${nev}/index.ts`, `--port=${port}`], {
    env: { ...process.env, ...MCP_NATIV_KORNYEZET, MCP_TOKENS: ROLES.map((r) => `${TOKEN[r]}:${r}:${kliensNev(r)}`).join(',') },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  })
  folyamat.stderr!.on('data', (d) => process.env.SMOKE_VERBOSE && process.stderr.write(d))
  const url = `http://127.0.0.1:${port}/mcp`
  for (let i = 0; ; i++) {
    try {
      await fetch(url, { method: 'POST' })
      break
    } catch {
      if (i > 60) throw new Error(`a(z) ${nev} MCP szerver nem indult el`)
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return {
    nev,
    url,
    kliensNev,
    folyamat,
    kliens: async (role) => {
      const c = new Client({ name: kliensNev(role), version: '1.0.0' })
      await c.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${TOKEN[role]}` } } }))
      await c.listTools() // ezután a kliens a structuredContent-et az outputSchema szerint ellenőrzi
      return c
    },
    stdio: async (role) => {
      const c = new Client({ name: kliensNev('stdio'), version: '1.0.0' })
      await c.connect(
        new StdioClientTransport({
          command: 'node_modules/.bin/tsx',
          args: [`mcp/servers/${nev}/index.ts`, '--stdio'],
          env: { ...(process.env as Record<string, string>), ...MCP_NATIV_KORNYEZET, MCP_STDIO_ROLE: role, MCP_STDIO_CLIENT: kliensNev('stdio') },
          stderr: 'pipe',
        })
      )
      return c
    },
    leallit: () => {
      try {
        process.kill(-folyamat.pid!, 'SIGTERM')
      } catch {}
    },
  }
}

/** Ellenőrzi, hogy az mcp séma elérhető (napló, idempotencia). */
export async function mcpSemaEllenorzes() {
  const sema = await supabase.schema('mcp').from('tool_calls').select('id').limit(1)
  if (sema.error) throw new Error(`az mcp séma nem érhető el (${sema.error.code}) – Dashboard → Data API → Exposed schemas → mcp`)
}

/** A naplóban a kliensek sorai a teszt kezdete óta. */
export async function naploSorok(kliensMinta: string, kezdetIso: string) {
  await new Promise((r) => setTimeout(r, 1000))
  const { data } = await supabase
    .schema('mcp')
    .from('tool_calls')
    .select('server, tool, client_id, role, transport, ok, error_code, duration_ms, response_bytes, input_summary')
    .like('client_id', kliensMinta)
    .gte('called_at', kezdetIso)
  return data ?? []
}

/** A lint és a kockázati osztály – minden szerver tesztje az elején. */
export async function eszkozlistaEllenorzes(c: Client, vartNevek: string[], vartRisk: Record<string, string>, lintFn: (t: never) => string[]) {
  const { tools } = await c.listTools()
  check(`${vartNevek.length} eszköz: ${tools.map((t) => t.name).join(', ')}`, kanonJson(tools.map((t) => t.name).sort()) === kanonJson([...vartNevek].sort()), tools.map((t) => t.name))
  const hibak = lintFn(tools as never)
  check('lint hibátlan (név, magyar title, angol leírás, lapos séma, outputSchema, annotációk, kockázati osztály)', hibak.length === 0, hibak)
  const risk = Object.fromEntries(tools.map((t) => [t.name, (t._meta as Record<string, unknown> | undefined)?.['donki/risk']]))
  check(`kockázati osztályok: ${Object.entries(vartRisk).map(([n, r]) => `${n}=${r}`).join(', ')}`, Object.entries(vartRisk).every(([n, r]) => risk[n] === r), risk)
  return tools
}
