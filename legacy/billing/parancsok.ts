// A számlázó protokoll parancsai. Csak a saját billing sémáján dolgozik.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { pdfBiztosit, pdfLink } from './pdf'
import {
  datumBe,
  datumKi,
  igenNem,
  normalizal,
  ok,
  osszegBe,
  osszegKi,
  ProtokollHiba,
} from './protokoll'

type Parancs = (supabase: SupabaseClient, mezok: string[]) => Promise<string>

function mezoszam(mezok: string[], db: number, legalabb = false) {
  if (legalabb ? mezok.length < db : mezok.length !== db) throw new ProtokollHiba('E101')
}

function kotelezo(s: string | undefined): string {
  const t = (s ?? '').trim()
  if (!t) throw new ProtokollHiba('E101')
  return t
}

function dbHiba(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

// PARTNER|KERES|<adoszam>  →  OK|VEVO-1023|NEV|CIM
const partnerKeres: Parancs = async (supabase, m) => {
  mezoszam(m, 3)
  const { data, error } = await supabase
    .schema('billing')
    .from('vevok')
    .select('kod, nev, cim')
    .eq('adoszam', kotelezo(m[2]))
    .maybeSingle()
  dbHiba(error)
  if (!data) throw new ProtokollHiba('E107')
  return ok(data.kod, data.nev, data.cim ?? '')
}

// PARTNER|UJ|<adoszam>|<NEV>|<CIM>  →  OK|VEVO-1031  (létező adószámra a meglévő kód)
const partnerUj: Parancs = async (supabase, m) => {
  mezoszam(m, 5)
  const adoszam = kotelezo(m[2])
  const billing = supabase.schema('billing')
  const { data: meglevo, error } = await billing.from('vevok').select('kod').eq('adoszam', adoszam).maybeSingle()
  dbHiba(error)
  if (meglevo) return ok(meglevo.kod)

  const { data, error: insHiba } = await billing
    .from('vevok')
    .insert({ adoszam, nev: normalizal(kotelezo(m[3])), cim: normalizal(m[4] ?? '') })
    .select('kod')
    .single()
  dbHiba(insHiba)
  return ok(data!.kod)
}

// DIJBEKERO|KESZIT / SZAMLA|KESZIT |<vevo>|<rendeles_ref>|<kelt>|<hatarido_nap>|<tetel>;<db>;<egysegar>|…
// →  OK|<szam>|<brutto>|<hatarido>
function keszit(tipus: 'SZAMLA' | 'DIJBEKERO'): Parancs {
  return async (supabase, m) => {
    mezoszam(m, 7, true)
    const vevo = kotelezo(m[2]).toUpperCase()
    const rendelesRef = m[3].trim()
    const kelt = datumBe(m[4])
    if (!kelt) throw new ProtokollHiba('E120')
    if (!/^\d+$/.test(m[5].trim())) throw new ProtokollHiba('E101')
    const hataridoNap = Number(m[5])

    const tetelek = m.slice(6).map((t) => {
      const [megnevezes, db, egysegar, ...tobb] = t.split(';')
      const mennyiseg = osszegBe(db ?? '')
      const ar = osszegBe(egysegar ?? '')
      if (tobb.length > 0 || !megnevezes?.trim() || mennyiseg === null || mennyiseg <= 0 || ar === null || ar < 0) {
        throw new ProtokollHiba('E101')
      }
      return { megnevezes: normalizal(megnevezes), mennyiseg, egysegar: ar }
    })

    const { data, error } = await supabase.schema('billing').rpc('szamla_keszit', {
      p_tipus: tipus,
      p_vevo_kod: vevo,
      p_rendeles_ref: rendelesRef,
      p_kelt: kelt,
      p_hatarido_nap: hataridoNap,
      p_tetelek: tetelek,
    })
    if (error?.code === 'BL107') throw new ProtokollHiba('E107')
    dbHiba(error)
    const r = data as { szam: string; brutto: number; hatarido: string }

    // A bizonylat ekkor már ki van állítva; ha a PDF most nem sikerül, a SZAMLA|PDF pótolja.
    await pdfBiztosit(supabase, r.szam).catch((e) => console.error('[billing] PDF', r.szam, e))
    return ok(r.szam, osszegKi(r.brutto), datumKi(r.hatarido))
  }
}

type SzamlaAllapot = { szam: string; vevo_kod: string; brutto: number; hatarido: string; fizetve: boolean; lejart: boolean }

async function szamlaBetolt(supabase: SupabaseClient, szam: string): Promise<SzamlaAllapot> {
  const { data, error } = await supabase
    .schema('billing')
    .from('szamlak')
    .select('szam, vevo_kod, brutto, hatarido, fizetve, lejart')
    .eq('szam', kotelezo(szam).toUpperCase())
    .maybeSingle()
  dbHiba(error)
  if (!data) throw new ProtokollHiba('E108')
  return data as SzamlaAllapot
}

// SZAMLA|LEKER|<szam>  →  OK|<szam>|<vevo>|<brutto>|<hatarido>|FIZETVE|N|LEJART|N
const szamlaLeker: Parancs = async (supabase, m) => {
  mezoszam(m, 3)
  const s = await szamlaBetolt(supabase, m[2])
  return ok(s.szam, s.vevo_kod, osszegKi(s.brutto), datumKi(s.hatarido), 'FIZETVE', igenNem(s.fizetve), 'LEJART', igenNem(s.lejart))
}

// SZAMLA|LEJART  →  OK|<db>|<szam>;<vevo>;<brutto>;<hatarido>|…  (a napi cron lejart jelzője alapján)
const szamlaLejart: Parancs = async (supabase, m) => {
  mezoszam(m, 2)
  const { data, error } = await supabase
    .schema('billing')
    .from('szamlak')
    .select('szam, vevo_kod, brutto, hatarido')
    .eq('lejart', true)
    .eq('fizetve', false)
    .order('hatarido')
  dbHiba(error)
  const sorok = (data ?? []).map((s) => [s.szam, s.vevo_kod, osszegKi(s.brutto), datumKi(s.hatarido)].join(';'))
  return ok(sorok.length, ...sorok)
}

// SZAMLA|FIZETVE|<szam>|<datum>  →  OK  (már fizetettre is OK, nem változtat)
const szamlaFizetve: Parancs = async (supabase, m) => {
  mezoszam(m, 4)
  const datum = datumBe(m[3])
  if (!datum) throw new ProtokollHiba('E120')
  const s = await szamlaBetolt(supabase, m[2])
  if (s.fizetve) return ok()
  const { error } = await supabase
    .schema('billing')
    .from('szamlak')
    .update({ fizetve: true, fizetve_datum: datum, lejart: false })
    .eq('szam', s.szam)
  dbHiba(error)
  return ok()
}

// SZAMLA|STORNO|<szam>  →  OK|<sztorno szam>  (már sztornózottra a meglévő sztornó száma)
const szamlaStorno: Parancs = async (supabase, m) => {
  mezoszam(m, 3)
  const { data, error } = await supabase.schema('billing').rpc('szamla_storno', { p_szam: kotelezo(m[2]).toUpperCase() })
  if (error?.code === 'BL108') throw new ProtokollHiba('E108')
  dbHiba(error)
  const r = data as { szam: string; uj: boolean }
  if (r.uj) await pdfBiztosit(supabase, r.szam).catch((e) => console.error('[billing] PDF', r.szam, e))
  return ok(r.szam)
}

// SZAMLA|PDF|<szam>  →  OK|<letöltési link, 1 óráig érvényes>
const szamlaPdf: Parancs = async (supabase, m) => {
  mezoszam(m, 3)
  const s = await szamlaBetolt(supabase, m[2])
  try {
    const ut = await pdfBiztosit(supabase, s.szam)
    return ok(await pdfLink(supabase, ut))
  } catch (e) {
    console.error('[billing] PDF', s.szam, e)
    throw new ProtokollHiba('E200')
  }
}

const PARANCSOK: Record<string, Parancs> = {
  'PARTNER|KERES': partnerKeres,
  'PARTNER|UJ': partnerUj,
  'DIJBEKERO|KESZIT': keszit('DIJBEKERO'),
  'SZAMLA|KESZIT': keszit('SZAMLA'),
  'SZAMLA|LEKER': szamlaLeker,
  'SZAMLA|LEJART': szamlaLejart,
  'SZAMLA|FIZETVE': szamlaFizetve,
  'SZAMLA|STORNO': szamlaStorno,
  'SZAMLA|PDF': szamlaPdf,
}

/** Egy parancssor végrehajtása; a hibát ProtokollHiba-ként dobja. */
export async function vegrehajt(sor: string): Promise<string> {
  const mezok = sor.split('|')
  const kulcs = `${(mezok[0] ?? '').trim().toUpperCase()}|${(mezok[1] ?? '').trim().toUpperCase()}`
  const parancs = PARANCSOK[kulcs]
  if (!parancs) throw new ProtokollHiba('E100')
  return parancs(createServiceClient(), mezok)
}
