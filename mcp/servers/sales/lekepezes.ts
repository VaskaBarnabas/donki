// Legacy → kanonikus leképezés a sales szerverhez: vevő, termék, ajánlat, és a JSON-RPC hibakódok.

import { z } from 'zod'
import { McpHiba } from '../../kozos/hiba'
import { Money, money, NextAction } from '../../kozos/kanonikus'
import { CUSTOMER_GROUPS, ugyfelcsoport, type Termek, type Vevo } from '../../kozos/torzsadat'
import { RENDSZER, RpcHibaValasz, type LegacyAjanlat } from './adapter'

export const JOVAHAGYASI_LIMIT_PCT = 15

// ---------------------------------------------------------------- azonosítók

export const customerIdField = z.uuid({ error: 'A vevőazonosító UUID legyen (a search_customers adja).' }).describe('Customer id (UUID) from search_customers')
export const skuField = z.string().regex(/^TK-\d{5}$/, { error: 'A termékkód formátuma TK-00001.' }).describe('Product code, e.g. "TK-00001"')
export const quoteIdField = z
  .string()
  .regex(/^AJ-\d{4}-\d{4,}$/, { error: 'Az ajánlatazonosító formátuma AJ-2026-0042.' })
  .describe('Quote id, e.g. "AJ-2026-0042"')

// ---------------------------------------------------------------- vevő

export const CustomerSummary = z.object({
  customerId: z.string(),
  name: z.string(),
  taxNumber: z.string(),
  customerGroup: z.enum(CUSTOMER_GROUPS),
  customerGroupLabel: z.string(),
})

export function vevoOsszefoglalo(v: Vevo): z.infer<typeof CustomerSummary> {
  const cs = ugyfelcsoport(v.customer_group)
  return { customerId: v.id, name: v.name, taxNumber: v.tax_number, customerGroup: cs.key, customerGroupLabel: cs.label }
}

// ---------------------------------------------------------------- termék

const KATEGORIA: Record<string, string> = {
  NYOMT: 'printers',
  SZAMT: 'computers',
  IRBUT: 'office_furniture',
  IRSZE: 'office_supplies',
  IPGEP: 'industrial_tools',
  MUNVE: 'safety_equipment',
}
export const CATEGORIES = ['printers', 'computers', 'office_furniture', 'office_supplies', 'industrial_tools', 'safety_equipment'] as const
export const Category = z.enum(CATEGORIES)
export const kategoriaLegacy = (c: (typeof CATEGORIES)[number]) => Object.entries(KATEGORIA).find(([, v]) => v === c)![0]

export const Product = z.object({
  sku: z.string(),
  name: z.string(),
  category: Category,
  categoryLabel: z.string(),
  listPrice: Money.describe('Net list price per unit'),
  customerPrice: Money.nullable().describe('Net unit price for the given customer group (before line/quantity discounts); null if no customer given'),
  customerDiscountPct: z.number().nullable(),
  unit: z.string(),
  warrantyMonths: z.number(),
  active: z.boolean(),
  stockTracked: z.boolean().describe('false: no warehouse code, the product cannot be reserved or delivered'),
})

export function termek(t: Termek, kategoriak: Map<string, string>, vevoAr: { price: number; discountPct: number } | null): z.infer<typeof Product> {
  return {
    sku: t.code,
    name: t.name,
    category: (KATEGORIA[t.category_id] ?? 'office_supplies') as (typeof CATEGORIES)[number],
    categoryLabel: kategoriak.get(t.category_id) ?? t.category_id,
    listPrice: money(t.list_price),
    customerPrice: vevoAr ? money(vevoAr.price) : null,
    customerDiscountPct: vevoAr ? vevoAr.discountPct : null,
    unit: t.unit,
    warrantyMonths: t.warranty_months,
    active: t.active,
    stockTracked: t.raktari_kod !== null,
  }
}

// ---------------------------------------------------------------- ajánlat

export const QUOTE_STATUSES = ['draft', 'pending_approval', 'approved', 'accepted', 'expired', 'rejected'] as const
export const QuoteStatus = z.enum(QUOTE_STATUSES)
const ALLAPOT: Record<string, { status: (typeof QUOTE_STATUSES)[number]; label: string }> = {
  PISZKOZAT: { status: 'draft', label: 'Piszkozat' },
  JOVAHAGYASRA_VAR: { status: 'pending_approval', label: 'Kedvezmény-jóváhagyásra vár' },
  JOVAHAGYOTT: { status: 'approved', label: 'Jóváhagyva, elfogadható' },
  ELFOGADVA: { status: 'accepted', label: 'Elfogadva, rendelés létrejött' },
  LEJART: { status: 'expired', label: 'Lejárt' },
  ELUTASITVA: { status: 'rejected', label: 'Elutasítva' },
}
export const legacyAjanlatAllapot = (s: (typeof QUOTE_STATUSES)[number]) => Object.entries(ALLAPOT).find(([, a]) => a.status === s)![0]

