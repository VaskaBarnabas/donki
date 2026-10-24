// Fizetés – REST (Authorization: Bearer). „Modern” hibák: HTTP státusz + {"error":{"type","message"}}.
//   POST /api/legacy/payments            {"invoiceRef":"SZ-2026-000187"} → 201 {id, url, status, …}
//   GET  /api/legacy/payments?invoiceRef=…  → {"data":[…]}
//   GET  /api/legacy/payments?id=<uuid>      → {…}

import type { Adatkliens as SupabaseClient } from '@/lib/rendszer/adat'
import { z } from 'zod'
import { fillerre, stripe, szamlazo } from './kulso'
import * as t from './tarolo'

const MIN_HUF_FILLER = 17500 // Stripe minimum terhelés: 175,00 HUF

export class ApiHiba extends Error {
  constructor(
    public readonly status: number,
    public readonly type: string,
    message: string
  ) {
    super(message)
  }
}

const createSema = z.object({ invoiceRef: z.string().regex(/^(SZ|DB)-\d{4}-\d{6}$/) })

/** "1133 BUDAPEST, VACI UT 118." → irányítószám, város, utca */
function cimBontas(cim: string) {
  const m = /^(\d{4})\s+([^,]+),\s*(.+)$/.exec(cim.trim())
  return m ? { zip: m[1], city: m[2].trim(), address: m[3].trim() } : { zip: '', city: '', address: cim.trim() }
}

function szamlaBridgeMeta(nev: string, adoszam: string, cim: string) {
  const c = cimBontas(cim)
  return { buyer_name: nev, tax_number: adoszam, country: 'Hungary', zip: c.zip, city: c.city, address: c.address }
}

/** Stripe Customer a vevő számlázási adataival (a SzámlaBridge elsődlegesen innen veszi őket). */
async function stripeVevo(nev: string, adoszam: string, cim: string, paymentId: string) {
  const c = cimBontas(cim)
  const alap = {
    name: nev,
    address: { line1: c.address, postal_code: c.zip, city: c.city, country: 'HU' },
    metadata: { paymentId, tax_number: adoszam },
  }
  try {
    return await stripe().customers.create({ ...alap, tax_id_data: [{ type: 'hu_tin', value: adoszam }] })
  } catch {
    // ha a Stripe nem fogadja el az adószám formátumát, adószám nélkül (a metaadatban így is ott van)
    return stripe().customers.create(alap)
  }
}

/** Biztosíték: a fizetés (és vele a SzámlaBridge számlázás) csak teszt üzemmódban engedélyezett. */
function tesztUzem() {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || process.env.SZAMLABRIDGE_MODE !== 'test') {
    throw new ApiHiba(503, 'live_mode_disabled', 'Payments are only enabled in test mode (Stripe test key and SZAMLABRIDGE_MODE=test)')
  }
}

