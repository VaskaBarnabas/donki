// A Helpdesk SOAP szolgáltatás műveletei. Saját séma: support (HJ-000321, RMA-2026-0012, xsd:dateTime).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { raktarParancs, rendelesTetelei, teljesitesIdeje, termek } from './kulso'
import { HdHiba, type XmlObjektum } from './soap'

type TicketRow = {
  id: string
  partner_tax_number: string
  order_no: number | null
  product_code: string | null
  leiras: string
  statusz: string
  created_at: string
  updated_at: string
}

type RmaRow = { id: string; ticket_id: string; tipus: string; statusz: string; csere_cikk: number | null; created_at: string }

const STATUSZOK = ['UJ', 'FOLYAMATBAN', 'VARAKOZIK', 'LEZART']
const RMA_TIPUSOK = ['CSERE', 'JAVITAS']

// ---------------------------------------------------------------- segédek

function szoveg(p: Record<string, unknown>, nev: string, kotelezo = true): string | null {
  const v = p[nev]
  const s = v === undefined || v === null ? '' : String(v).trim()
  if (!s) {
    if (kotelezo) throw new HdHiba('HD-422')
    return null
  }
  return s
}

function egesz(p: Record<string, unknown>, nev: string, kotelezo = true): number | null {
  const s = szoveg(p, nev, kotelezo)
  if (s === null) return null
  if (!/^\d+$/.test(s)) throw new HdHiba('HD-422')
  return Number(s)
}

function xsdIdo(ts: string): string {
  return new Date(ts).toISOString()
}

function db(): SupabaseClient {
  return createServiceClient()
}

