// Közös törzsadat-fordítás minden szervernek: a katalógus (termékkód ↔ raktári cikkszám) és a CRM
// (UUID ↔ adószám). A legacy modulok mind más azonosítót használnak; a fordítás egy helyen van.
// Forrás: a CRM és a katalógus PostgREST interfésze (service role).

import { db } from './kornyezet'

export type Termek = {
  code: string
  name: string
  category_id: string
  list_price: number
  unit: string
  warranty_months: number
  raktari_kod: number | null
  active: boolean
}
type Katalogus = { kodSzerint: Map<string, Termek>; cikkSzerint: Map<number, Termek>; kategoriak: Map<string, string>; ido: number }

let katalogusCache: Katalogus | null = null

/** A termékkatalógus és a kategóriák, 5 percig gyorsítótárazva. */
export async function katalogus(): Promise<Katalogus> {
  if (katalogusCache && Date.now() - katalogusCache.ido < 5 * 60_000) return katalogusCache
  const [t, k] = await Promise.all([
    db().schema('catalog').from('products').select('code, name, category_id, list_price, unit, warranty_months, raktari_kod, active').order('code'),
    db().schema('catalog').from('categories').select('id, name'),
  ])
  if (t.error) throw new Error(`katalogus: ${t.error.message}`)
  if (k.error) throw new Error(`katalogus: ${k.error.message}`)
  const termekek = ((t.data ?? []) as Termek[]).map((x) => ({ ...x, list_price: Number(x.list_price) }))
  katalogusCache = {
    kodSzerint: new Map(termekek.map((x) => [x.code, x])),
    cikkSzerint: new Map(termekek.filter((x) => x.raktari_kod !== null).map((x) => [x.raktari_kod!, x])),
    kategoriak: new Map(((k.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])),
    ido: Date.now(),
  }
  return katalogusCache
}

/** Ügyfélcsoport-ár a katalógus price_for függvényéből; ismeretlen termékkódra null. */
export async function ar(sku: string, customerGroup: string): Promise<{ price: number; discountPct: number; active: boolean } | null> {
  const { data, error } = await db().schema('catalog').rpc('price_for', { product_code: sku, customer_group: customerGroup })
  if (error) {
    if (error.code === 'PT404') return null
    throw new Error(`price_for: ${error.message}`)
  }
  const r = data as { price: number | string; discount_pct: number | string; active: boolean }
  return { price: Number(r.price), discountPct: Number(r.discount_pct), active: r.active }
}

// ---------------------------------------------------------------- CRM

export type Vevo = { id: string; name: string; tax_number: string; address: string | null; customer_group: string; owner_name: string | null }
const VEVO_MEZOK = 'id, name, tax_number, address, customer_group, owner_name'

export async function vevok(ids: string[]): Promise<Map<string, Vevo>> {
  const egyedi = [...new Set(ids)]
  if (egyedi.length === 0) return new Map()
  const { data, error } = await db().schema('crm').from('partners').select(VEVO_MEZOK).in('id', egyedi)
  if (error) throw new Error(`crm: ${error.message}`)
  return new Map(((data ?? []) as Vevo[]).map((v) => [v.id, v]))
}

export async function vevo(id: string): Promise<Vevo | null> {
  return (await vevok([id])).get(id) ?? null
}

/** Adószám → CRM vevő (a számlázó és az ügyfélszolgálat adószámmal azonosít). */
export async function vevokAdoszamSzerint(adoszamok: string[]): Promise<Map<string, Vevo>> {
  const egyedi = [...new Set(adoszamok.filter(Boolean))]
  if (egyedi.length === 0) return new Map()
  const { data, error } = await db().schema('crm').from('partners').select(VEVO_MEZOK).in('tax_number', egyedi)
  if (error) throw new Error(`crm: ${error.message}`)
  return new Map(((data ?? []) as Vevo[]).map((v) => [v.tax_number, v]))
}

export async function vevoKereses(opts: { query?: string; taxNumber?: string; limit: number }): Promise<Vevo[]> {
  let q = db().schema('crm').from('partners').select(VEVO_MEZOK).order('name').limit(opts.limit)
  if (opts.taxNumber) q = q.eq('tax_number', opts.taxNumber)
  if (opts.query) q = q.ilike('name', `%${opts.query.replace(/[%_,()]/g, ' ')}%`)
  const { data, error } = await q
  if (error) throw new Error(`crm: ${error.message}`)
  return (data ?? []) as Vevo[]
}

export async function kapcsolattartok(partnerId: string) {
  const { data, error } = await db().schema('crm').from('contacts').select('name, email, phone, role').eq('partner_id', partnerId).order('name')
  if (error) throw new Error(`crm: ${error.message}`)
  return (data ?? []) as { name: string; email: string | null; phone: string | null; role: string | null }[]
}

// ---------------------------------------------------------------- közös kanonikus szótárak

export const CUSTOMER_GROUPS = ['normal', 'loyal', 'reseller', 'key_account'] as const
const CSOPORT: Record<string, { key: (typeof CUSTOMER_GROUPS)[number]; label: string }> = {
  NORMAL: { key: 'normal', label: 'Normál' },
  TORZS: { key: 'loyal', label: 'Törzsvevő' },
  VISZONTELADO: { key: 'reseller', label: 'Viszonteladó' },
  KIEMELT: { key: 'key_account', label: 'Kiemelt' },
}
export function ugyfelcsoport(legacy: string) {
  return CSOPORT[legacy] ?? { key: 'normal' as const, label: 'Normál' }
}

/** Rendelésazonosító: RND-100045 vagy 100045 → szám, és vissza. */
export const rendelesSzam = (orderId: string) => Number(orderId.replace(/^RND-/i, ''))
export const rendelesRef = (no: number) => `RND-${no}`
