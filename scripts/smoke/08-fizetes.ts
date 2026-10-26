/**
 * 8. fázis füstteszt: fizetés (REST + Stripe webhook), Stripe teszt módban.
 * A sikeres/sikertelen fizetést a Stripe CLI szimulálja a saját Checkout Sessionünkön (tesztkártyával),
 * a valódi események a `stripe listen`-en keresztül érkeznek a webhookhoz.
 *
 * Előfeltétel: futó Next.js, Flowable, és
 *   stripe listen --all-snapshot --forward-to localhost:3000/api/legacy/payments/webhook
 * A sikeres fizetés után megvárja, amíg a SzámlaBridge kiállítja a Számlázz.hu tesztszámlát (SZAMLABRIDGE_PUBLIC_KEY kell).
 * Futtatás: npx tsx scripts/smoke/08-fizetes.ts   (~2-4 perc)
 */
import { execFileSync } from 'node:child_process'
import Stripe from 'stripe'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'
import { fizetettSzamla, sztornozottSzamla, tesztVevo, ujSzamla } from './bizonylatok'
import { adat, env, URL } from './rendszerek'

const supabase = adat() // a .schema(x) a séma tulajdonos rendszeréhez megy (15. fázis)
const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const RABA = '10000000-0000-4000-8000-000000000015'

type Fizetes = { id: string; status: string; url: string; amountMinor: number; currency: string; stripeSessionId: string; invoiceRef: string }

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}