function allapot(s: string) {
  const a = ALLAPOT[s]
  if (!a) throw new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ajánlatkezelő ismeretlen állapotot adott vissza.', { upstream: { system: RENDSZER, raw: s } })
  return a
}

export const QuoteLine = z.object({
  sku: z.string(),
  name: z.string(),
  quantity: z.number(),
  listUnitPrice: Money,
  lineDiscountPct: z.number().describe('Manual line discount; customer group and quantity discounts are applied on top'),
  lineTotal: Money.nullable().describe('Net line total after all discounts; null until calculated'),
})

export const Quote = z.object({
  quoteId: z.string(),
  status: QuoteStatus,
  statusLabel: z.string(),
  customer: z.object({ customerId: z.string(), name: z.string() }),
  createdOn: z.string(),
  validUntil: z.string(),
  lines: z.array(QuoteLine),
  totalNet: Money.describe('Net total after all discounts (VAT not included)'),
  totalListPrice: Money.describe('Net list price total before any discount'),
  totalDiscountPct: z.number().describe('Overall discount: 1 - totalNet / totalListPrice, in percent'),
  approvalRequired: z.boolean(),
  approvalLimitPct: z.number(),
  approvedBy: z.string().nullable(),
  orderId: z.string().nullable(),
  nextAction: NextAction.nullable(),
})
export type Quote = z.infer<typeof Quote>

export const QuoteSummary = z.object({
  quoteId: z.string(),
  status: QuoteStatus,
  statusLabel: z.string(),
  customer: z.object({ customerId: z.string(), name: z.string() }),
  validUntil: z.string(),
  totalNet: Money,
  totalDiscountPct: z.number(),
  orderId: z.string().nullable(),
})

function kovetkezoLepes(status: (typeof QUOTE_STATUSES)[number], kellJovahagyas: boolean, orderId: string | null): NextAction | null {
  switch (status) {
    case 'draft':
      return kellJovahagyas
        ? { code: 'request_quote_approval', label: `A kedvezmény meghaladja a ${JOVAHAGYASI_LIMIT_PCT}%-ot, ezért jóváhagyást kell kérni.`, actor: 'sales', tool: 'request_quote_approval' }
        : { code: 'accept_quote', label: 'A vevő elfogadása után az ajánlatból rendelés készíthető.', actor: 'sales', tool: 'accept_quote' }
    case 'pending_approval':
      return { code: 'approve_quote', label: 'Egy értékesítési vezetőnek jóvá kell hagynia a kedvezményt.', actor: 'sales_manager', tool: 'approve_quote' }
    case 'approved':
      return { code: 'accept_quote', label: 'A kedvezmény jóváhagyva; a vevő elfogadása után rendelés készíthető.', actor: 'sales', tool: 'accept_quote' }
    case 'accepted':
      return { code: 'track_order', label: `Az ajánlatból rendelés lett (${orderId}); az állapotát a rendeléskezelés mutatja.`, actor: 'sales', tool: 'get_order' }
    case 'expired':
      return { code: 'create_quote', label: 'Az ajánlat lejárt; új ajánlatot kell készíteni.', actor: 'sales', tool: 'create_quote' }
    default:
      return null
  }
}

export function ajanlat(q: LegacyAjanlat, vevoNev: string, termekNevek: Map<string, string>): Quote {
  const a = allapot(q.status)
  const kellJovahagyas = q.approvalRequired ?? q.totalDiscountPct > JOVAHAGYASI_LIMIT_PCT
  return {
    quoteId: q.id,
    status: a.status,
    statusLabel: a.label,
    customer: { customerId: q.partnerId, name: vevoNev },
    createdOn: q.createdOn,
    validUntil: q.validUntil,
    lines: (q.lines ?? []).map((l) => ({
      sku: l.productCode,
      name: termekNevek.get(l.productCode) ?? l.productCode,
      quantity: l.qty,
      listUnitPrice: money(l.unitPrice),
      lineDiscountPct: l.lineDiscountPct,
      lineTotal: l.lineNet === null ? null : money(l.lineNet),
    })),
    totalNet: money(q.totalNet),
    // A legacy „totalGross” NEM ÁFÁ-s bruttó, hanem a kedvezmények előtti listaár-összeg – ezért itt a tételekből számoljuk, más néven.
    totalListPrice: money((q.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0)),
    totalDiscountPct: q.totalDiscountPct,
    approvalRequired: kellJovahagyas,
    approvalLimitPct: q.approvalLimitPct ?? JOVAHAGYASI_LIMIT_PCT,
    approvedBy: q.approvedBy,
    orderId: q.orderRef,
    nextAction: kovetkezoLepes(a.status, kellJovahagyas, q.orderRef),
  }
}

