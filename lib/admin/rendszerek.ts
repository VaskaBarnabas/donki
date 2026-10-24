// A portál szerveroldali hozzáférése a független rendszerekhez (backend-for-frontend). 16. fázis: minden hívás a
// varázslóban bekötött integráción megy (lib/portal/integraciok.ts) – a portál egyik rendszer adatbázisához sem fér
// hozzá közvetlenül, és a környezetében nincs rendszerkulcs. Csak bejelentkezett felhasználó hívhatja (a Supabase
// munkamenete nélkül az integrációk sem olvashatók).
//
//   crm()                 – a CRM és katalógus hivatalos PostgREST interfésze
//   szamlak()/adatlap()   – a számlázó szöveges protokollja (SZAMLA|LISTA, SZAMLA|ADATLAP, SZAMLA|TETELEK)
//   raktar()              – a raktár üzenetsora (LISTA, KARTON, LEKERDEZ, MOZGAS …)
//   sorMetrikak()/sor()   – a sorok a tulajdonos rendszerek /health és /ops/sor végpontjain

import 'server-only'
import { PostgrestClient } from '@supabase/postgrest-js'
import { raktarHivas, type RaktarParancs } from '@/legacy/orders/raktar-hivas'
import type { Adatkliens } from '@/lib/rendszer/adat'
import { kapcsolat, RAKTAR_OPS_CIM, type RendszerAzon } from '@/lib/portal/integraciok'
import { protokollMezo, szamlazoParancs } from './interfeszek'

export async function crm(): Promise<Adatkliens> {
  const k = await kapcsolat('crm')
  return new PostgrestClient(k.url, { headers: { Authorization: `Bearer ${k.kulcs}` } })
}

// ---------------------------------------------------------------- számlázó (szöveges protokoll)

export type SzamlaSor = { szam: string; tipus: string; vevo: string; brutto: string; kelt: string; hatarido: string; fizetve: boolean; lejart: boolean; szinkron: string }

/** SZAMLA|LISTA – a számlázó saját formátumában (YYYY.MM.DD, 38100,00). */
export async function szamlak(tol = '2000.01.01', ig = '2099.12.31'): Promise<{ sorok: SzamlaSor[]; hiba: string | null }> {
  const v = await szamlazoParancs(`SZAMLA|LISTA|${protokollMezo(tol)}|${protokollMezo(ig)}`)
  if (!v.startsWith('OK|')) return { sorok: [], hiba: v }
  const [, , ...tetelek] = v.split('|')
  return {
    hiba: null,
    sorok: tetelek.filter(Boolean).map((t) => {
      const [szam, tipus, vevo, brutto, kelt, hatarido, fizetve, lejart, szinkron] = t.split(';')
      return { szam, tipus, vevo, brutto, kelt, hatarido, fizetve: fizetve === 'I', lejart: lejart === 'I', szinkron }
    }),
  }
}

export type SzamlaAdatlap = {
  szam: string; tipus: string; vevo: string; rendeles: string | null; kelt: string; hatarido: string; netto: string; afa: string; brutto: string
  fizetve: boolean; fizetveDatum: string | null; lejart: boolean; eredeti: string | null; sztornozva: boolean; szamlazzSzam: string | null; szinkron: string
}

export async function adatlap(szam: string): Promise<SzamlaAdatlap | null> {
  if (!/^[A-Z]{2}-\d{4}-\d{6}$/.test(szam)) return null
  const v = await szamlazoParancs(`SZAMLA|ADATLAP|${szam}`)
  if (!v.startsWith('OK|')) return null
  const m = v.split('|')
  const n = (x: string) => (x === '-' ? null : x)
  return {
    szam: m[1], tipus: m[2], vevo: m[3], rendeles: n(m[4]), kelt: m[5], hatarido: m[6], netto: m[7], afa: m[8], brutto: m[9],
    fizetve: m[11] === 'I', fizetveDatum: n(m[12]), lejart: m[14] === 'I', eredeti: n(m[16]), sztornozva: m[18] === 'I', szamlazzSzam: n(m[20]), szinkron: m[21],
  }
}

