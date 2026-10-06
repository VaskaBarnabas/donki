// Az admin felület szerver oldali kliensei a modulok SAJÁT interfészeihez.
// Szándékosan nincs közös hívó réteg vagy közös hibaformátum: minden modul a saját protokollján szól,
// a saját hozzáférési kulcsával (a kulcsok csak a szerveren vannak).

import 'server-only'
import { XMLParser } from 'fast-xml-parser'

function alap(): string {
  return `${process.env.APP_BASE_URL}/api/legacy`
}

// ---------------------------------------------------------------- ajánlatmotor – JSON-RPC 2.0

export type RpcValasz<T = unknown> = { result?: T; error?: { code: number; message: string; data?: unknown } }

export async function ajanlatRpc<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<RpcValasz<T>> {
  const res = await fetch(`${alap()}/quote-rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: { apiKey: process.env.LEGACY_QUOTE_KEY, ...params } }),
    cache: 'no-store',
  })
  return res.json()
}

export function rpcHibaSzoveg(e: NonNullable<RpcValasz['error']>): string {
  return `${e.code} ${e.message}${e.data ? ` ${JSON.stringify(e.data)}` : ''}`
}

// ---------------------------------------------------------------- rendelések – régi stílusú homlokzat

export type HomlokzatValasz<T = Record<string, unknown>> = { success: true; data: T } | { success: false; msg: string }

export async function rendelesHomlokzat<T = Record<string, unknown>>(
  method: 'GET' | 'POST',
  ut: string,
  body?: unknown
): Promise<HomlokzatValasz<T>> {
  const res = await fetch(`${alap()}/orders/${ut}`, {
    method,
    headers: { 'X-Legacy-Key': process.env.LEGACY_ORDERS_KEY ?? '', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  return res.json()
}

// ---------------------------------------------------------------- számlázás – szöveges protokoll

/** Nyers protokoll-parancs; az AUTH sort itt tesszük elé. Visszaad: a nyers válaszsor. */
export async function szamlazoParancs(parancs: string): Promise<string> {
  const res = await fetch(`${alap()}/billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `AUTH|${process.env.LEGACY_BILLING_KEY ?? ''}\n${parancs}\n`,
    cache: 'no-store',
  })
  return (await res.text()).trim()
}

// ---------------------------------------------------------------- fizetés – REST

export async function fizetesRest<T = Record<string, unknown>>(
  method: 'GET' | 'POST',
  query = '',
  body?: unknown
): Promise<{ status: number; body: T & { error?: { type: string; message: string } } }> {
  const res = await fetch(`${alap()}/payments${query}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.LEGACY_PAYMENTS_KEY ?? ''}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  return { status: res.status, body: await res.json() }
}

// ---------------------------------------------------------------- ügyfélszolgálat – SOAP 1.1

const soapParser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (nev) => nev === 'Ticket' || nev === 'Rma',
})

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type SoapValasz = { ok: Record<string, unknown> | null; fault: string | null }

export async function helpdeskSoap(muvelet: string, parameterek: Record<string, string | number | null | undefined>): Promise<SoapValasz> {
  const elemek = Object.entries(parameterek)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<hd:${k}>${xmlEscape(String(v))}</hd:${k}>`)
    .join('')
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:hd="urn:helpdesk:v1">' +
    `<soap:Header><hd:ApiKey>${xmlEscape(process.env.LEGACY_SUPPORT_KEY ?? '')}</hd:ApiKey></soap:Header>` +
    `<soap:Body><hd:${muvelet}>${elemek}</hd:${muvelet}></soap:Body></soap:Envelope>`

  const res = await fetch(`${alap()}/support/soap`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `urn:helpdesk:v1#${muvelet}` },
    body: xml,
    cache: 'no-store',
  })
  const doc = soapParser.parse(await res.text()) as { Envelope?: { Body?: Record<string, unknown> } }
  const body = doc.Envelope?.Body ?? {}
  const fault = body.Fault as { faultstring?: string } | undefined
  if (fault) return { ok: null, fault: String(fault.faultstring ?? 'SOAP Fault') }
  return { ok: (body[`${muvelet}Response`] as Record<string, unknown>) ?? {}, fault: null }
}
