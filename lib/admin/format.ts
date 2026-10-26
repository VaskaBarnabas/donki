// Megjelenítési segédek. A modulok saját formátumát (azonosító, dátum, pénz) szándékosan nem
// alakítjuk át egységesre – ezek csak olvashatóbbá teszik az ISO / epoch időket.

const ido = new Intl.DateTimeFormat('hu-HU', {
  timeZone: 'Europe/Budapest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function isoIdo(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : ido.format(d)
}

export function epochIdo(epoch: number | string | null | undefined): string {
  if (epoch === null || epoch === undefined || epoch === '') return '—'
  return ido.format(new Date(Number(epoch) * 1000))
}

export function ezres(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—'
  return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 }).format(Number(n))
}

export function egyParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

export type KeresesiParameterek = Promise<Record<string, string | string[] | undefined>>

/**
 * A rendeléskezelő legacy állapotkódjainak emberi felirata. A kód marad (régi munkamód), mellé kerül a felirat – a
 * `SZAMLAZVA` pl. csak annyit jelent, hogy a díjbekérő ki van állítva; a végszámla a fizetés után készül.
 */
export const RENDELES_ALLAPOT: Record<string, string> = {
  ROGZITETT: 'rögzítve, jóváhagyásra vár',
  JOVAHAGYOTT: 'jóváhagyva, készlet lefoglalva',
  TELJESITES_ALATT: 'szállítás alatt',
  SZALLITVA: 'kiszállítva, díjbekérőre vár',
  SZAMLAZVA: 'díjbekérő kiállítva, fizetésre vár',
  LEZART: 'lezárva, fizetve',
  LEMONDOTT: 'lemondva',
}
