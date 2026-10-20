// A fizetési modul kapcsolatai: Stripe, a számlázó szöveges protokollja (HTTP), a payment_events sor,
// és – a spec szerint – a rendelés megkeresése az orders.orders.invoice_ref alapján, majd Flowable üzenet.

import type { Adatkliens as SupabaseClient } from '@/lib/rendszer/adat'
import Stripe from 'stripe'

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
  const res = await fetch(`${process.env.BILLING_URL}/api/legacy/billing`, {
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
  externalInvoice?: { provider: string; paymentIntent: string; status: string } | null
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
 * A rendeléskezelő értesítése a díjbekérő kifizetéséről – a rendeléskezelő saját homlokzatán
 * (POST /api/legacy/orders/payment-received). A fizetési rendszer nem nyúl a rendelési adatbázishoz és a
 * rendeléskezelő folyamatmotorjához. Visszaad: a rendelésszám (ha van) és hogy a folyamat fogadta-e az értesítést.
 */
export async function rendelesErtesites(invoiceRef: string): Promise<{ orderNo: number | null; notified: boolean }> {
  const res = await fetch(`${process.env.ORDERS_URL}/api/legacy/orders/payment-received`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Legacy-Key': process.env.LEGACY_ORDERS_KEY ?? '' },
    body: JSON.stringify({ invoiceRef }),
  })
  const v = (await res.json()) as { success: boolean; msg?: string; data?: { orderNo: number | null; notified: boolean } }
  if (!v.success || !v.data) throw new Error(`Rendeleskezelo ertesitese: ${v.msg ?? `HTTP ${res.status}`}`)
  return v.data
}
