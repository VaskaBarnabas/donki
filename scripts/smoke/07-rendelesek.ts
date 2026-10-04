/**
 * 7. fázis füstteszt: rendelési homlokzat + Flowable BPMN + motor-végpontok + szállításkövetés.
 * Futó Next.js szervert és Flowable konténert igényel; ~3-4 perc (a szállításkövető időzítő 1 perces).
 * A szállítás gyorsításához a teszt közvetlenül állítja a fuvarozói állapotot (a szimuláció helyett).
 *
 * Futtatás: npx tsx scripts/smoke/07-rendelesek.ts
 */
import { createClient } from '@supabase/supabase-js'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'

process.loadEnvFile('.env.local')
const env = process.env as Record<string, string>
const BASE = `${env.APP_BASE_URL}/api/legacy`
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const RABA = '10000000-0000-4000-8000-000000000015' // TORZS partner, van számlázó vevője

type Valasz = { success: boolean; data?: Record<string, unknown> & { state?: string }; msg?: string }

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 600)}`}`)
}

async function homlokzat(method: 'GET' | 'POST', ut: string, body?: unknown, kulcs = env.LEGACY_ORDERS_KEY): Promise<Valasz> {
  const res = await fetch(`${BASE}/orders/${ut}`, {
    method,
    headers: { 'X-Legacy-Key': kulcs, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status !== 200) throw new Error(`HTTP ${res.status} (${ut})`)
  return res.json()
}

async function rpc(method: string, params: Record<string, unknown>) {
  const res = await fetch(`${BASE}/quote-rpc`, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { apiKey: env.LEGACY_QUOTE_KEY, ...params } }),
  })
  return res.json()
}

async function szamlazo(parancs: string) {
  const res = await fetch(`${BASE}/billing`, { method: 'POST', body: `AUTH|${env.LEGACY_BILLING_KEY}\n${parancs}` })
  return (await res.text()).trim()
}

async function letrehoz(lines: { productCode: string; qty: number; unitPrice: number }[]) {
  const v = await homlokzat('POST', 'create', { quoteRef: null, partnerId: RABA, lines })
  return v.data?.orderNo as number
}

async function allapot(no: number) {
  return (await homlokzat('GET', String(no))).data!
}

async function aktivFoglalas(no: number) {
  const { data } = await supabase.schema('inventory').from('reservations').select('cikk, db').eq('ref', `RND-${no}`).eq('statusz', 'AKTIV')
  return (data ?? []).reduce((s, r) => s + r.db, 0)
}

async function szallitasAllit(no: number, status: string) {
  const { error } = await supabase.schema('orders').from('shipments').update({ carrier_status: status, updated_at: new Date().toISOString() }).eq('order_no', no)
  if (error) throw new Error(error.message)
}

async function esemenyek(no: number) {
  const { data } = await supabase.schema('pgmq_public').rpc('read', { queue_name: 'order_events', sleep_seconds: 0, n: 1000 })
  // a pgmq.read nem garantál sorrendet: üzenetazonosító (= küldési sorrend) szerint rendezve
  return ((data ?? []) as { msg_id: number; message: Record<string, unknown> }[])
    .sort((a, b) => a.msg_id - b.msg_id)
    .map((m) => m.message)
    .filter((m) => m.orderNo === no)
}

