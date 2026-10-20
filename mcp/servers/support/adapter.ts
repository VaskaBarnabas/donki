// A support szerver legacy-kliense: a Helpdesk SOAP 1.1 szolgáltatás (document/literal, urn:helpdesk:v1, ApiKey a
// SOAP fejlécben). Hibánál SOAP Fault HTTP 500-zal, a faultstring csak a kód (HD-404 stb.).
// Saját, kis XML-kliens: a borítékot kézzel rakjuk össze, a választ a fast-xml-parser olvassa (névtér-előtag nélkül).

import { XMLParser } from 'fast-xml-parser'
import { McpHiba } from '../../kozos/hiba'
import { env } from '../../kozos/kornyezet'

export const RENDSZER = 'helpdesk-soap'

/** SOAP Fault – a lekepezes.ts fordítja kanonikus hibára. */
export class SoapFault extends Error {
  constructor(public readonly kod: string) {
    super(kod)
  }
}

export type LegacyRma = { RmaId: string; TicketId: string; Type: string; Status: string; ReplacementItem?: string; CreatedAt: string }
export type LegacyJegy = {
  TicketId: string
  PartnerTaxNumber: string
  OrderNo?: string
  ProductCode?: string
  Description: string
  Status: string
  CreatedAt: string
  UpdatedAt: string
  Rma?: LegacyRma[]
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false, // minden érték szöveg marad (pl. a 0-val kezdődő azonosítók miatt)
  trimValues: true,
  isArray: (nev) => nev === 'Ticket' || nev === 'Rma',
})

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Egy SOAP művelet; a <Muvelet>Response elem tartalmát adja vissza. */
export async function soap<T>(muvelet: string, mezok: Record<string, string | number | undefined>): Promise<T> {
  const elemek = Object.entries(mezok)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `<hd:${k}>${escape(String(v))}</hd:${k}>`)
    .join('')
  const boritek =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:hd="urn:helpdesk:v1">' +
    `<soap:Header><hd:ApiKey>${escape(env('LEGACY_SUPPORT_KEY'))}</hd:ApiKey></soap:Header>` +
    `<soap:Body><hd:${muvelet}>${elemek}</hd:${muvelet}></soap:Body></soap:Envelope>`

  let res: Response
  try {
    res = await fetch(`${env('SUPPORT_URL')}/api/legacy/support/soap`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `urn:helpdesk:v1#${muvelet}` },
      body: boritek,
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ügyfélszolgálati rendszer nem érhető el, próbáld újra később.', {
      retryable: true,
      upstream: { system: RENDSZER, raw: e instanceof Error ? e.name : 'fetch hiba' },
    })
  }

  const xml = await res.text()
  let body: Record<string, unknown> | undefined
  try {
    body = (parser.parse(xml) as { Envelope?: { Body?: Record<string, unknown> } }).Envelope?.Body
  } catch {
    body = undefined
  }
  if (!body) {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ügyfélszolgálati rendszer érvénytelen választ adott.', { retryable: true, upstream: { system: RENDSZER, raw: `HTTP ${res.status}` } })
  }
  const fault = body.Fault as { faultstring?: string } | undefined
  if (fault) throw new SoapFault(String(fault.faultstring ?? 'HD-500'))
  const valasz = body[`${muvelet}Response`]
  return (valasz && typeof valasz === 'object' ? valasz : {}) as T // üres válaszelemből a parser '' -t ad
}
