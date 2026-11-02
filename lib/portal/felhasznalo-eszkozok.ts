// A felhasználókezelés eszközei az asszisztensnek (a portál helyi eszközei, nem MCP): a bejelentkezett felhasználó
// SAJÁT Supabase-munkamenetével hívják ugyanazokat a security definer függvényeket, mint a Felhasználók oldal
// (felhasznalok_lista, szerepkor_beallitas). Így új kulcs nem kell, és a meglévő szabályok érvényesek: csak admin
// listázhat és állíthat, a saját admin szerepkörét senki nem veheti el, ismeretlen szerepkör nincs.
// (server-only nélkül: a füstteszt egy ideiglenes felhasználó munkamenetével közvetlenül is hívja.)

import type { SupabaseClient } from '@supabase/supabase-js'
import type { HelyiEszkoz, HivasEredmeny } from '@/agens/kozos/mcp'
import { SZEREPKOR_NEV, SZEREPKOROK } from '@/lib/szerepkorok'

type Felhasznalo = { id: string; email: string; display_name: string | null; role: string; created_at: string; last_sign_in_at: string | null }

const ok = (adat: unknown): HivasEredmeny => ({ ok: true, szoveg: JSON.stringify(adat), hibakod: null })
const hiba = (code: string, message: string): HivasEredmeny => ({ ok: false, szoveg: JSON.stringify({ error: { code, message } }), hibakod: code })

/** A Supabase-függvények hibáinak magyar, a modell számára is egyértelmű megfogalmazása. */
function supabaseHiba(e: { code?: string; message: string }): HivasEredmeny {
  if (e.code === '42501') return hiba('FORBIDDEN', /sajat admin/i.test(e.message) ? 'A saját admin szerepkörödet nem veheted el.' : 'Ehhez rendszergazda szerepkör kell.')
  if (e.code === '22023') return hiba('VALIDATION', 'Ismeretlen szerepkör.')
  if (e.code === 'P0002') return hiba('NOT_FOUND', 'Nincs ilyen felhasználó.')
  return hiba('ERROR', e.message)
}

export function felhasznaloEszkozok(supabase: SupabaseClient): HelyiEszkoz[] {
  async function lista(): Promise<Felhasznalo[] | HivasEredmeny> {
    const { data, error } = await supabase.rpc('felhasznalok_lista')
    return error ? supabaseHiba(error) : ((data ?? []) as Felhasznalo[])
  }

  return [
    {
      nev: 'list_users',
      cim: 'Felhasználók listázása',
      leiras: 'List the portal users with their e-mail address, name and role.',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      kockazat: 'read',
      futtat: async () => {
        const l = await lista()
        if (!Array.isArray(l)) return l
        return ok({ users: l.map((f) => ({ email: f.email, name: f.display_name, role: f.role, roleLabel: SZEREPKOR_NEV[f.role as keyof typeof SZEREPKOR_NEV] ?? f.role })) })
      },
    },
    {
      nev: 'set_user_role',
      cim: 'Szerepkör beállítása',
      leiras: "Set a portal user's role, identified by e-mail address. Roles: viewer, sales, logistics, finance, sales_manager, admin.",
      schema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: "The user's e-mail address, exactly as given" },
          role: { type: 'string', enum: [...SZEREPKOROK], description: 'The new role code' },
        },
        required: ['email', 'role'],
        additionalProperties: false,
      },
      kockazat: 'write',
      futtat: async (args) => {
        const email = String(args.email ?? '').trim().toLowerCase()
        const role = String(args.role ?? '')
        if (!email) return hiba('VALIDATION', 'Hiányzik az e-mail-cím.')
        if (!(SZEREPKOROK as readonly string[]).includes(role)) return hiba('VALIDATION', `Ismeretlen szerepkör: ${role}`)
        const l = await lista()
        if (!Array.isArray(l)) return l
        const f = l.find((x) => x.email.toLowerCase() === email)
        if (!f) return hiba('NOT_FOUND', `Nincs ${email} e-mail-című felhasználó.`)
        if (f.role === role) return ok({ email: f.email, role, roleLabel: SZEREPKOR_NEV[role as keyof typeof SZEREPKOR_NEV], changed: false, message: 'Már ez a szerepköre.' })
        const { error } = await supabase.rpc('szerepkor_beallitas', { p_user: f.id, p_role: role })
        if (error) return supabaseHiba(error)
        return ok({ email: f.email, previousRole: f.role, role, roleLabel: SZEREPKOR_NEV[role as keyof typeof SZEREPKOR_NEV], changed: true })
      },
    },
  ]
}
