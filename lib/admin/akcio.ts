// Az admin felület server actionjeinek közös eredménytípusa (csak UI – nem modul-szerződés).

export type AkcioEredmeny = {
  ok: boolean
  msg: string
  /** nyers válasz megjelenítéshez (pl. protokoll-válasz, JSON) */
  reszlet?: string
  /** megnyitható link (pl. PDF, Stripe Checkout) */
  link?: string
}

export const siker = (msg: string, extra: Partial<AkcioEredmeny> = {}): AkcioEredmeny => ({ ok: true, msg, ...extra })
export const kudarc = (msg: string, extra: Partial<AkcioEredmeny> = {}): AkcioEredmeny => ({ ok: false, msg, ...extra })

export function mezo(fd: FormData, nev: string): string {
  return String(fd.get(nev) ?? '').trim()
}

export function hibaSzoveg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
