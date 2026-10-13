/* eslint-disable @typescript-eslint/no-explicit-any -- a füstteszt típus nélküli JSON válaszokat vizsgál */
/**
 * 14. fázis: az `inventory` MCP szerver füsttesztje. Készlet termékkódon (a cikkszám rejtve), minimum alatti
 * tételek, korrekció és beérkezés, a raktári hibakódok leképezése, idempotencia. Minden mozgást visszaállít.
 *
 * Előfeltétel: a raktár workere fut (pg_cron); az `mcp` séma kiajánlva. Next.js nem kell.
 * Futtatás: npx tsx scripts/smoke/14-mcp-inventory.ts   (~1-2 perc, a raktári sor lassú)
 */
import { randomUUID } from 'node:crypto'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { lint } from '../../mcp/kozos/lint'
import { check, eszkozlistaEllenorzes, hiv, legacyNyom, mcpSemaEllenorzes, naplozottHivasok, naploSorok, ROLES, szakasz, szerverInditas, zaras, type Role } from './mcp-segedek'

const TOOLS = ['check_stock', 'list_low_stock', 'adjust_stock']

async function main() {
  console.log('14. fázis – inventory MCP szerver füstteszt')
  const kezdet = Date.now()
  const kezdetIso = new Date().toISOString()
  await mcpSemaEllenorzes()
  const szerver = await szerverInditas('inventory', 3293, 'smoke14i')
  try {
    const k = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await szerver.kliens(r)] as const))) as Record<Role, Client>

    szakasz('Eszközlista, lint, kockázati osztály')
    await eszkozlistaEllenorzes(k.viewer, TOOLS, { check_stock: 'read', list_low_stock: 'read', adjust_stock: 'write' }, lint)

    szakasz('Készlet lekérdezése termékkódon')
    const progresszek: string[] = []
    const vegyes = await hiv(k.viewer, 'check_stock', { skus: ['TK-00001', 'TK-00012', 'TK-00018'] }, { onprogress: (p) => progresszek.push(p.message ?? '') })
    const [t1, t12, t18] = vegyes.data.items ?? []
    check(
      `TK-00001: szabad ${t1?.available} (készlet ${t1?.onHand}, foglalt ${t1?.reserved}, min ${t1?.minimum}); TK-00012: stockTracked=false; TK-00018: szabad ${t18?.available}`,
      vegyes.ok && t1?.stockTracked === true && typeof t1.available === 'number' && t12?.stockTracked === false && t12.available === null && t18?.available === 0,
      vegyes
    )
    check(`nincs cikkszám és legacy mezőnév a kimenetben; ${progresszek.length} progress értesítés a várakozás alatt`, legacyNyom(vegyes.data).length === 0 && !JSON.stringify(vegyes.data).includes('4701'), legacyNyom(vegyes.data))
    const ismeretlen = await hiv(k.viewer, 'check_stock', { skus: ['TK-99999'] })
    check('ismeretlen termékkód → NOT_FOUND (a raktárt el sem éri)', ismeretlen.error?.code === 'NOT_FOUND' && ismeretlen.error.details.skus[0] === 'TK-99999', ismeretlen)
    const alacsony = await hiv(k.viewer, 'list_low_stock', {})
    check(`list_low_stock: ${alacsony.data.items?.length} termék a minimum alatt (${alacsony.data.items?.map((i: any) => i.sku).join(', ')})`, alacsony.ok && alacsony.data.items.length > 0 && alacsony.data.items.every((i: any) => i.belowMinimum && i.onHand < i.minimum), alacsony)

    szakasz('Készletmozgás: korrekció, beérkezés, hibák')
    const kiindulo = t1.onHand as number
    const kulcs = randomUUID()
    const plusz = await hiv(k.logistics, 'adjust_stock', { sku: 'TK-00001', type: 'correction', quantity: 1, reason: 'MCP füstteszt', idempotencyKey: kulcs })
    check(`korrekció +1 (logistics) → készlet ${kiindulo} → ${plusz.data.item?.onHand}`, plusz.ok && plusz.data.item.onHand === kiindulo + 1, plusz)
    const plusz2 = await hiv(k.logistics, 'adjust_stock', { sku: 'TK-00001', type: 'correction', quantity: 1, reason: 'MCP füstteszt', idempotencyKey: kulcs })
    const most = (await hiv(k.viewer, 'check_stock', { skus: ['TK-00001'] })).data.items[0].onHand
    check(`ugyanazzal az idempotencyKey-jel újra → ugyanaz a válasz, a készlet egyszer nőtt (${most})`, plusz2.data.item?.onHand === kiindulo + 1 && most === kiindulo + 1, { plusz2, most })
    const minusz = await hiv(k.sales_manager, 'adjust_stock', { sku: 'TK-00001', type: 'correction', quantity: -1, reason: 'MCP füstteszt visszaállítás' })
    check(`korrekció −1 (sales_manager) → vissza ${minusz.data.item?.onHand}`, minusz.ok && minusz.data.item.onHand === kiindulo, minusz)
    const be = await hiv(k.logistics, 'adjust_stock', { sku: 'TK-00018', type: 'receipt', quantity: 2, reason: 'MCP füstteszt beérkezés' })
    const vissza = await hiv(k.logistics, 'adjust_stock', { sku: 'TK-00018', type: 'correction', quantity: -2, reason: 'MCP füstteszt visszaállítás' })
    check('beérkezés +2 TK-00018, majd korrekció −2 → vissza 0', be.data.item?.onHand === 2 && vissza.data.item?.onHand === 0, { be, vissza })
    const sok = await hiv(k.logistics, 'adjust_stock', { sku: 'TK-00001', type: 'correction', quantity: -(kiindulo + 5), reason: 'túl sok' })
    check(`a szabad készletnél nagyobb csökkentés → INSUFFICIENT_STOCK { available: ${sok.error?.details?.available} }`, sok.error?.code === 'INSUFFICIENT_STOCK' && sok.error.details.sku === 'TK-00001', sok)
    const nincsKod = await hiv(k.logistics, 'adjust_stock', { sku: 'TK-00012', type: 'receipt', quantity: 1, reason: 'próba' })
    check('raktári kód nélküli termék → MISSING_DATA', nincsKod.error?.code === 'MISSING_DATA', nincsKod)
    const negativBe = await hiv(k.logistics, 'adjust_stock', { sku: 'TK-00001', type: 'receipt', quantity: -1, reason: 'próba' })
    check('negatív beérkezés → VALIDATION', negativBe.error?.code === 'VALIDATION', negativBe)
    const tilos = await Promise.all([hiv(k.viewer, 'adjust_stock', { sku: 'TK-00001', type: 'receipt', quantity: 1, reason: 'próba' }), hiv(k.sales, 'adjust_stock', { sku: 'TK-00001', type: 'receipt', quantity: 1, reason: 'próba' })])
    check('viewer és sales → adjust_stock: FORBIDDEN', tilos.every((t) => t.error?.code === 'FORBIDDEN'), tilos)

    szakasz('Napló')
    const n = await naploSorok('smoke14i-%', kezdetIso)
    check(`minden eszközhívásról van naplósor (${n.length} / ${naplozottHivasok()})`, n.length === naplozottHivasok(), n.length)
    const lassu = n.filter((r) => r.tool === 'check_stock' && r.ok)
    check(`a raktári sor válaszideje a naplóban: ${lassu.map((r) => r.duration_ms).join(', ')} ms`, lassu.every((r) => r.duration_ms > 0), lassu)

    await Promise.all(ROLES.map((r) => k[r].close()))
  } finally {
    szerver.leallit()
  }
  zaras(kezdet, 'Minden ellenőrzés sikeres – az inventory MCP szerver kész.')
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
