// A számlázó saját bizonylatai és a Számlázz.hu (a gazda) összehangolása (16. fázis).
//   mesterbe()       – egy saját bizonylat kiállítása a Számlázz.hu-ban; a gazda összege felülírja a sajátot
//   egyeztetes()     – minden bizonylat összevetése a gazdával (bruttó, fizetettség); eltérésnél jelölés
//   atvezetes()      – a még nem szinkronizált (pl. seedelt) bizonylatok egyszeri átvitele, sorrendhelyesen
// A külső azonosító: <saját sorszám>@<adatbázis-példány> – egy stack:reset után az új példány nem keveredik a régivel.

import type { Adatkliens as SupabaseClient } from '@/lib/rendszer/adat'
import { cimBontas, dijbekeroTorles, kifizet, kiallit, lekerdez, sztornoz } from './szamlazzhu'

type Sor = {
  szam: string
  tipus: 'SZAMLA' | 'DIJBEKERO' | 'STORNO'
  vevo_kod: string
  rendeles_ref: string | null
  kelt: string
  hatarido: string
  brutto: number
  fizetve: boolean
  fizetve_datum: string | null
  eredeti_szam: string | null
  sztornozva: boolean
  szamlazz_szam: string | null
  szamlazz_kulso_azon: string | null
  szinkron_allapot: string
}

const MEZOK = 'szam, tipus, vevo_kod, rendeles_ref, kelt, hatarido, brutto, fizetve, fizetve_datum, eredeti_szam, sztornozva, szamlazz_szam, szamlazz_kulso_azon, szinkron_allapot'

