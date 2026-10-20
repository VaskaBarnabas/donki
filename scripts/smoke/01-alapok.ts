/**
 * Alapok füstteszt (1. fázis, a 15. fázisban átírva a független rendszerekre): minden rendszer a SAJÁT
 * adatbázisában tartja a sémáját, a seedet és a sorait; nincs közös adatbázis. A rendszerek közötti szándékos
 * eltéréseket (katalógus ↔ raktár név, CRM ↔ számlázó vevő) a teszt a két rendszer adatából veti össze.
 * A seed-ellenőrzések a seedelt azonosítókra szűrnek, mert a későbbi füsttesztek új sorokat hoznak létre.
 *
 * Előfeltétel: npm run stack:up
 * Futtatás: npx tsx scripts/smoke/01-alapok.ts
 */
import { psql } from './rendszerek'

let failed = 0
function check(nev: string, vart: unknown, kapott: unknown) {
  const ok = String(vart) === String(kapott)
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${nev.padEnd(40)} várt: ${String(vart).padEnd(12)} kapott: ${String(kapott)}`)
}

const SEMAK = { crm: ['crm', 'catalog'], quote: ['quote'], orders: ['orders'], inventory: ['inventory'], billing: ['billing'], payments: ['payment'], support: ['support'] }
const SOROK = { orders: 'order_events', inventory: 'inventory_alerts,inventory_commands,inventory_replies', payments: 'payment_events' }
const MIND = Object.values(SEMAK).flat()

console.log('Alapok füstteszt – 7 független rendszer, mindegyik a saját adatbázisával\n')

for (const [r, semak] of Object.entries(SEMAK)) {
  const x = psql<Record<string, unknown>>(
    r,
    `select
       (select string_agg(nspname, ',' order by nspname) from pg_namespace where nspname = any(array[${MIND.map((s) => `'${s}'`).join(',')}])) as semak,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where c.relkind = 'r' and not c.relrowsecurity and n.nspname = any(array[${semak.map((s) => `'${s}'`).join(',')}])) as rls_nelkul,
       has_schema_privilege('anon', '${semak[0]}', 'usage') as anon,
       has_schema_privilege('service_role', '${semak[0]}', 'usage') as service,
       (select count(*) from pg_extension where extname = 'pgmq') as pgmq,
       current_setting('server_version_num')::int / 10000 as pg_verzio`
  )
  check(`${r}: csak a saját sémái (${semak.join(', ')})`, [...semak].sort().join(','), x.semak)
  check(`${r}: minden táblán RLS`, 0, x.rls_nelkul)
  check(`${r}: anon nem fér hozzá, service_role igen`, 'false/true', `${x.anon}/${x.service}`)
  const sor = SOROK[r as keyof typeof SOROK]
  if (sor) check(`${r}: saját üzenetsorai (Postgres ${x.pg_verzio} + pgmq)`, sor, psql<{ q: string }>(r, 'select string_agg(queue_name, \',\' order by queue_name) as q from pgmq.list_queues()').q)
  else check(`${r}: nincs üzenetsor (Postgres ${x.pg_verzio})`, 0, x.pgmq)
}

console.log('')
const crm = psql<Record<string, number>>('crm', `select
  (select count(*) from crm.partners) as partners, (select count(*) from crm.contacts) as contacts, (select count(*) from crm.deals) as deals,
  (select count(distinct stage) from crm.deals) as deal_stages, (select count(*) from catalog.categories) as categories,
  (select count(*) from catalog.products) as products, (select count(distinct customer_group) from catalog.customer_group_discounts) as discount_groups,
  (select count(*) from catalog.products where raktari_kod is null) as products_without_stock_code,
  has_schema_privilege('authenticated', 'crm', 'usage') as auth_crm`)
check('crm: partnerek', 30, crm.partners)
check('crm: kapcsolattartók', 60, crm.contacts)
check('crm: lehetőségek (4 szakasz)', '25/4', `${crm.deals}/${crm.deal_stages}`)
check('katalógus: kategóriák / termékek', '6/40', `${crm.categories}/${crm.products}`)
check('katalógus: ügyfélcsoport-kedvezmények', 4, crm.discount_groups)
check('katalógus: raktári kód nélküli termék', 3, crm.products_without_stock_code)

const inv = psql<Record<string, number>>('inventory', `select
  (select count(*) from inventory.items) as items,
  (select count(*) from inventory.items where keszlet > 0 and keszlet < min_keszlet) as items_below_min,
  (select count(*) from inventory.items where keszlet = 0) as items_zero,
  (select count(*) from inventory.items i where i.foglalt <> coalesce((select sum(r.db) from inventory.reservations r where r.cikk = i.cikk and r.statusz = 'AKTIV'), 0)) as foglalt_mismatches`)
check('raktár: cikkek', 37, inv.items)
check('raktár: minimum alatt / nulla készlet', '4/2', `${inv.items_below_min}/${inv.items_zero}`)
check('raktár: foglalt = aktív foglalások összege', 0, inv.foglalt_mismatches)

// rendszerek közötti szándékos eltérések – a két rendszer adatából összevetve
const termekek = psql<{ t: { code: string; name: string; raktari_kod: number | null }[] }>('crm', `select json_agg(p) as t from (select code, name, raktari_kod from catalog.products) p`).t
const cikkek = psql<{ t: { cikk: number; megnevezes: string }[] }>('inventory', `select json_agg(i) as t from (select cikk, megnevezes from inventory.items) i`).t
const cikkNev = new Map(cikkek.map((c) => [c.cikk, c.megnevezes]))
check('katalógus ↔ raktár: eltérő megnevezés', 2, termekek.filter((t) => t.raktari_kod !== null && cikkNev.has(t.raktari_kod) && cikkNev.get(t.raktari_kod) !== t.name).length)

const partnerek = psql<{ t: { name: string; tax_number: string }[] }>('crm', `select json_agg(p) as t from (select name, tax_number from crm.partners) p`).t
const vevok = psql<{ t: { nev: string; adoszam: string }[] }>('billing', `select json_agg(v) as t from (select nev, adoszam from billing.vevok) v`).t
const vevoAdoszam = new Map(vevok.map((v) => [v.adoszam, v.nev]))
const nagybetu = (s: string) => s.toUpperCase().replace(/[ÁÉÍÓÖŐÚÜŰ]/g, (c) => 'AEIOOOUUU'['ÁÉÍÓÖŐÚÜŰ'.indexOf(c)])
check('CRM ↔ számlázó: partner számlázó vevő nélkül', 2, partnerek.filter((p) => !vevoAdoszam.has(p.tax_number)).length)
check('CRM ↔ számlázó: eltérő névírás', 1, partnerek.filter((p) => vevoAdoszam.has(p.tax_number) && vevoAdoszam.get(p.tax_number) !== nagybetu(p.name)).length)

const q = psql<Record<string, number>>('quote', `select count(*) as quotes, count(distinct status) as statuses,
  count(*) filter (where status = 'JOVAHAGYASRA_VAR') as pending, count(*) filter (where status = 'LEJART') as expired
  from quote.quotes where id between 'AJ-2026-0035' and 'AJ-2026-0042'`)
check('ajánlat: seedelt ajánlatok / állapotok', '8/6', `${q.quotes}/${q.statuses}`)
check('ajánlat: jóváhagyásra vár / lejárt', '1/1', `${q.pending}/${q.expired}`)

const o = psql<Record<string, number | boolean>>('orders', `select (select count(*) from orders.orders where order_no <= 100045) as orders,
  (select count(distinct state) from orders.orders where order_no <= 100045) as states,
  (select last_value >= 100045 from pg_sequences where schemaname = 'orders' and sequencename like 'orders_order_no%') as seq,
  (select count(*) from pg_database where datname = 'flowable') as flowable_db`)
check('rendelés: seedelt rendelések / állapotok', '12/7', `${o.orders}/${o.states}`)
check('rendelés: sorszám ≥ 100045; a Flowable saját adatbázisa', 'true/1', `${o.seq}/${o.flowable_db}`)

const b = psql<Record<string, number | boolean>>('billing', `select
  (select count(*) from billing.szamlak where szam between 'SZ-2026-000180' and 'SZ-2026-000188' or szam = 'DB-2026-000031') as invoices,
  (select count(*) from billing.szamlak where lejart and not fizetve and szam between 'SZ-2026-000180' and 'SZ-2026-000188') as overdue,
  (select last_value >= 188 from pg_sequences where schemaname = 'billing' and sequencename = 'szamla_seq') as seq`)
check('számlázó: seedelt bizonylatok / lejárt fizetetlen', '10/3', `${b.invoices}/${b.overdue}`)
check('számlázó: sorszám ≥ 188', true, b.seq)

const p = psql<Record<string, number>>('payments', `select count(*) as payments from payment.payments where id::text like '30000000-%'`)
check('fizetés: seedelt fizetések', 4, p.payments)

const s = psql<Record<string, number>>('support', `select (select count(*) from support.tickets where id <= 'HJ-000321') as tickets,
  (select count(*) from support.rma where statusz <> 'LEZART' and id <= 'RMA-2026-0012') as active_rma`)
check('helpdesk: seedelt jegyek / aktív RMA', '5/1', `${s.tickets}/${s.active_rma}`)

console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
process.exit(failed === 0 ? 0 : 1)
