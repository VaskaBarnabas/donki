// A portál integrációs rétege (16. fázis): a független rendszereket a portál csak a varázslóban „bekötött”
// interfészeiken éri el. Egy integráció = a rendszer címe + a hozzáférési kulcsa, a Supabase-ben (public.integrations),
// a kulcs AES-256-GCM-mel titkosítva. A titkosító kulcs (PORTAL_INTEGRACIO_KEY) csak a portál szerverén van.
// A portál környezetében a rendszerek kulcsai közül egy sincs – minden innen jön.

import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type { RendszerAzon } from './kapcsolat-teszt'
import type { RendszerAzon } from './kapcsolat-teszt'

/** A varázsló rendszerei, sorrendben. A javasolt cím a rendszerek hálózatán érvényes (a portál konténeréből). */
export const INTEGRALHATO: { id: RendszerAzon; nev: string; interfesz: string; javasoltCim: string; kulcsLeiras: string }[] = [
  { id: 'crm', nev: 'CRM és katalógus', interfesz: 'PostgREST', javasoltCim: 'http://crm-api:3000', kulcsLeiras: 'a CRM API-kulcsa (CRM_API_KEY, .env.stack)' },
  { id: 'quote', nev: 'Ajánlatkezelő', interfesz: 'JSON-RPC 2.0', javasoltCim: 'http://quote:4101', kulcsLeiras: 'LEGACY_QUOTE_KEY (.env.local)' },
  { id: 'orders', nev: 'Rendeléskezelő', interfesz: 'régi HTTP homlokzat', javasoltCim: 'http://orders:4102', kulcsLeiras: 'LEGACY_ORDERS_KEY (.env.local)' },
  { id: 'inventory', nev: 'Raktárrendszer', interfesz: 'üzenetsor (pgmq)', javasoltCim: 'http://inventory-api:3000', kulcsLeiras: 'a raktár API-kulcsa (INVENTORY_API_KEY, .env.stack)' },
  { id: 'billing', nev: 'Számlázó rendszer', interfesz: 'szöveges protokoll', javasoltCim: 'http://billing:4103', kulcsLeiras: 'LEGACY_BILLING_KEY (.env.local)' },
  { id: 'payments', nev: 'Fizetési rendszer', interfesz: 'REST', javasoltCim: 'http://payments:4104', kulcsLeiras: 'LEGACY_PAYMENTS_KEY (.env.local)' },
  { id: 'support', nev: 'Helpdesk', interfesz: 'SOAP 1.1', javasoltCim: 'http://support:4105', kulcsLeiras: 'LEGACY_SUPPORT_KEY (.env.local)' },
]

/** A raktár üzemeltetési végpontja (sor-betekintés, egészség) a worker konténerén van, nem a sor-API-n. */
export const RAKTAR_OPS_CIM = () => process.env.INVENTORY_URL ?? 'http://localhost:4106'

import { titkosit, visszafejt } from './titok'

export { titkosit }

// ---------------------------------------------------------------- integrációk olvasása

export class NincsBekotve extends Error {
  constructor(public readonly rendszer: RendszerAzon) {
    super(`A(z) ${rendszer} rendszer nincs bekötve a portálhoz.`)
  }
}

export type IntegracioSor = { system: RendszerAzon; base_url: string; status: string; last_test_at: string | null; last_test_msg: string | null; updated_at: string }

/** Az integrációk listája (titok nélkül) – a varázslónak és az irányítópultnak. */
export const integraciok = cache(async (): Promise<IntegracioSor[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('integrations').select('system, base_url, status, last_test_at, last_test_msg, updated_at')
  if (error) throw new Error(`integraciok: ${error.message}`)
  return (data ?? []) as IntegracioSor[]
})

/** Egy rendszer kapcsolata (cím + visszafejtett kulcs). Kérésenként egyszer olvassa. */
export const kapcsolat = cache(async (rendszer: RendszerAzon): Promise<{ url: string; kulcs: string }> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('integrations').select('base_url, secret_enc').eq('system', rendszer).maybeSingle()
  if (error) throw new Error(`integracio: ${error.message}`)
  if (!data) throw new NincsBekotve(rendszer)
  return { url: data.base_url.replace(/\/+$/, ''), kulcs: visszafejt(data.secret_enc) }
})

// A kapcsolatteszt (elérhetőség + kulcs-próba a rendszer saját protokollján) külön, server-only nélküli modulban,
// hogy a füstteszt közvetlenül is hívhassa.
export { kapcsolatTeszt, type TesztEredmeny } from './kapcsolat-teszt'
