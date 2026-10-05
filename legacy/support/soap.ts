// SOAP 1.1 boríték: kérés feldolgozása (fast-xml-parser) és válasz / Fault összeállítása.

import { XMLParser } from 'fast-xml-parser'

export const NS = 'urn:helpdesk:v1'

export type HdKod = 'HD-401' | 'HD-404' | 'HD-409' | 'HD-422' | 'HD-500'

/** Szűkszavú SOAP Fault: a faultstring csak a kód. */
export class HdHiba extends Error {
  constructor(public readonly kod: HdKod) {
    super(kod)
  }
}

export type SoapKeres = { muvelet: string; apiKey: string | null; parameterek: Record<string, unknown> }

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false, // minden érték szöveg marad; a műveletek maguk validálnak
  trimValues: true,
})

export function kerestFeldolgoz(xml: string): SoapKeres {
  let doc: Record<string, unknown>
  try {
    doc = parser.parse(xml, true) as Record<string, unknown>
  } catch {
    throw new HdHiba('HD-422')
  }
  const envelope = doc.Envelope as Record<string, unknown> | undefined
  const body = envelope?.Body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') throw new HdHiba('HD-422')

  const [muvelet] = Object.keys(body)
  if (!muvelet) throw new HdHiba('HD-422')
  const header = envelope?.Header as Record<string, unknown> | undefined
  const apiKey = header && typeof header === 'object' && header.ApiKey !== undefined ? String(header.ApiKey) : null
  const p = body[muvelet]
  return { muvelet, apiKey, parameterek: p && typeof p === 'object' ? (p as Record<string, unknown>) : {} }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type XmlErtek = string | number | boolean | null | undefined | XmlObjektum | XmlObjektum[]
export type XmlObjektum = { [elem: string]: XmlErtek }

/** Egyszerű szerializáló: a null/undefined mező kimarad, a tömb ismételt elemet ad. */
function elemek(o: XmlObjektum): string {
  return Object.entries(o)
    .map(([nev, ertek]) => {
      if (ertek === null || ertek === undefined) return ''
      if (Array.isArray(ertek)) return ertek.map((e) => `<hd:${nev}>${elemek(e)}</hd:${nev}>`).join('')
      if (typeof ertek === 'object') return `<hd:${nev}>${elemek(ertek)}</hd:${nev}>`
      return `<hd:${nev}>${escape(String(ertek))}</hd:${nev}>`
    })
    .join('')
}

function boritek(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:hd="${NS}">` +
    `<soap:Body>${body}</soap:Body></soap:Envelope>`
  )
}

export function valasz(muvelet: string, tartalom: XmlObjektum): string {
  return boritek(`<hd:${muvelet}Response>${elemek(tartalom)}</hd:${muvelet}Response>`)
}

export function fault(kod: HdKod): string {
  const faultcode = kod === 'HD-500' ? 'soap:Server' : 'soap:Client'
  return boritek(`<soap:Fault><faultcode>${faultcode}</faultcode><faultstring>${kod}</faultstring></soap:Fault>`)
}
