// Régi stílusú HTTP homlokzat a Flowable folyamatmotor előtt: igék az URL-ben, mindig HTTP 200,
// {"success":true,"data":…} vagy {"success":false,"msg":"…"} – ékezet nélküli, magyar, nem strukturált szöveg.
// Az állapotátmenetekről a BPMN dönt; a homlokzat csak a megfelelő user taskot zárja le / üzenetet küld.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { aktivFeladatok, feladatKeres, feladatLezaras, folyamatInditas, uzenetKuldes } from '@/lib/flowable/client'
import { esemenyKuldes } from './esemenyek'
import { partner } from './kulso'
import { foglalasFeloldas, keszletFoglalas } from './motor'
import * as t from './tarolo'

export type HomlokzatValasz = { success: true; data: unknown } | { success: false; msg: string }

export class HomlokzatHiba extends Error {}

const NEM_ENGEDELYEZETT = 'Muvelet nem engedelyezett ebben az allapotban'

const ok = (data: unknown): HomlokzatValasz => ({ success: true, data })
const hiba = (msg: string): HomlokzatValasz => ({ success: false, msg })

const tetelSema = z
  .array(
    z.object({
      productCode: z.string().regex(/^TK-\d{5}$/),
      qty: z.number().int().positive(),
      unitPrice: z.number().nonnegative(),
    })
  )
  .min(1)

const createSema = z.object({
  quoteRef: z.string().optional().nullable(),
  partnerId: z.uuid(),
  lines: tetelSema,
})

const modifySema = z.object({ lines: tetelSema })

function rendelesSzam(s: string | undefined): number | null {
  return s && /^\d{6,}$/.test(s) ? Number(s) : null
}

async function reszletek(supabase: SupabaseClient, r: t.Rendeles) {
  const feladatok = r.process_instance_id ? await aktivFeladatok(r.process_instance_id) : []
  return {
    ...r,
    ref: `RND-${r.order_no}`,
    lines: await t.tetelek(supabase, r.order_no),
    current_task: feladatok[0] ? { key: feladatok[0].taskDefinitionKey, name: feladatok[0].name } : null,
  }
}

async function folyamatbanLevo(supabase: SupabaseClient, orderNo: number) {
  const r = await t.rendeles(supabase, orderNo)
  if (!r) throw new HomlokzatHiba(`Rendeles nem talalhato: ${orderNo}`)
  if (!r.process_instance_id) throw new HomlokzatHiba(NEM_ENGEDELYEZETT)
  return r as t.Rendeles & { process_instance_id: string }
}

/** Egy user task lezárása, ha éppen az az aktív. */
async function feladatLezar(supabase: SupabaseClient, orderNo: number, taskKey: string) {
  const r = await folyamatbanLevo(supabase, orderNo)
  const feladat = await feladatKeres(r.process_instance_id, taskKey)
  if (!feladat) throw new HomlokzatHiba(NEM_ENGEDELYEZETT)
  await feladatLezaras(feladat.id)
  return (await t.rendeles(supabase, orderNo))!
}

// ---------------------------------------------------------------- műveletek

async function create(supabase: SupabaseClient, body: unknown): Promise<HomlokzatValasz> {
  const p = createSema.safeParse(body)
  if (!p.success) return hiba('Hibas keres: quoteRef, partnerId, lines[{productCode, qty, unitPrice}] kotelezo')
  if (!(await partner(supabase, p.data.partnerId))) return hiba(`Ismeretlen partner: ${p.data.partnerId}`)

  const orderNo = await t.rendelesRogzit(supabase, p.data.quoteRef ?? null, p.data.partnerId, p.data.lines)
  try {
    const folyamat = await folyamatInditas('rendeles_folyamat', String(orderNo), {
      orderNo,
      appBaseUrl: process.env.ENGINE_CALLBACK_BASE_URL,
      engineKey: process.env.LEGACY_ENGINE_KEY,
    })
    await t.rendelesModosit(supabase, orderNo, { process_instance_id: folyamat.id })
  } catch (e) {
    console.error('[orders] folyamat inditas', orderNo, e)
    await t.rendelesTorles(supabase, orderNo)
    return hiba('Folyamat inditasa sikertelen, a rendeles nem jott letre')
  }
  return ok({ orderNo, ref: `RND-${orderNo}` })
}

async function approve(supabase: SupabaseClient, orderNo: number): Promise<HomlokzatValasz> {
  const r = await feladatLezar(supabase, orderNo, 'rendeles_jovahagyasa')
  if (r.state === 'JOVAHAGYOTT') return ok(await reszletek(supabase, r))

  const h = await t.utolsoHiba(supabase, orderNo)
  if (h?.reason === 'MISSING_STOCK_CODE') return hiba(`Keszlet foglalas sikertelen: hianyzo raktari kod (${h.detail})`)
  return hiba(`Keszlet foglalas sikertelen: ${h?.detail ?? h?.reason ?? 'ismeretlen ok'}`)
}

