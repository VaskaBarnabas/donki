/* eslint-disable @typescript-eslint/no-explicit-any -- a füstteszt típus nélküli JSON válaszokat vizsgál */
/**
 * 13. fázis: az `orders` MCP szerver füsttesztje – a hivatalos MCP kliens SDK-val, LLM nélkül, HTTP-n és stdio-n.
 * A teszt saját szerverpéldányt indít a 3291-es porton, ideiglenes tokenekkel (a .env.local MCP_TOKENS-étől függetlenül).
 *
 * Előfeltétel: futó Next.js (APP_BASE_URL) és Flowable; az `mcp` séma kiajánlva (Dashboard → Data API → Exposed schemas)
 * Futtatás: npx tsx scripts/smoke/13-mcp-orders.ts   (~3-4 perc, a szállításkövetés időzítője 1 perces)
 */
import { randomUUID } from 'node:crypto'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { lint } from '../../mcp/kozos/lint'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'
import { check, env, eszkozlistaEllenorzes, hiv, kanonJson, mcpSemaEllenorzes, naplozottHivasok, naploSorok, ROLES, szakasz, supabase, szerverInditas, zaras, type Eredmeny, type Role } from './mcp-segedek'

const PORT = 3291
const KLIENS = (r: string) => `smoke13-${r}`

const MATRA = '10000000-0000-4000-8000-000000000005' // NORMAL ügyfélcsoport, nincs jóváhagyás az ajánlaton
const REGI_RENDELES = 'RND-100034' // seedelt, lezárt, a folyamatmotoron kívül
const TOOLS = ['get_order', 'list_orders', 'get_order_timeline', 'wait_for_order_status', 'approve_order', 'start_fulfillment', 'issue_proforma', 'modify_order', 'cancel_order']

// ---------------------------------------------------------------- legacy előkészítés (ajánlat → rendelés)

async function rpc(method: string, params: Record<string, unknown>) {
  const res = await fetch(`${env.APP_BASE_URL}/api/legacy/quote-rpc`, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { apiKey: env.LEGACY_QUOTE_KEY, ...params } }),
  })
  return res.json()
}

async function ujRendeles(sku: string, qty: number): Promise<string> {
  const q = (await rpc('quote.create', { partnerId: MATRA })).result
  await rpc('quote.addLine', { quoteId: q.id, productCode: sku, qty })
  const accept = await rpc('quote.accept', { quoteId: q.id })
  if (!accept.result?.orderRef) throw new Error(`az ajánlat elfogadása sikertelen: ${JSON.stringify(accept)}`)
  return accept.result.orderRef as string
}

