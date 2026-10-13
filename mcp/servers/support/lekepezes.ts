// Legacy → kanonikus leképezés a support szerverhez: hibajegy, RMA, garancia, és a SOAP Fault kódok.
// A vevő a SOAP-ban adószám, a csereáru raktári cikkszám – mindkettő fordítva, a kimenetben nem jelenik meg.

import { z } from 'zod'
import { McpHiba } from '../../kozos/hiba'
import { NextAction, untrustedText } from '../../kozos/kanonikus'
import { rendelesRef, type Vevo } from '../../kozos/torzsadat'
import { RENDSZER, SoapFault, type LegacyJegy, type LegacyRma } from './adapter'

export const ticketIdField = z.string().regex(/^HJ-\d{6}$/, { error: 'A hibajegy azonosítója HJ-000321 alakú.' }).describe('Ticket id, e.g. "HJ-000321"')
export const rmaIdField = z.string().regex(/^RMA-\d{4}-\d{4,}$/, { error: 'Az RMA azonosítója RMA-2026-0012 alakú.' }).describe('RMA id, e.g. "RMA-2026-0012"')

// ---------------------------------------------------------------- szótárak

export const TICKET_STATUSES = ['new', 'in_progress', 'waiting', 'closed'] as const
export const TicketStatus = z.enum(TICKET_STATUSES)
const JEGY: Record<string, { status: (typeof TICKET_STATUSES)[number]; label: string }> = {
  UJ: { status: 'new', label: 'Új' },
  FOLYAMATBAN: { status: 'in_progress', label: 'Folyamatban' },
  VARAKOZIK: { status: 'waiting', label: 'Várakozik (ügyfélre vagy beszállítóra)' },
  LEZART: { status: 'closed', label: 'Lezárva' },
}
export const legacyJegyAllapot = (s: (typeof TICKET_STATUSES)[number]) => Object.entries(JEGY).find(([, a]) => a.status === s)![0]

const RMA_TIPUS = { CSERE: { type: 'replacement', label: 'Csere' }, JAVITAS: { type: 'repair', label: 'Javítás' } } as const
const RMA_ALLAPOT = {
  NYITOTT: { status: 'open', label: 'Nyitott' },
  BEERKEZETT: { status: 'received', label: 'A termék beérkezett' },
  LEZART: { status: 'closed', label: 'Lezárva' },
} as const
export const legacyRmaTipus = (t: 'replacement' | 'repair') => (t === 'replacement' ? 'CSERE' : 'JAVITAS')

// ---------------------------------------------------------------- sémák

export const Rma = z.object({
  rmaId: z.string(),
  ticketId: z.string(),
  type: z.enum(['replacement', 'repair']),
  typeLabel: z.string(),
  status: z.enum(['open', 'received', 'closed']),
  statusLabel: z.string(),
  replacementSku: z.string().nullable().describe('Replacement product reserved in the warehouse (replacement only)'),
  createdAt: z.string(),
})

export const Ticket = z.object({
  ticketId: z.string(),
  status: TicketStatus,
  statusLabel: z.string(),
  customer: z.object({ customerId: z.string().nullable(), name: z.string() }),
  orderId: z.string().nullable(),
  sku: z.string().nullable(),
  description: untrustedText('Problem description written by the customer'),
  createdAt: z.string(),
  updatedAt: z.string(),
  rmas: z.array(Rma),
  nextAction: NextAction.nullable(),
})
export type Ticket = z.infer<typeof Ticket>

export const TicketSummary = Ticket.omit({ rmas: true, nextAction: true, description: true }).extend({
  description: untrustedText('First 120 characters of the customer description'),
  openRma: z.boolean(),
})

export const Warranty = z.object({
  valid: z.boolean(),
  reason: z.enum(['valid', 'expired', 'not_in_order', 'not_delivered']),
  reasonLabel: z.string(),
  deliveredAt: z.string().nullable(),
  warrantyMonths: z.number().nullable(),
  expiresAt: z.string().nullable(),
})

// ---------------------------------------------------------------- leképezés

export function rma(r: LegacyRma, cikkSzerint: Map<number, { code: string }>): z.infer<typeof Rma> {
  const t = RMA_TIPUS[r.Type as keyof typeof RMA_TIPUS] ?? RMA_TIPUS.JAVITAS
  const a = RMA_ALLAPOT[r.Status as keyof typeof RMA_ALLAPOT] ?? RMA_ALLAPOT.NYITOTT
  return {
    rmaId: r.RmaId,
    ticketId: r.TicketId,
    type: t.type,
    typeLabel: t.label,
    status: a.status,
    statusLabel: a.label,
    replacementSku: r.ReplacementItem ? (cikkSzerint.get(Number(r.ReplacementItem))?.code ?? null) : null,
    createdAt: r.CreatedAt,
  }
}

function jegyAllapot(s: string) {
  const a = JEGY[s]
  if (!a) throw new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ügyfélszolgálati rendszer ismeretlen állapotot adott vissza.', { upstream: { system: RENDSZER, raw: s } })
  return a
}

function vevoKi(adoszam: string, crm: Map<string, Vevo>) {
  const v = crm.get(adoszam)
  return { customerId: v?.id ?? null, name: v?.name ?? `Ismeretlen vevő (${adoszam})` }
}