function hiba(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

let peldany: string | null = null
async function peldanyId(supabase: SupabaseClient): Promise<string> {
  if (peldany) return peldany
  const { data, error } = await supabase.schema('billing').from('peldany').select('id').single()
  hiba(error)
  peldany = (data as { id: string }).id
  return peldany
}

async function sorBetolt(supabase: SupabaseClient, szam: string): Promise<Sor> {
  const { data, error } = await supabase.schema('billing').from('szamlak').select(MEZOK).eq('szam', szam).single()
  hiba(error)
  return data as Sor
}

async function rogzit(supabase: SupabaseClient, szam: string, mezok: Record<string, unknown>) {
  const { error } = await supabase.schema('billing').from('szamlak').update({ ...mezok, szinkron_ido: new Date().toISOString() }).eq('szam', szam)
  hiba(error)
}

/** A saját bizonylat (SZAMLA / DIJBEKERO) kiállítása a Számlázz.hu-ban; utána a gazda összegével él tovább. */
export async function mesterbe(supabase: SupabaseClient, szam: string): Promise<{ szamlazzSzam: string; brutto: number }> {
  const b = supabase.schema('billing')
  const s = await sorBetolt(supabase, szam)
  if (s.szamlazz_szam) return { szamlazzSzam: s.szamlazz_szam, brutto: Number(s.brutto) }
  if (s.tipus === 'STORNO') return stornoMesterbe(supabase, s)

  const [{ data: v, error: vh }, { data: t, error: th }] = await Promise.all([
    b.from('vevok').select('nev, adoszam, cim').eq('kod', s.vevo_kod).single(),
    b.from('szamla_tetelek').select('megnevezes, mennyiseg, egysegar').eq('szam', szam).order('sor'),
  ])
  hiba(vh ?? th)
  const vevo = v as { nev: string; adoszam: string; cim: string | null }
  const kulsoAzon = `${szam}@${await peldanyId(supabase)}`

  // Idempotencia: ha egy korábbi (félbeszakadt) próbálkozás már kiállította, csak összekötjük – nem lesz duplikátum.
  const meglevo = await lekerdez(kulsoAzon)
  if (meglevo) {
    await rogzit(supabase, szam, { szamlazz_szam: meglevo.szamlazzSzam, szamlazz_kulso_azon: kulsoAzon, brutto: meglevo.brutto, szinkron_allapot: 'OK', szinkron_reszlet: null })
    return { szamlazzSzam: meglevo.szamlazzSzam, brutto: meglevo.brutto }
  }

  const m = await kiallit({
    dijbekero: s.tipus === 'DIJBEKERO',
    sajatSzam: szam,
    kulsoAzon,
    kelt: s.kelt,
    hatarido: s.hatarido,
    rendelesRef: s.rendeles_ref,
    vevo: { nev: vevo.nev, adoszam: vevo.adoszam, ...cimBontas(vevo.cim) },
    tetelek: ((t ?? []) as { megnevezes: string; mennyiseg: number; egysegar: number }[]).map((x) => ({ megnevezes: x.megnevezes, mennyiseg: Number(x.mennyiseg), egysegar: Number(x.egysegar) })),
  })
  // a gazda összege a mérvadó (HUF-ban egészre kerekít)
  try {
    await rogzit(supabase, szam, { szamlazz_szam: m.szamlazzSzam, szamlazz_kulso_azon: kulsoAzon, netto: m.netto, afa: m.brutto - m.netto, brutto: m.brutto, szinkron_allapot: 'OK', szinkron_reszlet: null })
  } catch (e) {
    // Kompenzálás: a díjbekérő törölhető, így nem marad árva bizonylat; a számlát a következő próbálkozás
    // a külső azonosító alapján megtalálja és összeköti (fent).
    if (s.tipus === 'DIJBEKERO') await dijbekeroTorles(m.szamlazzSzam).catch(() => null)
    throw e
  }
  return { szamlazzSzam: m.szamlazzSzam, brutto: m.brutto }
}

async function stornoMesterbe(supabase: SupabaseClient, s: Sor) {
  const eredeti = await mesterbe(supabase, s.eredeti_szam!)
  const kulsoAzon = `${s.szam}@${await peldanyId(supabase)}`
  const meglevo = await lekerdez(kulsoAzon) // idempotencia, mint a kiállításnál
  const m = meglevo
    ? { szamlazzSzam: meglevo.szamlazzSzam, netto: NaN, brutto: meglevo.brutto }
    : await sztornoz(eredeti.szamlazzSzam, kulsoAzon)
  // a sztornó kelte a gazdában a kiállítás napja (a Számlázz.hu szabálya) – a saját rekord is ezt veszi át
  const ma = new Date().toISOString().slice(0, 10)
  await rogzit(supabase, s.szam, {
    szamlazz_szam: m.szamlazzSzam,
    szamlazz_kulso_azon: kulsoAzon,
    ...(Number.isFinite(m.netto) ? { netto: m.netto, afa: m.brutto - m.netto } : {}),
    brutto: m.brutto,
    ...(meglevo ? {} : { kelt: ma, hatarido: ma }),
    szinkron_allapot: 'OK',
    szinkron_reszlet: null,
  })
  return { szamlazzSzam: m.szamlazzSzam, brutto: m.brutto }
}

/** A kifizetés rögzítése a gazdában (ismételhető). */
export async function kifizetesMesterbe(supabase: SupabaseClient, szam: string, datum: string) {
  const m = await mesterbe(supabase, szam) // a már szinkronizált bizonylatnál csak visszaadja a hivatkozást
  await kifizet(m.szamlazzSzam, datum, m.brutto)
}

export type EgyeztetesEredmeny = { osszes: number; ok: number; elteres: { szam: string; allapot: string; reszlet: string }[] }

/** Minden szinkronizált bizonylat összevetése a gazdával (bruttó, fizetettség). Az eltérést jelöli. */
export async function egyeztetes(supabase: SupabaseClient): Promise<EgyeztetesEredmeny> {
  const { data, error } = await supabase.schema('billing').from('szamlak').select(MEZOK).order('szam')
  hiba(error)
  const sorok = (data ?? []) as Sor[]
  const elteres: EgyeztetesEredmeny['elteres'] = []
  let ok = 0
  for (const s of sorok) {
    if (!s.szamlazz_kulso_azon) {
      elteres.push({ szam: s.szam, allapot: 'NINCS', reszlet: 'meg nincs a Szamlazz.hu-ban' })
      continue
    }
    const m = await lekerdez(s.szamlazz_kulso_azon)
    let allapot = 'OK'
    let reszlet: string | null = null
    if (!m) {
      allapot = 'HIANYZIK'
      reszlet = 'a Szamlazz.hu-ban nem talalhato'
    } else if (Math.abs(m.brutto - Number(s.brutto)) >= 0.01) {
      allapot = 'ELTERES'
      reszlet = `brutto: sajat ${s.brutto}, Szamlazz.hu ${m.brutto}`
    } else if (s.tipus !== 'STORNO' && !s.sztornozva && Number.isFinite(m.kintlevoseg) && s.fizetve !== (m.kintlevoseg === 0)) {
      allapot = 'ELTERES'
      reszlet = `fizetve: sajat ${s.fizetve ? 'I' : 'N'}, Szamlazz.hu kintlevoseg ${m.kintlevoseg}`
    }
    if (allapot !== s.szinkron_allapot || reszlet) await rogzit(supabase, s.szam, { szinkron_allapot: allapot, szinkron_reszlet: reszlet })
    if (allapot === 'OK') ok++
    else elteres.push({ szam: s.szam, allapot, reszlet: reszlet ?? '' })
  }
  return { osszes: sorok.length, ok, elteres }
}

/** A még nem szinkronizált bizonylatok átvitele (eredetik előbb, sztornók utána, majd a kifizetések). */
export async function atvezetes(supabase: SupabaseClient, naplo: (s: string) => void): Promise<number> {
  const { data, error } = await supabase.schema('billing').from('szamlak').select(MEZOK).is('szamlazz_szam', null).order('szam')
  hiba(error)
  const sorok = ((data ?? []) as Sor[]).sort((a, b) => Number(a.tipus === 'STORNO') - Number(b.tipus === 'STORNO'))
  for (const s of sorok) {
    const m = await mesterbe(supabase, s.szam)
    if (s.fizetve) await kifizet(m.szamlazzSzam, s.fizetve_datum ?? s.kelt, m.brutto)
    naplo(`${s.szam} → ${m.szamlazzSzam} (${m.brutto} Ft${s.fizetve ? ', fizetve' : ''})`)
  }
  return sorok.length
}
