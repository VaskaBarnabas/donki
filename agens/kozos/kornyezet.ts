// Az ágens réteg beállításai (17. fázis). Az ágens natívan fut a gépen (a helyi modell, Ollama miatt); a rendszereket
// csak az MCP szervereken éri el. A környezetből csak azt veszi át, ami neki kell: az MCP tokeneket (szerepkörönként)
// és a saját adatbázisa jelszavát – a rendszerek kulcsait nem.

import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const KELL = ['MCP_TOKENS', 'AGENS_DB_PASSWORD', 'AGENS_DB_URL', 'AGENS_MODEL', 'AGENS_MODEL_URL', 'AGENS_GONDOLKODAS']
for (const f of ['.env.local', '.env.stack']) {
  if (!existsSync(f)) continue
  const ertekek = parseEnv(readFileSync(f, 'utf8'))
  // a .env.local MCP_TOKENS-e elsőbbséget élvez a generált demo-tokenekkel szemben
  for (const k of KELL) if (ertekek[k] && process.env[k] === undefined) process.env[k] = ertekek[k]
}

// A LangChain felhős nyomkövetője (LangSmith) soha: az adat helyben marad.
process.env.LANGSMITH_TRACING = 'false'
process.env.LANGCHAIN_TRACING_V2 = 'false'

export const SZEREPKOROK = ['viewer', 'sales', 'logistics', 'finance', 'sales_manager', 'admin'] as const
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
