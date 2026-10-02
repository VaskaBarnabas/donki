// Az ajánlatmotor kapcsolatai más modulokkal – mindig azok saját interfészén keresztül:
//   CRM és katalógus: PostgREST (crm.partners, catalog.price_for)
//   Rendelések: a rendelésmodul régi stílusú HTTP homlokzata (POST /api/legacy/orders/create)

import type { SupabaseClient } from '@supabase/supabase-js'

export type Partner = { id: string; name: string; customer_group: string }

export type ArInfo = {
  product_code: string
  name: string
  list_price: number
  discount_pct: number
  price: number
  active: boolean
}

export async function partnerLekerdezes(supabase: SupabaseClient, partnerId: string): Promise<Partner | null> {
  const { data, error } = await supabase
    .schema('crm')
    .from('partners')
    .select('id, name, customer_group')
    .eq('id', partnerId)
    .maybeSingle()
  if (error) throw new Error(`CRM partner lekerdezes: ${error.message}`)
  return data
}

/** null, ha a termékkód ismeretlen (a price_for 404-et ad). */
export async function arLekerdezes(
  supabase: SupabaseClient,
  productCode: string,
  customerGroup: string
): Promise<ArInfo | null> {
  const { data, error, status } = await supabase
    .schema('catalog')
    .rpc('price_for', { product_code: productCode, customer_group: customerGroup })
  if (status === 404) return null
  if (error) throw new Error(`Katalogus price_for: ${error.message}`)
  const r = data as ArInfo
  return { ...r, list_price: Number(r.list_price), discount_pct: Number(r.discount_pct), price: Number(r.price) }
}

export class RendelesHiba extends Error {}

export type RendelesTetel = { productCode: string; qty: number; unitPrice: number }

/** Rendelés létrehozása a rendelésmodul homlokzatán. Válasz: {"success":true,"data":{"orderNo":…}}. */
export async function rendelesLetrehozas(adat: {
  quoteRef: string
  partnerId: string
  lines: RendelesTetel[]
}): Promise<number> {
  const url = `${process.env.APP_BASE_URL}/api/legacy/orders/create`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Legacy-Key': process.env.LEGACY_ORDERS_KEY ?? '' },
      body: JSON.stringify(adat),
    })
  } catch {
    throw new RendelesHiba('Rendeles letrehozasa sikertelen: a rendelesmodul nem elerheto')
  }

  let valasz: { success?: boolean; msg?: string; data?: { orderNo?: number } }
  try {
    valasz = await res.json()
  } catch {
    throw new RendelesHiba('Rendeles letrehozasa sikertelen: a rendelesmodul nem elerheto')
  }

  if (!valasz.success || typeof valasz.data?.orderNo !== 'number') {
    throw new RendelesHiba(`Rendeles letrehozasa sikertelen: ${valasz.msg ?? 'ismeretlen valasz'}`)
  }
  return valasz.data.orderNo
}