async function fizetesApi(method: 'GET' | 'POST', query = '', body?: unknown, kulcs = env.LEGACY_PAYMENTS_KEY) {
  const res = await fetch(`${URL.payments}/api/legacy/payments${query}`, {
    method,
    headers: { Authorization: `Bearer ${kulcs}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function homlokzat(method: 'GET' | 'POST', ut: string, body?: unknown) {
  const res = await fetch(`${URL.orders}/api/legacy/orders/${ut}`, {
    method,
    headers: { 'X-Legacy-Key': env.LEGACY_ORDERS_KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return (await res.json()) as { success: boolean; data?: Record<string, unknown>; msg?: string }
}

async function szamlazo(parancs: string) {
  const res = await fetch(`${URL.billing}/api/legacy/billing`, { method: 'POST', body: `AUTH|${env.LEGACY_BILLING_KEY}\n${parancs}` })
  return (await res.text()).trim()
}

// Stripe CLI: a saját Checkout Sessionünk kifizetése egy tesztkártyával (ugyanazzal, amit a `stripe trigger` fixture-ök használnak)
function cliFizetes(sessionId: string, amountMinor: number, token: 'tok_visa' | 'tok_chargeDeclined') {
  const stripeCli = (args: string[]) => {
    try {
      return execFileSync('stripe', [...args, '--api-key', env.STRIPE_SECRET_KEY], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      return (e as { stdout?: string }).stdout ?? ''
    }
  }
  // A Checkout megköveteli a kártyabirtokos nevét és e-mail címét
  const pm = JSON.parse(
    stripeCli([
      'payment_methods', 'create', '-d', 'type=card', '-d', `card[token]=${token}`,
      '-d', 'billing_details[name]=Fustteszt Elek', '-d', 'billing_details[email]=fustteszt@example.com',
    ])
  ).id
  return JSON.parse(stripeCli(['post', `/v1/payment_pages/${sessionId}/confirm`, '-d', `payment_method=${pm}`, '-d', `expected_amount=${amountMinor}`]))
}

async function var_(nev: string, felt: () => Promise<boolean>, maxMp = 60) {
  const kezdet = Date.now()
  while (Date.now() - kezdet < maxMp * 1000) {
    if (await felt()) {
      console.log(`     (${nev}: ${Math.round((Date.now() - kezdet) / 1000)} mp)`)
      return true
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  return false
}

function maPont() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date()).replaceAll('-', '.')
}

async function statusz(id: string) {
  return (await fizetesApi('GET', `?id=${id}`)).body.status as string
}

async function fizetesEsemenyek(paymentId: string) {
  const { data } = await supabase.schema('pgmq_public').rpc('read', { queue_name: 'payment_events', sleep_seconds: 0, n: 1000 })
  return ((data ?? []) as { message: Record<string, unknown> }[]).map((m) => m.message).filter((m) => m.paymentId === paymentId)
}

async function main() {
  console.log(`8. fázis füstteszt – fizetés (${URL.payments}/api/legacy/payments)\n`)

  // ---------------------------------------------------------------- REST hibák („modern” stílus)
  // a hibautakhoz saját bizonylatok (nem a seedeltek): fizetett számla, sztornó, kiállított (nem díjbekérő) számla
  const vevo = await tesztVevo()
  const [fizetett, sztornozott, kiallitott] = [await fizetettSzamla(vevo), await sztornozottSzamla(vevo), await ujSzamla(vevo)]
  const r401 = await fizetesApi('GET', `?invoiceRef=${fizetett.szam}`, undefined, 'rossz')
  check('rossz Bearer → 401 authentication_error', r401.status === 401 && r401.body.error?.type === 'authentication_error', r401)
  check('hiányzó invoiceRef → 400', (await fizetesApi('POST', '', {})).status === 400, null)
  check('ismeretlen számla → 404', (await fizetesApi('POST', '', { invoiceRef: 'SZ-2026-999999' })).status === 404, null)
  const r409 = await fizetesApi('POST', '', { invoiceRef: fizetett.szam })
  check('már fizetett számla → 409 invoice_already_paid', r409.status === 409 && r409.body.error?.type === 'invoice_already_paid', r409)
  check(`sztornó (negatív) számla ${sztornozott.storno} → 422`, (await fizetesApi('POST', '', { invoiceRef: sztornozott.storno })).status === 422, null)
  const r422 = await fizetesApi('POST', '', { invoiceRef: kiallitott.szam })
  check('kiállított számla (SZ-…) online fizetése → 422 invalid_invoice_type', r422.status === 422 && r422.body.error?.type === 'invalid_invoice_type', r422)

  const rossz = await fetch(`${URL.payments}/api/legacy/payments/webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=hamis' }, body: '{}' })
  check('webhook hamis aláírással → 400', rossz.status === 400, rossz.status)

  // ---------------------------------------------------------------- rendelés SZAMLAZVA állapotig
  const letrehoz = await homlokzat('POST', 'create', { quoteRef: null, partnerId: RABA, lines: [{ productCode: 'TK-00022', qty: 1, unitPrice: 22908 }] })
  const no = letrehoz.data?.orderNo as number
  await homlokzat('POST', `${no}/approve`)
  await homlokzat('POST', `${no}/fulfil`)
  await supabase.schema('orders').from('shipments').update({ carrier_status: 'KEZBESITVE' }).eq('order_no', no)
  await var_('szállítás', async () => (await homlokzat('GET', String(no))).data?.state === 'SZALLITVA', 120)
  const szamlazva = await homlokzat('POST', `${no}/invoice`)
  const szamla = szamlazva.data?.invoice_ref as string
  check(`rendelés ${no} SZAMLAZVA, díjbekérő: ${szamla}`, szamlazva.data?.state === 'SZAMLAZVA' && /^DB-/.test(szamla ?? ''), szamlazva)

  // ---------------------------------------------------------------- sikeres fizetés (Stripe CLI, tok_visa)
  const letrehozva = await fizetesApi('POST', '', { invoiceRef: szamla })
  const f = letrehozva.body as Fizetes
  check('POST /payments → 201, CREATED, Checkout URL', letrehozva.status === 201 && f.status === 'CREATED' && f.url.startsWith('https://checkout.stripe.com/'), letrehozva)

  const session = await stripe.checkout.sessions.retrieve(f.stripeSessionId)
  const leker = (await szamlazo(`SZAMLA|LEKER|${szamla}`)).split('|')
  check(
    'Stripe session: HUF, az összeg a számlázó bruttójából (fillér)',
    session.currency === 'huf' && session.amount_total === f.amountMinor && String(f.amountMinor) === leker[3].replace(',', ''),
    { session: [session.currency, session.amount_total], f: f.amountMinor, leker: leker[3] }
  )
  check('GET ?invoiceRef → a fizetés a listában', ((await fizetesApi('GET', `?invoiceRef=${szamla}`)).body.data as Fizetes[]).some((x) => x.id === f.id), null)

  const siker = cliFizetes(f.stripeSessionId, f.amountMinor, 'tok_visa')
  check('Stripe CLI: Checkout Session kifizetve', siker.status === 'complete' || siker.payment_status === 'paid' || siker.object === 'payment_page', siker.error ?? siker.status)

  check(
    'webhook (checkout.session.completed) → SUCCEEDED',
    await var_('webhook', async () => (await statusz(f.id)) === 'SUCCEEDED'),
    'Fut a `stripe listen --forward-to localhost:3000/api/legacy/payments/webhook`?'
  )
  check('számla FIZETVE|I (SZAMLA|FIZETVE)', (await szamlazo(`SZAMLA|LEKER|${szamla}`)).includes('|FIZETVE|I|'), null)
  const e1 = (await fizetesEsemenyek(f.id)).find((e) => e.type === 'payment.succeeded')
  check('payment_events: payment.succeeded, a rendelés értesítve', e1?.orderNo === no && e1?.orderNotified === true, e1)
  check('FizetesBeerkezett → a rendelés LEZART', await var_('lezárás', async () => (await homlokzat('GET', String(no))).data?.state === 'LEZART', 30), null)
  check('ugyanarra a számlára új fizetés → 409', (await fizetesApi('POST', '', { invoiceRef: szamla })).status === 409, null)

  // ---------------------------------------------------------------- Számlázz.hu tesztszámla a SzámlaBridge-en keresztül
  const stripeVevo = await stripe.customers.retrieve(String(session.customer))
  check('Stripe Customer a vevő számlázási adataival (név, cím, ország)', !('deleted' in stripeVevo) && !!stripeVevo.name && stripeVevo.address?.country === 'HU' && !!stripeVevo.address?.postal_code, stripeVevo)
  check('díjbekérőhöz rögzítve a fizetés azonosítója (SZAMLA|KULSO)', (await szamlazo(`SZAMLA|KULSO|${szamla}`)).split('|')[2]?.startsWith('pi_'), null)
  let kulso = ''
  const kesz = await var_('SzámlaBridge → Számlázz.hu számla', async () => {
    kulso = await szamlazo(`SZAMLA|KULSO|${szamla}`)
    return kulso.endsWith('|PDF|I')
  }, 180)
  check('a SzámlaBridge kiállította a Számlázz.hu tesztszámlát (PDF elérhető)', kesz, kulso)
  if (kesz) {
    const link = (await szamlazo(`SZAMLA|PDF|${szamla}`)).slice(3)
    const fej = new TextDecoder().decode(new Uint8Array(await (await fetch(link)).arrayBuffer()).slice(0, 5))
    check('SZAMLA|PDF → a Számlázz.hu számla PDF-je', link.includes('-szamlazz.pdf') && fej === '%PDF-', { link: link.slice(0, 80), fej })
  }

  // ---------------------------------------------------------------- sikertelen fizetés (Stripe CLI, elutasított kártya)
  // a sikertelen és a lejárt fizetéshez friss díjbekérők (online csak díjbekérő fizethető)
  const ujDijbekero = async () => (await szamlazo(`DIJBEKERO|KESZIT|VEVO-1015|RND-SMOKE|${maPont()}|8|ELOLEG;1;10000`)).split('|')[1]
  const db2 = await ujDijbekero()
  const f2 = (await fizetesApi('POST', '', { invoiceRef: db2 })).body as Fizetes
  cliFizetes(f2.stripeSessionId, f2.amountMinor, 'tok_chargeDeclined')
  check('webhook (payment_intent.payment_failed) → FAILED', await var_('webhook', async () => (await statusz(f2.id)) === 'FAILED'), null)
  const e2 = (await fizetesEsemenyek(f2.id)).find((e) => e.type === 'payment.failed')
  check('payment_events: payment.failed, hibaüzenettel', !!e2 && typeof e2.failureMessage === 'string', e2)
  check('a díjbekérő nem lett fizetett', (await szamlazo(`SZAMLA|LEKER|${db2}`)).includes('|FIZETVE|N|'), null)

  // ---------------------------------------------------------------- lejárt Checkout Session
  const f3 = (await fizetesApi('POST', '', { invoiceRef: await ujDijbekero() })).body as Fizetes
  await stripe.checkout.sessions.expire(f3.stripeSessionId)
  check('webhook (checkout.session.expired) → EXPIRED', await var_('webhook', async () => (await statusz(f3.id)) === 'EXPIRED'), null)
  check('payment_events: payment.expired', (await fizetesEsemenyek(f3.id)).some((e) => e.type === 'payment.expired'), null)

  // ---------------------------------------------------------------- takarítás: a kiszállított 1 db TK-00022 visszavételezése
  await raktarHivas({ cmd: 'MOZGAS', cikk: 4721, tipus: 'KORREKCIO', db: 1, ref: 'SMOKE-08' })

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
