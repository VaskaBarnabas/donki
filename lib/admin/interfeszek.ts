// Az admin felület szerver oldali kliensei a modulok SAJÁT interfészeihez.
// Szándékosan nincs közös hívó réteg vagy közös hibaformátum: minden modul a saját protokollján szól,
// a saját hozzáférési kulcsával (a kulcsok csak a szerveren vannak).
// 16. fázis: a címet és a kulcsot a portál integrációs rétege adja (a varázslóban bekötött rendszer).

import 'server-only'
import { XMLParser } from 'fast-xml-parser'
import { kapcsolat } from '@/lib/portal/integraciok'

// ---------------------------------------------------------------- ajánlatmotor – JSON-RPC 2.0

export type RpcValasz<T = unknown> = { result?: T; error?: { code: number; message: string; data?: unknown } }

export async function ajanlatRpc<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<RpcValasz<T>> {
  const k = await kapcsolat('quote')
  const res = await fetch(`${k.url}/api/legacy/quote-rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: { apiKey: k.kulcs, ...params } }),
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
  const k = await kapcsolat('orders')
  const res = await fetch(`${k.url}/api/legacy/orders/${ut}`, {
    method,
    headers: { 'X-Legacy-Key': k.kulcs, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  return res.json()
}

// ---------------------------------------------------------------- számlázás – szöveges protokoll

/**
 * Egy protokoll-mező (sorszám, vevőkód, dátum) ellenőrzése, mielőtt parancssorba kerül: a protokollban nincs escape,
 * így a | ; és a sortörés elcsúsztatná a mezőket vagy új parancsot nyitna. Hibás mezőnél kivételt dob.
 */
export function protokollMezo(ertek: string): string {
  if (!/^[A-Za-z0-9.\-_]{1,40}$/.test(ertek)) throw new Error('Ervenytelen protokoll-mezo')
  return ertek
}

/** Nyers protokoll-parancs; az AUTH sort itt tesszük elé. Visszaad: a nyers válaszsor. */
export async function szamlazoParancs(parancs: string): Promise<string> {
  const k = await kapcsolat('billing')
  const res = await fetch(`${k.url}/api/legacy/billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `AUTH|${k.kulcs}\n${parancs}\n`,
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
  const k = await kapcsolat('payments')
  const res = await fetch(`${k.url}/api/legacy/payments${query}`, {
    method,
    headers: { Authorization: `Bearer ${k.kulcs}`, 'Content-Type': 'application/json' },
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
    `<soap:Header><hd:ApiKey>${xmlEscape((await kapcsolat('support')).kulcs)}</hd:ApiKey></soap:Header>` +
    `<soap:Body><hd:${muvelet}>${elemek}</hd:${muvelet}></soap:Body></soap:Envelope>`

  const res = await fetch(`${(await kapcsolat('support')).url}/api/legacy/support/soap`, {
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
