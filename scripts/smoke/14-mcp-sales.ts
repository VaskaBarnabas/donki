/* eslint-disable @typescript-eslint/no-explicit-any -- a füstteszt típus nélküli JSON válaszokat vizsgál */
/**
 * 14. fázis: a `sales` MCP szerver füsttesztje (LLM nélkül, a hivatalos MCP klienssel).
 * Vevő- és termékkeresés, ajánlat egy lépésben, 15% feletti kedvezmény → jóváhagyás → elfogadás → rendelés,
 * a JSON-RPC hibák kanonikus leképezése, szerepkörök, idempotencia, napló.
 *
 * Előfeltétel: futó Next.js és Flowable (az accept_quote rendelést hoz létre); az `mcp` séma kiajánlva
 * Futtatás: npx tsx scripts/smoke/14-mcp-sales.ts   (~1 perc)
 */
import { randomUUID } from 'node:crypto'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { lint } from '../../mcp/kozos/lint'
import { check, env, eszkozlistaEllenorzes, hiv, legacyNyom, mcpSemaEllenorzes, naplozottHivasok, naploSorok, ROLES, szakasz, szerverInditas, zaras, type Role } from './mcp-segedek'

const BAKONY = '10000000-0000-4000-8000-000000000003' // KIEMELT
const TOOLS = ['search_customers', 'get_customer', 'search_products', 'create_quote', 'get_quote', 'list_quotes', 'request_quote_approval', 'approve_quote', 'accept_quote']

/** Takarítás: a teszt által létrehozott rendelés lemondása a legacy homlokzaton (még nincs foglalása). */
async function rendelesLemondas(orderId: string) {
  await fetch(`${env.APP_BASE_URL}/api/legacy/orders/${orderId.slice(4)}/cancel`, { method: 'POST', headers: { 'X-Legacy-Key': env.LEGACY_ORDERS_KEY } })
}

