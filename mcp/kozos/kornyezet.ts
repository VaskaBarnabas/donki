// Környezet és megosztott kliensek az MCP szerverekhez. Az MCP réteg önálló folyamat (nem a Next.js része),
// ezért maga tölti be a .env.local-t. FIGYELEM: stdio átvitelnél a stdout a protokollé – naplózás csak stderr-re.

import { existsSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

export function env(nev: string): string {
  const ertek = process.env[nev]
  if (!ertek) throw new Error(`Hianyzo kornyezeti valtozo: ${nev}`)
  return ertek
}

let supabase: SupabaseClient | null = null

/** Service role kliens: a PostgREST-interfészekhez (CRM, katalógus) és az mcp séma (napló, idempotencia) írásához. */
export function db(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return supabase
}

export function log(...args: unknown[]) {
  console.error('[mcp]', ...args)
}
