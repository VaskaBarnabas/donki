// Stripe webhook feldolgozás.
//   checkout.session.completed (paid)  → SUCCEEDED, SZAMLA|FIZETVE, payment_events, FizetesBeerkezett a rendelésnek
//   checkout.session.expired           → EXPIRED + esemény
//   payment_intent.payment_failed      → FAILED + esemény (a Checkoutban az ügyfél még újrapróbálhatja)
// Idempotens: a Stripe újraküldheti az eseményt. Sikeres fizetésnél előbb a mellékhatások (számla, rendelés),
// a státusz csak a végén lesz SUCCEEDED – ha közben hiba van, a Stripe újrapróbálja, és a lépések ismételhetők.

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { esemenyKuldes, maSzamlazoFormatumban, rendelesErtesites, szamlazo } from './kulso'
import * as t from './tarolo'

async function fizetesKeres(supabase: SupabaseClient, metadata: Stripe.Metadata | null, sessionId?: string) {
  if (metadata?.paymentId) {
    const f = await t.egy(supabase, metadata.paymentId)
    if (f) return f
  }
  return sessionId ? t.sessionAlapjan(supabase, sessionId) : null
}

function piId(pi: string | Stripe.PaymentIntent | null): string | null {
  return typeof pi === 'string' ? pi : (pi?.id ?? null)
}

async function sikeres(supabase: SupabaseClient, event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid') return 'not_paid_yet'
  const f = await fizetesKeres(supabase, session.metadata, session.id)
  if (!f) return 'unknown_payment'
  if (f.status === 'SUCCEEDED') return 'already_processed'

  const fizetve = await szamlazo(`SZAMLA|FIZETVE|${f.invoice_ref}|${maSzamlazoFormatumban()}`)
  if (fizetve[0] !== 'OK') throw new Error(`SZAMLA|FIZETVE: ${fizetve.join('|')}`)

  const rendeles = await rendelesErtesites(supabase, f.invoice_ref)
  const friss = await t.modosit(supabase, f.id, {
    status: 'SUCCEEDED',
    stripe_payment_intent: piId(session.payment_intent),
    stripe_session_id: f.stripe_session_id ?? session.id,
  })
  await esemenyKuldes(supabase, {
    type: 'payment.succeeded',
    paymentId: friss.id,
    invoiceRef: friss.invoice_ref,
    amountMinor: Number(friss.amount_minor),
    currency: friss.currency,
    stripeEventId: event.id,
    orderNo: rendeles.orderNo,
    orderNotified: rendeles.notified,
  })
  return 'succeeded'
}

async function lejart(supabase: SupabaseClient, event: Stripe.Event, session: Stripe.Checkout.Session) {
  const f = await fizetesKeres(supabase, session.metadata, session.id)
  if (!f) return 'unknown_payment'
  if (f.status === 'SUCCEEDED' || f.status === 'EXPIRED') return 'already_processed'
  const friss = await t.modosit(supabase, f.id, { status: 'EXPIRED' })
  await esemenyKuldes(supabase, {
    type: 'payment.expired',
    paymentId: friss.id,
    invoiceRef: friss.invoice_ref,
    amountMinor: Number(friss.amount_minor),
    currency: friss.currency,
    stripeEventId: event.id,
  })
  return 'expired'
}

async function sikertelen(supabase: SupabaseClient, event: Stripe.Event, pi: Stripe.PaymentIntent) {
  const f = await fizetesKeres(supabase, pi.metadata)
  if (!f) return 'unknown_payment'
  if (f.status === 'SUCCEEDED') return 'already_processed'
  const friss = await t.modosit(supabase, f.id, { status: 'FAILED', stripe_payment_intent: pi.id })
  await esemenyKuldes(supabase, {
    type: 'payment.failed',
    paymentId: friss.id,
    invoiceRef: friss.invoice_ref,
    amountMinor: Number(friss.amount_minor),
    currency: friss.currency,
    stripeEventId: event.id,
    failureMessage: pi.last_payment_error?.message ?? null,
  })
  return 'failed'
}

export async function esemenyFeldolgozas(supabase: SupabaseClient, event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed':
      return sikeres(supabase, event, event.data.object)
    case 'checkout.session.expired':
      return lejart(supabase, event, event.data.object)
    case 'payment_intent.payment_failed':
      return sikertelen(supabase, event, event.data.object)
    default:
      return 'ignored'
  }
}
