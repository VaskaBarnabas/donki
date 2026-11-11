// A UCP-rendelések oldal szerveroldala (21. fázis): a külső vásárló ágensek által leadott, jóváhagyásra váró rendelések
// az agens-db ucp sémájából. A jóváhagyás itt csak döntés; a végrehajtást (accept_quote → rendelés) az átjáró háttér-
// folyamata végzi az MCP-n, a szűk `ucp` szerepkörrel. Látja mindenki, dönteni az értékesítési vezető és az admin tud.

import 'server-only'
import { db } from '@/agens/kozos/naplo'
import { jogosult } from '@/lib/szerepkorok'
import { createClient } from '@/lib/supabase/server'
import { sajatSzerep } from './szerep'

export type UcpSor = {
  id: string
  platform: string
  allapot: string
  jovahagyas: string
  vevo: { email?: string; first_name?: string; last_name?: string } | null
  ugyfel: { name: string; taxNumber: string | null; azonositas?: string } | null
  ajanlat: string | null
  rendeles: string | null
  tetelek: { sku: string; quantity: number }[]
  brutto: number | null
  netto: number | null
  dontotte: string | null
  dontesIdo: string | null
  dontesOka: string | null
  hiba: string | null
  letrejott: string
}

export const ALLAPOT_NEV: Record<string, string> = {
  incomplete: 'hiányos',
  requires_escalation: 'emberi beavatkozás kell',
  ready_for_complete: 'leadható',
  complete_in_progress: 'leadva, jóváhagyásra vár',
  completed: 'rendelés rögzítve',
  canceled: 'megszakítva',
}
export const JOVAHAGYAS_NEV: Record<string, string> = { nincs: '–', var: 'jóváhagyásra vár', jovahagyva: 'jóváhagyva, végrehajtás alatt', elutasitva: 'elutasítva', vegrehajtva: 'végrehajtva', hiba: 'végrehajtási hiba' }

const sor = (r: Record<string, unknown>): UcpSor => {
  const v = (r.valasz ?? {}) as { totals?: { type: string; amount: number }[] }
  const osszeg = (t: string) => {
    const x = v.totals?.find((y) => y.type === t)
    return x ? x.amount / 100 : null
  }
  return {
    id: String(r.id),
    platform: String(r.platform),
    allapot: String(r.allapot),
    jovahagyas: String(r.jovahagyas),
    vevo: (r.vevo as UcpSor['vevo']) ?? null,
    ugyfel: (r.ugyfel as UcpSor['ugyfel']) ?? null,
    ajanlat: (r.ajanlat as string) ?? null,
    rendeles: (r.rendeles as string) ?? null,
    tetelek: ((r.tetelek as { sku: string; quantity: number }[]) ?? []).map((t) => ({ sku: t.sku, quantity: t.quantity })),
    brutto: osszeg('total'),
    netto: (() => {
      const s = osszeg('subtotal')
      const d = osszeg('discount') ?? 0
      return s === null ? null : s + d
    })(),
    dontotte: (r.dontotte as string) ?? null,
    dontesIdo: r.dontes_ido ? (r.dontes_ido as Date).toISOString() : null,
    dontesOka: (r.dontes_oka as string) ?? null,
    hiba: (r.hiba as string) ?? null,
    letrejott: (r.letrejott as Date).toISOString(),
  }
}

export async function ucpLista(nezet: 'var' | 'mind'): Promise<UcpSor[]> {
  if (!(await sajatSzerep())) throw new Error('Nincs bejelentkezve.')
  const { rows } = await db().query(
    `select * from ucp.checkout where ${nezet === 'var' ? `allapot = 'complete_in_progress' and jovahagyas = 'var'` : 'true'} order by letrejott desc limit 200`
  )
  return rows.map(sor)
}

export async function varakozoSzam(): Promise<number> {
  const { rows } = await db().query(`select count(*)::int n from ucp.checkout where allapot = 'complete_in_progress' and jovahagyas = 'var'`)
  return rows[0]?.n ?? 0
}

/** Döntés egy várakozó UCP-rendelésről. Csak az értékesítési vezető és az admin dönthet (mint a rendelés jóváhagyásánál). */
export async function dontes(id: string, jovahagy: boolean, ok: string | null): Promise<'ok' | 'nincs-jog' | 'nem-var'> {
  const szerep = await sajatSzerep()
  if (!jogosult(szerep, 'rendeles.approve')) return 'nincs-jog'
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const ki = String(data?.claims?.email ?? data?.claims?.sub ?? szerep)
  const { rowCount } = await db().query(
    `update ucp.checkout set jovahagyas = $2, dontotte = $3, dontes_ido = now(), dontes_oka = $4, modositva = now()
      where id = $1 and allapot = 'complete_in_progress' and jovahagyas = 'var'`,
    [id, jovahagy ? 'jovahagyva' : 'elutasitva', ki, ok]
  )
  return rowCount ? 'ok' : 'nem-var'
}
