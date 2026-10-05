/**
 * 9. fázis füstteszt: ügyfélszolgálat SOAP 1.1 (POST /api/legacy/support/soap, GET ?wsdl).
 * A hívásokat egy független SOAP kliens (`soap` npm csomag) a WSDL-ből generálja – ez a WSDL validitását is igazolja.
 * Futó Next.js szervert igényel. A raktári mellékhatásokat (foglalás, visszáru) a végén visszaállítja.
 *
 * Futtatás: npx tsx scripts/smoke/09-support.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as soap from 'soap'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'

process.loadEnvFile('.env.local')
const env = process.env as Record<string, string>
const URL_ = `${env.APP_BASE_URL}/api/legacy/support/soap`
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Hivas = (args: Record<string, unknown>) => Promise<[Record<string, unknown>]>

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}

async function kliens(kulcs: string) {
  const c = await soap.createClientAsync(`${URL_}?wsdl`)
  c.addSoapHeader(`<hd:ApiKey xmlns:hd="urn:helpdesk:v1">${kulcs}</hd:ApiKey>`)
  return c as unknown as Record<string, Hivas> & soap.Client
}

/** A hívás eredménye, vagy a SOAP Fault faultstring-je (pl. "HD-404"). */
async function hiv(c: Record<string, Hivas>, muvelet: string, args: Record<string, unknown>) {
  try {
    const [eredmeny] = await c[`${muvelet}Async`](args)
    return { ok: eredmeny, fault: null as string | null }
  } catch (e) {
    const f = (e as { root?: { Envelope?: { Body?: { Fault?: { faultstring?: string; faultcode?: string } } } } }).root?.Envelope?.Body?.Fault
    if (!f) throw e
    return { ok: null, fault: f.faultstring ?? null, faultcode: f.faultcode }
  }
}

async function aktivFoglalas(ref: string) {
  const { data } = await supabase.schema('inventory').from('reservations').select('db').eq('ref', ref).eq('statusz', 'AKTIV')
  return (data ?? []).reduce((s, r) => s + r.db, 0)
}

