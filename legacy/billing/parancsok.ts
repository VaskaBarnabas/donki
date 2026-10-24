// A számlázó protokoll parancsai. A saját billing sémáján dolgozik; a bizonylatok GAZDÁJA a Számlázz.hu (16. fázis):
// minden kiállítás, sztornó és kifizetés ott is megtörténik (Számla Agent), a gazda összege a mérvadó.

/** A Számlázz.hu hibája → E200 (a szöveg a protokoll szabályai szerint: nagybetű, ékezet és | ; nélkül) */
function agentHiba(e: unknown): never {
  if (e instanceof AgentHiba || e instanceof KulsoSzamlaHiba) {
    const kod = e instanceof AgentHiba ? `${e.kod} ` : ''
    throw new ProtokollHiba('E200', normalizal(`SZAMLAZZ.HU: ${kod}${e.message}`).replace(/[|;]/g, ' ').slice(0, 160))
  }
  throw e
}

import type { Adatkliens as SupabaseClient } from '@/lib/rendszer/adat'
import { createServiceClient } from '@/lib/rendszer/adat'
import { kulsoPdfBiztosit, mesterPdfBiztosit, pdfLink } from './pdf'
import { kulsoAllapot, KulsoSzamlaHiba, tesztUzemEllenorzes } from './szamlabridge'
import { AgentHiba } from './szamlazzhu'
import { egyeztetes, kifizetesMesterbe, mesterbe } from './szinkron'
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

// PARTNER|ADAT|<vevokod>  →  OK|VEVO-1023|NEV|ADOSZAM|CIM
const partnerAdat: Parancs = async (supabase, m) => {
  mezoszam(m, 3)
  const { data, error } = await supabase
    .schema('billing')
    .from('vevok')
    .select('kod, nev, adoszam, cim')
    .eq('kod', kotelezo(m[2]).toUpperCase())
    .maybeSingle()
  dbHiba(error)
  if (!data) throw new ProtokollHiba('E107')
  return ok(data.kod, data.nev, data.adoszam, data.cim ?? '')
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

    // A gazda (Számlázz.hu) is kiállítja; ha nem sikerül, a saját rögzítés visszavonódik – nem lehet eltérés.
    try {
      const m = await mesterbe(supabase, r.szam)
      return ok(r.szam, osszegKi(m.brutto), datumKi(r.hatarido))
    } catch (e) {
      const b = supabase.schema('billing')
      await b.from('nav_log').delete().eq('szam', r.szam)
      await b.from('szamlak').delete().eq('szam', r.szam)
      console.error('[billing] Szamlazz.hu kiallitas sikertelen, visszavonva:', r.szam, e instanceof Error ? e.message : e)
      agentHiba(e)
    }
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
  // a gazdában is (additiv=false: ismételhető – egy újrapróbált webhook sem okoz eltérést)
  await kifizetesMesterbe(supabase, s.szam, datum).catch(agentHiba)
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
  if (r.uj) {
    try {
      await mesterbe(supabase, r.szam) // a sztornó a gazdában (az eredeti Számlázz.hu számlájára)
    } catch (e) {
      const b = supabase.schema('billing')
      await b.from('nav_log').delete().eq('szam', r.szam)
      await b.from('szamlak').delete().eq('szam', r.szam)
      await b.from('szamlak').update({ sztornozva: false }).eq('szam', kotelezo(m[2]).toUpperCase())
      agentHiba(e)
    }
  }
  return ok(r.szam)
}

// SZAMLA|PDF|<szam>  →  OK|<letöltési link, 1 óráig érvényes>
// Ha a díjbekérőt kifizették és a SzámlaBridge kiállította a végszámlát, annak a PDF-jét adja;
// különben a bizonylat Számlázz.hu-beli PDF-jét (a gazdáét – ugyanaz, ami a Számlázz.hu felületén látszik).
const szamlaPdf: Parancs = async (supabase, m) => {
  mezoszam(m, 3)
  const s = await szamlaBetolt(supabase, m[2])
  const { data: kulso } = await supabase.schema('billing').from('szamlak').select('kulso_ref').eq('szam', s.szam).single()
  try {
    if (kulso?.kulso_ref) {
      const ut = await kulsoPdfBiztosit(supabase, s.szam)
      if (!ut) throw new ProtokollHiba('E200', 'KULSO SZAMLA MEG NEM ERHETO EL')
      return ok(await pdfLink(supabase, ut))
    }
    const ut = await mesterPdfBiztosit(supabase, s.szam)
    return ok(await pdfLink(supabase, ut))
  } catch (e) {
    if (e instanceof ProtokollHiba) throw e
    if (e instanceof AgentHiba) agentHiba(e)
    console.error('[billing] PDF', s.szam, e)
    throw new ProtokollHiba('E200', e instanceof KulsoSzamlaHiba ? e.message : undefined)
  }
}

