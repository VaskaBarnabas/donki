/**
 * Az összes rendszer bekötése a portálhoz egy lépésben, a varázsló helyett (16. fázis – a demóhoz és a tesztekhez).
 * Ugyanazt csinálja, mint a varázsló: a rendszerek hálózati címe + a hozzáférési kulcs AES-256-GCM-mel titkosítva a
 * Supabase public.integrations táblájába. A kulcsokat a .env.local (legacy kulcsok) és a .env.stack (CRM, raktár) adja;
 * a kulcsokat nem írja ki. Parancssori eszköz: a Supabase service role kulcsával ír (a portál nem kapja meg ezt).
 *
 * Futtatás: npm run portal:integraciok        (meglévőt felülír)
 *           npm run portal:integraciok -- --torles   (minden integráció törlése → a varázsló újra indul)
 */
import { createClient } from '@supabase/supabase-js'
import { titkosit } from '../lib/portal/titok'

for (const f of ['.env.local', '.env.stack']) process.loadEnvFile(f)
const env = process.env as Record<string, string>
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const KOTESEK: [string, string, string][] = [
  ['crm', 'http://crm-api:3000', 'CRM_API_KEY'],
  ['quote', 'http://quote:4101', 'LEGACY_QUOTE_KEY'],
  ['orders', 'http://orders:4102', 'LEGACY_ORDERS_KEY'],
  ['inventory', 'http://inventory-api:3000', 'INVENTORY_API_KEY'],
  ['billing', 'http://billing:4103', 'LEGACY_BILLING_KEY'],
  ['payments', 'http://payments:4104', 'LEGACY_PAYMENTS_KEY'],
  ['support', 'http://support:4105', 'LEGACY_SUPPORT_KEY'],
]

async function main() {
  if (process.argv.includes('--torles')) {
    const { error } = await supabase.from('integrations').delete().neq('system', '')
    if (error) throw new Error(error.message)
    console.log('Minden integráció törölve – a portál első belépéskor a varázslót mutatja.')
    return
  }
  const sorok = KOTESEK.map(([system, base_url, kulcs]) => {
    if (!env[kulcs]) throw new Error(`hiányzó kulcs: ${kulcs}`)
    return { system, base_url, secret_enc: titkosit(env[kulcs]), status: 'nem_tesztelt', last_test_msg: 'parancssorból bekötve', updated_at: new Date().toISOString() }
  })
  const { error } = await supabase.from('integrations').upsert(sorok)
  if (error) throw new Error(error.message)
  console.log(`${sorok.length} rendszer bekötve: ${sorok.map((s) => s.system).join(', ')} (a kulcsok titkosítva)`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
