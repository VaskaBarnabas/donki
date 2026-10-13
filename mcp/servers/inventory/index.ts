// Az `inventory` domain MCP szerver (14. fázis): készlet termékkódon – a háttérben a katalógus fordít raktári
// cikkszámra, és a raktár üzenetsorán (pgmq) kérdez. A cikkszám és az epoch idő soha nem jut ki.
// A foglalás, a kiadás és a feloldás szándékosan nincs kiajánlva: azok a rendelési folyamat belső lépései.
// Futtatás: npm run mcp:inventory (http://127.0.0.1:3203/mcp) vagy npx tsx mcp/servers/inventory/index.ts --stdio

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { eszkoz, type EszkozKontextus } from '../../kozos/eszkoz'
import { McpHiba } from '../../kozos/hiba'
import { idempotencyKeyField } from '../../kozos/kanonikus'
import { inditas } from '../../kozos/indito'
import { katalogus, type Termek } from '../../kozos/torzsadat'
import { raktarHivas, RENDSZER, type RaktarTetel, type RaktarValasz } from './adapter'

const SZERVER = 'inventory'
const OLVASOK = ['viewer', 'sales', 'logistics', 'finance', 'sales_manager'] as const

const skuField = z.string().regex(/^TK-\d{5}$/, { error: 'A termékkód formátuma TK-00001.' }).describe('Product code, e.g. "TK-00001"')

const StockItem = z.object({
  sku: z.string(),
  name: z.string(),
  stockTracked: z.boolean().describe('false: no warehouse code, stock is not kept for this product (cannot be reserved or delivered)'),
  onHand: z.number().nullable().describe('Physical stock'),
  reserved: z.number().nullable().describe('Reserved for orders'),
  available: z.number().nullable().describe('onHand - reserved: what new orders can get'),
  minimum: z.number().nullable(),
  belowMinimum: z.boolean().nullable(),
})
type StockItem = z.infer<typeof StockItem>

function tetel(t: Termek, r: RaktarTetel | null): StockItem {
  if (!r) return { sku: t.code, name: t.name, stockTracked: t.raktari_kod !== null, onHand: null, reserved: null, available: null, minimum: null, belowMinimum: null }
  return { sku: t.code, name: t.name, stockTracked: true, onHand: r.keszlet, reserved: r.foglalt, available: r.szabad, minimum: r.min, belowMinimum: r.keszlet < r.min }
}

/** Raktári válasz → hiba (NOK). Az R-01/R-02 a mi oldalunk hibája (rossz törzsadat vagy adapter), nem a hívóé. */
function nokHiba(v: RaktarValasz, sku?: string): McpHiba {
  const upstream = { system: RENDSZER, raw: `${v.hibakod} ${v.uzenet ?? ''}`.trim() }
  switch (v.hibakod) {
    case 'R-01':
      return new McpHiba('MISSING_DATA', `A(z) ${sku ?? ''} termék raktári kódja a raktárban ismeretlen (törzsadat-hiba). Szólj a törzsadat-kezelőnek.`, { details: { sku }, upstream })
    case 'R-03':
      return new McpHiba('INSUFFICIENT_STOCK', `Nincs elég készlet a(z) ${sku} termékből (szabad: ${v.szabad ?? '?'} db).`, {
        details: { sku, available: typeof v.szabad === 'number' ? v.szabad : null },
        suggestedActions: ['check_stock'],
        upstream,
      })
    case 'R-99':
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'A raktári rendszer belső hibát jelzett, próbáld újra később.', { retryable: true, upstream })
    default:
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'A raktári rendszer elutasította a kérést (adapterhiba). Szólj a rendszergazdának.', { retryable: false, upstream })
  }
}

/** Több cikk lekérdezése egyetlen LEKERDEZ üzenettel. */
async function lekerdez(termekek: Termek[], ctx: EszkozKontextus): Promise<Map<number, RaktarTetel>> {
  const cikkek = termekek.map((t) => t.raktari_kod).filter((c): c is number => c !== null)
  if (cikkek.length === 0) return new Map()
  const v = await raktarHivas({ cmd: 'LEKERDEZ', cikkek }, (mp) => ctx.progress(mp, undefined, 'A raktár válaszára várunk…'))
  if (v.status !== 'OK') throw nokHiba(v)
  return new Map(((v.tetelek ?? []) as RaktarTetel[]).map((r) => [r.cikk, r]))
}

const tetelSzoveg = (i: StockItem) =>
  !i.stockTracked
    ? `${i.sku} ${i.name}: nincs raktári nyilvántartás`
    : `${i.sku} ${i.name}: szabad ${i.available} db (készlet ${i.onHand}, foglalt ${i.reserved}, minimum ${i.minimum})${i.belowMinimum ? ' – MINIMUM ALATT' : ''}`