async function main() {
  console.log(`9. fázis füstteszt – ügyfélszolgálat SOAP (${URL_})\n`)

  // ---------------------------------------------------------------- WSDL
  const c = await kliens(env.LEGACY_SUPPORT_KEY)
  const leiras = c.describe() as Record<string, Record<string, Record<string, unknown>>>
  const muveletek = Object.keys(leiras.HelpdeskService.HelpdeskPort).sort()
  check(
    'WSDL betölthető egy független SOAP klienssel, 7 művelet',
    JSON.stringify(muveletek) === JSON.stringify(['CheckWarranty', 'CreateTicket', 'GetTicket', 'ListTickets', 'ReceiveRMA', 'StartRMA', 'UpdateTicketStatus']),
    muveletek
  )

  // ---------------------------------------------------------------- hozzáférés és hibák
  const rossz = await hiv(await kliens('rossz-kulcs'), 'GetTicket', { TicketId: 'HJ-000317' })
  check('rossz ApiKey → Fault HD-401 (soap:Client)', rossz.fault === 'HD-401' && String(rossz.faultcode).endsWith('Client'), rossz)
  check('ismeretlen jegy → HD-404', (await hiv(c, 'GetTicket', { TicketId: 'HJ-999999' })).fault === 'HD-404', null)
  check('hibás adószám → HD-422', (await hiv(c, 'CreateTicket', { PartnerTaxNumber: '123', Description: 'x' })).fault === 'HD-422', null)

  const nyers = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: '<nem-soap' })
  check('hibás XML → HTTP 500, Fault HD-422', nyers.status === 500 && (await nyers.text()).includes('<faultstring>HD-422</faultstring>'), nyers.status)

  // ---------------------------------------------------------------- jegyek
  const uj = await hiv(c, 'CreateTicket', {
    PartnerTaxNumber: '32038523-2-19',
    OrderNo: 100035,
    ProductCode: 'TK-00011',
    Description: 'Fusteszt: a monitor villog',
  })
  const ticket = (uj.ok?.Ticket ?? {}) as Record<string, unknown>
  const tid = ticket.TicketId as string
  check('CreateTicket → HJ-…, UJ, xsd:dateTime', /^HJ-\d{6}$/.test(tid) && ticket.Status === 'UJ' && !Number.isNaN(Date.parse(String(ticket.CreatedAt))), uj)

  const get = await hiv(c, 'GetTicket', { TicketId: 'HJ-000321' })
  const seedJegy = get.ok?.Ticket as Record<string, unknown>
  check('GetTicket HJ-000321 → aktív RMA (RMA-2026-0012)', JSON.stringify(seedJegy?.Rma ?? '').includes('RMA-2026-0012'), get)

  const lista = await hiv(c, 'ListTickets', { Status: 'UJ' })
  const jegyek = ([] as Record<string, unknown>[]).concat((lista.ok?.Ticket as Record<string, unknown>[]) ?? [])
  check('ListTickets Status=UJ → az új jegy a listában', jegyek.some((j) => j.TicketId === tid), lista)

  const statusz = await hiv(c, 'UpdateTicketStatus', { TicketId: tid, Status: 'VARAKOZIK' })
  check('UpdateTicketStatus → VARAKOZIK', (statusz.ok?.Ticket as Record<string, unknown>)?.Status === 'VARAKOZIK', statusz)

  // ---------------------------------------------------------------- garancia: mind a négy indokkód a seed eseteivel
  const esetek: [string, number, string, string][] = [
    ['HJ-000317', 100041, 'TK-00002', 'W-OK'],
    ['HJ-000318', 100034, 'TK-00038', 'W-EXP'],
    ['HJ-000319', 100043, 'TK-00013', 'W-NOTDELIVERED'],
    ['HJ-000320', 100999, 'TK-00001', 'W-NOORDER'],
  ]
  for (const [jegyId, orderNo, kod, vart] of esetek) {
    const w = await hiv(c, 'CheckWarranty', { OrderNo: orderNo, ProductCode: kod })
    const valid = w.ok?.Valid === true || w.ok?.Valid === 'true'
    check(`CheckWarranty ${jegyId} (${orderNo}, ${kod}) → ${vart}`, w.ok?.ReasonCode === vart && valid === (vart === 'W-OK'), w)
  }
  const termekNincs = await hiv(c, 'CheckWarranty', { OrderNo: 100041, ProductCode: 'TK-00040' })
  check('CheckWarranty a rendelésben nem szereplő termékre → W-NOORDER', termekNincs.ok?.ReasonCode === 'W-NOORDER', termekNincs)

  // ---------------------------------------------------------------- RMA: csere (FOGLAL) és javítás (beérkezéskor VISSZARU_BE)
  check('StartRMA HJ-000321 (már van aktív RMA) → HD-409', (await hiv(c, 'StartRMA', { TicketId: 'HJ-000321', Type: 'CSERE' })).fault === 'HD-409', null)

  const csere = await hiv(c, 'StartRMA', { TicketId: tid, Type: 'CSERE' })
  const csereRma = csere.ok?.Rma as Record<string, unknown>
  const csereId = csereRma?.RmaId as string
  check('StartRMA CSERE → RMA-…, csere cikk', /^RMA-\d{4}-\d{4}$/.test(csereId) && Number(csereRma?.ReplacementItem) > 0, csere)
  check('CSERE: FOGLAL a raktárban (ref = RMA azonosító)', (await aktivFoglalas(csereId)) === 1, null)
  check('második RMA ugyanarra a jegyre → HD-409', (await hiv(c, 'StartRMA', { TicketId: tid, Type: 'JAVITAS' })).fault === 'HD-409', null)
  check('ReceiveRMA cserére → HD-409', (await hiv(c, 'ReceiveRMA', { RmaId: csereId })).fault === 'HD-409', null)

  const jegy2 = (await hiv(c, 'CreateTicket', { PartnerTaxNumber: '32038523-2-19', OrderNo: 100035, ProductCode: 'TK-00008', Description: 'Fusteszt: javitas' })).ok?.Ticket as Record<string, unknown>
  const javitas = await hiv(c, 'StartRMA', { TicketId: jegy2.TicketId, Type: 'JAVITAS' })
  const javId = (javitas.ok?.Rma as Record<string, unknown>)?.RmaId as string
  check('StartRMA JAVITAS → NYITOTT', (javitas.ok?.Rma as Record<string, unknown>)?.Status === 'NYITOTT', javitas)
  const beerk = await hiv(c, 'ReceiveRMA', { RmaId: javId })
  const { data: mozgas } = await supabase.schema('inventory').from('movements').select('cikk, tipus').eq('ref', javId)
  check('ReceiveRMA → BEERKEZETT + VISSZARU mozgás a raktárban', (beerk.ok?.Rma as Record<string, unknown>)?.Status === 'BEERKEZETT' && mozgas?.[0]?.tipus === 'VISSZARU', { beerk, mozgas })
  check('ReceiveRMA újra → HD-409', (await hiv(c, 'ReceiveRMA', { RmaId: javId })).fault === 'HD-409', null)

  check('UpdateTicketStatus → LEZART', (await hiv(c, 'UpdateTicketStatus', { TicketId: tid, Status: 'LEZART' })).ok !== null, null)
  check('lezárt jegy módosítása → HD-409', (await hiv(c, 'UpdateTicketStatus', { TicketId: tid, Status: 'UJ' })).fault === 'HD-409', null)

  // ---------------------------------------------------------------- takarítás: a teszt foglalása és visszáruja
  await raktarHivas(supabase, { cmd: 'FELOLD', ref: csereId })
  if (mozgas?.[0]) await raktarHivas(supabase, { cmd: 'MOZGAS', cikk: mozgas[0].cikk, tipus: 'KORREKCIO', db: -1, ref: 'SMOKE-09' })

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni (fut a Next.js szerver?): ${e.message}`)
  process.exit(1)
})
