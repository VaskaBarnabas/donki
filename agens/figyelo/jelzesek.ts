// A jelzések tárolása (18. fázis, agens-db: agens.jelzes). Egy kulcsra egyszerre legfeljebb egy nyitott jelzés: az
// ismételt észlelés csak a darabszámot és az időt frissíti (az egyedi részleges index miatt több folyamat esetén is).

import { db } from '../kozos/naplo'
import type { NyitottJelzes, Szabaly, UjJelzes } from './szabalyok'

export const NYITOTT = ['UJ', 'NYITOTT', 'FOLYAMATBAN'] as const

/** Új jelzés, vagy a meglévő nyitott frissítése. Visszaad: az azonosító, és hogy új-e. */
export async function eszlel(j: UjJelzes): Promise<{ id: number; uj: boolean }> {
  const { rows } = await db().query<{ id: number; uj: boolean }>(
    `insert into agens.jelzes (kulcs, szabaly, sulyossag, szerepek, cim, forras, hivatkozas, elemzes, javaslat, ajanlott_keres)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (kulcs) where allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN')
       do update set eszlelesek = agens.jelzes.eszlelesek + 1, utoljara_eszlelve = now(), sulyossag = excluded.sulyossag
     returning id, (xmax = 0) as uj`,
    [j.kulcs, j.szabaly, j.sulyossag, j.szerepek, j.cim, JSON.stringify(j.forras), JSON.stringify(j.hivatkozas), j.elemzes, j.javaslat, j.ajanlottKeres]
  )
  return rows[0]
}

/** Magától lezárás: a kulcsok pontosan, vagy `*` végű előtagként. Visszaad: a lezárt jelzések száma. */
export async function lezar(kulcsok: string[], ok: string): Promise<number> {
  if (!kulcsok.length) return 0
  const pontos = kulcsok.filter((k) => !k.endsWith('*'))
  const elotag = kulcsok.filter((k) => k.endsWith('*')).map((k) => `${k.slice(0, -1).replace(/[\\%_]/g, '\\$&')}%`)
  const { rowCount } = await db().query(
    `update agens.jelzes set allapot = 'MEGOLDVA', lezarva = now(), lezarta = 'figyelo', lezaras_oka = $3
      where allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN') and (kulcs = any($1) or kulcs like any($2))`,
    [pontos, elotag, ok]
  )
  return rowCount ?? 0
}

export async function nyitottak(szabalyok: Szabaly[]): Promise<NyitottJelzes[]> {
  const { rows } = await db().query<NyitottJelzes>(
    `select id, kulcs, szabaly, hivatkozas from agens.jelzes where allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN') and szabaly = any($1) order by id`,
    [szabalyok]
  )
  return rows
}

export type Elemzendo = { id: number; szabaly: Szabaly; cim: string; forras: Record<string, unknown>; elemzes: string; probak: number }

/**
 * A következő elemzendő jelzés: az új, vagy amelynek az elemzése korábban nem sikerült, és eljött az újrapróba ideje
 * (súlyosság szerint). `id`: csak ez a jelzés (a teszthez).
 */
export async function kovetkezoElemzendo(id?: number): Promise<Elemzendo | null> {
  const { rows } = await db().query<Elemzendo>(
    `select id, szabaly, cim, forras, elemzes, elemzes_probak as probak from agens.jelzes
      where ($1::bigint is null or id = $1)
        and (allapot = 'UJ' or (allapot in ('NYITOTT', 'FOLYAMATBAN') and not elemzes_modell and elemzes_probak < 3 and kovetkezo_elemzes <= now()))
      order by case sulyossag when 'magas' then 0 when 'kozepes' then 1 else 2 end, id
      limit 1`,
    [id ?? null]
  )
  return rows[0] ?? null
}

export async function elemzesMentes(id: number, e: { elemzes: string; javaslat: string; ajanlottKeres: string | null; futasId: string | null }): Promise<void> {
  await db().query(
    `update agens.jelzes set elemzes = $2, javaslat = $3, ajanlott_keres = coalesce($4, ajanlott_keres), futas_id = $5, elemzes_modell = true,
            elemzes_probak = elemzes_probak + 1, kovetkezo_elemzes = null, allapot = case when allapot = 'UJ' then 'NYITOTT' else allapot end
      where id = $1`,
    [id, e.elemzes, e.javaslat, e.ajanlottKeres, e.futasId]
  )
}

/** Az elemzés nem sikerült: a sablonszöveg marad, a jelzés megjelenik (NYITOTT), és később újrapróbálja (5, 15, 45 perc). */
export async function elemzesSikertelen(id: number, futasId: string | null): Promise<void> {
  await db().query(
    `update agens.jelzes set futas_id = coalesce($2, futas_id), elemzes_probak = elemzes_probak + 1,
            kovetkezo_elemzes = now() + make_interval(mins => 5 * power(3, elemzes_probak)::int),
            allapot = case when allapot = 'UJ' then 'NYITOTT' else allapot end
      where id = $1`,
    [id, futasId]
  )
}

/** Az időzített szabályok első észlelési ideje (J7); a nem észlelt kulcsok törlődnek. */
export async function elsoEszleles(elotag: string, kulcsok: string[]): Promise<Map<string, Date>> {
  await db().query(`delete from agens.megfigyeles where kulcs like $1 and not (kulcs = any($2))`, [`${elotag}%`, kulcsok])
  if (!kulcsok.length) return new Map()
  const { rows } = await db().query<{ kulcs: string; elso: Date }>(
    `insert into agens.megfigyeles (kulcs) select unnest($1::text[]) on conflict (kulcs) do update set utolso = now() returning kulcs, elso`,
    [kulcsok]
  )
  return new Map(rows.map((r) => [r.kulcs, r.elso]))
}

// ---------------------------------------------------------------- a figyelő állapota

export type FigyeloAllapot = { bekapcsolva: boolean; utolso_kor: Date | null; utolso_hiba: string | null; korok: number; feldolgozott_esemeny: number }

export async function figyeloAllapot(): Promise<FigyeloAllapot> {
  const { rows } = await db().query<FigyeloAllapot>('select bekapcsolva, utolso_kor, utolso_hiba, korok, feldolgozott_esemeny from agens.figyelo')
  return rows[0]
}

export async function korMentes(k: { esemeny: number; hiba: string | null }): Promise<void> {
  await db().query('update agens.figyelo set utolso_kor = now(), korok = korok + 1, feldolgozott_esemeny = feldolgozott_esemeny + $1, utolso_hiba = $2', [k.esemeny, k.hiba])
}
