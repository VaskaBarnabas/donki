// A rendelésmodul saját sémája (orders): rendelés, tételek, foglalási hivatkozások, történet, szállítás.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Rendeles = {
  order_no: number
  quote_ref: string | null
  partner_id: string
  state: string
  process_instance_id: string | null
  invoice_ref: string | null
  created_at: string
  updated_at: string
}

export type RendelesTetel = { productCode: string; qty: number; unitPrice: number }

type TetelRow = { product_code: string; qty: number; unit_price: number }

function db(supabase: SupabaseClient) {
  return supabase.schema('orders')
}

function hiba(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function rendeles(supabase: SupabaseClient, orderNo: number): Promise<Rendeles | null> {
  const { data, error } = await db(supabase).from('orders').select('*').eq('order_no', orderNo).maybeSingle()
  hiba(error)
  return data as Rendeles | null
}

export async function rendelesLista(supabase: SupabaseClient, state?: string): Promise<Rendeles[]> {
  let q = db(supabase).from('orders').select('*').order('order_no', { ascending: false }).limit(200)
  if (state) q = q.eq('state', state)
  const { data, error } = await q
  hiba(error)
  return (data ?? []) as Rendeles[]
}

export async function tetelek(supabase: SupabaseClient, orderNo: number): Promise<RendelesTetel[]> {
  const { data, error } = await db(supabase)
    .from('order_lines')
    .select('product_code, qty, unit_price')
    .eq('order_no', orderNo)
    .order('id')
  hiba(error)
  return ((data ?? []) as TetelRow[]).map((t) => ({ productCode: t.product_code, qty: t.qty, unitPrice: Number(t.unit_price) }))
}

export async function rendelesRogzit(
  supabase: SupabaseClient,
  quoteRef: string | null,
  partnerId: string,
  lines: RendelesTetel[]
): Promise<number> {
  const { data, error } = await db(supabase).rpc('rendeles_rogzit', {
    p_quote_ref: quoteRef ?? '',
    p_partner_id: partnerId,
    p_tetelek: lines,
  })
  hiba(error)
  return Number(data)
}

export async function rendelesTorles(supabase: SupabaseClient, orderNo: number) {
  const { error } = await db(supabase).from('orders').delete().eq('order_no', orderNo)
  hiba(error)
}

export async function tetelekCsere(supabase: SupabaseClient, orderNo: number, lines: RendelesTetel[]) {
  const { error } = await db(supabase).rpc('tetelek_csere', { p_order_no: orderNo, p_tetelek: lines })
  hiba(error)
}

export async function rendelesModosit(supabase: SupabaseClient, orderNo: number, mezok: Partial<Rendeles>) {
  const { error } = await db(supabase)
    .from('orders')
    .update({ ...mezok, updated_at: new Date().toISOString() })
    .eq('order_no', orderNo)
  hiba(error)
}

export async function tortenetIr(
  supabase: SupabaseClient,
  sor: { order_no: number; from_state: string | null; to_state: string; action: string; ok: boolean; reason?: string | null; detail?: string | null }
) {
  const { error } = await db(supabase).from('process_history').insert(sor)
  hiba(error)
}

export async function tortenet(supabase: SupabaseClient, orderNo: number) {
  const { data, error } = await db(supabase)
    .from('process_history')
    .select('from_state, to_state, action, ok, reason, detail, ts')
    .eq('order_no', orderNo)
    .order('ts')
    .order('id')
  hiba(error)
  return data ?? []
}

export async function utolsoHiba(supabase: SupabaseClient, orderNo: number) {
  const { data, error } = await db(supabase)
    .from('process_history')
    .select('action, reason, detail, ts')
    .eq('order_no', orderNo)
    .eq('ok', false)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  hiba(error)
  return data as { action: string; reason: string | null; detail: string | null } | null
}

export async function foglalasRefMent(supabase: SupabaseClient, orderNo: number, cikk: number, dbSzam: number, corr: string) {
  const { error } = await db(supabase).from('reservations_ref').insert({ order_no: orderNo, cikk, db: dbSzam, corr })
  hiba(error)
}

export async function foglalasRefTorles(supabase: SupabaseClient, orderNo: number) {
  const { error } = await db(supabase).from('reservations_ref').delete().eq('order_no', orderNo)
  hiba(error)
}

export type Szallitas = {
  order_no: number
  carrier: string
  tracking_no: string | null
  carrier_status: string
  eta: string | null
  updated_at: string
}

export async function szallitas(supabase: SupabaseClient, orderNo: number): Promise<Szallitas | null> {
  const { data, error } = await db(supabase).from('shipments').select('*').eq('order_no', orderNo).maybeSingle()
  hiba(error)
  return data as Szallitas | null
}

export async function szallitasLetrehoz(supabase: SupabaseClient, sz: Omit<Szallitas, 'updated_at'>) {
  const { error } = await db(supabase).from('shipments').upsert(sz, { onConflict: 'order_no' })
  hiba(error)
}
