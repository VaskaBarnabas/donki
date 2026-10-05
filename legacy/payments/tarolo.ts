// A fizetési modul saját sémája (payment). Belső UUID + Stripe azonosítók, összeg fillérben (Stripe minor unit).

import type { SupabaseClient } from '@supabase/supabase-js'

export type FizetesStatus = 'CREATED' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'

export type Fizetes = {
  id: string
  invoice_ref: string
  stripe_session_id: string | null
  stripe_payment_intent: string | null
  checkout_url: string | null
  amount_minor: number
  currency: string
  status: FizetesStatus
  created_at: string
  updated_at: string
}

function tabla(supabase: SupabaseClient) {
  return supabase.schema('payment').from('payments')
}

function hiba(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function letrehoz(supabase: SupabaseClient, invoiceRef: string, amountMinor: number): Promise<Fizetes> {
  const { data, error } = await tabla(supabase)
    .insert({ invoice_ref: invoiceRef, amount_minor: amountMinor, currency: 'huf' })
    .select('*')
    .single()
  hiba(error)
  return data as Fizetes
}

export async function modosit(supabase: SupabaseClient, id: string, mezok: Partial<Fizetes>): Promise<Fizetes> {
  const { data, error } = await tabla(supabase)
    .update({ ...mezok, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  hiba(error)
  return data as Fizetes
}

export async function torol(supabase: SupabaseClient, id: string) {
  const { error } = await tabla(supabase).delete().eq('id', id)
  hiba(error)
}

export async function egy(supabase: SupabaseClient, id: string): Promise<Fizetes | null> {
  const { data, error } = await tabla(supabase).select('*').eq('id', id).maybeSingle()
  hiba(error)
  return data as Fizetes | null
}

export async function sessionAlapjan(supabase: SupabaseClient, sessionId: string): Promise<Fizetes | null> {
  const { data, error } = await tabla(supabase).select('*').eq('stripe_session_id', sessionId).maybeSingle()
  hiba(error)
  return data as Fizetes | null
}

export async function szamlaAlapjan(supabase: SupabaseClient, invoiceRef: string): Promise<Fizetes[]> {
  const { data, error } = await tabla(supabase).select('*').eq('invoice_ref', invoiceRef).order('created_at')
  hiba(error)
  return (data ?? []) as Fizetes[]
}

/** REST válaszformátum („modern”, camelCase, ISO idő). */
export function dto(f: Fizetes) {
  return {
    id: f.id,
    invoiceRef: f.invoice_ref,
    status: f.status,
    url: f.checkout_url,
    amountMinor: Number(f.amount_minor),
    currency: f.currency,
    stripeSessionId: f.stripe_session_id,
    stripePaymentIntent: f.stripe_payment_intent,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  }
}
