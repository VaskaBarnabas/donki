// A rendszerek vezérlése a portálból (15. fázis): a vezérlés magja (lib/rendszer/vezerles-mag.ts) admin
// jogosultság-ellenőrzéssel. Csak bejelentkezett, admin szerepkörű felhasználó (Supabase profiles) hívhatja.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { VezerlesHiba } from '@/lib/rendszer/vezerles-mag'

export { RENDSZEREK, rendszerAllapotok, rendszerMuvelet, rendszerNaplo, VezerlesHiba } from '@/lib/rendszer/vezerles-mag'
export type { Muvelet, RendszerAllapot, KontenerAllapot } from '@/lib/rendszer/vezerles-mag'

/** Csak bejelentkezett, admin szerepkörű felhasználó (Supabase profiles). */
export async function adminEllenorzes(): Promise<{ id: string; email: string | null }> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) throw new VezerlesHiba(401, 'Nincs bejelentkezve.')
  const { data: profil } = await supabase.from('profiles').select('role').eq('id', data.claims.sub).maybeSingle()
  if (profil?.role !== 'admin') throw new VezerlesHiba(403, 'A rendszerek vezérléséhez admin szerepkör kell.')
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null }
}