function letrehoz(): McpServer {
  const server = new McpServer(
    { name: 'donki-inventory', title: 'Raktárkészlet', version: '0.14.0' },
    {
      instructions:
        'Warehouse stock for the Donki ERP, by product code (sku). "available" is what new orders can get. Each call waits for the warehouse queue (5-10 s). ' +
        'Reservations and shipments are done by the order process, not here. Reply to the user in Hungarian.',
    }
  )

  eszkoz(server, SZERVER, {
    name: 'check_stock',
    title: 'Készlet lekérdezése',
    description: 'Check current stock (on hand, reserved, available, minimum) for up to 20 products in one call. Takes 5-10 s (warehouse queue).',
    input: { skus: z.array(skuField).min(1, { error: 'Legalább egy termékkód kell.' }).max(20).describe('Product codes') },
    output: { items: z.array(StockItem) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: OLVASOK,
    summary: (o) => o.items.map(tetelSzoveg).join('; '),
    run: async ({ skus }, ctx) => {
      const k = await katalogus()
      const egyedi = [...new Set(skus)]
      const ismeretlen = egyedi.filter((s) => !k.kodSzerint.has(s))
      if (ismeretlen.length) throw new McpHiba('NOT_FOUND', `Ismeretlen termékkód: ${ismeretlen.join(', ')}.`, { details: { skus: ismeretlen }, suggestedActions: ['search_products'] })
      const termekek = egyedi.map((s) => k.kodSzerint.get(s)!)
      const raktar = await lekerdez(termekek, ctx)
      return { items: termekek.map((t) => tetel(t, t.raktari_kod !== null ? (raktar.get(t.raktari_kod) ?? null) : null)) }
    },
  })

  eszkoz(server, SZERVER, {
    name: 'list_low_stock',
    title: 'Minimum alatti készlet',
    description: 'List active products whose physical stock is below the minimum level (reorder candidates). Takes 5-10 s.',
    input: {},
    output: { items: z.array(StockItem) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: OLVASOK,
    summary: (o) => (o.items.length ? `${o.items.length} termék van a minimum alatt: ${o.items.map(tetelSzoveg).join('; ')}` : 'Minden termék a minimumszint felett van.'),
    run: async (_args, ctx) => {
      const termekek = [...(await katalogus()).kodSzerint.values()].filter((t) => t.active && t.raktari_kod !== null)
      const raktar = await lekerdez(termekek, ctx)
      return { items: termekek.map((t) => tetel(t, raktar.get(t.raktari_kod!) ?? null)).filter((i) => i.belowMinimum) }
    },
  })

  eszkoz(server, SZERVER, {
    name: 'adjust_stock',
    title: 'Készletmozgás rögzítése',
    description:
      'Record goods receipt (type receipt, positive quantity) or an inventory correction (type correction, signed quantity) for a product. A correction cannot take reserved stock.',
    input: {
      sku: skuField,
      type: z.enum(['receipt', 'correction']).describe('receipt: goods received; correction: inventory count difference'),
      quantity: z.number().int().refine((n) => n !== 0, { error: 'A mennyiség nem lehet 0.' }).describe('Pieces; for correction may be negative'),
      reason: z.string().min(3, { error: 'Add meg az okát.' }).max(100).describe('Reason (kept in the warehouse log)'),
      idempotencyKey: idempotencyKeyField,
    },
    output: { item: StockItem },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    risk: 'write',
    roles: ['logistics', 'sales_manager'],
    summary: (o) => `Rögzítve. ${tetelSzoveg(o.item)}`,
    run: async ({ sku, type, quantity, reason }, ctx) => {
      if (type === 'receipt' && quantity < 0) throw new McpHiba('VALIDATION', 'Beérkezésnél a mennyiség pozitív legyen; csökkentéshez használj korrekciót.')
      const t = (await katalogus()).kodSzerint.get(sku)
      if (!t) throw new McpHiba('NOT_FOUND', `A(z) ${sku} termék nem található a katalógusban.`, { details: { sku }, suggestedActions: ['search_products'] })
      if (t.raktari_kod === null) {
        throw new McpHiba('MISSING_DATA', `A(z) ${sku} termékhez nincs raktári kód rögzítve, ezért készlete sem vezethető. Szólj a törzsadat-kezelőnek.`, { details: { sku } })
      }

      // A korrekció nem viheti el a lefoglalt készletet (a raktár ezt nem ellenőrzi, csak a 0 alá menést).
      const elotte = (await lekerdez([t], ctx)).get(t.raktari_kod)
      if (!elotte) throw new McpHiba('MISSING_DATA', `A(z) ${sku} termék raktári kódja a raktárban ismeretlen (törzsadat-hiba).`, { details: { sku } })
      if (quantity < 0 && -quantity > elotte.szabad) {
        throw new McpHiba('INSUFFICIENT_STOCK', `A korrekció nem vehet el lefoglalt készletet: a(z) ${sku} termékből csak ${elotte.szabad} db szabad.`, {
          details: { sku, available: elotte.szabad },
          suggestedActions: ['check_stock'],
        })
      }

      const ref = `MCP ${ctx.hivo.clientId}: ${reason}`.slice(0, 100)
      const v = await raktarHivas(
        { cmd: 'MOZGAS', cikk: t.raktari_kod, tipus: type === 'receipt' ? 'BE' : 'KORREKCIO', db: quantity, ref },
        (mp) => ctx.progress(mp, undefined, 'A raktár válaszára várunk…')
      )
      if (v.status !== 'OK') throw nokHiba(v, sku)
      const keszlet = Number(v.keszlet)
      return {
        item: tetel(t, { ...elotte, keszlet, szabad: Number(v.szabad ?? keszlet - elotte.foglalt) }),
      }
    },
  })

  return server
}

inditas({ nev: SZERVER, port: 3203, letrehoz }).catch((e) => {
  console.error('[mcp] inventory: az inditas sikertelen:', e instanceof Error ? e.message : e)
  process.exit(1)
})
