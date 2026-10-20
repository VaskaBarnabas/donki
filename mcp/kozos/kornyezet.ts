// Környezet és megosztott kliensek az MCP szerverekhez. Az MCP réteg önálló folyamat (nem a Next.js része),
// ezért maga tölti be a .env.local-t. FIGYELEM: stdio átvitelnél a stdout a protokollé – naplózás csak stderr-re.

import { existsSync } from 'node:fs'
import { createServiceClient, crmKliens, raktarSorKliens, type Adatkliens } from '../../lib/rendszer/adat'

// Natív futtatáskor (tsx) a .env.local és a .env.stack; konténerben a compose adja a változókat.
for (const f of ['.env.local', '.env.stack']) if (existsSync(f)) process.loadEnvFile(f)

export function env(nev: string): string {
  const ertek = process.env[nev]
  if (!ertek) throw new Error(`Hianyzo kornyezeti valtozo: ${nev}`)
  return ertek
}

/**
 * Az MCP réteg SAJÁT adatbázisa (mcp-db: napló, idempotencia) – 15. fázis óta nem a Supabase.
 * A CRM/katalógus a CRM rendszer interfészén (crm()), a raktár az üzenetsorán (raktarSor()) érhető el.
 */
export function db(): Adatkliens {
  return createServiceClient()
}
export const crm = crmKliens
export const raktarSor = raktarSorKliens

export function log(...args: unknown[]) {
  console.error('[mcp]', ...args)
}