// SZAMLA|KULSO|<szam>|<fizetes_azonosito>  →  OK                      (külső számla hivatkozásának rögzítése)
// SZAMLA|KULSO|<szam>                      →  OK|<szam>|<ref>|<allapot>|PDF|I/N   (lekérdezés)
const szamlaKulso: Parancs = async (supabase, m) => {
  if (m.length !== 3 && m.length !== 4) throw new ProtokollHiba('E101')
  const s = await szamlaBetolt(supabase, m[2])
  const billing = supabase.schema('billing')
  const { data, error } = await billing.from('szamlak').select('kulso_ref, kulso_allapot, kulso_pdf_utvonal').eq('szam', s.szam).single()
  dbHiba(error)
  const k = data as { kulso_ref: string | null; kulso_allapot: string | null; kulso_pdf_utvonal: string | null }

  if (m.length === 4) {
    const ref = kotelezo(m[3])
    if (k.kulso_ref && k.kulso_ref !== ref) throw new ProtokollHiba('E101', 'MAR VAN KULSO HIVATKOZAS')
    if (!k.kulso_ref) {
      const { error: modHiba } = await billing.from('szamlak').update({ kulso_ref: ref, kulso_allapot: 'FUGGOBEN' }).eq('szam', s.szam)
      dbHiba(modHiba)
    }
    return ok()
  }

  if (!k.kulso_ref) return ok(s.szam, '-', 'NINCS', 'PDF', 'N')
  let allapot = k.kulso_allapot ?? ''
  let pdf = !!k.kulso_pdf_utvonal
  if (!pdf) {
    try {
      tesztUzemEllenorzes()
      pdf = !!(await kulsoPdfBiztosit(supabase, s.szam))
      allapot = pdf ? 'KIALLITVA' : (await kulsoAllapot(k.kulso_ref)).allapot
      if (!pdf) await billing.from('szamlak').update({ kulso_allapot: allapot }).eq('szam', s.szam)
    } catch (e) {
      if (e instanceof KulsoSzamlaHiba) throw new ProtokollHiba('E200', e.message)
      throw e
    }
  }
  return ok(s.szam, k.kulso_ref, normalizal(allapot).replace(/[|;]/g, ' '), 'PDF', pdf ? 'I' : 'N')
}

// SZAMLA|LISTA|<tol YYYY.MM.DD>|<ig YYYY.MM.DD>  →  OK|<db>|<szam>;<tipus>;<vevo>;<brutto>;<kelt>;<hatarido>;<fizetve I/N>;<lejart I/N>;<szinkron>|…
// (a Számlázz.hu nem tud listázni – a bizonylatok listája a számlázóban van; legfeljebb 500, a legújabb elöl)
const szamlaLista: Parancs = async (supabase, m) => {
  mezoszam(m, 4)
  const tol = datumBe(m[2])
  const ig = datumBe(m[3])
  if (!tol || !ig) throw new ProtokollHiba('E120')
  const { data, error } = await supabase
    .schema('billing')
    .from('szamlak')
    .select('szam, tipus, vevo_kod, brutto, kelt, hatarido, fizetve, lejart, szinkron_allapot')
    .gte('kelt', tol)
    .lte('kelt', ig)
    .order('kelt', { ascending: false })
    .order('szam', { ascending: false })
    .limit(500)
  dbHiba(error)
  const sorok = (data ?? []).map((s) =>
    [s.szam, s.tipus, s.vevo_kod, osszegKi(s.brutto), datumKi(s.kelt), datumKi(s.hatarido), igenNem(s.fizetve), igenNem(s.lejart), s.szinkron_allapot].join(';')
  )
  return ok(sorok.length, ...sorok)
}