async function cancel(supabase: SupabaseClient, orderNo: number): Promise<HomlokzatValasz> {
  const r = await folyamatbanLevo(supabase, orderNo)
  if (r.state === 'LEZART' || r.state === 'LEMONDOTT') return hiba(NEM_ENGEDELYEZETT)
  if (!(await uzenetKuldes(r.process_instance_id, 'RendelesLemondas'))) return hiba(NEM_ENGEDELYEZETT)
  return ok(await t.rendeles(supabase, orderNo))
}

// Módosítás: csak ha a folyamat a jóváhagyáson vagy a kiszállítás indításán áll (a kiszállítás még nem indult).
async function modify(supabase: SupabaseClient, orderNo: number, body: unknown): Promise<HomlokzatValasz> {
  const p = modifySema.safeParse(body)
  if (!p.success) return hiba('Hibas keres: lines[{productCode, qty, unitPrice}] kotelezo')

  const r = await folyamatbanLevo(supabase, orderNo)
  const feladatok = await aktivFeladatok(r.process_instance_id)
  if (!feladatok.some((f) => ['rendeles_jovahagyasa', 'kiszallitas_inditasa'].includes(f.taskDefinitionKey))) {
    return hiba(NEM_ENGEDELYEZETT)
  }

  const regiTetelek = await t.tetelek(supabase, orderNo)
  const foglalt = r.state === 'JOVAHAGYOTT'
  if (foglalt) await foglalasFeloldas(supabase, orderNo)
  await t.tetelekCsere(supabase, orderNo, p.data.lines)

  if (foglalt) {
    const f = await keszletFoglalas(supabase, orderNo)
    if (!f.ok) {
      // Visszaállítás: a régi tételek és a régi foglalás
      await t.tetelekCsere(supabase, orderNo, regiTetelek)
      await keszletFoglalas(supabase, orderNo)
      await t.tortenetIr(supabase, { order_no: orderNo, from_state: r.state, to_state: r.state, action: 'modify', ok: false, reason: f.reason, detail: f.detail })
      return hiba(`Modositas sikertelen, keszlet foglalas sikertelen: ${f.detail}`)
    }
  }

  await t.tortenetIr(supabase, { order_no: orderNo, from_state: r.state, to_state: r.state, action: 'modify', ok: true })
  await esemenyKuldes(supabase, orderNo, { event: 'ORDER_MODIFIED', state: r.state })
  return ok(await reszletek(supabase, (await t.rendeles(supabase, orderNo))!))
}

// ---------------------------------------------------------------- útválasztás

export async function kezelGet(supabase: SupabaseClient, utvonal: string[], query: URLSearchParams): Promise<HomlokzatValasz> {
  const [elso, masodik] = utvonal

  if (elso === 'list' && utvonal.length === 1) {
    return ok(await t.rendelesLista(supabase, query.get('state') ?? undefined))
  }

  const orderNo = rendelesSzam(elso)
  if (orderNo === null || utvonal.length > 2) return hiba('Ismeretlen muvelet')
  const r = await t.rendeles(supabase, orderNo)
  if (!r) return hiba(`Rendeles nem talalhato: ${orderNo}`)

  if (!masodik) return ok(await reszletek(supabase, r))
  if (masodik === 'history') return ok(await t.tortenet(supabase, orderNo))
  if (masodik === 'shipping') {
    const sz = await t.szallitas(supabase, orderNo)
    return sz ? ok(sz) : hiba('Nincs szallitas ehhez a rendeleshez')
  }
  return hiba('Ismeretlen muvelet')
}

export async function kezelPost(supabase: SupabaseClient, utvonal: string[], body: unknown): Promise<HomlokzatValasz> {
  const [elso, masodik] = utvonal
  if (elso === 'create' && utvonal.length === 1) return create(supabase, body)

  const orderNo = rendelesSzam(elso)
  if (orderNo === null || utvonal.length !== 2) return hiba('Ismeretlen muvelet')

  try {
    switch (masodik) {
      case 'approve':
        return await approve(supabase, orderNo)
      case 'fulfil':
        return ok(await feladatLezar(supabase, orderNo, 'kiszallitas_inditasa'))
      case 'invoice':
        return ok(await feladatLezar(supabase, orderNo, 'szamla_kiallitasa'))
      case 'cancel':
        return await cancel(supabase, orderNo)
      case 'modify':
        return await modify(supabase, orderNo, body)
      default:
        return hiba('Ismeretlen muvelet')
    }
  } catch (e) {
    if (e instanceof HomlokzatHiba) return hiba(e.message)
    throw e
  }
}
