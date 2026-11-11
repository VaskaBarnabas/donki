// 21. fázis, UCP-átjáró: az állapot az agens-db ucp sémájában (systems/agens/db/14_ucp.sql).

import { createHash } from 'node:crypto'
import { db } from '../agens/kozos/naplo'

export type Allapot = 'incomplete' | 'requires_escalation' | 'ready_for_complete' | 'complete_in_progress' | 'completed' | 'canceled'
export type Jovahagyas = 'nincs' | 'var' | 'jovahagyva' | 'elutasitva' | 'vegrehajtva' | 'hiba'
export type Tetel = { id: string; sku: string; quantity: number }
export type Ugyfel = { customerId: string; name: string; taxNumber: string | null; azonositas?: string }

export type Sor = {
  id: string
  platform: string
  allapot: Allapot
  penznem: string
  vevo: Record<string, unknown> | null
  b2b: Record<string, unknown> | null
  ugyfel: Ugyfel | null
  tetelek: Tetel[]
  szallitas: Record<string, unknown> | null
  ajanlat: string | null
  valasz: Record<string, unknown> | null
  fizetes: Record<string, unknown> | null
  rendeles: string | null
  jovahagyas: Jovahagyas
  dontotte: string | null
  dontes_ido: string | null
  dontes_oka: string | null
  hiba: string | null
  webhook_url: string | null
  utolso_esemeny: string | null
  lejar: string
  letrejott: string
  modositva: string
}

const JSON_MEZOK = new Set(['vevo', 'b2b', 'ugyfel', 'tetelek', 'szallitas', 'valasz', 'fizetes'])

export async function olvas(id: string): Promise<Sor | null> {
  const { rows } = await db().query<Sor>('select * from ucp.checkout where id = $1', [id])
  return rows[0] ?? null
}

export async function ment(s: Partial<Sor> & { id: string }): Promise<Sor> {
  const mezok = Object.keys(s).filter((k) => k !== 'id')
  const ertekek = mezok.map((k) => (JSON_MEZOK.has(k) && s[k as keyof Sor] != null ? JSON.stringify(s[k as keyof Sor]) : s[k as keyof Sor]))
  // előbb módosítás; ha még nincs ilyen sor, beszúrás (az insert … on conflict a NOT NULL feltételt az ütközés előtt nézi)
  const beallitas = mezok.map((k, i) => `${k} = $${i + 2}`).join(', ')
  const upd = await db().query<Sor>(`update ucp.checkout set ${beallitas}, modositva = now() where id = $1 returning *`, [s.id, ...ertekek])
  if (upd.rows[0]) return upd.rows[0]
  const helyek = mezok.map((_, i) => `$${i + 2}`).join(', ')
  const { rows } = await db().query<Sor>(`insert into ucp.checkout (id, ${mezok.join(', ')}) values ($1, ${helyek}) returning *`, [s.id, ...ertekek])
  return rows[0]
}

export async function jovahagyasraVar(): Promise<Sor[]> {
  return (await db().query<Sor>(`select * from ucp.checkout where jovahagyas in ('var', 'jovahagyva', 'elutasitva') and allapot = 'complete_in_progress' order by modositva`)).rows
}

export async function kovetett(): Promise<Sor[]> {
  return (await db().query<Sor>(`select * from ucp.checkout where allapot = 'completed' and rendeles is not null and webhook_url is not null and modositva > now() - interval '60 days'`)).rows
}

// ---------------------------------------------------------------- idempotencia

export const kivonat = (x: unknown) => createHash('sha256').update(JSON.stringify(x ?? null)).digest('hex')

export async function idempotens(kulcs: string, muvelet: string): Promise<{ keres_hash: string; statusz: number; valasz: unknown } | null> {
  const { rows } = await db().query('select keres_hash, statusz, valasz from ucp.idempotencia where kulcs = $1 and muvelet = $2', [kulcs, muvelet])
  return rows[0] ?? null
}

export async function idempotensMent(kulcs: string, muvelet: string, kerHash: string, statusz: number, valasz: unknown) {
  await db().query('insert into ucp.idempotencia (kulcs, muvelet, keres_hash, statusz, valasz) values ($1, $2, $3, $4, $5) on conflict do nothing', [kulcs, muvelet, kerHash, statusz, JSON.stringify(valasz)])
}

// ---------------------------------------------------------------- webhook-sor

export async function webhookSorba(rendeles: string, url: string, esemeny: unknown) {
  await db().query('insert into ucp.webhook (rendeles, url, esemeny) values ($1, $2, $3)', [rendeles, url, JSON.stringify(esemeny)])
}

export async function webhookEsedekes(): Promise<{ id: string; url: string; esemeny: unknown; kiserlet: number }[]> {
  return (await db().query(`select id, url, esemeny, kiserlet from ucp.webhook where allapot = 'var' and kovetkezo <= now() order by id limit 20`)).rows
}

export async function webhookEredmeny(id: string, ok: boolean, kiserlet: number, hiba?: string) {
  if (ok) await db().query(`update ucp.webhook set allapot = 'elkuldve', kiserlet = $2 where id = $1`, [id, kiserlet])
  else
    await db().query(
      // exponenciális várakozás (1, 2, 4 … mp, legfeljebb 1 óra), 8 kísérlet után feladjuk
      `update ucp.webhook set kiserlet = $2, utolso_hiba = $3, allapot = case when $2 >= 8 then 'sikertelen' else 'var' end,
              kovetkezo = now() + make_interval(secs => least(3600, power(2, $2 - 1))) where id = $1`,
      [id, kiserlet, hiba ?? null]
    )
}
