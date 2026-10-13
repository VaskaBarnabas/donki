// Legacy → kanonikus leképezés az orders szerverhez: állapotok, szállítás, következő lépés, és a homlokzat
// szabad szöveges hibaüzenetei. Az ágens innen kifelé soha nem lát legacy formátumot (kivétel: upstream.raw).

import { z } from 'zod'
import { McpHiba } from '../../kozos/hiba'
import { Money, money, NextAction } from '../../kozos/kanonikus'
import { katalogus, RENDSZER, type LegacyRendeles, type LegacySor, type LegacySzallitas, type LegacyTortenet, type Vevo } from './adapter'

// ---------------------------------------------------------------- sémák

export const ORDER_STATUSES = ['received', 'approved', 'in_fulfillment', 'delivered', 'awaiting_payment', 'completed', 'cancelled'] as const
export const OrderStatus = z.enum(ORDER_STATUSES)
export type OrderStatus = z.infer<typeof OrderStatus>

export const SHIPMENT_STATUSES = ['awaiting_pickup', 'picked_up', 'in_transit', 'delayed', 'delivered'] as const
export const ShipmentStatus = z.enum(SHIPMENT_STATUSES)

/** RND-100045 vagy 100045 – mindkettő elfogadott. */
export const orderIdField = z
  .string()
  .regex(/^(RND-)?\d{6,}$/i, { error: 'A rendelésazonosító formátuma RND-100045 vagy 100045.' })
  .describe('Order id, e.g. "RND-100045" (the bare number "100045" is also accepted)')

export const Order = z.object({
  orderId: z.string(),
  status: OrderStatus,
  statusLabel: z.string(),
  customer: z.object({ customerId: z.string(), name: z.string() }),
  quoteId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(z.object({ sku: z.string(), quantity: z.number(), unitPrice: Money, lineTotal: Money })),
  total: Money.describe('Net total'),
  nextAction: NextAction.nullable(),
  shipment: z
    .object({ carrier: z.string(), trackingNo: z.string().nullable(), status: ShipmentStatus, statusLabel: z.string(), eta: z.string().nullable() })
    .nullable(),
  billing: z.object({ documentNo: z.string(), documentType: z.enum(['proforma', 'invoice']) }).nullable(),
  processManaged: z.boolean().describe('false: legacy order outside the process engine, read-only'),
})
export type Order = z.infer<typeof Order>

export const OrderSummary = z.object({
  orderId: z.string(),
  status: OrderStatus,
  statusLabel: z.string(),
  customer: z.object({ customerId: z.string(), name: z.string() }),
  quoteId: z.string().nullable(),
  updatedAt: z.string(),
  processManaged: z.boolean(),
})
export type OrderSummary = z.infer<typeof OrderSummary>

export const TimelineEntry = z.object({
  at: z.string(),
  from: OrderStatus.nullable(),
  to: OrderStatus,
  action: z.string(),
  ok: z.boolean(),
  reason: z.string().nullable(),
  detail: z.string().nullable(),
})

// ---------------------------------------------------------------- állapotok

const ALLAPOT: Record<string, { status: OrderStatus; label: string }> = {
  ROGZITETT: { status: 'received', label: 'Rögzítve, jóváhagyásra vár' },
  JOVAHAGYOTT: { status: 'approved', label: 'Jóváhagyva, készlet lefoglalva' },
  TELJESITES_ALATT: { status: 'in_fulfillment', label: 'Teljesítés alatt (szállítás folyamatban)' },
  SZALLITVA: { status: 'delivered', label: 'Kiszállítva' },
  SZAMLAZVA: { status: 'awaiting_payment', label: 'Díjbekérő kiállítva, fizetésre vár' },
  LEZART: { status: 'completed', label: 'Lezárva (fizetve)' },
  LEMONDOTT: { status: 'cancelled', label: 'Lemondva' },
}

export const STATUS_LABEL = Object.fromEntries(Object.values(ALLAPOT).map((a) => [a.status, a.label])) as Record<OrderStatus, string>

/** Kanonikus állapot → legacy kód (a list_orders szűréséhez). */
export function legacyAllapot(status: OrderStatus): string {
  return Object.entries(ALLAPOT).find(([, a]) => a.status === status)![0]
}

function allapot(state: string) {
  const a = ALLAPOT[state]
  if (!a) throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A rendeléskezelő rendszer ismeretlen állapotot adott vissza.', { upstream: { system: RENDSZER, raw: state } })
  return a
}