// SZAMLA|ADATLAP|<szam>  →  OK|<szam>|<tipus>|<vevo>|<rendeles vagy ->|<kelt>|<hatarido>|<netto>|<afa>|<brutto>|FIZETVE|<I/N>|<fizetes datuma vagy ->|
//                            LEJART|<I/N>|EREDETI|<szam vagy ->|SZTORNOZVA|<I/N>|SZAMLAZZHU|<sorszam vagy ->|<szinkron>
const szamlaAdatlap: Parancs = async (supabase, m) => {
  mezoszam(m, 3)
  const { data, error } = await supabase.schema('billing').from('szamlak').select('*').eq('szam', kotelezo(m[2]).toUpperCase()).maybeSingle()
  dbHiba(error)
  if (!data) throw new ProtokollHiba('E108')
  const s = data as Record<string, string | number | boolean | null>
  const v = (x: unknown) => (x === null || x === undefined || x === '' ? '-' : String(x))
  return ok(
    String(s.szam), String(s.tipus), String(s.vevo_kod), v(s.rendeles_ref), datumKi(String(s.kelt)), datumKi(String(s.hatarido)),
    osszegKi(Number(s.netto)), osszegKi(Number(s.afa)), osszegKi(Number(s.brutto)),
    'FIZETVE', igenNem(Boolean(s.fizetve)), s.fizetve_datum ? datumKi(String(s.fizetve_datum)) : '-',
    'LEJART', igenNem(Boolean(s.lejart)), 'EREDETI', v(s.eredeti_szam), 'SZTORNOZVA', igenNem(Boolean(s.sztornozva)),
    'SZAMLAZZHU', v(s.szamlazz_szam), String(s.szinkron_allapot)
  )
}

// SZAMLA|TETELEK|<szam>  →  OK|<db>|<megnevezes>;<mennyiseg>;<egysegar>|…
const szamlaTetelek: Parancs = async (supabase, m) => {
  mezoszam(m, 3)
  const s = await szamlaBetolt(supabase, m[2])
  const { data, error } = await supabase.schema('billing').from('szamla_tetelek').select('megnevezes, mennyiseg, egysegar').eq('szam', s.szam).order('sor')
  dbHiba(error)
  const sorok = (data ?? []).map((t) => [t.megnevezes, osszegKi(t.mennyiseg), osszegKi(t.egysegar)].join(';'))
  return ok(sorok.length, ...sorok)
}

// SZAMLA|SZINKRON  →  OK|<osszes>|<egyezo>|<elteres db>|<szam>;<allapot>;<reszlet>|…   (azonnali egyeztetés a Számlázz.hu-val)
const szamlaSzinkron: Parancs = async (supabase, m) => {
  mezoszam(m, 2)
  const e = await egyeztetes(supabase).catch(agentHiba)
  return ok(e.osszes, e.ok, e.elteres.length, ...e.elteres.map((x) => [x.szam, x.allapot, normalizal(x.reszlet).replace(/[|;]/g, ' ')].join(';')))
}

const PARANCSOK: Record<string, Parancs> = {
  'SZAMLA|LISTA': szamlaLista,
  'SZAMLA|TETELEK': szamlaTetelek,
  'SZAMLA|ADATLAP': szamlaAdatlap,
  'SZAMLA|SZINKRON': szamlaSzinkron,
  'PARTNER|KERES': partnerKeres,
  'PARTNER|UJ': partnerUj,
  'PARTNER|ADAT': partnerAdat,
  'DIJBEKERO|KESZIT': keszit('DIJBEKERO'),
  'SZAMLA|KESZIT': keszit('SZAMLA'),
  'SZAMLA|LEKER': szamlaLeker,
  'SZAMLA|LEJART': szamlaLejart,
  'SZAMLA|FIZETVE': szamlaFizetve,
  'SZAMLA|STORNO': szamlaStorno,
  'SZAMLA|PDF': szamlaPdf,
  'SZAMLA|KULSO': szamlaKulso,
}

/** Egy parancssor végrehajtása; a hibát ProtokollHiba-ként dobja. */
export async function vegrehajt(sor: string): Promise<string> {
  const mezok = sor.split('|')
  const kulcs = `${(mezok[0] ?? '').trim().toUpperCase()}|${(mezok[1] ?? '').trim().toUpperCase()}`
  const parancs = PARANCSOK[kulcs]
  if (!parancs) throw new ProtokollHiba('E100')
  return parancs(createServiceClient(), mezok)
}
