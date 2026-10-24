// A bejelentkezett felhasználó szerepköre (Supabase public.profiles, a sajat_szerepkor() függvénnyel) és a
// szerver-akciók jogosultság-ellenőrzése. A gomb elrejtése nem elég: a szerver is ellenőriz.

import 'server-only'
import { cache } from 'react'
import { kudarc, type AkcioEredmeny } from '@/lib/admin/akcio'
import { jogosult, JOGOK, SZEREPKOR_NEV, type Jog, type Szerepkor } from '@/lib/szerepkorok'
import { createClient } from '@/lib/supabase/server'

export const sajatSzerep = cache(async (): Promise<Szerepkor | null> => {
  const supabase = await createClient()
  const { data } = await supabase.rpc('sajat_szerepkor')
  return (data as Szerepkor | null) ?? null
})

/** null, ha szabad; különben egy kudarc-eredmény magyar indoklással (a szerver-akció ezt adja vissza). */
export async function jogHiany(jog: Jog): Promise<AkcioEredmeny | null> {
  const szerep = await sajatSzerep()
  if (jogosult(szerep, jog)) return null
  const kell = (JOGOK[jog] as readonly Szerepkor[]).map((r) => SZEREPKOR_NEV[r]).join(', ') || SZEREPKOR_NEV.admin
  return kudarc(`Ehhez a művelethez nincs jogosultságod (szükséges szerepkör: ${kell}; a tiéd: ${szerep ? SZEREPKOR_NEV[szerep] : 'nincs'}).`)
}
