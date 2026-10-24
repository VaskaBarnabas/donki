/**
 * 14. fázis: a `finance` MCP szerver füsttesztje. Bizonylatok kanonikus alakban (CRM-név a VEVO-kód helyett,
 * Money, ISO dátum), lejárt tartozások, PDF, fizetési link (Stripe TESZT), a számlázó és a fizetési REST hibái.
 *
 * Előfeltétel: a független rendszerek futnak (npm run stack:up; Stripe teszt kulcs). A fizetést nem végzi el.
 * Futtatás: npx tsx scripts/smoke/14-mcp-finance.ts   (~30 mp)
 */
import { randomUUID } from 'node:crypto'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { lint } from '../../mcp/kozos/lint'
import { check, env, eszkozlistaEllenorzes, hiv, legacyNyom, mcpSemaEllenorzes, naplozottHivasok, naploSorok, ROLES, supabase, szakasz, szerverInditas, zaras, type Role } from './mcp-segedek'
import { URL } from './rendszerek'

const TOOLS = ['get_document', 'list_overdue_documents', 'get_document_pdf', 'create_payment_link', 'get_payments']
const DUNA = '10000000-0000-4000-8000-000000000001'

/** Előkészítés és takarítás a számlázó saját protokollján (nem MCP). */
async function szamlazo(parancs: string) {
  const res = await fetch(`${URL.billing}/api/legacy/billing`, { method: 'POST', body: `AUTH|${env.LEGACY_BILLING_KEY}\n${parancs}` })
  return (await res.text()).trim()
}

