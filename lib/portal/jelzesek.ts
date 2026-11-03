// A Jelzések oldal szerveroldala (18. fázis): a háttérfigyelő jelzései az agens-db-ből. Mindenki a saját szerepkörének
// jelzéseit látja (agens.jelzes.szerepek), a rendszergazda mindet. A jelzés csak tájékoztat és javasol: a végrehajtás az
// asszisztensben, a megszokott jóváhagyással történik („Megoldás az asszisztensben”).

import 'server-only'
import { db } from '@/agens/kozos/naplo'
import { SZABALY_NEV, type Szabaly } from '@/agens/figyelo/szabalyok'
import { createClient } from '@/lib/supabase/server'
import { sajatSzerep } from './szerep'

export type JelzesAllapot = 'UJ' | 'NYITOTT' | 'FOLYAMATBAN' | 'MEGOLDVA' | 'ELVETVE'
export type Sulyossag = 'alacsony' | 'kozepes' | 'magas'

export type JelzesFej = {
  id: number
  szabaly: Szabaly
  szabalyNev: string
  sulyossag: Sulyossag
  cim: string
  allapot: JelzesAllapot
  eszlelesek: number
  letrejott: string
  utoljaraEszlelve: string
}

export type Jelzes = JelzesFej & {
  elemzes: string | null
  javaslat: string | null
  ajanlottKeres: string | null
  elemzesModell: boolean
  forras: Record<string, unknown>
  szerepek: string[]
  threadId: string | null
  lezarva: string | null
  lezarta: string | null
  lezarasOka: string | null
  lepesek: { agens: string; tipus: string; eszkoz: string | null; ok: boolean; hibakod: string | null; idoMs: number }[]
}

export const ALLAPOT_NEV: Record<JelzesAllapot, string> = {
  UJ: 'elemzés folyamatban',
  NYITOTT: 'nyitott',
  FOLYAMATBAN: 'megoldás folyamatban',
  MEGOLDVA: 'megoldva',
  ELVETVE: 'elvetve',
}

async function felhasznalo(): Promise<{ id: string; szerep: string }> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const id = data?.claims?.sub
  const szerep = await sajatSzerep()
  if (!id || !szerep) throw new Error('Nincs bejelentkezve.')
  return { id, szerep }
}

const LATHATO = `($1 = 'admin' or $1 = any(szerepek))`

const fej = (r: Record<string, unknown>): JelzesFej => ({
  id: Number(r.id),
  szabaly: r.szabaly as Szabaly,
  szabalyNev: SZABALY_NEV[r.szabaly as Szabaly] ?? String(r.szabaly),
  sulyossag: r.sulyossag as Sulyossag,
  cim: String(r.cim),
  allapot: r.allapot as JelzesAllapot,
  eszlelesek: Number(r.eszlelesek),
  letrejott: (r.letrejott as Date).toISOString(),
  utoljaraEszlelve: (r.utoljara_eszlelve as Date).toISOString(),
})

export async function jelzesLista(szuro: { lezart?: boolean; szabaly?: string; sulyossag?: string } = {}): Promise<JelzesFej[]> {
  const f = await felhasznalo()
  const { rows } = await db().query(
    `select id, szabaly, sulyossag, cim, allapot, eszlelesek, letrejott, utoljara_eszlelve from agens.jelzes
      where ${LATHATO} and (allapot in ('MEGOLDVA', 'ELVETVE')) = $2 and ($3 = '' or szabaly = $3) and ($4 = '' or sulyossag = $4)
      order by ${szuro.lezart ? 'lezarva desc' : `case sulyossag when 'magas' then 0 when 'kozepes' then 1 else 2 end, utoljara_eszlelve desc`}
      limit 200`,
    [f.szerep, !!szuro.lezart, szuro.szabaly ?? '', szuro.sulyossag ?? '']
  )
  return rows.map(fej)
}

export async function jelzes(id: number): Promise<Jelzes | null> {
  const f = await felhasznalo()
  const { rows } = await db().query(`select * from agens.jelzes where id = $2 and ${LATHATO}`, [f.szerep, id])
  const r = rows[0]
  if (!r) return null
  const { rows: lepesek } = r.futas_id
    ? await db().query<{ agens: string; tipus: string; eszkoz: string | null; ok: boolean; hibakod: string | null; ido_ms: number }>(
        'select agens, tipus, eszkoz, ok, hibakod, ido_ms from agens.lepes where futas_id = $1 order by id',
        [r.futas_id]
      )
    : { rows: [] }
  return {
    ...fej(r),
    elemzes: r.elemzes,
    javaslat: r.javaslat,
    ajanlottKeres: r.ajanlott_keres,
    elemzesModell: r.elemzes_modell,
    forras: r.forras,
    szerepek: r.szerepek,
    threadId: r.thread_id,
    lezarva: r.lezarva ? (r.lezarva as Date).toISOString() : null,
    lezarta: r.lezarta,
    lezarasOka: r.lezaras_oka,
    lepesek: lepesek.map((l) => ({ agens: l.agens, tipus: l.tipus, eszkoz: l.eszkoz, ok: l.ok, hibakod: l.hibakod, idoMs: l.ido_ms })),
  }
}

