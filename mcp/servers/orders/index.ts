// Az `orders` domain MCP szerver (13. fázis, pilot): a rendelési folyamat a régi homlokzat és a Flowable fölött.
// Futtatás: npm run mcp:orders (Streamable HTTP, http://127.0.0.1:3201/mcp) vagy npx tsx mcp/servers/orders/index.ts --stdio
// Rendelést szándékosan nem hoz létre – az a sales szerver accept_quote eszköze lesz (14. fázis).

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { eszkoz, type EszkozKontextus } from '../../kozos/eszkoz'
import { McpHiba } from '../../kozos/hiba'
import { log } from '../../kozos/kornyezet'
import { idempotencyKeyField } from '../../kozos/kanonikus'
import { inditas } from '../../kozos/indito'
import { ar, homlokzat, vevok, type LegacyRendeles, type LegacySor, type LegacySzallitas, type LegacyTortenet } from './adapter'
import {
  homlokzatHiba,
  legacyAllapot,
  Order,
  orderIdField,
  orderNo,
  orderRef,
  OrderStatus,
  OrderSummary,
  osszefoglalo,
  rendeles,
  STATUS_LABEL,
  TimelineEntry,
  tortenet,
  VART_FELADAT,
} from './lekepezes'

const SZERVER = 'orders'
const VEGALLAPOT: OrderStatus[] = ['completed', 'cancelled']

// ---------------------------------------------------------------- közös lépések

async function legacyRendeles(orderId: string): Promise<LegacyRendeles> {
  const v = await homlokzat<LegacyRendeles>('GET', String(orderNo(orderId)))
  if (!v.success) throw await homlokzatHiba(v.msg, { orderId: orderRef(orderNo(orderId)) })
  return v.data
}

/** Egy rendelés kanonikus alakban: homlokzat (rendelés + szállítás) + CRM (vevő neve). */
async function betolt(orderId: string): Promise<Order> {
  const r = await legacyRendeles(orderId)
  const [sz, v] = await Promise.all([
    r.state === 'ROGZITETT' || r.state === 'JOVAHAGYOTT' ? null : homlokzat<LegacySzallitas>('GET', `${r.order_no}/shipping`),
    vevok([r.partner_id]),
  ])
  return rendeles(r, sz?.success ? sz.data : null, v)
}

/** Írási művelet a homlokzaton, majd a friss rendelés visszaolvasása. Hibánál a jelenlegi állapotot is csatolja. */
async function iras(orderId: string, muvelet: string, body?: unknown): Promise<Order> {
  const v = await homlokzat<unknown>('POST', `${orderNo(orderId)}/${muvelet}`, body)
  if (!v.success) {
    const current = /^Muvelet nem engedelyezett/.test(v.msg) ? await betolt(orderId).catch(() => null) : null
    throw await homlokzatHiba(v.msg, { orderId: orderRef(orderNo(orderId)), current })
  }
  return betolt(orderId)
}

const varakozas = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

/** Lassú homlokzat-hívás közben (pl. jóváhagyás ~10 mp) néhány másodpercenként progress értesítés. */
async function progresszel<T>(ctx: EszkozKontextus, uzenet: string, fn: () => Promise<T>): Promise<T> {
  let i = 0
  await ctx.progress(i, undefined, uzenet)
  const idozito = setInterval(() => void ctx.progress(++i, undefined, uzenet).catch(() => {}), 2000)
  try {
    return await fn()
  } finally {
    clearInterval(idozito)
  }
}

const orderOut = { order: Order }
const rendelesSzoveg = (o: Order) =>
  `${o.orderId} – ${o.statusLabel}. Vevő: ${o.customer.name}, nettó ${o.total.amount} Ft.` +
  (o.nextAction ? ` Következő lépés: ${o.nextAction.label}` : '')

// ---------------------------------------------------------------- feliratkozás

const FELIRATKOZAS_POLL_MS = 10_000

/**
 * resources/subscribe az order://{orderId}-re: a szerver a feliratkozott rendeléseket 10 mp-enként lekéri a
 * homlokzaton, és állapot- vagy szállításváltáskor notifications/resources/updated értesítést küld.
 * Nem az order_events sorból dolgozik, mert az olvasás elfogyasztaná az üzenetet a többi feldolgozó elől.
 */
