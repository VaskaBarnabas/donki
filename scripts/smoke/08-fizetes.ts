/**
 * 8. fázis füstteszt: fizetés (REST + Stripe webhook), Stripe teszt módban.
 * A sikeres/sikertelen fizetést a Stripe CLI szimulálja a saját Checkout Sessionünkön (tesztkártyával),
 * a valódi események a `stripe listen`-en keresztül érkeznek a webhookhoz.
 *
 * Előfeltétel: futó Next.js, Flowable, és
 *   stripe listen --all-snapshot --forward-to localhost:3000/api/legacy/payments/webhook
 * Futtatás: npx tsx scripts/smoke/08-fizetes.ts   (~2 perc, a rendelés szállításkövetése miatt)
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'

process.loadEnvFile('.env.local')
const env = process.env as Record<string, string>
const BASE = `${env.APP_BASE_URL}/api/legacy`
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const RABA = '10000000-0000-4000-8000-000000000015'

type Fizetes = { id: string; status: string; url: string; amountMinor: number; currency: string; stripeSessionId: string; invoiceRef: string }

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}

async function fizetesApi(method: 'GET' | 'POST', query = '', body?: unknown, kulcs = env.LEGACY_PAYMENTS_KEY) {
  const res = await fetch(`${BASE}/payments${query}`, {
    method,
    headers: { Authorization: `Bearer ${kulcs}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function homlokzat(method: 'GET' | 'POST', ut: string, body?: unknown) {
  const res = await fetch(`${BASE}/orders/${ut}`, {
    method,
    headers: { 'X-Legacy-Key': env.LEGACY_ORDERS_KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return (await res.json()) as { success: boolean; data?: Record<string, unknown>; msg?: string }
}

async function szamlazo(parancs: string) {
  const res = await fetch(`${BASE}/billing`, { method: 'POST', body: `AUTH|${env.LEGACY_BILLING_KEY}\n${parancs}` })
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

async function statusz(id: string) {
  return (await fizetesApi('GET', `?id=${id}`)).body.status as string
}

async function fizetesEsemenyek(paymentId: string) {
  const { data } = await supabase.schema('pgmq_public').rpc('read', { queue_name: 'payment_events', sleep_seconds: 0, n: 1000 })
  return ((data ?? []) as { message: Record<string, unknown> }[]).map((m) => m.message).filter((m) => m.paymentId === paymentId)
}

async function main() {
  console.log(`8. fázis füstteszt – fizetés (${BASE}/payments)\n`)

  // ---------------------------------------------------------------- REST hibák („modern” stílus)
  const r401 = await fizetesApi('GET', '?invoiceRef=SZ-2026-000180', undefined, 'rossz')
  check('rossz Bearer → 401 authentication_error', r401.status === 401 && r401.body.error?.type === 'authentication_error', r401)
  check('hiányzó invoiceRef → 400', (await fizetesApi('POST', '', {})).status === 400, null)
  check('ismeretlen számla → 404', (await fizetesApi('POST', '', { invoiceRef: 'SZ-2026-999999' })).status === 404, null)
  const r409 = await fizetesApi('POST', '', { invoiceRef: 'SZ-2026-000180' })
  check('már fizetett számla → 409 invoice_already_paid', r409.status === 409 && r409.body.error?.type === 'invoice_already_paid', r409)
  check('sztornó (negatív) számla → 422', (await fizetesApi('POST', '', { invoiceRef: 'SZ-2026-000184' })).status === 422, null)

  const rossz = await fetch(`${BASE}/payments/webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=hamis' }, body: '{}' })
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
  check(`rendelés ${no} SZAMLAZVA, számla: ${szamla}`, szamlazva.data?.state === 'SZAMLAZVA' && !!szamla, szamlazva)

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

  // ---------------------------------------------------------------- sikertelen fizetés (Stripe CLI, elutasított kártya)
  const f2 = (await fizetesApi('POST', '', { invoiceRef: 'SZ-2026-000186' })).body as Fizetes
  cliFizetes(f2.stripeSessionId, f2.amountMinor, 'tok_chargeDeclined')
  check('webhook (payment_intent.payment_failed) → FAILED', await var_('webhook', async () => (await statusz(f2.id)) === 'FAILED'), null)
  const e2 = (await fizetesEsemenyek(f2.id)).find((e) => e.type === 'payment.failed')
  check('payment_events: payment.failed, hibaüzenettel', !!e2 && typeof e2.failureMessage === 'string', e2)
  check('a számla nem lett fizetett', (await szamlazo('SZAMLA|LEKER|SZ-2026-000186')).includes('|FIZETVE|N|'), null)

  // ---------------------------------------------------------------- lejárt Checkout Session
  const f3 = (await fizetesApi('POST', '', { invoiceRef: 'SZ-2026-000187' })).body as Fizetes
  await stripe.checkout.sessions.expire(f3.stripeSessionId)
  check('webhook (checkout.session.expired) → EXPIRED', await var_('webhook', async () => (await statusz(f3.id)) === 'EXPIRED'), null)
  check('payment_events: payment.expired', (await fizetesEsemenyek(f3.id)).some((e) => e.type === 'payment.expired'), null)

  // ---------------------------------------------------------------- takarítás: a kiszállított 1 db TK-00022 visszavételezése
  await raktarHivas(supabase, { cmd: 'MOZGAS', cikk: 4721, tipus: 'KORREKCIO', db: 1, ref: 'SMOKE-08' })

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