/** A nyitott jelzések száma súlyosság szerint (a menü jelvényéhez és az irányítópult kártyájához). */
export async function nyitottSzam(): Promise<{ osszes: number; magas: number; kozepes: number; alacsony: number }> {
  const f = await felhasznalo()
  const { rows } = await db().query<{ sulyossag: Sulyossag; db: string }>(
    `select sulyossag, count(*) as db from agens.jelzes where ${LATHATO} and allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN') group by sulyossag`,
    [f.szerep]
  )
  const db_ = (s: Sulyossag) => Number(rows.find((r) => r.sulyossag === s)?.db ?? 0)
  return { osszes: db_('magas') + db_('kozepes') + db_('alacsony'), magas: db_('magas'), kozepes: db_('kozepes'), alacsony: db_('alacsony') }
}

/** Kézi lezárás indoklással (pl. „tudunk róla, a vevővel megbeszéltük”). */
export async function elvet(id: number, indok: string): Promise<boolean> {
  const f = await felhasznalo()
  const { rowCount } = await db().query(
    `update agens.jelzes set allapot = 'ELVETVE', lezarva = now(), lezarta = $3, lezaras_oka = $4
      where id = $2 and ${LATHATO} and allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN')`,
    [f.szerep, id, f.id, indok]
  )
  return (rowCount ?? 0) > 0
}

/** Újraelemzés kérése: a figyelő a következő körben újra elemzi. */
export async function ujraelemzes(id: number): Promise<boolean> {
  const f = await felhasznalo()
  const { rowCount } = await db().query(
    `update agens.jelzes set elemzes_modell = false, elemzes_probak = 0, kovetkezo_elemzes = now()
      where id = $2 and ${LATHATO} and allapot in ('NYITOTT', 'FOLYAMATBAN')`,
    [f.szerep, id]
  )
  return (rowCount ?? 0) > 0
}

/** Az asszisztens-beszélgetés a jelzésből indult: a jelzés „megoldás folyamatban”, és a beszélgetéshez kötődik. */
export async function megoldasIndult(id: number, threadId: string): Promise<void> {
  const f = await felhasznalo()
  await db().query(
    `update agens.jelzes set allapot = 'FOLYAMATBAN', thread_id = $3 where id = $2 and ${LATHATO} and allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN')`,
    [f.szerep, id, threadId]
  )
}

/** A jelzés, amelyből a beszélgetés indult (az asszisztens oldal sávjához). */
export async function beszelgetesJelzese(threadId: string): Promise<{ id: number; cim: string; allapot: JelzesAllapot } | null> {
  const f = await felhasznalo()
  const { rows } = await db().query(`select id, cim, allapot from agens.jelzes where thread_id = $2 and ${LATHATO} order by id desc limit 1`, [f.szerep, threadId])
  return rows[0] ? { id: Number(rows[0].id), cim: rows[0].cim, allapot: rows[0].allapot } : null
}

// ---------------------------------------------------------------- a figyelő (csak admin)

export type FigyeloNezet = { bekapcsolva: boolean; utolsoKor: string | null; utolsoHiba: string | null; korok: number; feldolgozottEsemeny: number; nyitott: number; elemzesre: number }

export async function figyeloNezet(): Promise<FigyeloNezet> {
  if ((await sajatSzerep()) !== 'admin') throw new Error('Csak rendszergazda.')
  const { rows } = await db().query(
    `select f.*, (select count(*) from agens.jelzes where allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN')) as nyitott,
            (select count(*) from agens.jelzes where allapot = 'UJ') as elemzesre
       from agens.figyelo f`
  )
  const r = rows[0]
  return {
    bekapcsolva: r.bekapcsolva,
    utolsoKor: r.utolso_kor ? (r.utolso_kor as Date).toISOString() : null,
    utolsoHiba: r.utolso_hiba,
    korok: r.korok,
    feldolgozottEsemeny: r.feldolgozott_esemeny,
    nyitott: Number(r.nyitott),
    elemzesre: Number(r.elemzesre),
  }
}

export async function figyeloKapcsolo(be: boolean): Promise<void> {
  if ((await sajatSzerep()) !== 'admin') throw new Error('Csak rendszergazda.')
  await db().query('update agens.figyelo set bekapcsolva = $1', [be])
}
