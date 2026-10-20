// A portál szerveroldali hozzáférése a független rendszerekhez (15. fázis, backend-for-frontend).
// A felhasználó a Supabase-ben jelentkezik be; a rendszerek felé a portál a SAJÁT hozzáférésével megy, de csak
// akkor, ha a hívó be van jelentkezve. A böngészőbe egyik kulcs sem kerül.
//
//   crm()            – a CRM és katalógus hivatalos PostgREST interfésze (CRM_API_URL, CRM_API_KEY)
//   rendszerAdat(r)  – ÁTMENETI (16. fázisig) olvasó hozzáférés a listázó interfész nélküli rendszerek adataihoz
//                      (számlázó, fizetés, raktár, rendelési sor). A 16. fázis integrációs varázslója váltja ki.
//   sorTulajdonos()  – az üzenetsorok a tulajdonos rendszer adatbázisában vannak

import 'server-only'
import { PostgrestClient } from '@supabase/postgrest-js'
import { crmKliens, type Adatkliens } from '@/lib/rendszer/adat'
import { createClient } from '@/lib/supabase/server'

async function bejelentkezve() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) throw new Error('Nincs bejelentkezve')
}

export async function crm(): Promise<Adatkliens> {
  await bejelentkezve()
  return crmKliens()
}

export type AdminRendszer = 'billing' | 'payments' | 'inventory' | 'orders'

// natív fejlesztéskor (npm run dev) a rendszerek belső PostgREST-jének gépre kivezetett portja
const ALAP_URL: Record<AdminRendszer, string> = {
  orders: 'http://localhost:54102',
  billing: 'http://localhost:54103',
  payments: 'http://localhost:54104',
  inventory: 'http://localhost:54106',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- séma-típusok nélkül
export async function rendszerAdat(r: AdminRendszer): Promise<PostgrestClient<any, any, any>> {
  await bejelentkezve()
  const kulcs = process.env[`${r.toUpperCase()}_ADMIN_KEY`]
  if (!kulcs) throw new Error(`Hianyzo kornyezeti valtozo: ${r.toUpperCase()}_ADMIN_KEY`)
  return new PostgrestClient(process.env[`${r.toUpperCase()}_ADMIN_URL`] ?? ALAP_URL[r], { headers: { Authorization: `Bearer ${kulcs}` } })
}

/** Üzenetsor → a tulajdonos rendszer és a sorpanel-függvények sémája */
export const SOROK: Record<string, { rendszer: AdminRendszer; sema: string }> = {
  inventory_commands: { rendszer: 'inventory', sema: 'inventory' },
  inventory_replies: { rendszer: 'inventory', sema: 'inventory' },
  inventory_alerts: { rendszer: 'inventory', sema: 'inventory' },
  order_events: { rendszer: 'orders', sema: 'orders' },
  payment_events: { rendszer: 'payments', sema: 'payment' },
}

export type SorMetrika = { sor: string; hossz: number; legregebbi_mp: number | null; legujabb_mp: number | null; osszes_uzenet: number; archivalt: number }

/** A sorpanel metrikái mindhárom sor-tulajdonos rendszerből; egy kieső rendszer sorai egyszerűen hiányoznak. */
export async function sorMetrikak(): Promise<{ sorok: SorMetrika[]; hibak: string[] }> {
  const forrasok: [AdminRendszer, string][] = [['inventory', 'inventory'], ['orders', 'orders'], ['payments', 'payment']]
  const eredmeny = await Promise.all(
    forrasok.map(async ([r, sema]) => {
      try {
        const { data, error } = await (await rendszerAdat(r)).schema(sema).rpc('sor_metrikak')
        if (error) return { sorok: [], hiba: `${r}: ${error.message}` }
        return { sorok: (data ?? []) as SorMetrika[], hiba: null }
      } catch (e) {
        return { sorok: [], hiba: `${r}: ${e instanceof Error ? e.message : String(e)}` }
      }
    })
  )
  return { sorok: eredmeny.flatMap((e) => e.sorok), hibak: eredmeny.map((e) => e.hiba).filter((h): h is string => !!h) }
}