function kovetkezo(t: Omit<Ticket, 'nextAction'>): NextAction | null {
  if (t.status === 'closed') return null
  const nyitott = t.rmas.find((r) => r.status === 'open')
  if (nyitott?.type === 'repair') return { code: 'receive_rma', label: `A javításra küldött terméket (${nyitott.rmaId}) a beérkezéskor be kell vételezni.`, actor: 'logistics', tool: 'receive_rma' }
  if (nyitott?.type === 'replacement') return { code: 'close_ticket', label: `A lefoglalt csereterméket (${nyitott.replacementSku ?? '?'}) ki kell küldeni a vevőnek, utána a jegy lezárható.`, actor: 'sales', tool: 'update_ticket_status' }
  if (t.rmas.length === 0 && t.orderId && t.sku) return { code: 'check_warranty', label: 'Ellenőrizni kell a garanciát, mielőtt cserét vagy javítást indítunk.', actor: 'sales', tool: 'check_warranty' }
  if (t.status === 'new') return { code: 'take_ticket', label: 'A jegyet fel kell venni (folyamatban állapotba tenni).', actor: 'sales', tool: 'update_ticket_status' }
  return null
}

export function jegy(j: LegacyJegy, crm: Map<string, Vevo>, cikkSzerint: Map<number, { code: string }>): Ticket {
  const a = jegyAllapot(j.Status)
  const alap = {
    ticketId: j.TicketId,
    status: a.status,
    statusLabel: a.label,
    customer: vevoKi(j.PartnerTaxNumber, crm),
    orderId: j.OrderNo ? rendelesRef(Number(j.OrderNo)) : null,
    sku: j.ProductCode || null,
    description: j.Description ?? '',
    createdAt: j.CreatedAt,
    updatedAt: j.UpdatedAt,
    rmas: (j.Rma ?? []).map((r) => rma(r, cikkSzerint)),
  }
  return { ...alap, nextAction: kovetkezo(alap) }
}

export function jegyOsszefoglalo(j: LegacyJegy, crm: Map<string, Vevo>): z.infer<typeof TicketSummary> {
  const a = jegyAllapot(j.Status)
  const leiras = (j.Description ?? '').replace(/\s+/g, ' ')
  return {
    ticketId: j.TicketId,
    status: a.status,
    statusLabel: a.label,
    customer: vevoKi(j.PartnerTaxNumber, crm),
    orderId: j.OrderNo ? rendelesRef(Number(j.OrderNo)) : null,
    sku: j.ProductCode || null,
    description: leiras.length > 120 ? `${leiras.slice(0, 120)}…` : leiras,
    createdAt: j.CreatedAt,
    updatedAt: j.UpdatedAt,
    openRma: (j.Rma ?? []).some((r) => r.Status === 'NYITOTT'),
  }
}

const GARANCIA = {
  'W-OK': { reason: 'valid', label: 'Érvényes garancia' },
  'W-EXP': { reason: 'expired', label: 'A garancia lejárt' },
  'W-NOORDER': { reason: 'not_in_order', label: 'A rendelés nem létezik, vagy a termék nem szerepel benne' },
  'W-NOTDELIVERED': { reason: 'not_delivered', label: 'A rendelés még nincs kiszállítva, garancia még nem indult' },
} as const

export function garancia(v: { Valid?: string; ReasonCode?: string; DeliveredAt?: string; WarrantyMonths?: string; ExpiresAt?: string }): z.infer<typeof Warranty> {
  const g = GARANCIA[v.ReasonCode as keyof typeof GARANCIA]
  if (!g) throw new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ügyfélszolgálati rendszer ismeretlen garanciaválaszt adott.', { upstream: { system: RENDSZER, raw: String(v.ReasonCode) } })
  return {
    valid: v.Valid === 'true',
    reason: g.reason,
    reasonLabel: g.label,
    deliveredAt: v.DeliveredAt ?? null,
    warrantyMonths: v.WarrantyMonths ? Number(v.WarrantyMonths) : null,
    expiresAt: v.ExpiresAt ?? null,
  }
}

// ---------------------------------------------------------------- hibák

/** SOAP Fault → kanonikus hiba. A HD-409 kétértelmű; a pontosabb okot a hívó (index.ts) adja meg a `mire409`-cel. */
export function faultHiba(e: unknown, opts: { mi?: string; mire409?: () => McpHiba } = {}): unknown {
  if (!(e instanceof SoapFault)) return e
  const upstream = { system: RENDSZER, raw: e.kod }
  switch (e.kod) {
    case 'HD-404':
      return new McpHiba('NOT_FOUND', `${opts.mi ?? 'A hibajegy vagy az RMA'} nem található.`, { suggestedActions: ['list_tickets'], upstream })
    case 'HD-409': {
      const pontos = opts.mire409?.()
      if (!pontos) return new McpHiba('INVALID_STATE', 'Ez a művelet a jelenlegi állapotban nem végezhető el.', { suggestedActions: ['get_ticket'], upstream })
      return new McpHiba(pontos.code, pontos.message, { ...pontos.opts, upstream }) // a nyers kód hibakereséshez megmarad
    }
    case 'HD-422':
      return new McpHiba('VALIDATION', 'Az ügyfélszolgálati rendszer szerint a megadott adatok hibásak vagy hiányosak.', { upstream })
    case 'HD-401':
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ügyfélszolgálati rendszer elutasította a kapcsolatot (konfigurációs hiba). Szólj a rendszergazdának.', { retryable: false, upstream })
    default:
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ügyfélszolgálati rendszer hibát jelzett, próbáld újra később.', { retryable: true, upstream })
  }
}
