// Reconciliation with Stripe (16. fázis): Stripe is the source of truth for card payments. Every local STRIPE payment
// is compared with its Checkout Session (status, amount), and every Checkout Session created by THIS database instance
// (metadata.systemInstance) must have a local record. Sessions of earlier, discarded database instances (still in the
// Stripe test account) are out of scope. LEGACY_IMPORT payments never existed in Stripe and are reported separately.

import type { Adatkliens as SupabaseClient } from '@/lib/rendszer/adat'
import { esemenyKuldes, stripe } from './kulso'
import * as t from './tarolo'

export type Mismatch = { paymentId: string | null; invoiceRef: string | null; kind: 'status' | 'amount' | 'missing_in_stripe' | 'only_in_stripe'; local: string | null; stripe: string | null }

function stripeStatus(s: { status: string | null; payment_status: string }): t.FizetesStatus | 'OPEN' {
  if (s.status === 'complete' && s.payment_status === 'paid') return 'SUCCEEDED'
  if (s.status === 'expired') return 'EXPIRED'
  return 'OPEN' // open: CREATED or FAILED locally (a declined attempt keeps the session open)
}

export async function reconcile(supabase: SupabaseClient) {
  const peldany = await t.peldany(supabase)
  const helyi = await t.lista(supabase, null, 200)
  const mismatches: Mismatch[] = []
  let matched = 0

  for (const f of helyi.filter((x) => x.source === 'STRIPE')) {
    if (!f.stripe_session_id) {
      mismatches.push({ paymentId: f.id, invoiceRef: f.invoice_ref, kind: 'missing_in_stripe', local: f.status, stripe: null })
      continue
    }
    let s
    try {
      s = await stripe().checkout.sessions.retrieve(f.stripe_session_id)
    } catch {
      mismatches.push({ paymentId: f.id, invoiceRef: f.invoice_ref, kind: 'missing_in_stripe', local: f.status, stripe: null })
      continue
    }
    const st = stripeStatus(s)
    const helyiNyitott = f.status === 'CREATED' || f.status === 'FAILED'
    if (st === 'OPEN' ? !helyiNyitott : st !== f.status) {
      mismatches.push({ paymentId: f.id, invoiceRef: f.invoice_ref, kind: 'status', local: f.status, stripe: st })
    } else if ((s.amount_total ?? -1) !== Number(f.amount_minor)) {
      mismatches.push({ paymentId: f.id, invoiceRef: f.invoice_ref, kind: 'amount', local: String(f.amount_minor), stripe: String(s.amount_total) })
    } else matched++
  }

  // only in Stripe: sessions of this instance without a local record
  const ismert = new Set(helyi.map((f) => f.stripe_session_id).filter(Boolean))
  const tol = Math.floor(new Date(peldany.created_at).getTime() / 1000)
  for await (const s of stripe().checkout.sessions.list({ limit: 100, created: { gte: tol } })) {
    if (s.metadata?.systemInstance !== peldany.id || ismert.has(s.id)) continue
    mismatches.push({ paymentId: s.metadata?.paymentId ?? null, invoiceRef: s.metadata?.invoiceRef ?? null, kind: 'only_in_stripe', local: null, stripe: stripeStatus(s) })
  }

  return {
    systemInstance: peldany.id,
    checked: helyi.filter((x) => x.source === 'STRIPE').length,
    matched,
    legacyImport: helyi.filter((x) => x.source === 'LEGACY_IMPORT').length,
    mismatches,
    checkedAt: new Date().toISOString(),
  }
}

/**
 * A Stripe-ban lejárt Checkout Session-ök átvétele (17. fázis, L6): ha a lejárati webhook nem érkezett meg (pl. nem
 * futott a továbbító), a link nálunk „létrehozva” maradt. A Stripe a gazda, így a lejártat átvesszük – ugyanazzal az
 * eseménnyel, mint a webhook (payment.expired). Idempotens: a már lejárt vagy sikeres fizetéshez nem nyúl.
 */
export async function lejartLinkekAtvetele(supabase: SupabaseClient): Promise<{ atvett: number; ellenorzott: number }> {
  const nyitott = (await t.lista(supabase, null, 200)).filter((f) => f.source === 'STRIPE' && f.stripe_session_id && (f.status === 'CREATED' || f.status === 'FAILED'))
  let atvett = 0
  for (const f of nyitott) {
    const s = await stripe().checkout.sessions.retrieve(f.stripe_session_id!).catch(() => null)
    if (s?.status !== 'expired') continue
    const friss = await t.modosit(supabase, f.id, { status: 'EXPIRED' })
    await esemenyKuldes(supabase, {
      type: 'payment.expired',
      paymentId: friss.id,
      invoiceRef: friss.invoice_ref,
      amountMinor: Number(friss.amount_minor),
      currency: friss.currency,
      stripeEventId: `egyeztetes:${s.id}`,
    })
    atvett++
  }
  return { atvett, ellenorzott: nyitott.length }
}
