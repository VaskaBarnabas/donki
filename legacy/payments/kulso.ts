// A fizetési modul kapcsolatai: Stripe, a számlázó szöveges protokollja (HTTP), a payment_events sor,
// és – a spec szerint – a rendelés megkeresése az orders.orders.invoice_ref alapján, majd Flowable üzenet.

import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { uzenetKuldes } from '@/lib/flowable/client'

let stripeKliens: Stripe | null = null

export function stripe(): Stripe {
  if (!stripeKliens) {
    const kulcs = process.env.STRIPE_SECRET_KEY
    if (!kulcs) throw new Error('Hianyzo STRIPE_SECRET_KEY')
    stripeKliens = new Stripe(kulcs)
  }
  return stripeKliens
}

/** Egy parancs a számlázó protokollon; a válasz mezőkre bontva. */
export async function szamlazo(parancs: string): Promise<string[]> {
  const res = await fetch(`${process.env.APP_BASE_URL}/api/legacy/billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `AUTH|${process.env.LEGACY_BILLING_KEY ?? ''}\n${parancs}\n`,
  })
  if (!res.ok) throw new Error(`Szamlazo HTTP ${res.status}`)
  return (await res.text()).trim().split('|')
}

/** "166650,67" → 16665067 (fillér), lebegőpontos számolás nélkül. */
export function fillerre(osszeg: string): number | null {
  const m = /^(-?)(\d+),(\d{2})$/.exec(osszeg)
  if (!m) return null
  return Number(`${m[1]}${m[2]}${m[3]}`)
}

export function maSzamlazoFormatumban(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date()).replaceAll('-', '.')
}

export type FizetesEsemeny = {
  type: 'payment.succeeded' | 'payment.failed' | 'payment.expired'
  paymentId: string
  invoiceRef: string
  amountMinor: number
  currency: string
  stripeEventId: string
  orderNo?: number | null
  orderNotified?: boolean
  failureMessage?: string | null
}

export async function esemenyKuldes(supabase: SupabaseClient, e: FizetesEsemeny) {
  const { error } = await supabase.schema('pgmq_public').rpc('send', {
    queue_name: 'payment_events',
    message: { ...e, occurredAt: new Date().toISOString() },
    sleep_seconds: 0,
  })
  if (error) throw new Error(`payment_events kuldes: ${error.message}`)
}

/**
 * A számlához tartozó rendelés folyamatának FizetesBeerkezett üzenet.
 * Visszaad: a rendelésszám (ha van) és hogy a folyamat fogadta-e az üzenetet.
 */
export async function rendelesErtesites(
  supabase: SupabaseClient,
  invoiceRef: string
): Promise<{ orderNo: number | null; notified: boolean }> {
  const { data, error } = await supabase
    .schema('orders')
    .from('orders')
    .select('order_no, process_instance_id')
    .eq('invoice_ref', invoiceRef)
    .maybeSingle()
  if (error) throw new Error(`Rendeles keresese: ${error.message}`)
  if (!data) return { orderNo: null, notified: false }
  if (!data.process_instance_id) return { orderNo: data.order_no, notified: false }
  return { orderNo: data.order_no, notified: await uzenetKuldes(data.process_instance_id, 'FizetesBeerkezett') }
}
