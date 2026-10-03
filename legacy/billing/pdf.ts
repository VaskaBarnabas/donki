// PDF bizonylat előállítása (a Számlázz.hu adapter helyett) és tárolása a "szamlak" bucketben.
// Régi „mátrixnyomtatós” stílus: ékezet nélküli nagybetűs szöveg, beépített Courier font
// (a beépített PDF fontokban nincs ő/ű, ezért fontfájl beágyazása nélkül így marad olvasható).

import type { SupabaseClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { datumKi, normalizal, osszegKi } from './protokoll'

// A kitalált eladó (a szimulált KKV). Nem valódi cég, a PDF lábléce is jelzi.
export const ELADO = {
  nev: 'DONKI IRODATECHNIKA KFT',
  cim: '1097 BUDAPEST, GUBACSI UT 32.',
  adoszam: '25123452-2-43',
  bankszamla: '00000000-00000000-00000000',
  cegjegyzekszam: '01-09-999999',
}

const BUCKET = 'szamlak'

type SzamlaRow = {
  szam: string
  tipus: 'SZAMLA' | 'DIJBEKERO' | 'STORNO'
  vevo_kod: string
  rendeles_ref: string | null
  kelt: string
  hatarido: string
  netto: number
  afa: number
  brutto: number
  eredeti_szam: string | null
  pdf_utvonal: string | null
}

type TetelRow = { sor: number; megnevezes: string; mennyiseg: number; egysegar: number; afa_kulcs: number }
type VevoRow = { kod: string; nev: string; adoszam: string; cim: string | null }

const CIM = { SZAMLA: 'SZAMLA', DIJBEKERO: 'DIJBEKERO', STORNO: 'SZTORNO SZAMLA' } as const

// Csak WinAnsi-kódolható karakter maradhat (a beépített fontok miatt).
function tiszta(s: string): string {
  return normalizal(s).replace(/[^\x20-\x7e]/g, '?')
}

function levag(s: string, font: PDFFont, meret: number, szelesseg: number): string {
  let t = s
  while (t.length > 0 && font.widthOfTextAtSize(t, meret) > szelesseg) t = t.slice(0, -1)
  return t
}

async function rajzol(sz: SzamlaRow, tetelek: TetelRow[], vevo: VevoRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(sz.szam)
  doc.setSubject(`${CIM[sz.tipus]} ${sz.szam}`)
  doc.setAuthor(ELADO.nev)
  doc.setCreator('legacy billing')

  const mono = await doc.embedFont(StandardFonts.Courier)
  const monoB = await doc.embedFont(StandardFonts.CourierBold)
  const fekete = rgb(0, 0, 0)
  const szurke = rgb(0.4, 0.4, 0.4)

  const BAL = 40
  const JOBB = 555
  let page: PDFPage = doc.addPage([595, 842])
  let y = 800

  const ir = (s: string, x: number, opts: { font?: PDFFont; meret?: number; szin?: typeof fekete; jobbra?: boolean } = {}) => {
    const font = opts.font ?? mono
    const meret = opts.meret ?? 9
    const t = tiszta(s)
    const xx = opts.jobbra ? x - font.widthOfTextAtSize(t, meret) : x
    page.drawText(t, { x: xx, y, size: meret, font, color: opts.szin ?? fekete })
  }
  const vonal = (vastag = 0.8) => {
    page.drawLine({ start: { x: BAL, y: y + 4 }, end: { x: JOBB, y: y + 4 }, thickness: vastag, color: fekete })
  }

  // Fejléc
  ir(CIM[sz.tipus], BAL, { font: monoB, meret: 18 })
  ir(`SORSZAM: ${sz.szam}`, JOBB, { font: monoB, meret: 11, jobbra: true })
  y -= 16
  if (sz.tipus === 'STORNO' && sz.eredeti_szam) ir(`EREDETI SZAMLA: ${sz.eredeti_szam}`, JOBB, { jobbra: true })
  if (sz.tipus === 'DIJBEKERO') ir('NEM SZAMVITELI BIZONYLAT', JOBB, { jobbra: true })
  y -= 14
  vonal(1.5)
  y -= 14

  // Eladó / vevő
  const vevoX = 310
  ir('ELADO', BAL, { font: monoB })
  ir('VEVO', vevoX, { font: monoB })
  y -= 13
  const eladoSorok = [ELADO.nev, ELADO.cim, `ADOSZAM: ${ELADO.adoszam}`, `CEGJ.SZ.: ${ELADO.cegjegyzekszam}`, `BANKSZAMLA: ${ELADO.bankszamla}`]
  const vevoSorok = [`${vevo.nev} (${vevo.kod})`, vevo.cim ?? '', `ADOSZAM: ${vevo.adoszam}`]
  for (let i = 0; i < Math.max(eladoSorok.length, vevoSorok.length); i++) {
    if (eladoSorok[i]) ir(levag(tiszta(eladoSorok[i]), mono, 9, vevoX - BAL - 10), BAL)
    if (vevoSorok[i]) ir(levag(tiszta(vevoSorok[i]), mono, 9, JOBB - vevoX), vevoX)
    y -= 12
  }
  y -= 6
  vonal()
  y -= 14

  // Dátumok
  const adatok: [string, string][] = [
    ['KELT', datumKi(sz.kelt)],
    ['TELJESITES', datumKi(sz.kelt)],
    ['FIZETESI HATARIDO', datumKi(sz.hatarido)],
    ['FIZETESI MOD', 'ATUTALAS'],
    ['RENDELES', sz.rendeles_ref ?? '-'],
  ]
  for (const [cimke, ertek] of adatok) {
    ir(`${cimke}:`, BAL)
    ir(ertek, BAL + 140, { font: monoB })
    y -= 12
  }
  y -= 6
  vonal()
  y -= 14

  // Tételek
  const oszlop = { megn: BAL, menny: 300, egyseg: 375, netto: 450, brutto: JOBB }
  const fejlec = () => {
    ir('MEGNEVEZES', oszlop.megn, { font: monoB })
    ir('MENNY.', oszlop.menny, { font: monoB, jobbra: true })
    ir('EGYSEGAR', oszlop.egyseg, { font: monoB, jobbra: true })
    ir('NETTO', oszlop.netto, { font: monoB, jobbra: true })
    ir('BRUTTO (27%)', oszlop.brutto, { font: monoB, jobbra: true })
    y -= 6
    vonal(0.5)
    y -= 12
  }
  fejlec()
  for (const t of tetelek) {
    if (y < 120) {
      page = doc.addPage([595, 842])
      y = 800
      fejlec()
    }
    const netto = Math.round(Number(t.mennyiseg) * Number(t.egysegar) * 100) / 100
    const brutto = Math.round(netto * (1 + Number(t.afa_kulcs) / 100) * 100) / 100
    ir(levag(`${t.sor}. ${tiszta(t.megnevezes)}`, mono, 9, oszlop.menny - oszlop.megn - 50), oszlop.megn)
    ir(String(Number(t.mennyiseg)), oszlop.menny, { jobbra: true })
    ir(osszegKi(t.egysegar), oszlop.egyseg, { jobbra: true })
    ir(osszegKi(netto), oszlop.netto, { jobbra: true })
    ir(osszegKi(brutto), oszlop.brutto, { jobbra: true })
    y -= 12
  }
  y -= 4
  vonal()
  y -= 16

  // Összesítő
  for (const [cimke, ertek, vastag] of [
    ['NETTO OSSZESEN', sz.netto, false],
    ['AFA 27%', sz.afa, false],
    ['FIZETENDO (HUF)', sz.brutto, true],
  ] as const) {
    ir(cimke, 330, { font: vastag ? monoB : mono, meret: vastag ? 11 : 9 })
    ir(osszegKi(ertek), JOBB, { font: vastag ? monoB : mono, meret: vastag ? 11 : 9, jobbra: true })
    y -= vastag ? 16 : 12
  }

  // Lábléc minden oldalon
  for (const p of doc.getPages()) {
    p.drawText(tiszta('SZIMULALT BIZONYLAT - SZAKDOLGOZATI PROTOTIPUS, NEM VALODI SZAMLA'), {
      x: BAL,
      y: 40,
      size: 7,
      font: mono,
      color: szurke,
    })
  }

  return doc.save()
}

function utvonal(sz: SzamlaRow): string {
  return `${sz.kelt.slice(0, 4)}/${sz.szam}.pdf`
}

/**
 * Elkészíti és feltölti a bizonylat PDF-jét, ha még nincs (a kiállított PDF nem íródik felül).
 * Visszaadja a Storage-beli útvonalat.
 */
export async function pdfBiztosit(supabase: SupabaseClient, szam: string): Promise<string> {
  const billing = supabase.schema('billing')
  const { data: sz, error } = await billing.from('szamlak').select('*').eq('szam', szam).single()
  if (error) throw new Error(`Szamla betoltese: ${error.message}`)
  const szamla = sz as SzamlaRow
  if (szamla.pdf_utvonal) return szamla.pdf_utvonal

  const [{ data: tetelek, error: tHiba }, { data: vevo, error: vHiba }] = await Promise.all([
    billing.from('szamla_tetelek').select('sor, megnevezes, mennyiseg, egysegar, afa_kulcs').eq('szam', szam).order('sor'),
    billing.from('vevok').select('kod, nev, adoszam, cim').eq('kod', szamla.vevo_kod).single(),
  ])
  if (tHiba || vHiba) throw new Error(`Tetelek/vevo betoltese: ${(tHiba ?? vHiba)?.message}`)

  const pdf = await rajzol(szamla, (tetelek ?? []) as TetelRow[], vevo as VevoRow)
  const ut = utvonal(szamla)
  const { error: feltoltHiba } = await supabase.storage
    .from(BUCKET)
    .upload(ut, pdf, { contentType: 'application/pdf', upsert: false })
  // Ha párhuzamos kérés már feltöltötte, az is rendben van – a kiállított PDF nem változik.
  if (feltoltHiba && !/exists|duplicate/i.test(feltoltHiba.message)) {
    throw new Error(`PDF feltoltes: ${feltoltHiba.message}`)
  }

  const { error: modHiba } = await billing.from('szamlak').update({ pdf_utvonal: ut }).eq('szam', szam)
  if (modHiba) throw new Error(`pdf_utvonal mentese: ${modHiba.message}`)
  return ut
}

/** Időkorlátos letöltési link (alapból 1 óra). */
export async function pdfLink(supabase: SupabaseClient, ut: string, mp = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ut, mp)
  if (error || !data) throw new Error(`Letoltesi link: ${error?.message}`)
  return data.signedUrl
}
