/**
 * Közös segéd a füsttesztekhez a független rendszerek világában (15. fázis).
 *
 * - URL: a rendszerek gépre kivezetett címei (127.0.0.1)
 * - adat(): „útválasztó” adatkliens – a .schema('inventory'), .schema('orders') stb. hívást a megfelelő rendszer saját
 *   adatbázisához (a belső PostgREST fejlesztői portjára) irányítja, a pgmq_public hívásokat pedig a sor tulajdonosához.
 *   A tesztek így a korábbi, egy Supabase klienssel írt ellenőrzéseiket változatlanul használhatják.
 * - psql(): közvetlen SQL egy rendszer adatbázisán (docker compose exec), az alapok-teszthez
 * - A legacy segédek (pl. raktarHivas) a gépről a raktár kivezetett API-ját használják.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { PostgrestClient } from '@supabase/postgrest-js'
import { jwtAlair } from '../../lib/rendszer/jwt'

for (const f of ['.env.local', '.env.stack']) if (existsSync(f)) process.loadEnvFile(f)
export const env = process.env as Record<string, string>

export const URL = {
  crm: 'http://localhost:4100',
  quote: 'http://localhost:4101',
  orders: 'http://localhost:4102',
  billing: 'http://localhost:4103',
  payments: 'http://localhost:4104',
  support: 'http://localhost:4105',
  inventory: 'http://localhost:4106',
  flowable: 'http://localhost:8080/flowable-rest/service',
}

// a legacy segédek (raktarHivas, CRM-lekérdezések) a gépről hívva
process.env.INVENTORY_API_URL ??= 'http://localhost:54106'
process.env.CRM_API_URL ??= 'http://localhost:4100'
process.env.ORDERS_URL ??= URL.orders
process.env.BILLING_URL ??= URL.billing
process.env.FLOWABLE_REST_URL = URL.flowable
process.env.QUOTE_URL ??= URL.quote
process.env.PAYMENTS_URL ??= URL.payments
process.env.SUPPORT_URL ??= URL.support

/** A natívan (tsx-szel) indított MCP szerver környezete: a saját mcp-db-je a gépről. */
export const MCP_NATIV_KORNYEZET = { RENDSZER_DB_URL: 'http://localhost:54107', RENDSZER_DB_JWT_SECRET: env.MCP_JWT_SECRET }

const REST: Record<string, { port: number; titok: string }> = {
  crm: { port: 4100, titok: 'CRM_JWT_SECRET' },
  quote: { port: 54101, titok: 'QUOTE_JWT_SECRET' },
  orders: { port: 54102, titok: 'ORDERS_JWT_SECRET' },
  billing: { port: 54103, titok: 'BILLING_JWT_SECRET' },
  payments: { port: 54104, titok: 'PAYMENTS_JWT_SECRET' },
  support: { port: 54105, titok: 'SUPPORT_JWT_SECRET' },
  inventory: { port: 54106, titok: 'INVENTORY_JWT_SECRET' },
  mcp: { port: 54107, titok: 'MCP_JWT_SECRET' },
}

/** Séma → a rendszer, amelynek az adatbázisában van */
const SEMA_RENDSZER: Record<string, string> = {
  crm: 'crm', catalog: 'crm', quote: 'quote', orders: 'orders', inventory: 'inventory', billing: 'billing', payment: 'payments', support: 'support', mcp: 'mcp',
}
/** Üzenetsor → a tulajdonos rendszer */
const SOR_RENDSZER: Record<string, string> = {
  inventory_commands: 'inventory', inventory_replies: 'inventory', inventory_alerts: 'inventory', order_events: 'orders', payment_events: 'payments',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Kliens = PostgrestClient<any, any, any>

export function rendszerKliens(rendszer: string): Kliens {
  const r = REST[rendszer]
  const token = jwtAlair({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 3600 }, env[r.titok])
  return new PostgrestClient(`http://localhost:${r.port}`, { headers: { Authorization: `Bearer ${token}` } })
}

/** Útválasztó kliens: .schema(név) → a séma tulajdonos rendszere; pgmq_public → a sor tulajdonosa (queue_name alapján). */
export function adat() {
  return {
    schema(nev: string): ReturnType<Kliens['schema']> {
      if (nev === 'pgmq_public') {
        return {
          rpc: (fn: string, args: { queue_name: string } & Record<string, unknown>) => rendszerKliens(SOR_RENDSZER[args.queue_name]).schema('pgmq_public').rpc(fn, args),
        } as unknown as ReturnType<Kliens['schema']>
      }
      const r = SEMA_RENDSZER[nev]
      if (!r) throw new Error(`ismeretlen séma: ${nev}`)
      return rendszerKliens(r).schema(nev)
    },
  }
}

/** SQL egy rendszer adatbázisán (a konténerben, postgres felhasználóval); egy sor JSON-ként. */
export function psql<T = Record<string, unknown>>(rendszer: string, sql: string, adatbazis = 'postgres'): T {
  const ki = execFileSync('docker', ['compose', '--env-file', '.env.local', '--env-file', '.env.stack', 'exec', '-T', `${rendszer}-db`, 'psql', '-U', 'postgres', '-d', adatbazis, '-At', '-c', `select row_to_json(_sor) from (${sql}) _sor`], { encoding: 'utf8' })
  return JSON.parse(ki.trim())
}
