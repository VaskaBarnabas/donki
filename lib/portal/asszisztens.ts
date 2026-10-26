// Az asszisztens-oldal szerveroldala: az ágens (agens/, LangGraph) a bejelentkezett felhasználó nevében, az ő
// szerepkörével fut. A beszélgetés a felhasználóé – mást nem láthat és nem folytathat (agens.futas.felhasznalo).
// Az ágens a portál folyamatában fut (natívan, a helyi Ollamával); a rendszereket csak az MCP rétegen éri el.

import 'server-only'
import { Agens, type FutasValasz } from '@/agens/futtato'
import type { JovahagyasKeres } from '@/agens/graf'
import { db } from '@/agens/kozos/naplo'
import { BEALLITAS, type Szerep } from '@/agens/kozos/kornyezet'
import { AGENS_DEF, type AgensNev } from '@/agens/ugynokok'
import { createClient } from '@/lib/supabase/server'
import { sajatSzerep } from './szerep'

export type Lepes = { agens: string; tipus: string; eszkoz: string | null; jovahagyas: string | null; ok: boolean; hibakod: string | null; tokenek: number; idoMs: number }

export type Kor = {
  futasId: string
  keres: string
  valasz: string | null
  allapot: FutasValasz['allapot'] | null
  agens: string | null
  hiba: string | null
  lepesek: Lepes[]
  tokenek: number
  idoMs: number | null
}

export type Beszelgetes = { threadId: string; korok: Kor[]; jovahagyas: JovahagyasKeres[] }
export type BeszelgetesFej = { threadId: string; cim: string; utolso: string }

// egy példány a portál folyamatában (a checkpointer-kapcsolat és a modellkliens újrahasznosítva)
let peldany: Promise<Agens> | null = null
const agens = () => (peldany ??= Agens.nyit().catch((e) => ((peldany = null), Promise.reject(e))))

export const AGENS_NEV: Record<string, string> = { frontdesk: 'Front-desk', ...Object.fromEntries(Object.values(AGENS_DEF).map((d) => [d.nev, d.cim])) }
export const MODELL = () => BEALLITAS.modell

async function felhasznalo(): Promise<{ id: string; szerep: Szerep }> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const id = data?.claims?.sub
  const szerep = await sajatSzerep()
  if (!id || !szerep) throw new Error('Nincs bejelentkezve.')
  return { id, szerep: szerep as Szerep }
}

/** A beszélgetés a felhasználóé-e (vagy még nincs ilyen). */
async function sajatE(threadId: string, felhasznaloId: string): Promise<boolean> {
  const { rows } = await db().query<{ idegen: boolean }>('select bool_or(felhasznalo is distinct from $2) as idegen from agens.futas where thread_id = $1', [threadId, felhasznaloId])
  return rows[0]?.idegen !== true
}

async function korok(threadId: string): Promise<Kor[]> {
  const { rows } = await db().query<{ id: string; keres: string; valasz: string | null; eredmeny: Kor['allapot']; agens: string | null; hiba: string | null; ido_ms: number | null }>(
    'select id, keres, valasz, eredmeny, agens, hiba, ido_ms from agens.futas where thread_id = $1 order by indult',
    [threadId]
  )
  const { rows: lepesek } = await db().query<{ futas_id: string; agens: string; tipus: string; eszkoz: string | null; jovahagyas: string | null; ok: boolean; hibakod: string | null; tokenek: number; ido_ms: number }>(
    'select l.futas_id, l.agens, l.tipus, l.eszkoz, l.jovahagyas, l.ok, l.hibakod, l.token_be + l.token_ki as tokenek, l.ido_ms from agens.lepes l join agens.futas f on f.id = l.futas_id where f.thread_id = $1 order by l.id',
    [threadId]
  )
  return rows.map((r) => {
    const sajat = lepesek.filter((l) => l.futas_id === r.id).map((l) => ({ agens: l.agens, tipus: l.tipus, eszkoz: l.eszkoz, jovahagyas: l.jovahagyas, ok: l.ok, hibakod: l.hibakod, tokenek: l.tokenek, idoMs: l.ido_ms }))
    return { futasId: r.id, keres: r.keres, valasz: r.valasz, allapot: r.eredmeny, agens: r.agens, hiba: r.hiba, lepesek: sajat, tokenek: sajat.reduce((s, l) => s + l.tokenek, 0), idoMs: r.ido_ms }
  })
}

export async function beszelgetes(threadId: string): Promise<Beszelgetes | null> {
  const f = await felhasznalo()
  if (!(await sajatE(threadId, f.id))) return null
  const a = await agens()
  const [k, h] = await Promise.all([korok(threadId), a.helyzet(threadId)])
  if (!k.length) return null
  return { threadId, korok: k, jovahagyas: h.jovahagyas }
}

export async function beszelgetesek(): Promise<BeszelgetesFej[]> {
  const f = await felhasznalo()
  const { rows } = await db().query<{ thread_id: string; cim: string; utolso: Date }>(
    `select thread_id, (array_agg(keres order by indult))[1] as cim, max(indult) as utolso
       from agens.futas where felhasznalo = $1 group by thread_id order by max(indult) desc limit 20`,
    [f.id]
  )
  return rows.map((r) => ({ threadId: r.thread_id, cim: r.cim, utolso: r.utolso.toISOString() }))
}

/** Új kérés (új vagy meglévő, saját beszélgetésben). */
export async function kerdes(threadId: string | null, szoveg: string): Promise<Beszelgetes> {
  const f = await felhasznalo()
  if (threadId && !(await sajatE(threadId, f.id))) throw new Error('Ez nem a te beszélgetésed.')
  const a = await agens()
  const v = await a.kerdez({ threadId: threadId ?? undefined, szerep: f.szerep, keres: szoveg, felhasznalo: f.id })
  return (await beszelgetes(v.threadId))!
}

/** A függő jóváhagyások eldöntése: csak a beszélgetés gazdája, és csak a ténylegesen függő hívásokra. */
export async function dontes(threadId: string, dontesek: Record<string, boolean>): Promise<Beszelgetes> {
  const f = await felhasznalo()
  if (!(await sajatE(threadId, f.id))) throw new Error('Ez nem a te beszélgetésed.')
  const a = await agens()
  const fuggo = (await a.helyzet(threadId)).jovahagyas
  if (!fuggo.length) throw new Error('Ebben a beszélgetésben nincs jóváhagyásra váró művelet.')
  await a.dont({ threadId, dontesek: Object.fromEntries(fuggo.map((j) => [j.id, dontesek[j.id] === true])) })
  return (await beszelgetes(threadId))!
}

export type { AgensNev, JovahagyasKeres }