async function main() {
  console.log('14. fázis – sales MCP szerver füstteszt')
  const kezdet = Date.now()
  const kezdetIso = new Date().toISOString()
  await mcpSemaEllenorzes()
  const szerver = await szerverInditas('sales', 3292, 'smoke14s')
  try {
    const k = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await szerver.kliens(r)] as const))) as Record<Role, Client>

    szakasz('Eszközlista, lint, kockázati osztály')
    await eszkozlistaEllenorzes(k.viewer, TOOLS, { search_customers: 'read', create_quote: 'write', approve_quote: 'write', accept_quote: 'write' }, lint)
    const res = await k.viewer.readResource({ uri: 'catalog://categories' })
    const kat = JSON.parse((res.contents[0] as { text: string }).text)
    check(`resource catalog://categories: ${kat.length} kategória (${kat[0]?.category} = „${kat[0]?.name}”)`, kat.length === 6 && kat.every((c: any) => /^[a-z_]+$/.test(c.category)), kat)
    const pr = await k.viewer.getPrompt({ name: 'new_order', arguments: { request: 'Bakony kér 3 nyomtatót' } })
    check('prompt new_order: a kérés adatként jelölve (<<<…>>>)', JSON.stringify(pr.messages).includes('<<<Bakony kér 3 nyomtatót>>>'), pr)

    szakasz('Vevők és termékek – kanonikus alak')
    const nev = await hiv(k.viewer, 'search_customers', { query: 'bakony' })
    const ado = await hiv(k.viewer, 'search_customers', { taxNumber: '32038523-2-19' })
    check(
      `search_customers név és adószám szerint → ${nev.data.items?.[0]?.name} (${nev.data.items?.[0]?.customerGroupLabel})`,
      nev.data.items?.[0]?.customerId === BAKONY && ado.data.items?.[0]?.customerId === BAKONY && nev.data.items[0].customerGroup === 'key_account',
      { nev, ado }
    )
    const ures = await hiv(k.viewer, 'search_customers', {})
    check('search_customers feltétel nélkül → VALIDATION', !ures.ok && ures.error?.code === 'VALIDATION', ures)
    const vevo = await hiv(k.viewer, 'get_customer', { customerId: BAKONY })
    check(`get_customer: ${vevo.data.customer?.contacts?.length} kapcsolattartó, ${vevo.data.customer?.recentQuotes?.length} friss ajánlat`, vevo.ok && vevo.data.customer.contacts.length > 0, vevo)
    const termek = await hiv(k.viewer, 'search_products', { query: 'PC-OF5', customerId: BAKONY })
    const t8 = termek.data.items?.[0]
    check(
      `search_products TK-00008 a KIEMELT vevőnek: lista ${t8?.listPrice?.amount}, vevői ár ${t8?.customerPrice?.amount} Ft (${t8?.customerDiscountPct}%)`,
      t8?.sku === 'TK-00008' && t8.customerPrice.amount === '272506.00' && t8.listPrice.amount === '289900.00' && t8.category === 'computers',
      termek
    )
    const ekezet = await hiv(k.viewer, 'search_products', { query: 'szamitogep' })
    check(`ékezet nélküli keresés („szamitogep”) → ${ekezet.data.items?.length} találat`, ekezet.data.items?.some((p: any) => p.sku === 'TK-00008'), ekezet)
    const kivezetett = await hiv(k.viewer, 'search_products', { query: 'TK-00033', includeInactive: true })
    check('kivezetett termék csak includeInactive-vel, active=false', kivezetett.data.items?.[0]?.active === false && (await hiv(k.viewer, 'search_products', { query: 'TK-00033' })).data.items.length === 0, kivezetett)
    const nincsRaktar = await hiv(k.viewer, 'search_products', { query: 'TK-00012' })
    check('raktári kód nélküli termék: stockTracked=false', nincsRaktar.data.items?.[0]?.stockTracked === false, nincsRaktar)
    check('nincs legacy formátum a kimenetekben (cikkszám, vevőkód, legacy mezőnév)', [nev, vevo, termek].every((r) => legacyNyom(r.data).length === 0), [nev, vevo, termek].map((r) => legacyNyom(r.data)))

    szakasz('Ajánlat 15% feletti kedvezménnyel: jóváhagyás → elfogadás → rendelés')
    const elotte = (await hiv(k.viewer, 'list_quotes', { customerId: BAKONY, limit: 50 })).data.items.length
    const kulcs = randomUUID()
    const q1 = await hiv(k.sales, 'create_quote', { customerId: BAKONY, lines: [{ sku: 'TK-00001', quantity: 12, discountPct: 3 }], idempotencyKey: kulcs })
    const q = q1.data.quote
    check(
      `create_quote → ${q?.quoteId}: draft, nettó ${q?.totalNet?.amount}, listaáron ${q?.totalListPrice?.amount}, kedvezmény ${q?.totalDiscountPct}%, approvalRequired`,
      q1.ok && q.status === 'draft' && q.approvalRequired === true && q.totalDiscountPct > 15 && q.totalListPrice.amount === '1078800.00' && q.nextAction?.tool === 'request_quote_approval',
      q1
    )
    const q1b = await hiv(k.sales, 'create_quote', { customerId: BAKONY, lines: [{ sku: 'TK-00001', quantity: 12, discountPct: 3 }], idempotencyKey: kulcs })
    check('ugyanazzal az idempotencyKey-jel → ugyanaz az ajánlat, nem jön létre új', q1b.data.quote?.quoteId === q.quoteId, q1b.data.quote?.quoteId)

    const korai = await hiv(k.sales, 'accept_quote', { quoteId: q.quoteId })
    check(
      `accept_quote jóváhagyás nélkül → APPROVAL_REQUIRED { discountPct: ${korai.error?.details?.discountPct}, limit: ${korai.error?.details?.limit} }`,
      !korai.ok && korai.error?.code === 'APPROVAL_REQUIRED' && korai.error.details.limit === 15 && korai.error.suggestedActions.includes('request_quote_approval'),
      korai
    )
    console.log(`     („${korai.error?.message}”)`)
    const kerve = await hiv(k.sales, 'request_quote_approval', { quoteId: q.quoteId, reason: 'MCP füstteszt – kiemelt vevő' })
    check('request_quote_approval → pending_approval, nextAction approve_quote (sales_manager)', kerve.data.quote?.status === 'pending_approval' && kerve.data.quote.nextAction?.actor === 'sales_manager', kerve)
    const tilos1 = await hiv(k.sales, 'approve_quote', { quoteId: q.quoteId })
    const tilos2 = await hiv(k.viewer, 'create_quote', { customerId: BAKONY, lines: [{ sku: 'TK-00001', quantity: 1 }] })
    check('sales → approve_quote és viewer → create_quote: FORBIDDEN', tilos1.error?.code === 'FORBIDDEN' && tilos2.error?.code === 'FORBIDDEN', { tilos1, tilos2 })
    const jovahagyva = await hiv(k.sales_manager, 'approve_quote', { quoteId: q.quoteId })
    check(`approve_quote → approved, jóváhagyó: ${jovahagyva.data.quote?.approvedBy} (a hívó azonosítója)`, jovahagyva.data.quote?.status === 'approved' && jovahagyva.data.quote.approvedBy === szerver.kliensNev('sales_manager'), jovahagyva)
    const elfogadva = await hiv(k.sales, 'accept_quote', { quoteId: q.quoteId, idempotencyKey: randomUUID() })
    const orderId = elfogadva.data.orderId as string
    check(
      `accept_quote → rendelés ${orderId}, nextAction approve_order (sales_manager)`,
      elfogadva.ok && /^RND-\d+$/.test(orderId) && elfogadva.data.quote.status === 'accepted' && elfogadva.data.nextAction?.tool === 'approve_order',
      elfogadva
    )
    const utana = await hiv(k.viewer, 'get_quote', { quoteId: q.quoteId })
    check('get_quote: accepted, orderId kitöltve, nextAction track_order', utana.data.quote?.orderId === orderId && utana.data.quote.nextAction?.code === 'track_order', utana)
    const ujra = await hiv(k.sales, 'request_quote_approval', { quoteId: q.quoteId, reason: 'még egyszer' })
    check(
      `elfogadott ajánlatra request_quote_approval → INVALID_STATE { status: ${ujra.error?.details?.status}, allowed: ${ujra.error?.details?.allowed} }`,
      !ujra.ok && ujra.error?.code === 'INVALID_STATE' && ujra.error.details.status === 'accepted' && ujra.error.details.allowed.includes('draft'),
      ujra
    )

    szakasz('Hibák előzetes ellenőrzéssel – nem marad félkész piszkozat')
    const inaktiv = await hiv(k.sales, 'create_quote', { customerId: BAKONY, lines: [{ sku: 'TK-00001', quantity: 1 }, { sku: 'TK-00033', quantity: 1 }] })
    check(`kivezetett termék (TK-00033) → VALIDATION: „${inaktiv.error?.message}”`, !inaktiv.ok && inaktiv.error?.code === 'VALIDATION' && inaktiv.error.details.skus.includes('TK-00033'), inaktiv)
    const ismeretlen = await hiv(k.sales, 'create_quote', { customerId: BAKONY, lines: [{ sku: 'TK-99999', quantity: 1 }] })
    check('ismeretlen termékkód → NOT_FOUND + search_products', ismeretlen.error?.code === 'NOT_FOUND' && ismeretlen.error.suggestedActions.includes('search_products'), ismeretlen)
    const nincsVevo = await hiv(k.sales, 'create_quote', { customerId: randomUUID(), lines: [{ sku: 'TK-00001', quantity: 1 }] })
    check('ismeretlen vevő → NOT_FOUND + search_customers', nincsVevo.error?.code === 'NOT_FOUND' && nincsVevo.error.suggestedActions.includes('search_customers'), nincsVevo)
    const dupla = await hiv(k.sales, 'create_quote', { customerId: BAKONY, lines: [{ sku: 'TK-00001', quantity: 1 }, { sku: 'TK-00001', quantity: 2 }] })
    check('ismétlődő termék → VALIDATION', dupla.error?.code === 'VALIDATION', dupla)
    const utolag = (await hiv(k.viewer, 'list_quotes', { customerId: BAKONY, limit: 50 })).data.items.length
    check(`a Bakony ajánlatainak száma pontosan eggyel nőtt (${elotte} → ${utolag})`, utolag === elotte + 1, { elotte, utolag })
    const nincsAjanlat = await hiv(k.viewer, 'get_quote', { quoteId: 'AJ-2026-9999' })
    check('ismeretlen ajánlat → NOT_FOUND (JSON-RPC -32602 QUOTE_NOT_FOUND)', nincsAjanlat.error?.code === 'NOT_FOUND' && nincsAjanlat.error.upstream?.system === 'quote-jsonrpc', nincsAjanlat)
    const lista = await hiv(k.viewer, 'list_quotes', { status: 'pending_approval', limit: 5 })
    check(`list_quotes status=pending_approval: ${lista.data.items?.length} db`, lista.ok && lista.data.items.every((i: any) => i.status === 'pending_approval'), lista)

    szakasz('stdio és napló')
    const stdio = await szerver.stdio('sales')
    const s = await hiv(stdio, 'get_quote', { quoteId: q.quoteId })
    check('stdio (sales) get_quote', s.ok && s.data.quote.quoteId === q.quoteId, s)
    await stdio.close()
    const n = await naploSorok('smoke14s-%', kezdetIso)
    check(`minden eszközhívásról van naplósor (${n.length} / ${naplozottHivasok()}), mind server=sales`, n.length === naplozottHivasok() && n.every((r) => r.server === 'sales'), n.length)
    check('hibakódok a naplóban: APPROVAL_REQUIRED, FORBIDDEN, INVALID_STATE, VALIDATION, NOT_FOUND', ['APPROVAL_REQUIRED', 'FORBIDDEN', 'INVALID_STATE', 'VALIDATION', 'NOT_FOUND'].every((c) => n.some((r) => r.error_code === c)), [...new Set(n.map((r) => r.error_code))])

    await Promise.all(ROLES.map((r) => k[r].close()))
    await rendelesLemondas(orderId)
  } finally {
    szerver.leallit()
  }
  zaras(kezdet, 'Minden ellenőrzés sikeres – a sales MCP szerver kész.')
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