export async function fizetesLetrehozas(supabase: SupabaseClient, body: unknown) {
  tesztUzem()
  const p = createSema.safeParse(body)
  if (!p.success) throw new ApiHiba(400, 'invalid_request_error', 'invoiceRef is required (SZ-YYYY-NNNNNN or DB-YYYY-NNNNNN)')
  const invoiceRef = p.data.invoiceRef

  // Az összeg a számlázó protokollból jön, nem a billing táblából.
  let szamla: string[]
  try {
    szamla = await szamlazo(`SZAMLA|LEKER|${invoiceRef}`)
  } catch (e) {
    throw new ApiHiba(502, 'billing_unavailable', `Billing service unavailable: ${e instanceof Error ? e.message : e}`)
  }
  if (szamla[0] === 'ERR' && szamla[1] === 'E108') throw new ApiHiba(404, 'not_found', `Invoice ${invoiceRef} not found`)
  if (szamla[0] !== 'OK') throw new ApiHiba(502, 'billing_error', `Billing error: ${szamla.join('|')}`)

  // OK|<szam>|<vevo>|<brutto>|<hatarido>|FIZETVE|N|LEJART|N
  if (szamla[6] === 'I') throw new ApiHiba(409, 'invoice_already_paid', `Invoice ${invoiceRef} is already paid`)
  // A végleges számlát a fizetés után a SzámlaBridge állítja ki – egy már kiállított számla (SZ-…)
  // online fizetése második számlát eredményezne, ezért online csak díjbekérő fizethető.
  if (!invoiceRef.startsWith('DB-')) {
    throw new ApiHiba(422, 'invalid_invoice_type', 'Online payment is only available for pro-forma invoices (DB-…); the final invoice is issued after payment')
  }
  const amountMinor = fillerre(szamla[3])
  if (amountMinor === null) throw new ApiHiba(502, 'billing_error', `Unparsable amount: ${szamla[3]}`)
  if (amountMinor < MIN_HUF_FILLER) {
    throw new ApiHiba(422, 'invalid_amount', `Amount ${szamla[3]} HUF is below the minimum chargeable amount (175,00 HUF)`)
  }

  // A vevő adatai a számlázó protokollból – a SzámlaBridge ezekből állítja ki a Számlázz.hu számlát
  const vevo = await szamlazo(`PARTNER|ADAT|${szamla[2]}`)
  if (vevo[0] !== 'OK') throw new ApiHiba(502, 'billing_error', `Billing error: ${vevo.join('|')}`)
  const [, , nev, adoszam, cim] = vevo
  const brutto = (amountMinor / 100).toFixed(2)
  const tetel = `Dijbekero ${invoiceRef} szerinti termekek`

  const fizetes = await t.letrehoz(supabase, invoiceRef, amountMinor)
  const meta = { paymentId: fizetes.id, invoiceRef, systemInstance: (await t.peldany(supabase)).id }
  try {
    const customer = await stripeVevo(nev, adoszam, cim, fizetes.id)
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer: customer.id,
      client_reference_id: fizetes.id,
      metadata: meta,
      payment_intent_data: {
        description: tetel,
        // a saját azonosítóink + a SzámlaBridge metaadat-sémája (https://www.szamlabridge.com/fordevelopers)
        metadata: {
          ...meta,
          ...szamlaBridgeMeta(nev, adoszam, cim),
          identifier: invoiceRef,
          vat: '27',
          is_unit_price_gross: 'true',
          label: tetel,
          quantity: '1',
          unit: 'db',
          unit_price: brutto,
          comment: `Dijbekero: ${invoiceRef}`,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'huf', unit_amount: amountMinor, product_data: { name: tetel } },
        },
      ],
      success_url: `${process.env.PORTAL_PUBLIC_URL}/?fizetes=sikeres&szamla=${invoiceRef}`,
      cancel_url: `${process.env.PORTAL_PUBLIC_URL}/?fizetes=megszakitva&szamla=${invoiceRef}`,
    })
    return t.dto(
      await t.modosit(supabase, fizetes.id, { stripe_session_id: session.id, checkout_url: session.url })
    )
  } catch (e) {
    await t.torol(supabase, fizetes.id)
    throw new ApiHiba(502, 'stripe_error', `Stripe error: ${e instanceof Error ? e.message : e}`)
  }
}

export async function fizetesLekerdezes(supabase: SupabaseClient, query: URLSearchParams) {
  const id = query.get('id')
  const invoiceRef = query.get('invoiceRef')

  if (id) {
    if (!z.uuid().safeParse(id).success) throw new ApiHiba(400, 'invalid_request_error', 'id must be a UUID')
    const f = await t.egy(supabase, id)
    if (!f) throw new ApiHiba(404, 'not_found', `Payment ${id} not found`)
    return t.dto(f)
  }
  if (invoiceRef) {
    return { data: (await t.szamlaAlapjan(supabase, invoiceRef)).map(t.dto) }
  }
  // list mode (16. fázis): GET ?status=SUCCEEDED&limit=50  – newest first, max 200
  const status = query.get('status')
  const limitParam = query.get('limit')
  if (status !== null || limitParam !== null) {
    if (status && !['CREATED', 'SUCCEEDED', 'FAILED', 'EXPIRED'].includes(status)) throw new ApiHiba(400, 'invalid_request_error', 'status must be CREATED, SUCCEEDED, FAILED or EXPIRED')
    const limit = Math.min(Math.max(Number(limitParam ?? 50) || 50, 1), 200)
    return { data: (await t.lista(supabase, status, limit)).map(t.dto) }
  }
  throw new ApiHiba(400, 'invalid_request_error', 'One of id, invoiceRef, status or limit query parameters is required')
}