async function var_(nev: string, felt: () => Promise<boolean>, maxMp = 120) {
  const kezdet = Date.now()
  while (Date.now() - kezdet < maxMp * 1000) {
    if (await felt()) {
      console.log(`     (${nev}: ${Math.round((Date.now() - kezdet) / 1000)} mp)`)
      return true
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  return false
}

async function main() {
  console.log(`7. fázis füstteszt – rendelések (${BASE}/orders)\n`)

  // ---------------------------------------------------------------- homlokzat alapok
  const rosszKulcs = await homlokzat('GET', 'list', undefined, 'rossz')
  check('rossz X-Legacy-Key → success:false, HTTP 200', rosszKulcs.success === false && rosszKulcs.msg === 'Hozzaferes megtagadva', rosszKulcs)

  const lista = await homlokzat('GET', 'list?state=LEZART')
  check('list?state=LEZART → a seedelt lezárt rendelések', (lista.data as unknown as { order_no: number }[]).some((r) => r.order_no === 100034), lista)

  const tort = await homlokzat('GET', '100034/history')
  check('100034/history → SZALLITVA bejegyzés (garanciához)', (tort.data as unknown as { to_state: string }[]).some((h) => h.to_state === 'SZALLITVA'), tort)

  check('100034/shipping → KEZBESITVE', (await homlokzat('GET', '100034/shipping')).data?.carrier_status === 'KEZBESITVE', null)
  check('ismeretlen művelet', (await homlokzat('POST', '100034/torol')).msg === 'Ismeretlen muvelet', null)
  const nemEng = await homlokzat('POST', '100045/approve')
  check('seedelt (folyamat nélküli) rendelés approve → nem engedélyezett', nemEng.msg === 'Muvelet nem engedelyezett ebben az allapotban', nemEng)

  // ---------------------------------------------------------------- teljes út: ajánlat → rendelés → számla → lemondás + sztornó
  const q = await rpc('quote.create', { partnerId: RABA })
  await rpc('quote.addLine', { quoteId: q.result.id, productCode: 'TK-00001', qty: 1 })
  const accept = await rpc('quote.accept', { quoteId: q.result.id })
  const no = accept.result?.orderNo as number
  check('quote.accept → rendelés a homlokzaton (ELFOGADVA, orderRef)', accept.result?.status === 'ELFOGADVA' && accept.result?.orderRef === `RND-${no}`, accept)

  let r = await allapot(no)
  check('új rendelés: ROGZITETT, aktív task: rendeles_jovahagyasa', r.state === 'ROGZITETT' && (r.current_task as { key: string })?.key === 'rendeles_jovahagyasa', r)
  check('fulfil jóváhagyás előtt → nem engedélyezett', (await homlokzat('POST', `${no}/fulfil`)).success === false, null)

  const appr = await homlokzat('POST', `${no}/approve`)
  check('approve → JOVAHAGYOTT, foglalás aktív', appr.data?.state === 'JOVAHAGYOTT' && (await aktivFoglalas(no)) === 1, appr)
  check('approve újra → nem engedélyezett', (await homlokzat('POST', `${no}/approve`)).msg === 'Muvelet nem engedelyezett ebben az allapotban', null)

  const mod = await homlokzat('POST', `${no}/modify`, { lines: [{ productCode: 'TK-00001', qty: 2, unitPrice: 85405 }] })
  check('modify JOVAHAGYOTT-ban → újrafoglalás (2 db)', mod.success && (await aktivFoglalas(no)) === 2, mod)

  const ful = await homlokzat('POST', `${no}/fulfil`)
  check('fulfil → TELJESITES_ALATT, foglalás kiadva', ful.data?.state === 'TELJESITES_ALATT' && (await aktivFoglalas(no)) === 0, ful)
  check('modify kiszállítás után → nem engedélyezett', (await homlokzat('POST', `${no}/modify`, { lines: [{ productCode: 'TK-00001', qty: 1, unitPrice: 1 }] })).success === false, null)
  check('shipping → szállítmány létrejött', (await homlokzat('GET', `${no}/shipping`)).data?.carrier_status !== undefined, null)

  await szallitasAllit(no, 'KESIK')
  check('KESIK → SHIPMENT_DELAYED esemény', await var_('késés jelzése', async () => (await esemenyek(no)).some((e) => e.event === 'SHIPMENT_DELAYED')), null)

  await szallitasAllit(no, 'KEZBESITVE')
  check('KEZBESITVE → SZALLITVA', await var_('kézbesítés észlelése', async () => (await allapot(no)).state === 'SZALLITVA'), null)
  check('SHIPMENT_DELAYED csak egyszer', (await esemenyek(no)).filter((e) => e.event === 'SHIPMENT_DELAYED').length === 1, null)

  const inv = await homlokzat('POST', `${no}/invoice`)
  const szamla = inv.data?.invoice_ref as string
  check('invoice → SZAMLAZVA, invoice_ref', inv.data?.state === 'SZAMLAZVA' && /^SZ-\d{4}-\d{6}$/.test(szamla), inv)
  check('számla a számlázóban (SZAMLA|LEKER)', (await szamlazo(`SZAMLA|LEKER|${szamla}`)).startsWith(`OK|${szamla}|`), null)

  const canc = await homlokzat('POST', `${no}/cancel`)
  const { data: sz } = await supabase.schema('billing').from('szamlak').select('sztornozva').eq('szam', szamla).single()
  check('cancel számlázott rendelésnél → LEMONDOTT + sztornó', canc.data?.state === 'LEMONDOTT' && sz?.sztornozva === true, canc)
  check('cancel újra → nem engedélyezett', (await homlokzat('POST', `${no}/cancel`)).success === false, null)

  const atmenetek = (await esemenyek(no)).filter((e) => e.event === 'ORDER_STATE_CHANGED').map((e) => e.to)
  check(
    'esemény minden állapotváltásról',
    JSON.stringify(atmenetek) === JSON.stringify(['ROGZITETT', 'JOVAHAGYOTT', 'TELJESITES_ALATT', 'SZALLITVA', 'SZAMLAZVA', 'LEMONDOTT']),
    atmenetek
  )

  // ---------------------------------------------------------------- készlethiány → vissza jóváhagyásra → módosítás → lemondás
  const hiany = await letrehoz([
    { productCode: 'TK-00001', qty: 1, unitPrice: 85405 },
    { productCode: 'TK-00018', qty: 1, unitPrice: 249000 }, // 0 készletű cikk
  ])
  const h1 = await homlokzat('POST', `${hiany}/approve`)
  check('készlethiány → "Keszlet foglalas sikertelen: … (hiany: 1 db)"', h1.success === false && /^Keszlet foglalas sikertelen: \d+ \(hiany: 1 db\)$/.test(h1.msg ?? ''), h1)
  r = await allapot(hiany)
  check('hiány után: ROGZITETT, vissza a jóváhagyásra', r.state === 'ROGZITETT' && (r.current_task as { key: string })?.key === 'rendeles_jovahagyasa', r)
  check('részleges siker feloldva (nincs aktív foglalás)', (await aktivFoglalas(hiany)) === 0, null)
  check('ORDER_ACTION_FAILED esemény (INVENTORY_SHORTAGE)', (await esemenyek(hiany)).some((e) => e.event === 'ORDER_ACTION_FAILED' && e.reason === 'INVENTORY_SHORTAGE'), null)

  await homlokzat('POST', `${hiany}/modify`, { lines: [{ productCode: 'TK-00001', qty: 1, unitPrice: 85405 }] })
  const h2 = await homlokzat('POST', `${hiany}/approve`)
  check('módosítás után approve → JOVAHAGYOTT', h2.data?.state === 'JOVAHAGYOTT' && (await aktivFoglalas(hiany)) === 1, h2)
  const h3 = await homlokzat('POST', `${hiany}/cancel`)
  check('cancel JOVAHAGYOTT-ban → LEMONDOTT, foglalás feloldva', h3.data?.state === 'LEMONDOTT' && (await aktivFoglalas(hiany)) === 0, h3)

  // ---------------------------------------------------------------- hiányzó raktári kód
  const kod = await letrehoz([{ productCode: 'TK-00012', qty: 1, unitPrice: 39900 }])
  const k1 = await homlokzat('POST', `${kod}/approve`)
  check('hiányzó raktári kód → "hianyzo raktari kod (TK-00012)"', k1.msg === 'Keszlet foglalas sikertelen: hianyzo raktari kod (TK-00012)', k1)
  check('cancel ROGZITETT-ben → LEMONDOTT', (await homlokzat('POST', `${kod}/cancel`)).data?.state === 'LEMONDOTT', null)

  // ---------------------------------------------------------------- takarítás: a kiszállított 2 db TK-00001 visszavételezése
  await raktarHivas(supabase, { cmd: 'MOZGAS', cikk: 4701, tipus: 'KORREKCIO', db: 2, ref: 'SMOKE-07' })

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni (fut a Next.js szerver és a Flowable?): ${e.message}`)
  process.exit(1)
})