const SZALLITAS: Record<string, { status: z.infer<typeof ShipmentStatus>; label: string }> = {
  FELVETELRE_VAR: { status: 'awaiting_pickup', label: 'Felvételre vár' },
  FELVEVE: { status: 'picked_up', label: 'A futár felvette' },
  UTON: { status: 'in_transit', label: 'Úton' },
  KESIK: { status: 'delayed', label: 'Késik' },
  KEZBESITVE: { status: 'delivered', label: 'Kézbesítve' },
}

export function orderNo(orderId: string): number {
  return Number(orderId.replace(/^RND-/i, ''))
}

export function orderRef(no: number): string {
  return `RND-${no}`
}

// ---------------------------------------------------------------- következő lépés

const FELADAT: Record<string, NextAction> = {
  rendeles_jovahagyasa: { code: 'approve_order', label: 'A rendelést egy értékesítési vezetőnek jóvá kell hagynia.', actor: 'sales_manager', tool: 'approve_order' },
  kiszallitas_inditasa: { code: 'start_fulfillment', label: 'A logisztikának el kell indítania a kiszállítást.', actor: 'logistics', tool: 'start_fulfillment' },
  szamla_kiallitasa: { code: 'issue_proforma', label: 'A pénzügynek ki kell állítania a díjbekérőt.', actor: 'finance', tool: 'issue_proforma' },
}

/**
 * Állapot → az a user task, amelyre a BPMN szerint ebben az állapotban vár a folyamat. Az állapotot egy HTTP task
 * írja, a user task csak utána jön létre – a köztes pillanatban a következő lépést az állapotból adjuk meg.
 */
export const VART_FELADAT: Partial<Record<OrderStatus, string>> = {
  received: 'rendeles_jovahagyasa',
  approved: 'kiszallitas_inditasa',
  delivered: 'szamla_kiallitasa',
}

function kovetkezoLepes(r: LegacyRendeles, status: OrderStatus, szallitas: Order['shipment']): NextAction | null {
  if (!r.process_instance_id) return null
  if (r.current_task && FELADAT[r.current_task.key]) return FELADAT[r.current_task.key]
  const vart = VART_FELADAT[status]
  if (vart) return FELADAT[vart]
  if (status === 'in_fulfillment') {
    const hol = szallitas ? ` (jelenleg: ${szallitas.statusLabel.toLowerCase()})` : ''
    return { code: 'wait_for_delivery', label: `A kiszállításra kell várni${hol}.`, actor: 'system', tool: 'wait_for_order_status' }
  }
  if (status === 'awaiting_payment') return { code: 'collect_payment', label: 'A vevőnek ki kell fizetnie a díjbekérőt.', actor: 'customer' }
  return null
}

// ---------------------------------------------------------------- rendelés

function vevo(id: string, vevok: Map<string, Vevo>) {
  return { customerId: id, name: vevok.get(id)?.name ?? 'Ismeretlen vevő' }
}

export function rendeles(r: LegacyRendeles, sz: LegacySzallitas | null, vevok: Map<string, Vevo>): Order {
  const a = allapot(r.state)
  const shipment = sz
    ? {
        carrier: sz.carrier,
        trackingNo: sz.tracking_no,
        status: SZALLITAS[sz.carrier_status]?.status ?? 'in_transit',
        statusLabel: SZALLITAS[sz.carrier_status]?.label ?? 'Úton',
        eta: sz.eta,
      }
    : null
  const lines = r.lines.map((l) => ({ sku: l.productCode, quantity: l.qty, unitPrice: money(l.unitPrice), lineTotal: money(l.qty * l.unitPrice) }))
  return {
    orderId: orderRef(r.order_no),
    status: a.status,
    statusLabel: a.label,
    customer: vevo(r.partner_id, vevok),
    quoteId: r.quote_ref || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lines,
    total: money(r.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)),
    nextAction: kovetkezoLepes(r, a.status, shipment),
    shipment,
    billing: r.invoice_ref ? { documentNo: r.invoice_ref, documentType: r.invoice_ref.startsWith('DB-') ? 'proforma' : 'invoice' } : null,
    processManaged: r.process_instance_id !== null,
  }
}

export function osszefoglalo(r: LegacySor, vevok: Map<string, Vevo>): OrderSummary {
  const a = allapot(r.state)
  return {
    orderId: orderRef(r.order_no),
    status: a.status,
    statusLabel: a.label,
    customer: vevo(r.partner_id, vevok),
    quoteId: r.quote_ref || null,
    updatedAt: r.updated_at,
    processManaged: r.process_instance_id !== null,
  }
}

