// A rendelési folyamat (BPMN) HTTP taskjai által hívott belső akciók.
// „Modern”, gépi JSON: {"ok":true,…} vagy {"ok":false,"reason":"…","detail":"…"} – a gateway-eknek egyértelmű kell.
// Váratlan hibánál a route 500-at ad, így a HTTP task (failStatusCodes) hibára fut, és a hívó művelet visszagördül.

import type { SupabaseClient } from '@supabase/supabase-js'
import { esemenyKuldes } from './esemenyek'
import { partner, protokollMa, protokollMezo, protokollOsszeg, szamlazo, termekek } from './kulso'
import { raktarHivas } from './raktar-hivas'
import * as t from './tarolo'

export type MotorValasz = { ok: boolean; reason: string; detail: string; [mezo: string]: unknown }

const SIKER = { ok: true, reason: '', detail: '' }

function rendelesRef(orderNo: number) {
  return `RND-${orderNo}`
}

// A detail a BPMN-ben egy JSON-sztring belsejébe kerül: idézőjel és backslash nem lehet benne.
function tisztaDetail(s: string) {
  return s.replace(/["\\]/g, '')
}

async function rendelesKotelezo(supabase: SupabaseClient, orderNo: number) {
  const r = await t.rendeles(supabase, orderNo)
  if (!r) throw new Error(`Ismeretlen rendeles: ${orderNo}`)
  return r
}

/** Az összes aktív foglalás feloldása a rendelés hivatkozásával (R-04 = nem volt mit feloldani). */
export async function foglalasFeloldas(supabase: SupabaseClient, orderNo: number): Promise<number> {
  const { valasz } = await raktarHivas(supabase, { cmd: 'FELOLD', ref: rendelesRef(orderNo) })
  if (!valasz) throw new Error('Raktar nem valaszolt (FELOLD)')
  if (valasz.status === 'NOK' && valasz.hibakod !== 'R-04') throw new Error(`FELOLD: ${valasz.hibakod} ${valasz.uzenet}`)
  await t.foglalasRefTorles(supabase, orderNo)
  return valasz.status === 'OK' ? Number(valasz.feloldott) : 0
}

/**
 * Készletfoglalás a rendelés összes tételére: TK-kód → raktári cikk a katalógus alapján, majd FOGLAL.
 * Részleges siker esetén a már sikeres foglalásokat feloldja.
 */
export async function keszletFoglalas(supabase: SupabaseClient, orderNo: number): Promise<MotorValasz> {
  const lines = await t.tetelek(supabase, orderNo)
  const katalogus = await termekek(supabase, lines.map((l) => l.productCode))

  const hianyzoKod = lines.filter((l) => !katalogus.get(l.productCode)?.raktari_kod).map((l) => l.productCode)
  if (hianyzoKod.length > 0) {
    return { ok: false, reason: 'MISSING_STOCK_CODE', detail: hianyzoKod.join(', ') }
  }

  const foglalasok: { cikk: number; db: number }[] = []
  for (const l of lines) {
    const cikk = katalogus.get(l.productCode)!.raktari_kod!
    const { corr, valasz } = await raktarHivas(supabase, { cmd: 'FOGLAL', cikk, db: l.qty, ref: rendelesRef(orderNo) })

    if (valasz?.status === 'OK') {
      await t.foglalasRefMent(supabase, orderNo, cikk, l.qty, corr)
      foglalasok.push({ cikk, db: l.qty })
      continue
    }

    // Sikertelen: a már lefoglalt tételek feloldása
    if (foglalasok.length > 0) await foglalasFeloldas(supabase, orderNo)
    if (!valasz) {
      return { ok: false, reason: 'INVENTORY_TIMEOUT', detail: tisztaDetail(`${cikk} (raktar nem valaszolt)`) }
    }
    if (valasz.hibakod === 'R-03') {
      const hiany = l.qty - Number(valasz.szabad ?? 0)
      return { ok: false, reason: 'INVENTORY_SHORTAGE', detail: `${cikk} (hiany: ${hiany} db)` }
    }
    return { ok: false, reason: 'INVENTORY_ERROR', detail: tisztaDetail(`${cikk} (${valasz.hibakod} ${valasz.uzenet ?? ''})`) }
  }

  return { ...SIKER, foglalasok }
}

type Body = Record<string, unknown> & { orderNo: number }

// allapot {orderNo, action, state?} vagy {orderNo, action, ok:false, reason, detail}
async function allapot(supabase: SupabaseClient, b: Body): Promise<MotorValasz> {
  const r = await rendelesKotelezo(supabase, b.orderNo)
  const action = String(b.action ?? 'allapot')

  if (b.ok === false) {
    const reason = String(b.reason ?? 'UNKNOWN')
    const detail = b.detail ? String(b.detail) : null
    await t.tortenetIr(supabase, { order_no: r.order_no, from_state: r.state, to_state: r.state, action, ok: false, reason, detail })
    await esemenyKuldes(supabase, r.order_no, { event: 'ORDER_ACTION_FAILED', state: r.state, action, reason, detail: detail ?? undefined })
    return SIKER
  }

  const uj = String(b.state)
  const elozo = action === 'start' ? null : r.state
  await t.rendelesModosit(supabase, r.order_no, { state: uj })
  await t.tortenetIr(supabase, { order_no: r.order_no, from_state: elozo, to_state: uj, action, ok: true })
  await esemenyKuldes(supabase, r.order_no, { event: 'ORDER_STATE_CHANGED', from: elozo, to: uj, action })
  return SIKER
}

async function foglalasFeloldasaAkcio(supabase: SupabaseClient, b: Body): Promise<MotorValasz> {
  await rendelesKotelezo(supabase, b.orderNo)
  return { ...SIKER, feloldva: await foglalasFeloldas(supabase, b.orderNo) }
}

// Szállítmány létrehozása; a lefoglalt készlet kiadása (MOZGAS KI a foglalás hivatkozásával → KIADVA).
async function szallitasLetrehozasa(supabase: SupabaseClient, b: Body): Promise<MotorValasz> {
  const r = await rendelesKotelezo(supabase, b.orderNo)
  const lines = await t.tetelek(supabase, r.order_no)
  const katalogus = await termekek(supabase, lines.map((l) => l.productCode))

  const figyelmeztetesek: string[] = []
  for (const l of lines) {
    const cikk = katalogus.get(l.productCode)?.raktari_kod
    if (!cikk) continue
    const { valasz } = await raktarHivas(supabase, { cmd: 'MOZGAS', cikk, tipus: 'KI', db: l.qty, ref: rendelesRef(r.order_no) })
    if (valasz?.status !== 'OK') figyelmeztetesek.push(`${cikk}: ${valasz?.hibakod ?? 'nincs valasz'}`)
  }

  const fuvarozok = ['GLS', 'MPL', 'DPD']
  const carrier = fuvarozok[r.order_no % 3]
  const eta = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()
  await t.szallitasLetrehoz(supabase, {
    order_no: r.order_no,
    carrier,
    tracking_no: `${carrier}${String(r.order_no * 37).padStart(8, '0')}`,
    carrier_status: 'FELVETELRE_VAR',
    eta,
  })
  return { ...SIKER, carrier, figyelmeztetesek }
}

async function szallitasAllapot(supabase: SupabaseClient, b: Body): Promise<MotorValasz> {
  const sz = await t.szallitas(supabase, b.orderNo)
  if (!sz) return { ok: false, reason: 'NO_SHIPMENT', detail: '', status: 'NINCS' }
  return { ...SIKER, status: sz.carrier_status }
}

// Számla a számlázó protokollon: vevő keresése adószámmal (ha nincs, felvétele), majd SZAMLA|KESZIT.
async function szamlazas(supabase: SupabaseClient, b: Body): Promise<MotorValasz> {
  const r = await rendelesKotelezo(supabase, b.orderNo)
  if (r.invoice_ref) return { ...SIKER, invoiceRef: r.invoice_ref }

  const p = await partner(supabase, r.partner_id)
  if (!p) throw new Error(`Ismeretlen partner: ${r.partner_id}`)

  let vevo = await szamlazo(`PARTNER|KERES|${p.tax_number}`)
  if (vevo[0] === 'ERR' && vevo[1] === 'E107') {
    vevo = await szamlazo(`PARTNER|UJ|${p.tax_number}|${protokollMezo(p.name)}|${protokollMezo(p.address ?? '')}`)
  }
  if (vevo[0] !== 'OK') throw new Error(`Szamlazo (partner): ${vevo.join('|')}`)
  const vevoKod = vevo[1]

  const lines = await t.tetelek(supabase, r.order_no)
  const katalogus = await termekek(supabase, lines.map((l) => l.productCode))
  const tetelMezok = lines.map(
    (l) => `${protokollMezo(`${l.productCode} ${katalogus.get(l.productCode)?.name ?? ''}`)};${l.qty};${protokollOsszeg(l.unitPrice)}`
  )

  const szamla = await szamlazo(
    ['SZAMLA', 'KESZIT', vevoKod, rendelesRef(r.order_no), protokollMa(), '8', ...tetelMezok].join('|')
  )
  if (szamla[0] !== 'OK') throw new Error(`Szamlazo (szamla): ${szamla.join('|')}`)

  await t.rendelesModosit(supabase, r.order_no, { invoice_ref: szamla[1] })
  return { ...SIKER, invoiceRef: szamla[1], brutto: szamla[2], hatarido: szamla[3] }
}

async function storno(supabase: SupabaseClient, b: Body): Promise<MotorValasz> {
  const r = await rendelesKotelezo(supabase, b.orderNo)
  if (!r.invoice_ref) return { ...SIKER, stornoRef: null }
  const v = await szamlazo(`SZAMLA|STORNO|${r.invoice_ref}`)
  if (v[0] !== 'OK') throw new Error(`Szamlazo (storno): ${v.join('|')}`)
  return { ...SIKER, stornoRef: v[1] }
}

async function esemeny(supabase: SupabaseClient, b: Body): Promise<MotorValasz> {
  if (b.type !== 'SHIPMENT_DELAYED') return { ok: false, reason: 'UNKNOWN_EVENT', detail: String(b.type) }
  const sz = await t.szallitas(supabase, b.orderNo)
  await esemenyKuldes(supabase, b.orderNo, {
    event: 'SHIPMENT_DELAYED',
    carrier: sz?.carrier ?? '',
    trackingNo: sz?.tracking_no ?? null,
    eta: sz?.eta ?? null,
  })
  return { ...SIKER, jelezve: true }
}

export const MOTOR_AKCIOK: Record<string, (supabase: SupabaseClient, b: Body) => Promise<MotorValasz>> = {
  allapot,
  keszlet_foglalas: (supabase, b) => keszletFoglalas(supabase, b.orderNo),
  foglalas_feloldasa: foglalasFeloldasaAkcio,
  szallitas_letrehozasa: szallitasLetrehozasa,
  szallitas_allapot: szallitasAllapot,
  szamlazas,
  storno,
  esemeny,
}
