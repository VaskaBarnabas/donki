// Fizetés – REST (Authorization: Bearer). „Modern” hibák: HTTP státusz + {"error":{"type","message"}}.
//   POST /api/legacy/payments            {"invoiceRef":"SZ-2026-000187"} → 201 {id, url, status, …}
//   GET  /api/legacy/payments?invoiceRef=…  → {"data":[…]}
//   GET  /api/legacy/payments?id=<uuid>      → {…}

import type { SupabaseClient } from '@supabase/supabase-js'
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

export async function fizetesLetrehozas(supabase: SupabaseClient, body: unknown) {
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
  const amountMinor = fillerre(szamla[3])
  if (amountMinor === null) throw new ApiHiba(502, 'billing_error', `Unparsable amount: ${szamla[3]}`)
  if (amountMinor < MIN_HUF_FILLER) {
    throw new ApiHiba(422, 'invalid_amount', `Amount ${szamla[3]} HUF is below the minimum chargeable amount (175,00 HUF)`)
  }

  const fizetes = await t.letrehoz(supabase, invoiceRef, amountMinor)
  const meta = { paymentId: fizetes.id, invoiceRef }
  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      client_reference_id: fizetes.id,
      metadata: meta,
      payment_intent_data: { metadata: meta, description: `Szamla ${invoiceRef}` },
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'huf', unit_amount: amountMinor, product_data: { name: `Szamla ${invoiceRef}` } },
        },
      ],
      success_url: `${process.env.APP_BASE_URL}/?fizetes=sikeres&szamla=${invoiceRef}`,
      cancel_url: `${process.env.APP_BASE_URL}/?fizetes=megszakitva&szamla=${invoiceRef}`,
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
  throw new ApiHiba(400, 'invalid_request_error', 'Either id or invoiceRef query parameter is required')
}
