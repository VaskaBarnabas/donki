// A bizonylatok PDF-jei (16. fázis óta mind a GAZDÁBÓL, a Számlázz.hu-ból): a díjbekérő és a számla a Számla
// Agentről, a fizetés utáni végszámla a SzámlaBridge-ről. A számlázó saját tárhelyén eltárolja őket (a kiállított
// bizonylat nem változik), és időkorlátos, aláírt letöltési linket ad. (A korábbi saját PDF-rajzoló megszűnt:
// így a portálon pontosan az a dokumentum látszik, ami a Számlázz.hu felületén.)

import type { Adatkliens as SupabaseClient } from '@/lib/rendszer/adat'
import { helyiTarhely } from '@/lib/rendszer/tarhely'
import { kulsoPdf } from './szamlabridge'
import { pdf as mesterPdf } from './szamlazzhu'
import { mesterbe } from './szinkron'

const BUCKET = 'szamlak'

/**
 * A külső számla (SzámlaBridge → Számlázz.hu) PDF-je: ha már le van töltve, az útvonala; ha nincs,
 * letölti a SzámlaBridge-től és eltárolja. null, ha a külső számla még nem készült el.
 */
export async function kulsoPdfBiztosit(supabase: SupabaseClient, szam: string): Promise<string | null> {
  const billing = supabase.schema('billing')
  const { data, error } = await billing.from('szamlak').select('szam, kelt, kulso_ref, kulso_pdf_utvonal').eq('szam', szam).single()
  if (error) throw new Error(`Szamla betoltese: ${error.message}`)
  if (data.kulso_pdf_utvonal) return data.kulso_pdf_utvonal
  if (!data.kulso_ref) return null

  const pdf = await kulsoPdf(data.kulso_ref)
  if (!pdf) return null

  const ut = `${String(data.kelt).slice(0, 4)}/${szam}-szamlazz.pdf`
  const { error: feltoltHiba } = await helyiTarhely().from(BUCKET).upload(ut, pdf, { contentType: 'application/pdf', upsert: false })
  if (feltoltHiba && !/exists|duplicate/i.test(feltoltHiba.message)) throw new Error(`PDF feltoltes: ${feltoltHiba.message}`)
  const { error: modHiba } = await billing.from('szamlak').update({ kulso_pdf_utvonal: ut, kulso_allapot: 'KIALLITVA' }).eq('szam', szam)
  if (modHiba) throw new Error(`kulso_pdf_utvonal mentese: ${modHiba.message}`)
  return ut
}

/**
 * A bizonylat PDF-je a GAZDÁBÓL (Számlázz.hu, 16. fázis): ugyanaz a dokumentum, ami a Számlázz.hu felületén látszik.
 * Egyszer letölti és eltárolja (a kiállított bizonylat nem változik); ha a bizonylat még nincs a Számlázz.hu-ban,
 * előbb átviszi. Visszaadja a tárhelybeli útvonalat.
 */
export async function mesterPdfBiztosit(supabase: SupabaseClient, szam: string): Promise<string> {
  const billing = supabase.schema('billing')
  const { data, error } = await billing.from('szamlak').select('szam, kelt, pdf_utvonal, szamlazz_szam').eq('szam', szam).single()
  if (error) throw new Error(`Szamla betoltese: ${error.message}`)
  if (data.pdf_utvonal && String(data.pdf_utvonal).endsWith('-szamlazzhu.pdf')) return data.pdf_utvonal
  const szamlazzSzam = data.szamlazz_szam ?? (await mesterbe(supabase, szam)).szamlazzSzam
  const tartalom = await mesterPdf(szamlazzSzam)
  const ut = `${String(data.kelt).slice(0, 4)}/${szam}-szamlazzhu.pdf`
  const { error: feltoltHiba } = await helyiTarhely().from(BUCKET).upload(ut, tartalom, { contentType: 'application/pdf', upsert: true })
  if (feltoltHiba) throw new Error(`PDF mentes: ${feltoltHiba.message}`)
  const { error: modHiba } = await billing.from('szamlak').update({ pdf_utvonal: ut }).eq('szam', szam)
  if (modHiba) throw new Error(`pdf_utvonal mentese: ${modHiba.message}`)
  return ut
}

/** Időkorlátos letöltési link (alapból 1 óra). */
export async function pdfLink(supabase: SupabaseClient, ut: string, mp = 3600): Promise<string> {
  const { data, error } = await helyiTarhely().from(BUCKET).createSignedUrl(ut, mp)
  if (error || !data) throw new Error(`Letoltesi link: ${error?.message}`)
  return data.signedUrl
}
