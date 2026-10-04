// A rendelésmodul kapcsolatai más modulokkal – mindig azok saját interfészén:
//   katalógus és CRM: PostgREST; számlázás: a szöveges protokoll HTTP-n; raktár: raktar-hivas.ts

import type { SupabaseClient } from '@supabase/supabase-js'

export type TermekInfo = { code: string; name: string; raktari_kod: number | null }
export type Partner = { id: string; name: string; tax_number: string; address: string | null }

export async function termekek(supabase: SupabaseClient, kodok: string[]): Promise<Map<string, TermekInfo>> {
  const { data, error } = await supabase
    .schema('catalog')
    .from('products')
    .select('code, name, raktari_kod')
    .in('code', kodok)
  if (error) throw new Error(`Katalogus lekerdezes: ${error.message}`)
  return new Map((data ?? []).map((t) => [t.code, t as TermekInfo]))
}

export async function partner(supabase: SupabaseClient, partnerId: string): Promise<Partner | null> {
  const { data, error } = await supabase
    .schema('crm')
    .from('partners')
    .select('id, name, tax_number, address')
    .eq('id', partnerId)
    .maybeSingle()
  if (error) throw new Error(`CRM partner lekerdezes: ${error.message}`)
  return data as Partner | null
}

/** Egy parancs a számlázó protokollon; a válasz mezőkre bontva (["OK", …] vagy ["ERR", "E107", …]). */
export async function szamlazo(parancs: string): Promise<string[]> {
  const res = await fetch(`${process.env.APP_BASE_URL}/api/legacy/billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `AUTH|${process.env.LEGACY_BILLING_KEY ?? ''}\n${parancs}\n`,
  })
  return (await res.text()).trim().split('|')
}

/** A számlázó protokoll nem ismer escape-elést: a mezőben nem lehet | és ; */
export function protokollMezo(s: string): string {
  return s.replace(/[|;\r\n]/g, ' ').trim()
}

export function protokollOsszeg(n: number | string): string {
  return Number(n).toFixed(2).replace('.', ',')
}

export function protokollMa(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date()).replaceAll('-', '.')
}
