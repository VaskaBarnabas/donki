/**
 * 1. fázis füstteszt: sémák, bővítmények, sorok, cron jobok, jogosultságok és seed adatok.
 * A seed-ellenőrzések a seedelt azonosítókra szűrnek, mert a későbbi fázisok füsttesztjei új sorokat hoznak létre.
 * A linkelt Supabase projekten fut a CLI-n keresztül (npx supabase db query --linked),
 * így nem kell hozzá service role kulcs és exposed séma.
 *
 * Futtatás: npx tsx scripts/smoke/01-alapok.ts
 */
import { execFileSync } from 'node:child_process'

const MODULE_SCHEMAS = ['crm', 'catalog', 'quote', 'orders', 'inventory', 'billing', 'payment', 'support']

const SQL = `
select
  (select count(*) from pg_namespace where nspname = any(array['crm','catalog','quote','orders','inventory','billing','payment','support','flowable'])) as schemas,
  (select count(*) from pg_extension where extname in ('pgmq','pg_cron')) as extensions,
  (select string_agg(queue_name, ',' order by queue_name) from pgmq.list_queues()) as queues,
  (select string_agg(jobname, ',' order by jobname) from cron.job) as cron_jobs,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and not c.relrowsecurity
       and n.nspname = any(array['crm','catalog','quote','orders','inventory','billing','payment','support'])) as tables_without_rls,
  has_schema_privilege('anon', 'crm', 'usage') as anon_crm,
  has_schema_privilege('authenticated', 'crm', 'usage') as auth_crm,
  has_schema_privilege('authenticated', 'quote', 'usage') as auth_quote,
  has_schema_privilege('service_role', 'billing', 'usage') as service_billing,
  has_schema_privilege('authenticated', 'flowable', 'usage') as auth_flowable,
  (select count(*) from crm.partners) as partners,
  (select count(*) from crm.contacts) as contacts,
  (select count(*) from crm.deals) as deals,
  (select count(distinct stage) from crm.deals) as deal_stages,
  (select count(*) from catalog.categories) as categories,
  (select count(*) from catalog.products) as products,
  (select count(distinct customer_group) from catalog.customer_group_discounts) as discount_groups,
  (select count(*) from catalog.products where raktari_kod is null) as products_without_stock_code,
  (select count(*) from inventory.items) as items,
  (select count(*) from catalog.products p join inventory.items i on i.cikk = p.raktari_kod
     where p.name <> i.megnevezes) as name_mismatches,
  (select count(*) from inventory.items where keszlet > 0 and keszlet < min_keszlet) as items_below_min,
  (select count(*) from inventory.items where keszlet = 0) as items_zero,
  (select count(*) from inventory.items i
     where i.foglalt <> coalesce((select sum(r.db) from inventory.reservations r
                                  where r.cikk = i.cikk and r.statusz = 'AKTIV'), 0)) as foglalt_mismatches,
  (select count(*) from crm.partners p
     where not exists (select 1 from billing.vevok v where v.adoszam = p.tax_number)) as partners_without_vevo,
  (select count(*) from crm.partners p join billing.vevok v on v.adoszam = p.tax_number
     where v.nev <> translate(upper(p.name), 'ÁÉÍÓÖŐÚÜŰ', 'AEIOOOUUU')) as vevo_name_variants,
  (select count(*) from quote.quotes where id between 'AJ-2026-0035' and 'AJ-2026-0042') as quotes,
  (select count(distinct status) from quote.quotes where id between 'AJ-2026-0035' and 'AJ-2026-0042') as quote_statuses,
  (select count(*) from quote.quotes where status = 'JOVAHAGYASRA_VAR' and id between 'AJ-2026-0035' and 'AJ-2026-0042') as quotes_pending,
  (select count(*) from quote.quotes where status = 'LEJART' and id between 'AJ-2026-0035' and 'AJ-2026-0042') as quotes_expired,
  (select count(*) from orders.orders where order_no <= 100045) as orders,
  (select count(distinct state) from orders.orders where order_no <= 100045) as order_states,
  (select count(*) from billing.szamlak where szam between 'SZ-2026-000180' and 'SZ-2026-000188' or szam = 'DB-2026-000031') as invoices,
  (select count(*) from billing.szamlak where lejart and not fizetve and szam between 'SZ-2026-000180' and 'SZ-2026-000188') as invoices_overdue_unpaid,
  (select count(*) from support.tickets where id <= 'HJ-000321') as tickets,
  (select count(*) from support.rma where statusz <> 'LEZART' and id <= 'RMA-2026-0012') as active_rma,
  (select last_value >= 188 from pg_sequences where schemaname = 'billing' and sequencename = 'szamla_seq') as szamla_seq_min_188,
  (select last_value >= 100045 from pg_sequences where schemaname = 'orders' and sequencename like 'orders_order_no%') as order_seq_min_100045
`

const EXPECTED: Record<string, unknown> = {
  schemas: 9,
  extensions: 2,
  queues: 'inventory_alerts,inventory_commands,inventory_replies,order_events,payment_events',
  cron_jobs: 'billing-lejart,inventory-worker,orders-szallitas-szimulacio',
  tables_without_rls: 0,
  anon_crm: false,
  auth_crm: true,
  auth_quote: false,
  service_billing: true,
  auth_flowable: false,
  partners: 30,
  contacts: 60,
  deals: 25,
  deal_stages: 4,
  categories: 6,
  products: 40,
  discount_groups: 4,
  products_without_stock_code: 3,
  items: 37,
  name_mismatches: 2,
  items_below_min: 4,
  items_zero: 2,
  foglalt_mismatches: 0,
  partners_without_vevo: 2,
  vevo_name_variants: 1,
  quotes: 8,
  quote_statuses: 6,
  quotes_pending: 1,
  quotes_expired: 1,
  orders: 12,
  order_states: 7,
  invoices: 10,
  invoices_overdue_unpaid: 3,
  tickets: 5,
  active_rma: 1,
  szamla_seq_min_188: true,
  order_seq_min_100045: true,
}

// A Supabase CLI néha nem nullás kóddal lép ki egy telemetria-időtúllépés miatt (egy plusz
// {"_tag":"Error"…} sort írva az eredmény után), pedig a lekérdezés lefutott – ezt itt kezeljük.
function cliKimenet(sql: string): string {
  try {
    return execFileSync('npx', ['supabase', 'db', 'query', '--linked', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    const stdout = (e as { stdout?: string }).stdout ?? ''
    if (stdout.includes('"rows"')) return stdout
    throw e
  }
}

function query(sql: string): Record<string, unknown> {
  const out = cliKimenet(sql)
  const parsed = JSON.parse(out.slice(0, out.indexOf('\n{"_tag"') + 1 || undefined)) as { rows: Record<string, unknown>[] }
  return parsed.rows[0]
}

console.log(`1. fázis füstteszt – modulsémák: ${MODULE_SCHEMAS.join(', ')}`)
const row = query(SQL)
let failed = 0
for (const [key, expected] of Object.entries(EXPECTED)) {
  const actual = row[key]
  const ok = String(actual) === String(expected)
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${key.padEnd(28)} várt: ${String(expected).padEnd(12)} kapott: ${String(actual)}`)
}
console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
process.exit(failed === 0 ? 0 : 1)