export function tortenet(sorok: LegacyTortenet[]): z.infer<typeof TimelineEntry>[] {
  return sorok.map((h) => ({
    at: h.ts,
    from: h.from_state ? allapot(h.from_state).status : null,
    to: allapot(h.to_state).status,
    action: h.action,
    ok: h.ok,
    reason: h.reason,
    detail: h.detail,
  }))
}

// ---------------------------------------------------------------- hibák

/** A homlokzat `success:false` üzenetének leképezése kanonikus hibára. */
export async function homlokzatHiba(msg: string, kontextus: { orderId?: string; current?: Order | null } = {}): Promise<McpHiba> {
  const upstream = { system: RENDSZER, raw: msg }

  if (/^Rendeles nem talalhato/.test(msg)) {
    return new McpHiba('NOT_FOUND', kontextus.orderId ? `A(z) ${kontextus.orderId} rendelés nem található.` : 'A rendelés nem található.', {
      suggestedActions: ['list_orders'],
      upstream,
    })
  }
  if (/^Muvelet nem engedelyezett/.test(msg)) {
    const c = kontextus.current
    const details: Record<string, unknown> = c ? { status: c.status, nextAction: c.nextAction } : {}
    const miert = !c
      ? ''
      : !c.processManaged
        ? ' Ez egy régi rendelés, amely a folyamatmotoron kívül van, ezért csak olvasható.'
        : ` A rendelés állapota: ${c.statusLabel.toLowerCase()}.${c.nextAction ? ` Következő lépés: ${c.nextAction.label}` : ''}`
    return new McpHiba('INVALID_STATE', `Ez a művelet a rendelés jelenlegi állapotában nem végezhető el.${miert}`, {
      details,
      suggestedActions: ['get_order'],
      upstream,
    })
  }

  const hiany = /keszlet foglalas sikertelen: (\d+) \(hiany: (\d+) db\)/i.exec(msg)
  if (hiany) {
    const termek = (await katalogus()).cikkSzerint.get(Number(hiany[1]))
    const sku = termek?.code ?? null
    const missing = Number(hiany[2])
    return new McpHiba(
      'INSUFFICIENT_STOCK',
      `Nincs elég készlet${termek ? ` a(z) ${sku} (${termek.name}) termékből` : ''}: ${missing} db hiányzik. Csökkentsd a mennyiséget, vagy várj a beérkezésre.`,
      { details: { sku, missing }, suggestedActions: ['modify_order', 'check_stock'], upstream }
    )
  }

  const kod = /hianyzo raktari kod \(([^)]*)\)/.exec(msg)
  if (kod) {
    const skus = kod[1].split(',').map((s) => s.trim())
    return new McpHiba('MISSING_DATA', `A(z) ${skus.join(', ')} termékhez nincs raktári kód rögzítve, ezért nem foglalható. Vedd ki a rendelésből, vagy szólj a törzsadat-kezelőnek.`, {
      details: { sku: skus[0], skus },
      suggestedActions: ['modify_order'],
      upstream,
    })
  }
  if (/raktar nem valaszolt/.test(msg)) {
    return new McpHiba('UPSTREAM_UNAVAILABLE', 'A raktári rendszer nem válaszolt időben, próbáld újra később.', { retryable: true, upstream })
  }
  if (/^Hibas keres|^Hibas JSON/.test(msg)) {
    return new McpHiba('VALIDATION', 'A kérés adatai hibásak vagy hiányosak.', { upstream })
  }
  if (/^Ismeretlen partner: (.+)$/.test(msg)) {
    return new McpHiba('NOT_FOUND', 'A megadott vevő nem található.', { details: { customerId: msg.split(': ')[1] }, upstream })
  }
  if (/^Hozzaferes megtagadva/.test(msg)) {
    // Konfigurációs hiba az MCP réteg és a legacy rendszer között – nem a hívó hibája, újrapróbálni felesleges.
    return new McpHiba('UPSTREAM_UNAVAILABLE', 'A rendeléskezelő rendszer elutasította a kapcsolatot (konfigurációs hiba). Szólj a rendszergazdának.', {
      retryable: false,
      upstream,
    })
  }
  return new McpHiba('UPSTREAM_UNAVAILABLE', 'A rendeléskezelő rendszer hibát jelzett, próbáld újra később.', { retryable: true, upstream })
}
