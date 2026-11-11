// Az ágens réteg beállításai (17. fázis). Az ágens natívan fut a gépen (a helyi modell, Ollama miatt); a rendszereket
// csak az MCP szervereken éri el. A környezetből csak azt veszi át, ami neki kell: az MCP tokeneket (szerepkörönként),
// a saját adatbázisa jelszavát és (18. fázis) a háttérfigyelő sor-kulcsait – a rendszerek adatkulcsait nem.

import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const KELL = ['MCP_TOKENS', 'AGENS_DB_PASSWORD', 'AGENS_DB_URL', 'AGENS_MODEL', 'AGENS_MODEL_URL', 'AGENS_GONDOLKODAS', 'AGENS_FIGYELO', 'ORDERS_SOR_KEY', 'PAYMENTS_SOR_KEY', 'INVENTORY_API_KEY', 'UCP_ALAIRO_KULCS', 'UCP_ALAP_URL', 'UCP_PLATFORMOK']
for (const f of ['.env.local', '.env.stack']) {
  if (!existsSync(f)) continue
  const ertekek = parseEnv(readFileSync(f, 'utf8'))
  // a .env.local MCP_TOKENS-e elsőbbséget élvez a generált demo-tokenekkel szemben
  for (const k of KELL) if (ertekek[k] && process.env[k] === undefined) process.env[k] = ertekek[k]
}

// A LangChain felhős nyomkövetője (LangSmith) soha: az adat helyben marad.
process.env.LANGSMITH_TRACING = 'false'
process.env.LANGCHAIN_TRACING_V2 = 'false'

// a hat felhasználói szerepkör és a háttérfigyelő csak olvasó szerepköre (18. fázis; az MCP-n írni nem tud)
export const SZEREPKOROK = ['viewer', 'sales', 'logistics', 'finance', 'sales_manager', 'admin', 'monitor', 'ucp'] as const
export type Szerep = (typeof SZEREPKOROK)[number]

export const BEALLITAS = {
  // a 0. lépés mérése szerint (2026-10-24) az e4b pontosabb és gyorsabb volt; a 12b: AGENS_MODEL=donki-gemma
  modell: process.env.AGENS_MODEL ?? 'donki-gemma-e4b',
  modellUrl: process.env.AGENS_MODEL_URL ?? 'http://127.0.0.1:11434',
  /** a gemma4 „gondolkodás” módja a szakágenseknél (a front-desknél mindig ki) */
  gondolkodas: process.env.AGENS_GONDOLKODAS === '1',
  dbUrl: () => process.env.AGENS_DB_URL ?? `postgres://postgres:${encodeURIComponent(process.env.AGENS_DB_PASSWORD ?? '')}@127.0.0.1:54108/postgres`,
  /** szakágensenként legfeljebb ennyi eszközhívás egy kérésre */
  maxEszkozHivas: 15,
}

/** A háttérfigyelő (18. fázis) beállításai. AGENS_FIGYELO=ki: nem indul (pl. a tesztek alatt). */
export const FIGYELO = {
  bekapcsolva: process.env.AGENS_FIGYELO !== 'ki',
  /** az eseménysorok olvasása */
  esemenyMs: Number(process.env.AGENS_FIGYELO_ESEMENY_MS ?? 15_000),
  /** az időzített ellenőrzések (J4 lezárás, J6–J9, a nyitott jelzések lezárása) */
  idozitettMs: Number(process.env.AGENS_FIGYELO_IDOZITETT_MS ?? 10 * 60_000),
  /** legfeljebb ennyi ágens-elemzés percenként (a helyi modell egyszerre egy kérést szolgál ki jól) */
  elemzesPercenkent: 6,
  sorok: {
    orders: { url: process.env.ORDERS_SOR_URL ?? 'http://127.0.0.1:54102', kulcs: () => process.env.ORDERS_SOR_KEY ?? '', sor: 'order_events' },
    payments: { url: process.env.PAYMENTS_SOR_URL ?? 'http://127.0.0.1:54104', kulcs: () => process.env.PAYMENTS_SOR_KEY ?? '', sor: 'payment_events' },
    inventory: { url: process.env.INVENTORY_SOR_URL ?? 'http://127.0.0.1:54106', kulcs: () => process.env.INVENTORY_API_KEY ?? '', sor: 'inventory_alerts' },
  },
} as const

export const MCP_SZERVEREK = {
  orders: process.env.MCP_ORDERS_URL ?? 'http://127.0.0.1:3201/mcp',
  sales: process.env.MCP_SALES_URL ?? 'http://127.0.0.1:3202/mcp',
  inventory: process.env.MCP_INVENTORY_URL ?? 'http://127.0.0.1:3203/mcp',
  finance: process.env.MCP_FINANCE_URL ?? 'http://127.0.0.1:3204/mcp',
  support: process.env.MCP_SUPPORT_URL ?? 'http://127.0.0.1:3205/mcp',
} as const
export type SzerverNev = keyof typeof MCP_SZERVEREK

/** Az MCP token a szerepkörhöz (MCP_TOKENS: token:szerepkör:kliens, vesszővel). A modell ezt soha nem látja. */
export function mcpToken(szerep: Szerep): string {
  for (const t of (process.env.MCP_TOKENS ?? '').split(',')) {
    const [token, role] = t.split(':')
    if (role === szerep && token) return token
  }
  throw new Error(`Nincs MCP token a(z) ${szerep} szerepkörhöz (MCP_TOKENS, npm run stack:secrets)`)
}