function feliratkozas(server: McpServer) {
  const figyelt = new Map<string, string>() // uri → utolsó állapot-ujjlenyomat
  let idozito: NodeJS.Timeout | null = null
  const ujjlenyomat = (o: Order) => `${o.status}|${o.shipment?.status ?? ''}|${o.billing?.documentNo ?? ''}`

  const kor = async () => {
    for (const [uri, elozo] of figyelt) {
      try {
        const most = ujjlenyomat(await betolt(uri.slice('order://'.length)))
        if (most !== elozo) {
          figyelt.set(uri, most)
          await server.server.sendResourceUpdated({ uri })
        }
      } catch (e) {
        log('feliratkozas: lekerdezes sikertelen', uri, e instanceof Error ? e.message : e)
      }
    }
  }

  server.server.registerCapabilities({ resources: { subscribe: true } })
  server.server.setRequestHandler(SubscribeRequestSchema, async ({ params }) => {
    const m = /^order:\/\/((?:RND-)?\d{6,})$/i.exec(params.uri)
    if (!m) throw new Error('Csak order://{orderId} resource-ra lehet feliratkozni.')
    figyelt.set(params.uri, ujjlenyomat(await betolt(m[1])))
    idozito ??= setInterval(() => void kor(), FELIRATKOZAS_POLL_MS)
    return {}
  })
  server.server.setRequestHandler(UnsubscribeRequestSchema, async ({ params }) => {
    const m = /^order:\/\/((?:RND-)?\d{6,})$/i.exec(params.uri)
    if (m) figyelt.delete(params.uri)
    if (figyelt.size === 0 && idozito) {
      clearInterval(idozito)
      idozito = null
    }
    return {}
  })
  server.server.onclose = () => {
    if (idozito) clearInterval(idozito)
    figyelt.clear()
  }
}

// ---------------------------------------------------------------- szerver