export function ajanlatOsszefoglalo(q: LegacyAjanlat, vevoNev: string): z.infer<typeof QuoteSummary> {
  const a = allapot(q.status)
  return {
    quoteId: q.id,
    status: a.status,
    statusLabel: a.label,
    customer: { customerId: q.partnerId, name: vevoNev },
    validUntil: q.validUntil,
    totalNet: money(q.totalNet),
    totalDiscountPct: q.totalDiscountPct,
    orderId: q.orderRef,
  }
}

// ---------------------------------------------------------------- hibák

const STATUSZ_FELIRAT = Object.fromEntries(Object.entries(ALLAPOT).map(([k, a]) => [k, a.label.toLowerCase()]))

/** JSON-RPC hiba → kanonikus hiba. Ami nem RpcHibaValasz (pl. már McpHiba), azt változatlanul továbbdobja. */
export function rpcHiba(e: unknown): unknown {
  if (!(e instanceof RpcHibaValasz)) return e
  const { code, message, data } = e.hiba
  const d = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  const upstream = { system: RENDSZER, raw: JSON.stringify(e.hiba).slice(0, 500) }

  switch (code) {
    case -32602: {
      if (d.reason === 'QUOTE_NOT_FOUND') return new McpHiba('NOT_FOUND', `A(z) ${d.quoteId} ajánlat nem található.`, { details: { quoteId: d.quoteId }, suggestedActions: ['list_quotes'], upstream })
      if (d.reason === 'PARTNER_NOT_FOUND') return new McpHiba('NOT_FOUND', 'A megadott vevő nem található.', { details: { customerId: d.partnerId }, suggestedActions: ['search_customers'], upstream })
      if (d.reason === 'PRODUCT_NOT_FOUND') return new McpHiba('NOT_FOUND', `A(z) ${d.productCode} termék nem található a katalógusban.`, { details: { sku: d.productCode }, suggestedActions: ['search_products'], upstream })
      if (d.reason === 'TEMPLATE_NOT_FOUND') return new McpHiba('VALIDATION', 'Ismeretlen érvényességi sablon.', { upstream })
      const mezok = Array.isArray(data) ? (data as { field: string; message: string }[]).map((m) => m.field).join(', ') : ''
      return new McpHiba('VALIDATION', `Az ajánlat adatai hibásak${mezok ? ` (${mezok})` : ''}.`, { upstream })
    }
    case -32010:
      return new McpHiba(
        'APPROVAL_REQUIRED',
        `Az összesített kedvezmény (${d.discountPct}%) meghaladja a ${d.limit}%-os küszöböt, ezért az elfogadás előtt vezetői jóváhagyás kell.`,
        { details: { discountPct: d.discountPct, limit: d.limit }, suggestedActions: ['request_quote_approval'], upstream }
      )
    case -32011:
      return new McpHiba('EXPIRED', `Az ajánlat ${d.validUntil}-án lejárt. Új ajánlatot kell készíteni.`, {
        details: { quoteId: d.quoteId, validUntil: d.validUntil },
        suggestedActions: ['create_quote'],
        upstream,
      })
    case -32012: {
      if (d.reason === 'NO_LINES') return new McpHiba('VALIDATION', 'Az ajánlatnak nincs tétele.', { upstream })
      const status = typeof d.status === 'string' && ALLAPOT[d.status] ? ALLAPOT[d.status].status : null
      const allowed = Array.isArray(d.allowed) ? (d.allowed as string[]).map((s) => ALLAPOT[s]?.status ?? s) : []
      return new McpHiba(
        'INVALID_STATE',
        `Ez a művelet az ajánlat jelenlegi állapotában (${STATUSZ_FELIRAT[String(d.status)] ?? 'ismeretlen'}) nem végezhető el. Az ajánlat tételei nem módosíthatók; ha változtatni kell, készíts új ajánlatot.`,
        { details: { quoteId: d.quoteId, status, allowed }, suggestedActions: ['get_quote', 'create_quote'], upstream }
      )
    }
    case -32013:
      return new McpHiba('VALIDATION', `A(z) ${d.productCode} termék már nem rendelhető (kivezetett termék).`, { details: { sku: d.productCode }, suggestedActions: ['search_products'], upstream })
    case -32603:
      if (d.reason === 'ORDER_CREATE_FAILED') {
        return new McpHiba('UPSTREAM_UNAVAILABLE', 'A rendelés létrehozása nem sikerült (a rendeléskezelő nem válaszolt); az ajánlat változatlan, próbáld újra.', { retryable: true, upstream })
      }
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ajánlatkezelő rendszer hibát jelzett, próbáld újra később.', { retryable: true, upstream })
    default:
      // -32001 (kulcs), -32600/-32601/-32700: konfigurációs vagy adapterhiba – nem a hívóé, újrapróbálni felesleges
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ajánlatkezelő rendszer elutasította a kérést (konfigurációs hiba). Szólj a rendszergazdának.', {
        retryable: false,
        upstream: { system: RENDSZER, raw: `${code} ${message}` },
      })
  }
}