export async function tetelek(szam: string): Promise<{ megnevezes: string; mennyiseg: string; egysegar: string }[]> {
  if (!/^[A-Z]{2}-\d{4}-\d{6}$/.test(szam)) return []
  const v = await szamlazoParancs(`SZAMLA|TETELEK|${szam}`)
  if (!v.startsWith('OK|')) return []
  return v.split('|').slice(2).filter(Boolean).map((t) => {
    const [megnevezes, mennyiseg, egysegar] = t.split(';')
    return { megnevezes, mennyiseg, egysegar }
  })
}

// ---------------------------------------------------------------- raktár (üzenetsor)

/** Raktári parancs a bekötött raktár üzenetsorán (a raktár saját formátumában válaszol). */
export async function raktar(parancs: RaktarParancs) {
  const k = await kapcsolat('inventory')
  return raktarHivas(parancs, undefined, new PostgrestClient(k.url, { headers: { Authorization: `Bearer ${k.kulcs}` } }))
}

// ---------------------------------------------------------------- üzenetsorok (a tulajdonos rendszereknél)

export type SorMetrika = { sor: string; hossz: number; legregebbi_mp: number | null; legujabb_mp: number | null; osszes_uzenet: number; archivalt: number }

/** A sor → tulajdonos rendszer; az /ops végpont címe és kulcsa a bekötött integrációból. */
export const SOROK: Record<string, RendszerAzon> = {
  inventory_commands: 'inventory',
  inventory_replies: 'inventory',
  inventory_alerts: 'inventory',
  order_events: 'orders',
  payment_events: 'payments',
}

async function opsCim(r: RendszerAzon): Promise<{ url: string; kulcs: string }> {
  const k = await kapcsolat(r)
  // a raktár üzemeltetési végpontja a worker konténerén van (a bekötött cím a sor-API)
  return { url: r === 'inventory' ? RAKTAR_OPS_CIM() : k.url, kulcs: k.kulcs }
}

/** A sorpanel metrikái a három sor-tulajdonos rendszer /health válaszából; egy kieső vagy be nem kötött rendszer sorai hiányoznak. */
export async function sorMetrikak(): Promise<{ sorok: SorMetrika[]; hibak: string[] }> {
  const eredmeny = await Promise.all(
    (['inventory', 'orders', 'payments'] as RendszerAzon[]).map(async (r) => {
      try {
        const { url } = await opsCim(r)
        const v = (await (await fetch(`${url}/health`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })).json()) as { queues?: SorMetrika[] }
        return { sorok: v.queues ?? [], hiba: null }
      } catch (e) {
        return { sorok: [], hiba: `${r}: ${e instanceof Error ? e.message : String(e)}` }
      }
    })
  )
  return { sorok: eredmeny.flatMap((e) => e.sorok), hibak: eredmeny.map((e) => e.hiba).filter((h): h is string => !!h) }
}

export type SorUzenet = { msg_id: number; read_ct: number; enqueued_at: string; vt: string; message: unknown }

/** Betekintés egy sorba a tulajdonos rendszer /ops/sor végpontján (nem olvassa ki az üzeneteket). */
export async function sor(nev: string, archiv: boolean): Promise<{ uzenetek: SorUzenet[]; hiba: string | null }> {
  const { url, kulcs } = await opsCim(SOROK[nev])
  const r = await fetch(`${url}/ops/sor/${nev}${archiv ? '?archiv=1' : ''}`, { headers: { 'X-Ops-Key': kulcs }, cache: 'no-store' })
  const v = (await r.json()) as { uzenetek?: SorUzenet[]; hiba?: string }
  return { uzenetek: v.uzenetek ?? [], hiba: v.hiba ?? null }
}