function hiba(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function rmaXml(r: RmaRow): XmlObjektum {
  return {
    RmaId: r.id,
    TicketId: r.ticket_id,
    Type: r.tipus,
    Status: r.statusz,
    ReplacementItem: r.csere_cikk,
    CreatedAt: xsdIdo(r.created_at),
  }
}

function jegyXml(t: TicketRow, rmak: RmaRow[] = []): XmlObjektum {
  return {
    TicketId: t.id,
    PartnerTaxNumber: t.partner_tax_number,
    OrderNo: t.order_no,
    ProductCode: t.product_code,
    Description: t.leiras,
    Status: t.statusz,
    CreatedAt: xsdIdo(t.created_at),
    UpdatedAt: xsdIdo(t.updated_at),
    Rma: rmak.map(rmaXml),
  }
}

async function jegy(supabase: SupabaseClient, id: string): Promise<TicketRow> {
  const { data, error } = await supabase.schema('support').from('tickets').select('*').eq('id', id).maybeSingle()
  hiba(error)
  if (!data) throw new HdHiba('HD-404')
  return data as TicketRow
}

async function jegyRmai(supabase: SupabaseClient, ticketIds: string[]): Promise<RmaRow[]> {
  if (ticketIds.length === 0) return []
  const { data, error } = await supabase.schema('support').from('rma').select('*').in('ticket_id', ticketIds).order('created_at')
  hiba(error)
  return (data ?? []) as RmaRow[]
}

async function jegyModosit(supabase: SupabaseClient, id: string, mezok: Partial<TicketRow>): Promise<TicketRow> {
  const { data, error } = await supabase
    .schema('support')
    .from('tickets')
    .update({ ...mezok, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  hiba(error)
  return data as TicketRow
}

// ---------------------------------------------------------------- műveletek

async function createTicket(p: Record<string, unknown>): Promise<XmlObjektum> {
  const adoszam = szoveg(p, 'PartnerTaxNumber')!
  if (!/^\d{8}-\d-\d{2}$/.test(adoszam)) throw new HdHiba('HD-422')
  const termekkod = szoveg(p, 'ProductCode', false)
  if (termekkod && !/^TK-\d{5}$/.test(termekkod)) throw new HdHiba('HD-422')

  const { data, error } = await db()
    .schema('support')
    .from('tickets')
    .insert({
      partner_tax_number: adoszam,
      order_no: egesz(p, 'OrderNo', false),
      product_code: termekkod,
      leiras: szoveg(p, 'Description')!,
    })
    .select('*')
    .single()
  hiba(error)
  return { Ticket: jegyXml(data as TicketRow) }
}

async function getTicket(p: Record<string, unknown>): Promise<XmlObjektum> {
  const supabase = db()
  const t = await jegy(supabase, szoveg(p, 'TicketId')!)
  return { Ticket: jegyXml(t, await jegyRmai(supabase, [t.id])) }
}

async function listTickets(p: Record<string, unknown>): Promise<XmlObjektum> {
  const statusz = szoveg(p, 'Status', false)
  if (statusz && !STATUSZOK.includes(statusz)) throw new HdHiba('HD-422')
  const adoszam = szoveg(p, 'PartnerTaxNumber', false)

  const supabase = db()
  let q = supabase.schema('support').from('tickets').select('*').order('id', { ascending: false }).limit(200)
  if (statusz) q = q.eq('statusz', statusz)
  if (adoszam) q = q.eq('partner_tax_number', adoszam)
  const { data, error } = await q
  hiba(error)
  const jegyek = (data ?? []) as TicketRow[]
  const rmak = await jegyRmai(supabase, jegyek.map((t) => t.id))
  return { Ticket: jegyek.map((t) => jegyXml(t, rmak.filter((r) => r.ticket_id === t.id))) }
}

async function updateTicketStatus(p: Record<string, unknown>): Promise<XmlObjektum> {
  const statusz = szoveg(p, 'Status')!
  if (!STATUSZOK.includes(statusz)) throw new HdHiba('HD-422')
  const supabase = db()
  const t = await jegy(supabase, szoveg(p, 'TicketId')!)
  if (t.statusz === 'LEZART') throw new HdHiba('HD-409')
  const friss = await jegyModosit(supabase, t.id, { statusz })
  return { Ticket: jegyXml(friss, await jegyRmai(supabase, [t.id])) }
}

// Garancia: a teljesítés (SZALLITVA) ideje a rendelési homlokzatból + a katalógus garanciaideje.
async function checkWarranty(p: Record<string, unknown>): Promise<XmlObjektum> {
  const orderNo = egesz(p, 'OrderNo')!
  const termekkod = szoveg(p, 'ProductCode')!

  const tetelek = await rendelesTetelei(orderNo)
  if (!tetelek || !tetelek.includes(termekkod)) return { Valid: false, ReasonCode: 'W-NOORDER' }

  const teljesites = await teljesitesIdeje(orderNo)
  if (!teljesites) return { Valid: false, ReasonCode: 'W-NOTDELIVERED' }

  const t = await termek(db(), termekkod)
  if (!t) return { Valid: false, ReasonCode: 'W-NOORDER' }

  const lejar = new Date(teljesites)
  lejar.setUTCMonth(lejar.getUTCMonth() + t.warranty_months)
  const ervenyes = Date.now() <= lejar.getTime()
  return {
    Valid: ervenyes,
    ReasonCode: ervenyes ? 'W-OK' : 'W-EXP',
    DeliveredAt: xsdIdo(teljesites),
    WarrantyMonths: t.warranty_months,
    ExpiresAt: lejar.toISOString(),
  }
}

// RMA indítása. Csere: FOGLAL a raktárnak (1 db, ref = RMA azonosító). Javítás: a VISSZARU_BE a ReceiveRMA-nál.
async function startRma(p: Record<string, unknown>): Promise<XmlObjektum> {
  const tipus = szoveg(p, 'Type')!
  if (!RMA_TIPUSOK.includes(tipus)) throw new HdHiba('HD-422')
  const supabase = db()
  const t = await jegy(supabase, szoveg(p, 'TicketId')!)
  if (t.statusz === 'LEZART') throw new HdHiba('HD-409')
  if ((await jegyRmai(supabase, [t.id])).some((r) => r.statusz !== 'LEZART')) throw new HdHiba('HD-409')
  if (!t.product_code) throw new HdHiba('HD-422')

  let cikk: number | null = null
  if (tipus === 'CSERE') {
    cikk = (await termek(supabase, t.product_code))?.raktari_kod ?? null
    if (!cikk) throw new HdHiba('HD-422')
  }

  const { data, error } = await supabase
    .schema('support')
    .from('rma')
    .insert({ ticket_id: t.id, tipus, csere_cikk: cikk })
    .select('*')
    .single()
  hiba(error)
  const rma = data as RmaRow

  if (tipus === 'CSERE') {
    const v = await raktarParancs(supabase, { cmd: 'FOGLAL', cikk, db: 1, ref: rma.id })
    if (v?.status !== 'OK') {
      await supabase.schema('support').from('rma').delete().eq('id', rma.id)
      throw new HdHiba(v?.hibakod === 'R-03' ? 'HD-409' : 'HD-500')
    }
  }

  if (t.statusz === 'UJ') await jegyModosit(supabase, t.id, { statusz: 'FOLYAMATBAN' })
  return { Rma: rmaXml(rma) }
}

// Javításra beküldött termék beérkezése: VISSZARU_BE a raktárnak, az RMA BEERKEZETT lesz.
async function receiveRma(p: Record<string, unknown>): Promise<XmlObjektum> {
  const supabase = db()
  const { data, error } = await supabase.schema('support').from('rma').select('*').eq('id', szoveg(p, 'RmaId')!).maybeSingle()
  hiba(error)
  if (!data) throw new HdHiba('HD-404')
  const rma = data as RmaRow
  if (rma.tipus !== 'JAVITAS' || rma.statusz !== 'NYITOTT') throw new HdHiba('HD-409')

  const t = await jegy(supabase, rma.ticket_id)
  const cikk = t.product_code ? (await termek(supabase, t.product_code))?.raktari_kod : null
  if (!cikk) throw new HdHiba('HD-422')

  const v = await raktarParancs(supabase, { cmd: 'VISSZARU_BE', cikk, db: 1, ref: rma.id })
  if (v?.status !== 'OK') throw new HdHiba('HD-500')

  const { data: friss, error: modHiba } = await supabase
    .schema('support')
    .from('rma')
    .update({ statusz: 'BEERKEZETT' })
    .eq('id', rma.id)
    .select('*')
    .single()
  hiba(modHiba)
  return { Rma: rmaXml(friss as RmaRow) }
}

export const MUVELETEK: Record<string, (p: Record<string, unknown>) => Promise<XmlObjektum>> = {
  CreateTicket: createTicket,
  GetTicket: getTicket,
  ListTickets: listTickets,
  UpdateTicketStatus: updateTicketStatus,
  CheckWarranty: checkWarranty,
  StartRMA: startRma,
  ReceiveRMA: receiveRma,
}
