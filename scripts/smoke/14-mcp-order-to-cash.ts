/* eslint-disable @typescript-eslint/no-explicit-any -- a füstteszt típus nélküli JSON válaszokat vizsgál */
/**
 * 14. fázis elfogadási tesztje: a teljes order-to-cash folyamat KIZÁRÓLAG MCP eszközökkel, mind az öt domain
 * szerveren, a szerepkörhöz illő tokenekkel – egyetlen legacy hívás nélkül. Két lépés történik az MCP-n kívül,
 * mert a valóságban sem a cég rendszere végzi: a fuvarozó kézbesít, és a vevő bankkártyával fizet (Stripe teszt).
 * A végén: minden válasz kanonikus (nincs legacy formátum), és minden hívás naplózva van.
 *
 * Előfeltétel: Next.js, Flowable, `stripe listen --all-snapshot --forward-to localhost:3000/api/legacy/payments/webhook`,
 *              SzámlaBridge (a Számlázz.hu tesztszámlához); az `mcp` séma kiajánlva
 * Futtatás: npx tsx scripts/smoke/14-mcp-order-to-cash.ts   (~3-5 perc)
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'
import { check, env, hiv, legacyNyom, mcpSemaEllenorzes, naplozottHivasok, naploSorok, ROLES, supabase, szakasz, szerverInditas, zaras, type Eredmeny, type Role, type Szerver } from './mcp-segedek'

const DB = 3
const SZERVEREK = [
  ['sales', 3281],
  ['orders', 3282],
  ['inventory', 3283],
  ['finance', 3284],
  ['support', 3285],
] as const
type Nev = (typeof SZERVEREK)[number][0]

const kimenetek: { eszkoz: string; data: unknown }[] = []
let kiszallitva = false

function stripeCli(args: string[]) {
  try {
    return execFileSync('stripe', [...args, '--api-key', env.STRIPE_SECRET_KEY], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? ''
  }
}

async function main() {
  console.log('14. fázis – order-to-cash kizárólag MCP eszközökkel (5 szerver)')
  const kezdet = Date.now()
  const kezdetIso = new Date().toISOString()
  await mcpSemaEllenorzes()

  const szerverek = {} as Record<Nev, Szerver>
  const k = {} as Record<Nev, Record<Role, Client>>
  try {
    for (const [nev, port] of SZERVEREK) szerverek[nev] = await szerverInditas(nev, port, `smoke14o-${nev}`)
    for (const [nev] of SZERVEREK) k[nev] = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await szerverek[nev].kliens(r)] as const))) as Record<Role, Client>

    /** Eszközhívás a megfelelő szerveren és szerepkörrel; a kimenet a legacy-nyom ellenőrzéshez gyűlik. */
    const mcp = async (szerver: Nev, role: Role, eszkoz: string, args: Record<string, unknown>): Promise<Eredmeny> => {
      const r = await hiv(k[szerver][role], eszkoz, args)
      if (r.ok) kimenetek.push({ eszkoz, data: r.data })
      return r
    }

    // -------------------------------------------------------------- értékesítés
    szakasz('Értékesítés (sales): vevő, termék, készlet, ajánlat, elfogadás')
    const vevo = (await mcp('sales', 'sales', 'search_customers', { query: 'Bakony' })).data.items[0]
    const termek = (await mcp('sales', 'sales', 'search_products', { query: 'LP-4020', customerId: vevo.customerId })).data.items.find((p: any) => p.sku === 'TK-00001')
    check(`vevő: ${vevo?.name} (${vevo?.customerGroupLabel}); termék: ${termek?.sku} ${termek?.name}, ${termek?.customerPrice?.amount} Ft`, !!vevo && !!termek?.customerPrice, { vevo, termek })
    const keszlet = (await mcp('inventory', 'sales', 'check_stock', { skus: ['TK-00001'] })).data.items[0]
    check(`készlet (inventory): szabad ${keszlet?.available} db ≥ ${DB}`, keszlet?.available >= DB, keszlet)

    let q = (await mcp('sales', 'sales', 'create_quote', { customerId: vevo.customerId, lines: [{ sku: 'TK-00001', quantity: DB }], idempotencyKey: randomUUID() })).data.quote
    check(`create_quote → ${q?.quoteId}: nettó ${q?.totalNet?.amount} Ft (listaáron ${q?.totalListPrice?.amount}, kedvezmény ${q?.totalDiscountPct}%)`, q?.status === 'draft', q)
    if (q.nextAction?.tool === 'request_quote_approval') {
      await mcp('sales', 'sales', 'request_quote_approval', { quoteId: q.quoteId, reason: 'MCP order-to-cash' })
      q = (await mcp('sales', 'sales_manager', 'approve_quote', { quoteId: q.quoteId })).data.quote
      console.log(`     (a kedvezmény jóváhagyást igényelt – jóváhagyva: ${q.approvedBy})`)
    }
    const elfogad = await mcp('sales', 'sales', 'accept_quote', { quoteId: q.quoteId, idempotencyKey: randomUUID() })
    const orderId = elfogad.data.orderId as string
    check(`accept_quote → ${orderId}, nextAction: ${elfogad.data.nextAction?.tool} (${elfogad.data.nextAction?.actor})`, elfogad.ok && elfogad.data.nextAction?.tool === 'approve_order', elfogad)

    // -------------------------------------------------------------- rendelés
    szakasz('Rendelés (orders): jóváhagyás, kiszállítás, díjbekérő – feliratkozással')
    const ertesitesek: string[] = []
    k.orders.viewer.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => void ertesitesek.push(n.params.uri))
    await k.orders.viewer.subscribeResource({ uri: `order://${orderId}` })

    const jov = await mcp('orders', 'sales_manager', 'approve_order', { orderId, idempotencyKey: randomUUID() })
    check(`approve_order (sales_manager) → ${jov.data.order?.statusLabel}; következő: ${jov.data.order?.nextAction?.actor}`, jov.data.order?.status === 'approved' && jov.data.order.nextAction?.tool === 'start_fulfillment', jov)
    const ful = await mcp('orders', 'logistics', 'start_fulfillment', { orderId, idempotencyKey: randomUUID() })
    kiszallitva = ful.data.order?.status === 'in_fulfillment'
    check(`start_fulfillment (logistics) → ${ful.data.order?.statusLabel}, ${ful.data.order?.shipment?.carrier}`, ful.data.order?.status === 'in_fulfillment', ful)

    // MCP-n kívül: a fuvarozó kézbesít (a rendelési folyamat percenként kérdezi le a fuvarozót)
    await supabase.schema('orders').from('shipments').update({ carrier_status: 'KEZBESITVE' }).eq('order_no', Number(orderId.slice(4)))
    let w: Eredmeny | null = null
    for (let i = 0; i < 3 && !w?.data.reached; i++) w = await mcp('orders', 'viewer', 'wait_for_order_status', { orderId, status: 'delivered', timeoutSeconds: 60 })
    check(`wait_for_order_status delivered → ${w?.data.order?.statusLabel}; következő: ${w?.data.order?.nextAction?.actor}`, !!w?.data.reached && w.data.order.nextAction?.tool === 'issue_proforma', w)
    const inv = await mcp('orders', 'finance', 'issue_proforma', { orderId, idempotencyKey: randomUUID() })
    const documentNo = inv.data.order?.billing?.documentNo as string
    check(`issue_proforma (finance) → ${inv.data.order?.statusLabel}, díjbekérő ${documentNo}`, inv.data.order?.status === 'awaiting_payment' && /^DB-/.test(documentNo), inv)

    // -------------------------------------------------------------- pénzügy
    szakasz('Pénzügy (finance): díjbekérő, fizetési link, fizetés, Számlázz.hu számla')
    const doc = (await mcp('finance', 'finance', 'get_document', { documentNo })).data.document
    check(`get_document ${documentNo}: ${doc?.statusLabel}, bruttó ${doc?.total?.amount} Ft, vevő ${doc?.customer?.name}`, doc?.status === 'unpaid' && doc.customer.customerId === vevo.customerId && doc.nextAction?.tool === 'create_payment_link', doc)
    const link = (await mcp('finance', 'finance', 'create_payment_link', { documentNo, idempotencyKey: randomUUID() })).data.payment
    check(`create_payment_link → ${link?.amount?.amount} Ft = a díjbekérő bruttója, Stripe TESZT checkout`, link?.amount?.amount === doc.total.amount && /cs_test_/.test(link.checkoutUrl), link)
    check(
      `a díjbekérő bruttója = az ajánlat nettója × 1,27 (${q.totalNet.amount} × 1,27 = ${doc.total.amount})`,
      Math.abs(Number(q.totalNet.amount) * 1.27 - Number(doc.total.amount)) < 0.01,
      { net: q.totalNet, gross: doc.total }
    )

    // MCP-n kívül: a vevő bankkártyával fizet a checkout oldalon (Stripe teszt kártya, a CLI-vel)
    const session = /(cs_test_[A-Za-z0-9]+)/.exec(link.checkoutUrl)![1]
    const pm = JSON.parse(stripeCli(['payment_methods', 'create', '-d', 'type=card', '-d', 'card[token]=tok_visa', '-d', 'billing_details[name]=MCP Fustteszt', '-d', 'billing_details[email]=mcp@example.com'])).id
    stripeCli(['post', `/v1/payment_pages/${session}/confirm`, '-d', `payment_method=${pm}`, '-d', `expected_amount=${Math.round(Number(link.amount.amount) * 100)}`])

    let lezart: Eredmeny | null = null
    for (let i = 0; i < 2 && !lezart?.data.reached; i++) lezart = await mcp('orders', 'viewer', 'wait_for_order_status', { orderId, status: 'completed', timeoutSeconds: 60 })
    check(`fizetés után wait_for_order_status completed → ${lezart?.data.order?.statusLabel}`, !!lezart?.data.reached, lezart?.data.order?.status ?? 'Fut a stripe listen --forward-to?')
    const fiz = (await mcp('finance', 'viewer', 'get_payments', { documentNo })).data.items
    check(`get_payments: ${fiz?.map((p: any) => p.statusLabel).join(', ')}`, fiz?.some((p: any) => p.status === 'succeeded'), fiz)

    let vegszamla: any = null
    const vKezdet = Date.now()
    while (Date.now() - vKezdet < 180_000) {
      vegszamla = (await mcp('finance', 'viewer', 'get_document', { documentNo })).data.document
      if (vegszamla?.finalInvoice?.status === 'issued') break
      await new Promise((r) => setTimeout(r, 10_000))
    }
    check(
      `get_document: kifizetve, végszámla „${vegszamla?.finalInvoice?.statusLabel}” (${Math.round((Date.now() - vKezdet) / 1000)} mp), nextAction ${vegszamla?.nextAction?.code}`,
      vegszamla?.paid === true && vegszamla.finalInvoice?.status === 'issued',
      vegszamla
    )
    if (vegszamla?.finalInvoice?.status === 'issued') {
      const pdf = (await mcp('finance', 'finance', 'get_document_pdf', { documentNo })).data
      const fej = new TextDecoder().decode(new Uint8Array(await (await fetch(pdf.url)).arrayBuffer()).slice(0, 5))
      check(`get_document_pdf → a Számlázz.hu tesztszámla PDF-je (${pdf.source}, ${fej})`, pdf.source === 'szamlazz_hu' && fej === '%PDF-', pdf)
    }

    // -------------------------------------------------------------- utóélet
    szakasz('Ügyfélszolgálat (support): hibajegy és garancia')
    const jegy = (await mcp('support', 'sales', 'create_ticket', { customerId: vevo.customerId, description: 'A nyomtató zajos.', orderId, sku: 'TK-00001' })).data.ticket
    const gar = (await mcp('support', 'sales', 'check_warranty', { orderId, sku: 'TK-00001' })).data.warranty
    check(`hibajegy ${jegy?.ticketId}; garancia: ${gar?.reasonLabel} (lejár: ${gar?.expiresAt?.slice(0, 10)})`, !!jegy?.ticketId && gar?.valid === true, { jegy, gar })
    await mcp('support', 'sales', 'update_ticket_status', { ticketId: jegy.ticketId, status: 'closed' })

    // -------------------------------------------------------------- összegzés
    szakasz('Összegzés: feliratkozás, kanonikus kimenetek, napló')
    const tl = (await mcp('orders', 'viewer', 'get_order_timeline', { orderId })).data.entries.map((e: any) => e.to)
    check(`rendelés története: ${tl.join(' → ')}`, JSON.stringify(tl) === JSON.stringify(['received', 'approved', 'in_fulfillment', 'delivered', 'awaiting_payment', 'completed']), tl)
    check(`order://${orderId} feliratkozás: ${ertesitesek.length} értesítés az állapotváltásokról`, ertesitesek.length >= 2, ertesitesek)
    await k.orders.viewer.unsubscribeResource({ uri: `order://${orderId}` })
    const nyomok = kimenetek.map((x) => ({ eszkoz: x.eszkoz, nyom: legacyNyom(x.data) })).filter((x) => x.nyom.length)
    check(`${kimenetek.length} sikeres eszközválasz, egyikben sincs legacy formátum`, nyomok.length === 0, nyomok)
    const n = await naploSorok('smoke14o-%', kezdetIso)
    const szerverenkent = Object.fromEntries(SZERVEREK.map(([nev]) => [nev, n.filter((r) => r.server === nev).length]))
    check(`minden hívás naplózva (${n.length} / ${naplozottHivasok()}), szerverenként: ${JSON.stringify(szerverenkent)}`, n.length === naplozottHivasok() && Object.values(szerverenkent).every((x) => x > 0), szerverenkent)
    const ido = n.reduce((s, r) => s + r.duration_ms, 0)
    const bajt = n.reduce((s, r) => s + r.response_bytes, 0)
    console.log(`     (az eszközhívások összideje ${Math.round(ido / 1000)} mp, a válaszok összesen ${Math.round(bajt / 1024)} KB – a tokenomics mérés alapja)`)

    for (const [nev] of SZERVEREK) await Promise.all(ROLES.map((r) => k[nev][r].close()))
  } finally {
    for (const s of Object.values(szerverek)) s.leallit()
    // takarítás: a kiszállított készlet visszavételezése (raktári cikk 4701 = TK-00001)
    if (kiszallitva) await raktarHivas(supabase, { cmd: 'MOZGAS', cikk: 4701, tipus: 'KORREKCIO', db: DB, ref: 'SMOKE-14-O2C' })
  }
  zaras(kezdet, 'Minden ellenőrzés sikeres – a teljes order-to-cash folyamat végigvihető kizárólag MCP eszközökkel.')
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
