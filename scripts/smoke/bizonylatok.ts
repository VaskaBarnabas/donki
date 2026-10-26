/**
 * Tesztbizonylatok a füsttesztekhez: minden teszt maga állítja ki a bizonylatot, amit ellenőriz – a seedelt
 * számlákra (SZ-2026-0001xx) nem támaszkodunk, mert az éles rendszer üresen indul. A bizonylatok a számlázó szöveges
 * protokollján jönnek létre, így a Számlázz.hu tesztfiókban is (a gazdában) valódiak.
 *
 * A „lejárt” állapothoz az idő múlását szimuláljuk: a friss számla határidejét a számlázó adatbázisában a múltba
 * tesszük, és lefuttatjuk ugyanazt a jelölőfüggvényt, amelyet a számlázó éjszakai feladata hív (billing.jelol_lejart).
 */
import { env, psqlFuttat, URL } from './rendszerek'

export async function szamlazo(parancs: string, kulcs = env.LEGACY_BILLING_KEY): Promise<string> {
  const r = await fetch(`${URL.billing}/api/legacy/billing`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: `AUTH|${kulcs}\n${parancs}\n` })
  return (await r.text()).trim()
}

/** A mai nap a számlázó formátumában (YYYY.MM.DD, budapesti idő). */
export const maPont = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date()).replaceAll('-', '.')

/** 38100,00 → '38100.00' (a kanonikus MCP-formátum) */
export const kanonikus = (osszeg: string) => osszeg.replace(',', '.')

function elvar(valasz: string, mit: string): string[] {
  if (!valasz.startsWith('OK')) throw new Error(`Tesztbizonylat (${mit}) nem jött létre: ${valasz}`)
  return valasz.split('|')
}

/** Saját tesztvevő a számlázóban (egyedi adószámmal); visszaad: VEVO-… */
export async function tesztVevo(nev = 'Füstteszt Kereskedő Kft'): Promise<string> {
  const adoszam = `98${String(Date.now()).slice(-6)}-2-41`
  return elvar(await szamlazo(`PARTNER|UJ|${adoszam}|${nev}|1111 Budapest, Próba utca 1.`), 'vevő')[1]
}

export type Bizonylat = { szam: string; brutto: string; hatarido: string }

/** Ma kelt számla 15 napos határidővel. Alapból 1 tétel: 1 × 10 000 Ft nettó → 12 700,00 bruttó. */
export async function ujSzamla(vevo: string, tetelek = 'FUSTTESZT TETEL;1;10000', ref = 'RND-SMOKE'): Promise<Bizonylat> {
  const v = elvar(await szamlazo(`SZAMLA|KESZIT|${vevo}|${ref}|${maPont()}|15|${tetelek}`), 'számla')
  return { szam: v[1], brutto: v[2], hatarido: v[3] }
}

/** Ma kelt díjbekérő 8 napos határidővel. */
export async function ujDijbekero(vevo: string, tetelek = 'FUSTTESZT ELOLEG;1;1000', ref = ''): Promise<Bizonylat> {
  const v = elvar(await szamlazo(`DIJBEKERO|KESZIT|${vevo}|${ref}|${maPont()}|8|${tetelek}`), 'díjbekérő')
  return { szam: v[1], brutto: v[2], hatarido: v[3] }
}

/** Fizetettnek jelölt friss számla. */
export async function fizetettSzamla(vevo: string): Promise<Bizonylat> {
  const sz = await ujSzamla(vevo)
  elvar(await szamlazo(`SZAMLA|FIZETVE|${sz.szam}|${maPont()}`), 'fizetés')
  return sz
}

/** Friss számla sztornója; visszaad: az eredeti és a sztornó sorszáma. */
export async function sztornozottSzamla(vevo: string): Promise<{ eredeti: string; storno: string }> {
  const sz = await ujSzamla(vevo)
  return { eredeti: sz.szam, storno: elvar(await szamlazo(`SZAMLA|STORNO|${sz.szam}`), 'sztornó')[1] }
}

/**
 * Lejárt, nem fizetett számla: friss számla, a határideje `napja` nappal a múltban, és lefut a lejárt-jelölés.
 * Visszaad: a sorszám, a bruttó és az új határidő (YYYY-MM-DD).
 */
export async function lejartSzamla(vevo: string, napja = 10, tetelek?: string): Promise<Bizonylat> {
  const sz = await ujSzamla(vevo, tetelek)
  if (!/^[A-Z]{2}-\d{4}-\d{6}$/.test(sz.szam)) throw new Error(`váratlan sorszám: ${sz.szam}`)
  const hatarido = psqlFuttat('billing', `update billing.szamlak set hatarido = current_date - ${Math.trunc(napja)} where szam = '${sz.szam}' returning hatarido`).match(/\d{4}-\d{2}-\d{2}/)?.[0]
  psqlFuttat('billing', 'select billing.jelol_lejart()')
  if (!hatarido) throw new Error(`a határidő módosítása nem sikerült: ${sz.szam}`)
  return { ...sz, hatarido }
}
