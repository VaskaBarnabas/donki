/**
 * 11. fázis: teljes order-to-cash füstteszt – ajánlattól a lezárásig, majd garancia.
 * Egyetlen rendelés halad át az összes modulon, mindegyik a saját interfészén:
 *   JSON-RPC (ajánlat) → HTTP homlokzat + Flowable BPMN (rendelés) → pgmq (raktár) → szöveges protokoll (számla)
 *   → REST + Stripe webhook (fizetés) → SOAP (ügyfélszolgálat)
 *
 * Előfeltétel: futó Next.js, Flowable, és `stripe listen --all-snapshot --forward-to localhost:3000/api/legacy/payments/webhook`
 * Futtatás: npx tsx scripts/smoke/11-order-to-cash.ts   (~2 perc)
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'

process.loadEnvFile('.env.local')
const env = process.env as Record<string, string>
const BASE = `${env.APP_BASE_URL}/api/legacy`
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const BAKONY = { id: '10000000-0000-4000-8000-000000000003', adoszam: '32038523-2-19' } // KIEMELT
const TERMEK = 'TK-00001' // raktári cikk: 4701
const DB = 12

let failed = 0
let lepes = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}
function szakasz(cim: string) {
  console.log(`\n${++lepes}. ${cim}`)
}

// ---------------------------------------------------------------- a modulok saját interfészei

async function rpc(method: string, params: Record<string, unknown>) {
  const res = await fetch(`${BASE}/quote-rpc`, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: lepes, method, params: { apiKey: env.LEGACY_QUOTE_KEY, ...params } }),
  })
  return res.json()
}

async function rendeles(method: 'GET' | 'POST', ut: string) {
  const res = await fetch(`${BASE}/orders/${ut}`, { method, headers: { 'X-Legacy-Key': env.LEGACY_ORDERS_KEY } })
  return (await res.json()) as { success: boolean; data?: Record<string, unknown> & { state?: string }; msg?: string }
}

async function szamlazo(parancs: string) {
  const res = await fetch(`${BASE}/billing`, { method: 'POST', body: `AUTH|${env.LEGACY_BILLING_KEY}\n${parancs}` })
  return (await res.text()).trim()
}

async function fizetes(method: 'GET' | 'POST', query = '', body?: unknown) {
  const res = await fetch(`${BASE}/payments${query}`, {
    method,
    headers: { Authorization: `Bearer ${env.LEGACY_PAYMENTS_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function soap(muvelet: string, mezok: Record<string, string | number>) {
  const elemek = Object.entries(mezok).map(([k, v]) => `<hd:${k}>${v}</hd:${k}>`).join('')
  const res = await fetch(`${BASE}/support/soap`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `urn:helpdesk:v1#${muvelet}` },
    body:
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:hd="urn:helpdesk:v1">' +
      `<soap:Header><hd:ApiKey>${env.LEGACY_SUPPORT_KEY}</hd:ApiKey></soap:Header>` +
      `<soap:Body><hd:${muvelet}>${elemek}</hd:${muvelet}></soap:Body></soap:Envelope>`,
  })
  const xml = await res.text()
  const ertek = (elem: string) => new RegExp(`<hd:${elem}>([^<]*)</hd:${elem}>`).exec(xml)?.[1]
  return { status: res.status, xml, ertek }
}

async function sor(nev: string) {
  const { data } = await supabase.schema('pgmq_public').rpc('read', { queue_name: nev, sleep_seconds: 0, n: 1000 })
  return ((data ?? []) as { msg_id: number; message: Record<string, unknown> }[]).sort((a, b) => a.msg_id - b.msg_id).map((m) => m.message)
}

function stripeCli(args: string[]) {
  try {
    return execFileSync('stripe', [...args, '--api-key', env.STRIPE_SECRET_KEY], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? ''
  }
}

async function var_(nev: string, felt: () => Promise<boolean>, maxMp = 120) {
  const kezdet = Date.now()
  while (Date.now() - kezdet < maxMp * 1000) {
    if (await felt()) {
      console.log(`     (${nev}: ${Math.round((Date.now() - kezdet) / 1000)} mp)`)
      return true
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return false
}

async function main() {
  console.log(`11. fázis – teljes order-to-cash füstteszt (${BASE})`)
  const kezdet = Date.now()

  // ---------------------------------------------------------------- 1. ajánlat (JSON-RPC)
  szakasz('Ajánlat – JSON-RPC')
  const q = (await rpc('quote.create', { partnerId: BAKONY.id })).result
  await rpc('quote.addLine', { quoteId: q.id, productCode: TERMEK, qty: DB, lineDiscountPct: 3 })
  const calc = (await rpc('quote.calculate', { quoteId: q.id })).result
  check(`${q.id}: 12 db ${TERMEK}, KIEMELT partner → ${calc?.totalDiscountPct}% kedvezmény, jóváhagyás kell`, calc?.approvalRequired === true, calc)
  check('accept jóváhagyás nélkül → -32010', (await rpc('quote.accept', { quoteId: q.id })).error?.code === -32010, null)
  await rpc('quote.requestApproval', { quoteId: q.id, reason: 'Order-to-cash füstteszt' })
  await rpc('quote.approve', { quoteId: q.id, approver: 'Horváth Zoltán' })
  const accept = (await rpc('quote.accept', { quoteId: q.id })).result
  const no = accept?.orderNo as number
  check(`jóváhagyás után accept → ELFOGADVA, rendelés ${accept?.orderRef}`, accept?.status === 'ELFOGADVA' && !!no, accept)

  // ---------------------------------------------------------------- 2. rendelés (homlokzat + BPMN + raktár)
  szakasz('Rendelés – régi HTTP homlokzat, Flowable BPMN, raktári sor')
  check('ROGZITETT, aktív task: rendeles_jovahagyasa', (await rendeles('GET', String(no))).data?.state === 'ROGZITETT', null)

  const appr = await rendeles('POST', `${no}/approve`)
  const { data: fogl } = await supabase.schema('inventory').from('reservations').select('db, statusz').eq('ref', `RND-${no}`)
  check('jóváhagyás → JOVAHAGYOTT, 12 db lefoglalva a raktárban', appr.data?.state === 'JOVAHAGYOTT' && fogl?.[0]?.db === DB && fogl[0].statusz === 'AKTIV', { appr, fogl })

  const ful = await rendeles('POST', `${no}/fulfil`)
  check('kiszállítás → TELJESITES_ALATT, szállítmány létrejött', ful.data?.state === 'TELJESITES_ALATT' && (await rendeles('GET', `${no}/shipping`)).success, ful)
  await supabase.schema('orders').from('shipments').update({ carrier_status: 'KEZBESITVE' }).eq('order_no', no)
  check('a fuvarozó kézbesít → a BPMN szállításkövetése → SZALLITVA', await var_('szállításkövetés', async () => (await rendeles('GET', String(no))).data?.state === 'SZALLITVA'), null)

  // ---------------------------------------------------------------- 3. számla (szöveges protokoll + PDF)
  szakasz('Számla – szöveges protokoll, PDF bizonylat')
  const inv = await rendeles('POST', `${no}/invoice`)
  const szamla = inv.data?.invoice_ref as string
  const leker = (await szamlazo(`SZAMLA|LEKER|${szamla}`)).split('|')
  check(`számla ${szamla}: ${leker[3]} Ft, határidő ${leker[4]}, FIZETVE|N`, inv.data?.state === 'SZAMLAZVA' && leker[0] === 'OK' && leker[6] === 'N', { inv, leker })
  const pdfLink = (await szamlazo(`SZAMLA|PDF|${szamla}`)).slice(3)
  const pdf = await PDFDocument.load(new Uint8Array(await (await fetch(pdfLink)).arrayBuffer()))
  check('PDF bizonylat letölthető, a sorszám a dokumentumban', pdf.getTitle() === szamla, pdf.getTitle())

  // ---------------------------------------------------------------- 4. fizetés (REST + Stripe + webhook)
  szakasz('Fizetés – REST, Stripe Checkout (teszt), webhook')
  const f = (await fizetes('POST', '', { invoiceRef: szamla })).body
  check(`fizetési link: ${f.amountMinor} fillér = a számla bruttója`, f.status === 'CREATED' && String(f.amountMinor) === leker[3].replace(',', ''), f)
  const pm = JSON.parse(
    stripeCli(['payment_methods', 'create', '-d', 'type=card', '-d', 'card[token]=tok_visa', '-d', 'billing_details[name]=Fustteszt Elek', '-d', 'billing_details[email]=fustteszt@example.com'])
  ).id
  stripeCli(['post', `/v1/payment_pages/${f.stripeSessionId}/confirm`, '-d', `payment_method=${pm}`, '-d', `expected_amount=${f.amountMinor}`])
  check('Stripe webhook → SUCCEEDED', await var_('webhook', async () => (await fizetes('GET', `?id=${f.id}`)).body.status === 'SUCCEEDED', 60), 'Fut a stripe listen?')
  check('számla fizetve a számlázóban (FIZETVE|I)', (await szamlazo(`SZAMLA|LEKER|${szamla}`)).includes('|FIZETVE|I|'), null)
  check('FizetesBeerkezett → a rendelés LEZART', await var_('lezárás', async () => (await rendeles('GET', String(no))).data?.state === 'LEZART', 30), null)

  // ---------------------------------------------------------------- 5. utóélet (SOAP)
  szakasz('Ügyfélszolgálat – SOAP')
  const jegy = await soap('CreateTicket', { PartnerTaxNumber: BAKONY.adoszam, OrderNo: no, ProductCode: TERMEK, Description: 'Order-to-cash fusteszt' })
  const jegyId = jegy.ertek('TicketId')
  check(`hibajegy ${jegyId}`, jegy.status === 200 && /^HJ-\d{6}$/.test(jegyId ?? ''), jegy.xml.slice(0, 300))
  const w = await soap('CheckWarranty', { OrderNo: no, ProductCode: TERMEK })
  check(`garancia: ${w.ertek('ReasonCode')}, lejár: ${w.ertek('ExpiresAt')?.slice(0, 10)}`, w.ertek('ReasonCode') === 'W-OK' && w.ertek('WarrantyMonths') === '12', w.xml.slice(0, 400))
  await soap('UpdateTicketStatus', { TicketId: jegyId!, Status: 'LEZART' })

  // ---------------------------------------------------------------- 6. nyomok: történet és események
  szakasz('Folyamattörténet és események')
  const tort = ((await rendeles('GET', `${no}/history`)).data as unknown as { to_state: string; action: string }[]).map((h) => `${h.action}→${h.to_state}`)
  check(
    'folyamattörténet: start, approve, fulfil, delivered, invoice, payment',
    JSON.stringify(tort) === JSON.stringify(['start→ROGZITETT', 'approve→JOVAHAGYOTT', 'fulfil→TELJESITES_ALATT', 'delivered→SZALLITVA', 'invoice→SZAMLAZVA', 'payment→LEZART']),
    tort
  )
  const orderEvents = (await sor('order_events')).filter((e) => e.orderNo === no && e.event === 'ORDER_STATE_CHANGED').map((e) => e.to)
  check('order_events: minden állapotváltás', JSON.stringify(orderEvents) === JSON.stringify(['ROGZITETT', 'JOVAHAGYOTT', 'TELJESITES_ALATT', 'SZALLITVA', 'SZAMLAZVA', 'LEZART']), orderEvents)
  const fizEsemeny = (await sor('payment_events')).find((e) => e.paymentId === f.id)
  check('payment_events: payment.succeeded, a rendelés értesítve', fizEsemeny?.type === 'payment.succeeded' && fizEsemeny.orderNo === no && fizEsemeny.orderNotified === true, fizEsemeny)

  // ---------------------------------------------------------------- takarítás: a kiszállított készlet visszavételezése
  await raktarHivas(supabase, { cmd: 'MOZGAS', cikk: 4701, tipus: 'KORREKCIO', db: DB, ref: 'SMOKE-11' })

  console.log(`\n(${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  console.log(failed === 0 ? 'Minden ellenőrzés sikeres – a teljes order-to-cash folyamat végigfutott.' : `${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
