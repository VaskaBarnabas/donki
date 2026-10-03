// A számlázó modul egyedi szöveges protokollja.
// Mezőelválasztó "|", almező ";", ékezet nélküli NAGYBETŰS szöveg, dátum YYYY.MM.DD,
// összeg vesszős tizedes ezres tagolás nélkül (38100,00). Válasz: OK|… vagy ERR|Exxx|SZOVEG.

export const HIBA = {
  E001: 'AUTH HIBA',
  E100: 'ISMERETLEN PARANCS',
  E101: 'HIBAS MEZOSZAM VAGY MEZOFORMATUM',
  E107: 'VEVO NEM TALALHATO',
  E108: 'SZAMLA NEM TALALHATO',
  E120: 'HIBAS DATUMFORMATUM',
  E200: 'SZAMLAZO SZOLGALTATAS HIBA',
  E999: 'BELSO HIBA',
} as const

export type HibaKod = keyof typeof HIBA

export class ProtokollHiba extends Error {
  constructor(
    public readonly kod: HibaKod,
    szoveg?: string
  ) {
    super(szoveg ?? HIBA[kod])
  }
}

export function ok(...mezok: (string | number)[]): string {
  return ['OK', ...mezok].join('|')
}

export function hiba(kod: HibaKod, szoveg: string = HIBA[kod]): string {
  return `ERR|${kod}|${normalizal(szoveg)}`
}

/** Ékezet nélküli NAGYBETŰS szöveg (az ő/ű is). */
export function normalizal(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

/** YYYY.MM.DD → YYYY-MM-DD (érvénytelen naptári dátumra null). */
export function datumBe(s: string): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(s.trim())
  if (!m) return null
  const iso = `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null
}

/** YYYY-MM-DD → YYYY.MM.DD */
export function datumKi(iso: string): string {
  return iso.slice(0, 10).replaceAll('-', '.')
}

/** "12500" vagy "12500,50" → szám; más formátumra null. */
export function osszegBe(s: string): number | null {
  const t = s.trim()
  if (!/^-?\d+(,\d{1,2})?$/.test(t)) return null
  return Number(t.replace(',', '.'))
}

/** 38100 → "38100,00" */
export function osszegKi(n: number | string): string {
  return Number(n).toFixed(2).replace('.', ',')
}

export function igenNem(b: boolean): 'I' | 'N' {
  return b ? 'I' : 'N'
}
