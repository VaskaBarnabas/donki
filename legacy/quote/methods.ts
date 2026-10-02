// Az ajánlatmotor JSON-RPC metódusai. Saját séma: quote (azonosító AJ-2026-0042,
// dátum YYYY-MM-DD, pénz egész forint). Más modult csak a kulso.ts-en keresztül ér el.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { HIBAKOD, RpcHiba } from './hibak'
import { arLekerdezes, partnerLekerdezes, rendelesLetrehozas, RendelesHiba } from './kulso'
import { arazAjanlat, JOVAHAGYASI_LIMIT_PCT } from './pricing'

type QuoteRow = {
  id: string
  partner_id: string
  template_id: number | null
  created_on: string
  valid_until: string
  status: string
  total_net: number
  total_discount_pct: number
  approval_reason: string | null
  approved_by: string | null
  approved_on: string | null
  order_ref: string | null
}

type LineRow = {
  id: number
  quote_id: string
  product_code: string
  qty: number
  unit_price: number
  line_discount_pct: number
  line_net: number | null
}

const NYITOTT = ['PISZKOZAT', 'JOVAHAGYASRA_VAR', 'JOVAHAGYOTT']

// ---------------------------------------------------------------- segédek

function ma(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date())
}

function napHozzaad(datum: string, nap: number): string {
  const d = new Date(`${datum}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + nap)
  return d.toISOString().slice(0, 10)
}

function db(): SupabaseClient {
  return createServiceClient()
}

function ajanlatDto(q: QuoteRow, lines?: LineRow[]) {
  return {
    id: q.id,
    partnerId: q.partner_id,
    templateId: q.template_id,
    createdOn: q.created_on,
    validUntil: q.valid_until,
    status: q.status,
    totalNet: Number(q.total_net),
    totalDiscountPct: Number(q.total_discount_pct),
    approvalReason: q.approval_reason,
    approvedBy: q.approved_by,
    approvedOn: q.approved_on,
    orderRef: q.order_ref,
    ...(lines && {
      lines: lines.map((l) => ({
        lineId: l.id,
        productCode: l.product_code,
        qty: l.qty,
        unitPrice: Number(l.unit_price),
        lineDiscountPct: Number(l.line_discount_pct),
        lineNet: l.line_net === null ? null : Number(l.line_net),
      })),
    }),
  }
}

async function ajanlatBetolt(supabase: SupabaseClient, quoteId: string): Promise<QuoteRow> {
  const { data, error } = await supabase.schema('quote').from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new RpcHiba(HIBAKOD.INVALID_PARAMS, 'Invalid params', { quoteId, reason: 'QUOTE_NOT_FOUND' })
  return data as QuoteRow
}

async function tetelekBetolt(supabase: SupabaseClient, quoteId: string): Promise<LineRow[]> {
  const { data, error } = await supabase
    .schema('quote')
    .from('quote_lines')
    .select('*')
    .eq('quote_id', quoteId)
    .order('id')
  if (error) throw new Error(error.message)
  return (data ?? []) as LineRow[]
}

async function ajanlatModosit(supabase: SupabaseClient, quoteId: string, mezok: Partial<QuoteRow>): Promise<QuoteRow> {
  const { data, error } = await supabase
    .schema('quote')
    .from('quotes')
    .update(mezok)
    .eq('id', quoteId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as QuoteRow
}

function allapotEllenorzes(q: QuoteRow, engedett: string[]) {
  if (!engedett.includes(q.status)) {
    throw new RpcHiba(HIBAKOD.INVALID_STATE, 'INVALID_STATE', { quoteId: q.id, status: q.status, allowed: engedett })
  }
}

/** Lusta lejárat: nyitott, de lejárt ajánlat a hívás pillanatában LEJART lesz. */
async function lejaratEllenorzes(supabase: SupabaseClient, q: QuoteRow) {
  if (q.status === 'LEJART') {
    throw new RpcHiba(HIBAKOD.QUOTE_EXPIRED, 'QUOTE_EXPIRED', { quoteId: q.id, validUntil: q.valid_until })
  }
  if (NYITOTT.includes(q.status) && q.valid_until < ma()) {
    await ajanlatModosit(supabase, q.id, { status: 'LEJART' })
    throw new RpcHiba(HIBAKOD.QUOTE_EXPIRED, 'QUOTE_EXPIRED', { quoteId: q.id, validUntil: q.valid_until })
  }
}

async function partnerKotelezo(supabase: SupabaseClient, partnerId: string) {
  const partner = await partnerLekerdezes(supabase, partnerId)
  if (!partner) throw new RpcHiba(HIBAKOD.INVALID_PARAMS, 'Invalid params', { partnerId, reason: 'PARTNER_NOT_FOUND' })
  return partner
}

/** Újraszámolja az ajánlatot friss katalógusárakkal, és elmenti a tételeket és az összesítőt. */
async function szamol(supabase: SupabaseClient, q: QuoteRow) {
  const lines = await tetelekBetolt(supabase, q.id)
  if (lines.length === 0) {
    throw new RpcHiba(HIBAKOD.INVALID_STATE, 'INVALID_STATE', { quoteId: q.id, reason: 'NO_LINES' })
  }
  const partner = await partnerKotelezo(supabase, q.partner_id)

  const arak = await Promise.all(lines.map((l) => arLekerdezes(supabase, l.product_code, partner.customer_group)))
  arak.forEach((ar, i) => {
    if (!ar) {
      throw new RpcHiba(HIBAKOD.INVALID_PARAMS, 'Invalid params', { productCode: lines[i].product_code, reason: 'PRODUCT_NOT_FOUND' })
    }
    if (!ar.active) {
      throw new RpcHiba(HIBAKOD.PRODUCT_INACTIVE, 'PRODUCT_INACTIVE', { productCode: lines[i].product_code })
    }
  })

  const eredmeny = arazAjanlat(
    lines.map((l, i) => ({
      productCode: l.product_code,
      qty: l.qty,
      listPrice: Math.round(arak[i]!.list_price),
      groupDiscountPct: arak[i]!.discount_pct,
      lineDiscountPct: Number(l.line_discount_pct),
    }))
  )

  const frissTetelek: LineRow[] = []
  for (const [i, l] of lines.entries()) {
    const t = eredmeny.tetelek[i]
    const { data, error } = await supabase
      .schema('quote')
      .from('quote_lines')
      .update({ unit_price: t.listPrice, line_net: t.lineNet })
      .eq('id', l.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    frissTetelek.push(data as LineRow)
  }

  const friss = await ajanlatModosit(supabase, q.id, {
    total_net: eredmeny.totalNet,
    total_discount_pct: eredmeny.totalDiscountPct,
  })
  return { quote: friss, lines: frissTetelek, eredmeny }
}

// ---------------------------------------------------------------- paraméter sémák

const quoteId = z.string().regex(/^AJ-\d{4}-\d{4,}$/, 'Ervenytelen ajanlatszam (AJ-EEEE-NNNN)')

const sema = {
  create: z.object({ partnerId: z.uuid(), templateId: z.number().int().positive().optional() }),
  addLine: z.object({
    quoteId,
    productCode: z.string().regex(/^TK-\d{5}$/, 'Ervenytelen termekkod (TK-NNNNN)'),
    qty: z.number().int().positive(),
    lineDiscountPct: z.number().min(0).max(100).optional(),
  }),
  csakId: z.object({ quoteId }),
  requestApproval: z.object({ quoteId, reason: z.string().trim().min(1) }),
  approve: z.object({ quoteId, approver: z.string().trim().min(1) }),
  list: z.object({
    partnerId: z.uuid().optional(),
    status: z.enum(['PISZKOZAT', 'JOVAHAGYASRA_VAR', 'JOVAHAGYOTT', 'ELFOGADVA', 'LEJART', 'ELUTASITVA']).optional(),
  }),
}

// ---------------------------------------------------------------- metódusok

async function create(params: Record<string, unknown>) {
  const p = sema.create.parse(params)
  const supabase = db()
  await partnerKotelezo(supabase, p.partnerId)

  const templateId = p.templateId ?? 1
  const { data: sablon, error: sablonHiba } = await supabase
    .schema('quote')
    .from('templates')
    .select('id, ervenyesseg_nap')
    .eq('id', templateId)
    .maybeSingle()
  if (sablonHiba) throw new Error(sablonHiba.message)
  if (!sablon) throw new RpcHiba(HIBAKOD.INVALID_PARAMS, 'Invalid params', { templateId, reason: 'TEMPLATE_NOT_FOUND' })

  const { data, error } = await supabase
    .schema('quote')
    .from('quotes')
    .insert({ partner_id: p.partnerId, template_id: templateId, valid_until: napHozzaad(ma(), sablon.ervenyesseg_nap) })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return ajanlatDto(data as QuoteRow, [])
}

async function addLine(params: Record<string, unknown>) {
  const p = sema.addLine.parse(params)
  const supabase = db()
  const q = await ajanlatBetolt(supabase, p.quoteId)
  await lejaratEllenorzes(supabase, q)
  allapotEllenorzes(q, ['PISZKOZAT'])

  const partner = await partnerKotelezo(supabase, q.partner_id)
  const ar = await arLekerdezes(supabase, p.productCode, partner.customer_group)
  if (!ar) throw new RpcHiba(HIBAKOD.INVALID_PARAMS, 'Invalid params', { productCode: p.productCode, reason: 'PRODUCT_NOT_FOUND' })
  if (!ar.active) throw new RpcHiba(HIBAKOD.PRODUCT_INACTIVE, 'PRODUCT_INACTIVE', { productCode: p.productCode })

  const { error } = await supabase
    .schema('quote')
    .from('quote_lines')
    .insert({
      quote_id: q.id,
      product_code: p.productCode,
      qty: p.qty,
      unit_price: Math.round(ar.list_price),
      line_discount_pct: p.lineDiscountPct ?? 0,
    })
  if (error) throw new Error(error.message)
  return ajanlatDto(q, await tetelekBetolt(supabase, q.id))
}

async function calculate(params: Record<string, unknown>) {
  const p = sema.csakId.parse(params)
  const supabase = db()
  const q = await ajanlatBetolt(supabase, p.quoteId)
  await lejaratEllenorzes(supabase, q)
  allapotEllenorzes(q, NYITOTT)

  const { quote, lines, eredmeny } = await szamol(supabase, q)
  return {
    ...ajanlatDto(quote, lines),
    totalGross: eredmeny.totalGross,
    approvalRequired: eredmeny.approvalRequired,
    approvalLimitPct: JOVAHAGYASI_LIMIT_PCT,
  }
}

async function requestApproval(params: Record<string, unknown>) {
  const p = sema.requestApproval.parse(params)
  const supabase = db()
  const q = await ajanlatBetolt(supabase, p.quoteId)
  await lejaratEllenorzes(supabase, q)
  allapotEllenorzes(q, ['PISZKOZAT'])
  return ajanlatDto(await ajanlatModosit(supabase, q.id, { status: 'JOVAHAGYASRA_VAR', approval_reason: p.reason }))
}

async function approve(params: Record<string, unknown>) {
  const p = sema.approve.parse(params)
  const supabase = db()
  const q = await ajanlatBetolt(supabase, p.quoteId)
  await lejaratEllenorzes(supabase, q)
  allapotEllenorzes(q, ['JOVAHAGYASRA_VAR'])
  return ajanlatDto(
    await ajanlatModosit(supabase, q.id, { status: 'JOVAHAGYOTT', approved_by: p.approver, approved_on: ma() })
  )
}

async function accept(params: Record<string, unknown>) {
  const p = sema.csakId.parse(params)
  const supabase = db()
  const q = await ajanlatBetolt(supabase, p.quoteId)
  await lejaratEllenorzes(supabase, q)
  allapotEllenorzes(q, ['PISZKOZAT', 'JOVAHAGYOTT'])

  const { lines, eredmeny } = await szamol(supabase, q)
  if (eredmeny.approvalRequired && q.status !== 'JOVAHAGYOTT') {
    throw new RpcHiba(HIBAKOD.DISCOUNT_APPROVAL_REQUIRED, 'DISCOUNT_APPROVAL_REQUIRED', {
      discountPct: eredmeny.totalDiscountPct,
      limit: JOVAHAGYASI_LIMIT_PCT,
    })
  }

  let orderNo: number
  try {
    orderNo = await rendelesLetrehozas({
      quoteRef: q.id,
      partnerId: q.partner_id,
      lines: lines.map((l) => ({
        productCode: l.product_code,
        qty: l.qty,
        unitPrice: Math.round((Number(l.line_net) / l.qty) * 100) / 100,
      })),
    })
  } catch (e) {
    if (e instanceof RendelesHiba) {
      throw new RpcHiba(HIBAKOD.INTERNAL_ERROR, 'Internal error', { reason: 'ORDER_CREATE_FAILED', detail: e.message })
    }
    throw e
  }

  const orderRef = `RND-${orderNo}`
  const friss = await ajanlatModosit(supabase, q.id, { status: 'ELFOGADVA', order_ref: orderRef })
  return { quoteId: friss.id, status: friss.status, orderNo, orderRef }
}

async function get(params: Record<string, unknown>) {
  const p = sema.csakId.parse(params)
  const supabase = db()
  const q = await ajanlatBetolt(supabase, p.quoteId)
  return ajanlatDto(q, await tetelekBetolt(supabase, q.id))
}

async function list(params: Record<string, unknown>) {
  const p = sema.list.parse(params)
  let keres = db().schema('quote').from('quotes').select('*').order('id', { ascending: false }).limit(100)
  if (p.partnerId) keres = keres.eq('partner_id', p.partnerId)
  if (p.status) keres = keres.eq('status', p.status)
  const { data, error } = await keres
  if (error) throw new Error(error.message)
  return ((data ?? []) as QuoteRow[]).map((q) => ajanlatDto(q))
}

export const METODUSOK: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  'quote.create': create,
  'quote.addLine': addLine,
  'quote.calculate': calculate,
  'quote.requestApproval': requestApproval,
  'quote.approve': approve,
  'quote.accept': accept,
  'quote.get': get,
  'quote.list': list,
}
