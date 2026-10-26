// Az ágens naplója a saját adatbázisában (agens-db, `agens` séma): futásonként egy sor (agens.futas) és lépésenként
// egy sor (agens.lepes) – a 19. fázis mérésének alapja. A naplózás hibája nem akasztja meg az ágenst.

import pg from 'pg'
import { BEALLITAS } from './kornyezet'

let pool: pg.Pool | null = null
export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: BEALLITAS.dbUrl(), max: 4 })
  return pool
}
export async function dbZar(): Promise<void> {
  await pool?.end()
  pool = null
}

export type Lepes = {
  agens: string
  tipus: 'modell' | 'eszkoz' | 'jovahagyas' | 'skill'
  eszkoz?: string | null
  kockazat?: string | null
  jovahagyas?: 'nem_kell' | 'jovahagyva' | 'elutasitva' | null
  ok?: boolean
  hibakod?: string | null
  tokenBe?: number
  tokenKi?: number
  idoMs?: number
}

export type FutasEredmeny = 'kesz' | 'visszakerdezett' | 'jovahagyasra_var' | 'megszakitva' | 'hiba'

export interface Naplo {
  futasIndit(f: { id: string; threadId: string; szerep: string; keres: string; modell: string; felhasznalo?: string | null }): Promise<void>
  lepes(futasId: string, l: Lepes): Promise<void>
  futasZar(futasId: string, z: { eredmeny: FutasEredmeny; agens?: string | null; valasz?: string | null; hiba?: string | null; idoMs: number }): Promise<void>
}

async function csendben(f: () => Promise<unknown>) {
  try {
    await f()
  } catch (e) {
    console.error('[agens] naplózás sikertelen:', e instanceof Error ? e.message : e)
  }
}

export const pgNaplo: Naplo = {
  futasIndit: (f) =>
    csendben(() =>
      db().query('insert into agens.futas (id, thread_id, szerep, keres, modell, felhasznalo) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing', [f.id, f.threadId, f.szerep, f.keres, f.modell, f.felhasznalo ?? null])
    ),
  lepes: (futasId, l) =>
    csendben(() =>
      db().query(
        'insert into agens.lepes (futas_id, agens, tipus, eszkoz, kockazat, jovahagyas, ok, hibakod, token_be, token_ki, ido_ms) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [futasId, l.agens, l.tipus, l.eszkoz ?? null, l.kockazat ?? null, l.jovahagyas ?? null, l.ok ?? true, l.hibakod ?? null, l.tokenBe ?? 0, l.tokenKi ?? 0, l.idoMs ?? 0]
      )
    ),
  futasZar: (futasId, z) =>
    csendben(() =>
      db().query(
        `update agens.futas f set vege = now(), eredmeny = $2, agens = coalesce($3, f.agens), valasz = $4, hiba = $5, ido_ms = coalesce(f.ido_ms, 0) + $6,
           token_be = (select coalesce(sum(token_be), 0) from agens.lepes where futas_id = f.id),
           token_ki = (select coalesce(sum(token_ki), 0) from agens.lepes where futas_id = f.id)
         where id = $1`,
        [futasId, z.eredmeny, z.agens ?? null, z.valasz ?? null, z.hiba ?? null, Math.round(z.idoMs)]
      )
    ),
}