async function main() {
  console.log(`13. fázis – orders MCP szerver füstteszt (port ${PORT})`)
  const kezdet = Date.now()
  const kezdetIso = new Date().toISOString()
  await mcpSemaEllenorzes()

  const szerver = await szerverInditas('orders', PORT, 'smoke13')
  const MCP_URL = szerver.url
  try {
    const k = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await szerver.kliens(r)] as const))) as Record<Role, Client>

    // -------------------------------------------------------------- 1. eszközlista + lint
    szakasz('Eszközlista és modellfüggetlenségi lint')
    const tools = await eszkozlistaEllenorzes(k.viewer, TOOLS, { get_order: 'read', approve_order: 'write', cancel_order: 'irreversible' }, lint)
    const t = Object.fromEntries(tools.map((x) => [x.name, x]))
    check(
      'annotációk: olvasók readOnly, cancel_order destructive, írók idempotent',
      ['get_order', 'list_orders', 'get_order_timeline', 'wait_for_order_status'].every((n) => t[n].annotations?.readOnlyHint === true) &&
        t.cancel_order.annotations?.destructiveHint === true &&
        ['approve_order', 'start_fulfillment', 'issue_proforma', 'modify_order', 'cancel_order'].every((n) => t[n].annotations?.idempotentHint === true),
      tools.map((x) => [x.name, x.annotations])
    )
    const tmpl = await k.viewer.listResourceTemplates()
    const prompts = await k.viewer.listPrompts()
    check('resource sablon order://{orderId}, prompt order_status_report', tmpl.resourceTemplates.some((r) => r.uriTemplate === 'order://{orderId}') && prompts.prompts.some((p) => p.name === 'order_status_report'), { tmpl, prompts })

    // -------------------------------------------------------------- 2. olvasás
    szakasz('Olvasás – kanonikus alak')
    const regi = await hiv(k.viewer, 'get_order', { orderId: REGI_RENDELES })
    const o = regi.data.order
    check(
      `get_order ${REGI_RENDELES}: completed, processManaged=false, nextAction=null, Money string`,
      regi.ok && o.status === 'completed' && o.processManaged === false && o.nextAction === null && /^\d+\.\d{2}$/.test(o.total.amount) && o.total.currency === 'HUF',
      regi
    )
    check(`  vevő neve a CRM-ből (${o?.customer?.name}), tételek sku-val, nincs legacy mező`, !!o?.customer?.name && o.lines.every((l: any) => /^TK-/.test(l.sku)) && !('state' in o) && !('order_no' in o), o)
    check(`  szöveges összefoglaló magyarul: „${regi.text.slice(0, 70)}…”`, regi.text.includes('Lezárva'), regi.text)
    const szam = await hiv(k.viewer, 'get_order', { orderId: REGI_RENDELES.slice(4) })
    check('get_order "100034" (szám alakban) ugyanazt adja', szam.ok && szam.data.order.orderId === REGI_RENDELES, szam)

    const lista = await hiv(k.viewer, 'list_orders', { status: 'completed', limit: 2 })
    const lista2 = await hiv(k.viewer, 'list_orders', { status: 'completed', limit: 2, cursor: lista.data.nextCursor })
    check(
      `list_orders completed, lapozva: ${lista.data.items?.map((i: any) => i.orderId)} | ${lista2.data.items?.map((i: any) => i.orderId)}`,
      lista.ok && lista.data.items.length === 2 && lista.data.items.every((i: any) => i.status === 'completed') && !!lista.data.nextCursor && lista2.data.items[0]?.orderId !== lista.data.items[0].orderId,
      { lista, lista2 }
    )
    const sajat = await hiv(k.viewer, 'list_orders', { customerId: MATRA, limit: 50 })
    check('list_orders customerId szűrés', sajat.ok && sajat.data.items.every((i: any) => i.customer.customerId === MATRA), sajat.data.items?.slice(0, 3))

    const res = await k.viewer.readResource({ uri: `order://${REGI_RENDELES}` })
    check('resource order://RND-100034', JSON.parse((res.contents[0] as { text: string }).text).orderId === REGI_RENDELES, res)
    const pr = await k.viewer.getPrompt({ name: 'order_status_report', arguments: { orderId: REGI_RENDELES } })
    check('prompt order_status_report: egy üzenet, get_order-t kér', pr.messages.length === 1 && JSON.stringify(pr.messages[0].content).includes('get_order'), pr)

    // -------------------------------------------------------------- 3. hibák
    szakasz('Hibák – egységes kanonikus hiba')
    const nincs = await hiv(k.viewer, 'get_order', { orderId: 'RND-999999' })
    check(`ismeretlen rendelés → NOT_FOUND: „${nincs.error?.message}”`, !nincs.ok && nincs.error?.code === 'NOT_FOUND' && nincs.error.upstream?.system === 'orders-facade', nincs)
    const regiJov = await hiv(k.sales_manager, 'approve_order', { orderId: REGI_RENDELES })
    check(
      'régi rendelés jóváhagyása → INVALID_STATE + suggestedActions [get_order]',
      !regiJov.ok && regiJov.error?.code === 'INVALID_STATE' && regiJov.error.suggestedActions.includes('get_order') && regiJov.error.details.status === 'completed',
      regiJov
    )
    console.log(`     („${regiJov.error?.message}”)`)
    const rossz = await hiv(k.viewer, 'get_order', { orderId: 'abc' }, { naplo: false })
    check('érvénytelen bemenet → isError, magyar mezőüzenet (az SDK validál, a legacy-t nem éri el)', !rossz.ok && rossz.text.includes('RND-100045 vagy 100045'), rossz)

    // -------------------------------------------------------------- 4. teljes út
    szakasz('Teljes út egy friss rendelésen (ajánlatból): jóváhagyás → kiszállítás → díjbekérő')
    const A = await ujRendeles('TK-00001', 2)
    const a0 = await hiv(k.viewer, 'get_order', { orderId: A })
    check(`${A}: received, nextAction approve_order (sales_manager)`, a0.data.order?.status === 'received' && a0.data.order.nextAction?.tool === 'approve_order' && a0.data.order.nextAction.actor === 'sales_manager', a0)

    const progresszek: string[] = []
    const a1 = await hiv(k.sales_manager, 'approve_order', { orderId: A, idempotencyKey: randomUUID() }, { onprogress: (p) => progresszek.push(p.message ?? '') })
    check(`approve_order → approved, nextAction start_fulfillment`, a1.ok && a1.data.order.status === 'approved' && a1.data.order.nextAction?.tool === 'start_fulfillment', a1)
    check(`  progress értesítések: ${progresszek.length} db („${progresszek[0]}”)`, progresszek.length >= 1 && progresszek[0] === 'Készletfoglalás folyamatban…', progresszek)

    // feliratkozás a rendelésre: állapotváltáskor a szerver értesít (14. fázis)
    const ertesitesek: string[] = []
    k.viewer.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => void ertesitesek.push(n.params.uri))
    await k.viewer.subscribeResource({ uri: `order://${A}` })

    const a2 = await hiv(k.logistics, 'start_fulfillment', { orderId: A, idempotencyKey: randomUUID() })
    check(
      `start_fulfillment (logistics) → in_fulfillment, szállítmány: ${a2.data.order?.shipment?.carrier} ${a2.data.order?.shipment?.statusLabel}, nextAction wait_for_delivery`,
      a2.ok && a2.data.order.status === 'in_fulfillment' && !!a2.data.order.shipment && a2.data.order.nextAction?.code === 'wait_for_delivery',
      a2
    )
    await supabase.schema('orders').from('shipments').update({ carrier_status: 'KEZBESITVE' }).eq('order_no', Number(A.slice(4)))
    let w: Eredmeny | null = null
    const varKezdet = Date.now()
    for (let i = 0; i < 3 && !w?.data.reached; i++) w = await hiv(k.viewer, 'wait_for_order_status', { orderId: A, status: 'delivered', timeoutSeconds: 60 })
    check(
      `wait_for_order_status delivered → reached (${Math.round((Date.now() - varKezdet) / 1000)} mp), nextAction issue_proforma (finance)`,
      !!w?.data.reached && w.data.order.status === 'delivered' && w.data.order.nextAction?.tool === 'issue_proforma',
      w
    )
    check(`order://${A} feliratkozás: ${ertesitesek.length} értesítés az állapotváltásokról`, ertesitesek.length >= 1 && ertesitesek.every((u) => u === `order://${A}`), ertesitesek)
    await k.viewer.unsubscribeResource({ uri: `order://${A}` })
    const a3 = await hiv(k.finance, 'issue_proforma', { orderId: A, idempotencyKey: randomUUID() })
    check(
      `issue_proforma (finance) → awaiting_payment, ${a3.data.order?.billing?.documentNo} proforma, nextAction collect_payment`,
      a3.ok && a3.data.order.status === 'awaiting_payment' && a3.data.order.billing?.documentType === 'proforma' && /^DB-/.test(a3.data.order.billing.documentNo) && a3.data.order.nextAction?.code === 'collect_payment',
      a3
    )
    const tl = await hiv(k.viewer, 'get_order_timeline', { orderId: A })
    const lepesek = tl.data.entries?.map((e: any) => e.to)
    check(`get_order_timeline kanonikus kulcsokkal: ${lepesek?.join(' → ')}`, JSON.stringify(lepesek) === JSON.stringify(['received', 'approved', 'in_fulfillment', 'delivered', 'awaiting_payment']), tl)

    // -------------------------------------------------------------- 5. készlethiány, hiányzó adat, módosítás, idempotencia
    szakasz('Készlethiány és hiányzó raktári kód → módosítás → jóváhagyás (idempotens) → lemondás')
    const B = await ujRendeles('TK-00018', 1) // raktári készlet: 0
    const b1 = await hiv(k.sales_manager, 'approve_order', { orderId: B })
    check(
      `INSUFFICIENT_STOCK { sku: ${b1.error?.details?.sku}, missing: ${b1.error?.details?.missing} } – termékkóddal, nem cikkszámmal`,
      !b1.ok && b1.error?.code === 'INSUFFICIENT_STOCK' && b1.error.details.sku === 'TK-00018' && b1.error.details.missing === 1 && b1.error.suggestedActions.includes('modify_order'),
      b1
    )
    console.log(`     („${b1.error?.message}”)`)
    const b2 = await hiv(k.viewer, 'get_order', { orderId: B })
    check('  utána újra received, nextAction approve_order', b2.data.order?.status === 'received' && b2.data.order.nextAction?.tool === 'approve_order', b2)

    const dupla = await hiv(k.sales, 'modify_order', { orderId: B, lines: [{ sku: 'TK-00001', quantity: 1 }, { sku: 'TK-00001', quantity: 2 }] })
    check('modify_order ismétlődő termékkel → VALIDATION', !dupla.ok && dupla.error?.code === 'VALIDATION', dupla)
    const b3 = await hiv(k.sales, 'modify_order', { orderId: B, lines: [{ sku: 'TK-00012', quantity: 1 }] })
    check(`modify_order (sales) TK-00012 → egységár a vevő csoportjára: ${b3.data.order?.lines?.[0]?.unitPrice?.amount} Ft`, b3.ok && b3.data.order.lines[0].sku === 'TK-00012' && Number(b3.data.order.lines[0].unitPrice.amount) > 0, b3)
    const b4 = await hiv(k.sales_manager, 'approve_order', { orderId: B })
    check(`raktári kód nélküli termék → MISSING_DATA { sku: ${b4.error?.details?.sku} }`, !b4.ok && b4.error?.code === 'MISSING_DATA' && b4.error.details.sku === 'TK-00012', b4)

    const tilos = await hiv(k.viewer, 'approve_order', { orderId: B })
    check('viewer → approve_order: FORBIDDEN (a legacy-t el sem éri)', !tilos.ok && tilos.error?.code === 'FORBIDDEN', tilos)
    const tilos2 = await hiv(k.logistics, 'modify_order', { orderId: B, lines: [{ sku: 'TK-00001', quantity: 1 }] })
    check('logistics → modify_order: FORBIDDEN', !tilos2.ok && tilos2.error?.code === 'FORBIDDEN', tilos2)

    await hiv(k.sales, 'modify_order', { orderId: B, lines: [{ sku: 'TK-00001', quantity: 1 }] })
    const kulcs = randomUUID()
    const b5 = await hiv(k.sales_manager, 'approve_order', { orderId: B, idempotencyKey: kulcs })
    const b6 = await hiv(k.sales_manager, 'approve_order', { orderId: B, idempotencyKey: kulcs })
    check('módosítás után approve_order → approved', b5.ok && b5.data.order.status === 'approved', b5)
    check('ugyanazzal az idempotencyKey-jel újra → ugyanaz a válasz (nem INVALID_STATE)', b6.ok && kanonJson(b6.data) === kanonJson(b5.data), b6)
    const jovahagyasok = (await hiv(k.viewer, 'get_order_timeline', { orderId: B })).data.entries.filter((e: any) => e.action === 'approve' && e.ok)
    check('  a legacy-ben egyetlen sikeres jóváhagyás történt', jovahagyasok.length === 1, jovahagyasok)

    const b7 = await hiv(k.sales_manager, 'cancel_order', { orderId: B, reason: 'MCP füstteszt takarítás', idempotencyKey: randomUUID() })
    const { data: fogl } = await supabase.schema('inventory').from('reservations').select('statusz').eq('ref', B)
    check(`cancel_order → cancelled, foglalás feloldva (${fogl?.map((f) => f.statusz)})`, b7.ok && b7.data.order.status === 'cancelled' && b7.data.order.nextAction === null && !!fogl?.length && fogl.every((f) => f.statusz !== 'AKTIV'), { b7, fogl })

    // -------------------------------------------------------------- 6. HTTP hitelesítés
    szakasz('HTTP hitelesítés')
    const nincsToken = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' })
    const nincsTokenTorzs = await nincsToken.json()
    check(`token nélkül → HTTP ${nincsToken.status}: „${nincsTokenTorzs.message}”`, nincsToken.status === 401, nincsTokenTorzs)
    const rosszToken = await fetch(MCP_URL, { method: 'POST', headers: { Authorization: 'Bearer rossz', 'Content-Type': 'application/json' }, body: '{}' })
    check('érvénytelen tokennel → HTTP 401', rosszToken.status === 401, rosszToken.status)

    // -------------------------------------------------------------- 7. stdio
    szakasz('stdio átvitel (helyi kliens, szerepkör: MCP_STDIO_ROLE=viewer)')
    const stdio = await szerver.stdio('viewer')
    const sTools = await stdio.listTools()
    check(`stdio: ${sTools.tools.length} eszköz`, sTools.tools.length === 9, sTools.tools.length)
    const sGet = await hiv(stdio, 'get_order', { orderId: A })
    check(`stdio get_order ${A} → ${sGet.data.order?.status}`, sGet.ok && sGet.data.order.status === 'awaiting_payment', sGet)
    const sTilos = await hiv(stdio, 'cancel_order', { orderId: A, reason: 'nem szabad' })
    check('stdio viewer → cancel_order: FORBIDDEN', !sTilos.ok && sTilos.error?.code === 'FORBIDDEN', sTilos)
    await stdio.close()

    // -------------------------------------------------------------- 8. napló
    szakasz('Naplózás (mcp.tool_calls, mcp.idempotency)')
    const n = await naploSorok('smoke13-%', kezdetIso)
    check(`minden eszközhívásról van naplósor (${n.length} / ${naplozottHivasok()})`, n.length === naplozottHivasok(), { n: n.length, naplozott: naplozottHivasok() })
    const jov = n.find((r) => r.tool === 'approve_order' && r.ok && r.client_id === KLIENS('sales_manager'))
    check(`approve_order sor: sales_manager, http, ${jov?.duration_ms} ms, ${jov?.response_bytes} bájt, kulcs elrejtve`, !!jov && jov.transport === 'http' && jov.duration_ms > 0 && jov.response_bytes > 0 && n.filter((r) => r.input_summary?.idempotencyKey).every((r) => r.input_summary.idempotencyKey === '***'), jov)
    check(
      'hibakódok a naplóban: FORBIDDEN, INSUFFICIENT_STOCK, MISSING_DATA, NOT_FOUND, INVALID_STATE',
      ['FORBIDDEN', 'INSUFFICIENT_STOCK', 'MISSING_DATA', 'NOT_FOUND', 'INVALID_STATE'].every((c) => n.some((r) => r.error_code === c)),
      [...new Set(n.map((r) => r.error_code))]
    )
    check('stdio hívások transport=stdio, role=viewer', n.filter((r) => r.client_id === KLIENS('stdio')).every((r) => r.transport === 'stdio' && r.role === 'viewer') && n.some((r) => r.client_id === KLIENS('stdio')), null)
    const { data: idem } = await supabase.schema('mcp').from('idempotency').select('tool').eq('idempotency_key', kulcs)
    check('az idempotencia-kulcs eltárolva', idem?.length === 1 && idem[0].tool === 'approve_order', idem)

    await Promise.all(ROLES.map((r) => k[r].close()))

    // -------------------------------------------------------------- takarítás: a kiszállított készlet visszavételezése
    await raktarHivas(supabase, { cmd: 'MOZGAS', cikk: 4701, tipus: 'KORREKCIO', db: 2, ref: 'SMOKE-13' })
  } finally {
    szerver.leallit()
  }
  zaras(kezdet, 'Minden ellenőrzés sikeres – az orders MCP szerver kész.')
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