async function main() {
  console.log('14. fázis – finance MCP szerver füstteszt')
  const kezdet = Date.now()
  const kezdetIso = new Date().toISOString()
  await mcpSemaEllenorzes()
  const szerver = await szerverInditas('finance', 3294, 'smoke14f')
  let ujDijbekero: string | null = null
  try {
    const k = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await szerver.kliens(r)] as const))) as Record<Role, Client>

    szakasz('Eszközlista, lint, kockázati osztály')
    await eszkozlistaEllenorzes(k.viewer, TOOLS, { get_document: 'read', create_payment_link: 'financial' }, lint)

    szakasz('Számla kanonikus alakban')
    const sz = await hiv(k.viewer, 'get_document', { documentNo: 'SZ-2026-000187' })
    const d = sz.data.document
    check(
      `SZ-2026-000187: ${d?.documentTypeLabel}, ${d?.statusLabel}, bruttó ${d?.total?.amount} Ft, határidő ${d?.dueDate}`,
      sz.ok && d.documentType === 'invoice' && d.total.amount === '3676956.00' && d.dueDate === '2026-08-31' && d.overdue === true && d.status === 'overdue',
      sz
    )
    check(`vevő a CRM-ből: ${d?.customer?.name} (nem „DUNA-IRODAHAZ KFT.”), customerId kitöltve`, d?.customer?.customerId === DUNA && d.customer.name === 'Duna Irodaház Kft', d?.customer)
    check('számlánál nextAction collect_payment (átutalás), nincs végszámla-blokk', d?.nextAction?.code === 'collect_payment' && d.finalInvoice === null, d?.nextAction)
    check('nincs legacy formátum (VEVO-kód, 38100,00, YYYY.MM.DD)', legacyNyom(sz.data).length === 0, legacyNyom(sz.data))

    const lejart = await hiv(k.finance, 'list_overdue_documents', { limit: 3 })
    check(
      `list_overdue_documents: ${lejart.data.totalCount} lejárt tétel, összesen ${lejart.data.totalOverdue?.amount} Ft (első: ${lejart.data.items?.[0]?.documentNo} ${lejart.data.items?.[0]?.customer?.name})`,
      lejart.ok && lejart.data.totalCount >= lejart.data.items.length && lejart.data.items.length <= 3 && /^\d+\.\d{2}$/.test(lejart.data.totalOverdue.amount),
      lejart
    )
    const tilosLejart = await hiv(k.viewer, 'list_overdue_documents', {})
    check('viewer → list_overdue_documents: FORBIDDEN', tilosLejart.error?.code === 'FORBIDDEN', tilosLejart)

    const pdf = await hiv(k.viewer, 'get_document_pdf', { documentNo: 'SZ-2026-000187' })
    const fej = pdf.ok ? new TextDecoder().decode(new Uint8Array(await (await fetch(pdf.data.url)).arrayBuffer()).slice(0, 5)) : ''
    check(`get_document_pdf: saját bizonylat, a link valódi PDF-et ad (${fej})`, pdf.ok && pdf.data.source === 'own' && fej === '%PDF-', pdf)

    szakasz('Díjbekérő és fizetési link (Stripe teszt)')
    const ma = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date()).replace(/-/g, '.')
    const kesz = await szamlazo(`DIJBEKERO|KESZIT|VEVO-1001||${ma}|8|MCP FUSTTESZT TETEL;1;1000`)
    ujDijbekero = kesz.split('|')[1]
    const db = await hiv(k.viewer, 'get_document', { documentNo: ujDijbekero })
    check(
      `${ujDijbekero}: díjbekérő, fizetésre vár, bruttó ${db.data.document?.total?.amount}, végszámla: „${db.data.document?.finalInvoice?.statusLabel}”, nextAction create_payment_link`,
      db.ok && db.data.document.documentType === 'proforma' && db.data.document.total.amount === '1270.00' && db.data.document.finalInvoice?.status === 'none' && db.data.document.nextAction?.tool === 'create_payment_link',
      db
    )
    const tilosLink = await hiv(k.sales, 'create_payment_link', { documentNo: ujDijbekero })
    check('sales → create_payment_link: FORBIDDEN (pénzügyi művelet)', tilosLink.error?.code === 'FORBIDDEN', tilosLink)
    const kulcs = randomUUID()
    const link = await hiv(k.finance, 'create_payment_link', { documentNo: ujDijbekero, idempotencyKey: kulcs })
    const p = link.data.payment
    check(`create_payment_link → ${p?.status}, ${p?.amount?.amount} Ft, Stripe TESZT checkout (${p?.checkoutUrl?.slice(0, 40)}…)`, link.ok && p.status === 'pending' && p.amount.amount === '1270.00' && /checkout\.stripe\.com\/c\/pay\/cs_test_/.test(p.checkoutUrl), link)
    const link2 = await hiv(k.finance, 'create_payment_link', { documentNo: ujDijbekero, idempotencyKey: kulcs })
    const fizetesek = await hiv(k.viewer, 'get_payments', { documentNo: ujDijbekero })
    check(`ugyanazzal az idempotencyKey-jel → ugyanaz a link; get_payments: ${fizetesek.data.items?.length} db`, link2.data.payment?.paymentId === p.paymentId && fizetesek.data.items?.length === 1, { link2, fizetesek })

    szakasz('Fizetési és számlázói hibák')
    const szamlaraLink = await hiv(k.finance, 'create_payment_link', { documentNo: 'SZ-2026-000187' })
    check(`számlára link → VALIDATION: „${szamlaraLink.error?.message}”`, szamlaraLink.error?.code === 'VALIDATION' && szamlaraLink.error.upstream?.system === 'payments-rest', szamlaraLink)
    const { data: fizetett } = await supabase
      .schema('billing')
      .from('szamlak')
      .select('szam')
      .like('szam', 'DB-%')
      .eq('fizetve', true)
      .not('kulso_pdf_utvonal', 'is', null)
      .order('szam', { ascending: false })
      .limit(1)
    const fdb = fizetett?.[0]?.szam
    if (fdb) {
      const mar = await hiv(k.finance, 'create_payment_link', { documentNo: fdb })
      check(`fizetett díjbekérőre (${fdb}) link → INVALID_STATE`, mar.error?.code === 'INVALID_STATE', mar)
      const fd = await hiv(k.viewer, 'get_document', { documentNo: fdb })
      check(`${fdb}: paid, végszámla „${fd.data.document?.finalInvoice?.statusLabel}”, nextAction send_invoice`, fd.data.document?.paid === true && fd.data.document.finalInvoice?.status === 'issued' && fd.data.document.nextAction?.code === 'send_invoice', fd)
      const kpdf = await hiv(k.viewer, 'get_document_pdf', { documentNo: fdb })
      check('a fizetett díjbekérő PDF-je a Számlázz.hu számla (source=szamlazz_hu)', kpdf.data.source === 'szamlazz_hu', kpdf)
    } else {
      console.log('     (nincs Számlázz.hu számlával rendelkező fizetett díjbekérő – a 11-es vagy a 14-es order-to-cash teszt hoz létre ilyet)')
    }
    const nincs = await hiv(k.viewer, 'get_document', { documentNo: 'SZ-2026-999999' })
    check('ismeretlen bizonylat → NOT_FOUND (ERR|E108)', nincs.error?.code === 'NOT_FOUND' && nincs.error.upstream?.raw?.includes('E108'), nincs)
    const nincsFiz = await hiv(k.viewer, 'get_payments', { documentNo: 'DB-2026-999999' })
    check(`ismeretlen díjbekérő fizetései → ${nincsFiz.ok ? 'üres lista' : nincsFiz.error?.code}`, (nincsFiz.ok && nincsFiz.data.items.length === 0) || nincsFiz.error?.code === 'NOT_FOUND', nincsFiz)

    szakasz('Napló')
    const n = await naploSorok('smoke14f-%', kezdetIso)
    check(`minden eszközhívásról van naplósor (${n.length} / ${naplozottHivasok()})`, n.length === naplozottHivasok(), n.length)
    await Promise.all(ROLES.map((r) => k[r].close()))
  } finally {
    szerver.leallit()
    // takarítás: a teszt díjbekérője ne maradjon nyitott tartozásként
    if (ujDijbekero) await szamlazo(`SZAMLA|FIZETVE|${ujDijbekero}|${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date()).replace(/-/g, '.')}`)
  }
  zaras(kezdet, 'Minden ellenőrzés sikeres – a finance MCP szerver kész.')
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