function letrehoz(): McpServer {
  const server = new McpServer(
    { name: 'donki-orders', title: 'Rendeléskezelés', version: '0.13.0' },
    {
      instructions:
        'Order management for the Donki ERP. Orders move: received -> approved -> in_fulfillment -> delivered -> awaiting_payment -> completed. ' +
        'Always follow order.nextAction (it names the tool and the role). Errors are structured: read error.code and error.suggestedActions. ' +
        'All user-facing text (labels, messages) is Hungarian; reply to the user in Hungarian.',
    }
  )

  // -------------------------------------------------------------- olvasás

  eszkoz(server, SZERVER, {
    name: 'get_order',
    title: 'Rendelés lekérdezése',
    description: 'Get one order with status, lines, totals, shipment, billing document and the next action (who should do what, with which tool).',
    input: { orderId: orderIdField },
    output: orderOut,
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: ['viewer', 'sales', 'logistics', 'finance', 'sales_manager'],
    summary: (o) => rendelesSzoveg(o.order),
    run: async ({ orderId }) => ({ order: await betolt(orderId) }),
  })

  eszkoz(server, SZERVER, {
    name: 'list_orders',
    title: 'Rendelések listázása',
    description: 'List orders, newest first, optionally filtered by status and/or customer. Returns short summaries; use get_order for details. Paginated with cursor.',
    input: {
      status: OrderStatus.optional().describe('Filter by order status'),
      customerId: z.uuid({ error: 'A vevőazonosító UUID legyen.' }).optional().describe('Filter by customer id (UUID)'),
      limit: z.number().int().min(1).max(50).optional().describe('Page size, default 20, max 50'),
      cursor: z.string().optional().describe('nextCursor from the previous page'),
    },
    output: { items: z.array(OrderSummary), nextCursor: z.string().nullable() },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: ['viewer', 'sales', 'logistics', 'finance', 'sales_manager'],
    summary: (o) => (o.items.length ? `${o.items.length} rendelés: ${o.items.map((i) => `${i.orderId} (${i.statusLabel})`).join(', ')}` : 'Nincs a feltételeknek megfelelő rendelés.') + (o.nextCursor ? ' – van további oldal.' : ''),
    run: async ({ status, customerId, limit = 20, cursor }) => {
      const tol = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0
      const v = await homlokzat<LegacySor[]>('GET', status ? `list?state=${legacyAllapot(status)}` : 'list')
      if (!v.success) throw await homlokzatHiba(v.msg)
      const sorok = customerId ? v.data.filter((r) => r.partner_id === customerId) : v.data
      const oldal = sorok.slice(tol, tol + limit)
      const vv = await vevok(oldal.map((r) => r.partner_id))
      return { items: oldal.map((r) => osszefoglalo(r, vv)), nextCursor: tol + limit < sorok.length ? String(tol + limit) : null }
    },
  })

  eszkoz(server, SZERVER, {
    name: 'get_order_timeline',
    title: 'Rendelés története',
    description: 'Get the status history of an order: every step with time, from/to status, action, and failure reason if a step failed.',
    input: { orderId: orderIdField },
    output: { orderId: z.string(), entries: z.array(TimelineEntry) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: ['viewer', 'sales', 'logistics', 'finance', 'sales_manager'],
    summary: (o) =>
      `${o.orderId} története (${o.entries.length} lépés): ` +
      o.entries.map((e) => `${e.at.slice(0, 16).replace('T', ' ')} ${STATUS_LABEL[e.to]}${e.ok ? '' : ' – SIKERTELEN'}`).join('; '),
    run: async ({ orderId }) => {
      const id = orderRef(orderNo(orderId))
      const v = await homlokzat<LegacyTortenet[]>('GET', `${orderNo(orderId)}/history`)
      if (!v.success) throw await homlokzatHiba(v.msg, { orderId: id })
      if (v.data.length === 0) await legacyRendeles(orderId) // nem létező rendelésre NOT_FOUND
      return { orderId: id, entries: tortenet(v.data) }
    },
  })

  eszkoz(server, SZERVER, {
    name: 'wait_for_order_status',
    title: 'Várakozás a rendelés állapotára',
    description: 'Wait (up to timeoutSeconds, max 60) until the order reaches the given status, e.g. delivered after start_fulfillment. Returns reached=false on timeout; call again to keep waiting.',
    input: {
      orderId: orderIdField,
      status: OrderStatus.describe('Target status'),
      timeoutSeconds: z.number().int().min(1).max(60).optional().describe('Default 30, max 60'),
    },
    output: { reached: z.boolean(), order: Order },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: ['viewer', 'sales', 'logistics', 'finance', 'sales_manager'],
    summary: (o) => (o.reached ? `A rendelés elérte az állapotot: ${o.order.statusLabel}.` : `A várakozási idő lejárt, a rendelés állapota: ${o.order.statusLabel}.`) + (o.order.nextAction ? ` Következő lépés: ${o.order.nextAction.label}` : ''),
    run: async ({ orderId, status, timeoutSeconds = 30 }, ctx) => {
      const vege = Date.now() + timeoutSeconds * 1000
      let order = await betolt(orderId)
      for (let i = 1; order.status !== status && !VEGALLAPOT.includes(order.status) && Date.now() < vege && !ctx.signal.aborted; i++) {
        await ctx.progress(i, undefined, `Várakozás: ${order.statusLabel}`)
        await varakozas(Math.min(3000, Math.max(0, vege - Date.now())), ctx.signal)
        order = await betolt(orderId)
      }
      // Az állapotot egy HTTP task írja, a következő user task csak utána jön létre: megvárjuk (max. ~6 mp),
      // hogy a visszaadott állapotban a következő lépés azonnal végrehajtható legyen.
      if (order.status === status && order.processManaged && VART_FELADAT[status]) {
        for (let i = 0; i < 12 && !(await legacyRendeles(orderId)).current_task; i++) await varakozas(500, ctx.signal)
        order = await betolt(orderId)
      }
      return { reached: order.status === status, order }
    },
  })

  // -------------------------------------------------------------- írás

  eszkoz(server, SZERVER, {
    name: 'approve_order',
    title: 'Rendelés jóváhagyása',
    description: 'Approve a received order; this reserves stock in the warehouse (takes ~10 s). Fails with INSUFFICIENT_STOCK if stock is short.',
    input: { orderId: orderIdField, idempotencyKey: idempotencyKeyField },
    output: orderOut,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    risk: 'write',
    roles: ['sales_manager'],
    summary: (o) => `Jóváhagyva. ${rendelesSzoveg(o.order)}`,
    run: async ({ orderId }, ctx) => ({ order: await progresszel(ctx, 'Készletfoglalás folyamatban…', () => iras(orderId, 'approve')) }),
  })

  eszkoz(server, SZERVER, {
    name: 'start_fulfillment',
    title: 'Kiszállítás indítása',
    description: 'Start delivery of an approved order: the reserved stock is shipped and a carrier shipment is created.',
    input: { orderId: orderIdField, idempotencyKey: idempotencyKeyField },
    output: orderOut,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    risk: 'write',
    roles: ['logistics', 'sales_manager'],
    summary: (o) => `Kiszállítás elindítva. ${rendelesSzoveg(o.order)}`,
    run: async ({ orderId }, ctx) => ({ order: await progresszel(ctx, 'Kiszállítás indítása…', () => iras(orderId, 'fulfil')) }),
  })

  eszkoz(server, SZERVER, {
    name: 'issue_proforma',
    title: 'Díjbekérő kiállítása',
    description: 'Issue the proforma (payment request) for a delivered order. The final invoice is created automatically after payment.',
    input: { orderId: orderIdField, idempotencyKey: idempotencyKeyField },
    output: orderOut,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    risk: 'write',
    roles: ['finance'],
    summary: (o) => `Díjbekérő kiállítva: ${o.order.billing?.documentNo}. ${rendelesSzoveg(o.order)}`,
    run: async ({ orderId }, ctx) => ({ order: await progresszel(ctx, 'Díjbekérő kiállítása…', () => iras(orderId, 'invoice')) }),
  })

  eszkoz(server, SZERVER, {
    name: 'modify_order',
    title: 'Rendelés módosítása',
    description: 'Replace the lines of an order that is not yet shipped (status received or approved). Existing lines keep their price; new products get the customer group price.',
    input: {
      orderId: orderIdField,
      lines: z
        .array(
          z.object({
            sku: z.string().regex(/^TK-\d{5}$/, { error: 'A termékkód formátuma TK-00001.' }).describe('Product code, e.g. "TK-00001"'),
            quantity: z.number().int().min(1, { error: 'A mennyiség legalább 1 legyen.' }).max(10000),
          })
        )
        .min(1, { error: 'Legalább egy tétel kell.' })
        .max(20)
        .describe('The complete new list of lines (not a delta)'),
      idempotencyKey: idempotencyKeyField,
    },
    output: orderOut,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    risk: 'write',
    roles: ['sales', 'sales_manager'],
    summary: (o) => `Módosítva: ${o.order.lines.map((l) => `${l.quantity} db ${l.sku}`).join(', ')}. ${rendelesSzoveg(o.order)}`,
    run: async ({ orderId, lines }, ctx) => {
      const skuk = lines.map((l) => l.sku)
      const dupla = skuk.filter((s, i) => skuk.indexOf(s) !== i)
      if (dupla.length) throw new McpHiba('VALIDATION', `Egy termék csak egyszer szerepelhet: ${[...new Set(dupla)].join(', ')}.`, { details: { skus: dupla } })

      const r = await legacyRendeles(orderId)
      const regiAr = new Map(r.lines.map((l) => [l.productCode, l.unitPrice]))
      const csoport = (await vevok([r.partner_id])).get(r.partner_id)?.customer_group ?? 'NORMAL'

      const tetelek: { productCode: string; qty: number; unitPrice: number }[] = []
      for (const l of lines) {
        let unitPrice = regiAr.get(l.sku)
        if (unitPrice === undefined) {
          const a = await ar(l.sku, csoport)
          if (!a) throw new McpHiba('NOT_FOUND', `A(z) ${l.sku} termék nem található a katalógusban.`, { details: { sku: l.sku } })
          if (!a.active) throw new McpHiba('VALIDATION', `A(z) ${l.sku} termék már nem rendelhető (kivezetett termék).`, { details: { sku: l.sku } })
          unitPrice = a.price
        }
        tetelek.push({ productCode: l.sku, qty: l.quantity, unitPrice })
      }
      return { order: await progresszel(ctx, 'Módosítás és készletfoglalás…', () => iras(orderId, 'modify', { lines: tetelek })) }
    },
  })

  eszkoz(server, SZERVER, {
    name: 'cancel_order',
    title: 'Rendelés lemondása',
    description: 'Cancel an order that is not completed; any stock reservation is released. Irreversible. Ask the user for confirmation first.',
    input: {
      orderId: orderIdField,
      reason: z.string().min(3, { error: 'Add meg a lemondás okát.' }).max(300).describe('Why the order is cancelled (kept in the audit log)'),
      idempotencyKey: idempotencyKeyField,
    },
    output: orderOut,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    risk: 'irreversible',
    roles: ['sales_manager'],
    summary: (o) => `Lemondva. ${rendelesSzoveg(o.order)}`,
    run: async ({ orderId }) => {
      // A lemondás egy BPMN üzenet; az állapotváltás aszinkron, ezért röviden megvárjuk.
      let order = await iras(orderId, 'cancel')
      for (let i = 0; i < 5 && order.status !== 'cancelled'; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        order = await betolt(orderId)
      }
      return { order }
    },
  })

  // -------------------------------------------------------------- resource, feliratkozás és prompt

  server.registerResource(
    'order',
    new ResourceTemplate('order://{orderId}', { list: undefined }),
    { title: 'Rendelés', description: 'One order in canonical form (same as get_order).', mimeType: 'application/json' },
    async (uri, { orderId }) => {
      const id = String(orderId)
      if (!orderIdField.safeParse(id).success) throw new Error('A rendelésazonosító formátuma RND-100045 vagy 100045.')
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await betolt(id)) }] }
    }
  )

  feliratkozas(server)

  server.registerPrompt(
    'order_status_report',
    {
      title: 'Rendelés állapotjelentés',
      description: 'Explain where an order stands and what the next step is.',
      argsSchema: { orderId: z.string().describe('Order id, e.g. RND-100045') },
    },
    ({ orderId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Report the status of order ${orderId}. Call get_order, and get_order_timeline if a step failed. ` +
              'In Hungarian, in at most 5 sentences: current status, customer, net total, shipment status if any, ' +
              'and the next step with who must do it (order.nextAction). Do not show internal codes.',
          },
        },
      ],
    })
  )

  return server
}

inditas({ nev: SZERVER, port: 3201, letrehoz }).catch((e) => {
  console.error('[mcp] orders: az inditas sikertelen:', e instanceof Error ? e.message : e)
  process.exit(1)
})
