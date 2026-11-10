// A „nyers” ágens eszközei (19. fázis, a mérés „eredeti esete”): interfészenként egy eszköz, MCP nélkül. A szállítást
// az eszköz intézi (HTTP-hívás, SOAP POST, szöveges protokoll, a raktársornál küldés + a válasz megvárása a korrelációs
// azonosítóval), és a kulcsot is a végrehajtó teszi a kérésbe – a modell nem látja. A kérés formáját, a mezőket, a
// kódokat és a hibák jelentését a modellnek kell tudnia a legacy-docs/ leírásából (legacy_doc). Ez a méltányos határ:
// a „vezeték” nem a mérés tárgya, a protokoll ismerete igen.
//
// Csak a mérőfuttatóból (parancssor) fut: a rendszerek legacy kulcsait a .env.local / .env.stack adja; a portál ezeket
// nem tölti be, és a nyers ágenst a front-desk soha nem kínálja fel.

import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EszkozForras, HivasEredmeny, Kockazat, McpEszkoz } from '../kozos/mcp'

const DOKS = join(process.cwd(), 'legacy-docs')
const MAX_VALASZ = 6000
const cim = (nev: string, alap: string) => process.env[nev] ?? alap
const kulcs = (nev: string) => {
  const v = process.env[nev]
  if (!v) throw new Error(`Hiányzó kulcs a nyers eszközhöz: ${nev}`)
  return v
}

type Nyers = Omit<McpEszkoz, 'szerver' | 'kockazat' | 'idempotens'> & {
  /** hívásonkénti minősítés: olvas-e (a jóváhagyási kapuhoz) */
  olvas: (args: Record<string, unknown>) => boolean
  futtat: (args: Record<string, unknown>) => Promise<string>
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))
const ut = (v: unknown) => s(v).replace(/^\/+/, '')

async function http(url: string, init: RequestInit): Promise<string> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) })
  return `HTTP ${r.status}\n${await r.text()}`
}

/** Az eszközlista (lustán: a dokumentációs könyvtárat csak a nyers ágens első használatakor olvassa). */
const eszkozLista = (): Nyers[] => [
  {
    nev: 'legacy_doc',
    cim: 'Dokumentáció',
    leiras: 'Read the documentation of a legacy system (Markdown or WSDL).',
    schema: { type: 'object', properties: { name: { type: 'string', enum: readdirSync(DOKS) } }, required: ['name'] },
    olvas: () => true,
    futtat: async (a) => readFileSync(join(DOKS, s(a.name).replace(/[^\w.-]/g, '')), 'utf8'),
  },
  {
    nev: 'crm_rest',
    cim: 'CRM / katalógus (PostgREST)',
    leiras: 'Call the CRM and catalogue PostgREST interface. path: table and query, e.g. "partners?name=ilike.*bakony*". profile: "crm" or "catalog".',
    schema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PATCH'] },
        path: { type: 'string' },
        profile: { type: 'string', enum: ['crm', 'catalog'] },
        body: { type: 'object', description: 'JSON body for POST/PATCH' },
      },
      required: ['method', 'path', 'profile'],
    },
    olvas: (a) => s(a.method).toUpperCase() === 'GET',
    futtat: (a) => {
      const iras = s(a.method).toUpperCase() !== 'GET'
      return http(`${cim('CRM_API_URL', 'http://localhost:4100')}/${ut(a.path)}`, {
        method: s(a.method).toUpperCase() || 'GET',
        headers: {
          Authorization: `Bearer ${kulcs('CRM_API_KEY')}`,
          [iras ? 'Content-Profile' : 'Accept-Profile']: s(a.profile) || 'crm',
          ...(iras ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
        },
        body: iras && a.body ? JSON.stringify(a.body) : undefined,
      })
    },
  },
  {
    nev: 'ajanlat_rpc',
    cim: 'Ajánlatmotor (JSON-RPC)',
    leiras: 'Call the quote engine JSON-RPC 2.0 interface. method: e.g. "quote.list"; params: the method parameters (without apiKey).',
    schema: { type: 'object', properties: { method: { type: 'string' }, params: { type: 'object' } }, required: ['method'] },
    olvas: (a) => /\.(get|list|price|find|search|calculate)/i.test(s(a.method)),
    futtat: (a) =>
      http(`${cim('QUOTE_URL', 'http://localhost:4101')}/api/legacy/quote-rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: s(a.method), params: { ...((a.params as object) ?? {}), apiKey: kulcs('LEGACY_QUOTE_KEY') } }),
      }),
  },
  {
    nev: 'rendeles_http',
    cim: 'Rendeléskezelő (HTTP homlokzat)',
    leiras: 'Call the order system old HTTP facade under /api/legacy/orders/. path: e.g. "list?state=ROGZITETT", "100045", "100045/approve".',
    schema: {
      type: 'object',
      properties: { method: { type: 'string', enum: ['GET', 'POST'] }, path: { type: 'string' }, body: { type: 'object' } },
      required: ['method', 'path'],
    },
    olvas: (a) => s(a.method).toUpperCase() === 'GET',
    futtat: (a) =>
      http(`${cim('ORDERS_URL', 'http://localhost:4102')}/api/legacy/orders/${ut(a.path)}`, {
        method: s(a.method).toUpperCase() || 'GET',
        headers: { 'X-Legacy-Key': kulcs('LEGACY_ORDERS_KEY'), ...(a.body ? { 'Content-Type': 'application/json' } : {}) },
        body: a.body ? JSON.stringify(a.body) : undefined,
      }),
  },
  {
    nev: 'raktar_sor',
    cim: 'Raktár (üzenetsor)',
    leiras: 'Send a command to the warehouse command queue and wait for its reply (the correlation id is added automatically). command: the message object, e.g. {"cmd":"LEKERDEZ","cikk":4717}.',
    schema: { type: 'object', properties: { command: { type: 'object' } }, required: ['command'] },
    olvas: (a) => /^(LEKERDEZ|LISTA|KARTON)$/i.test(s((a.command as Record<string, unknown> | undefined)?.cmd)),
    futtat: async (a) => {
      const url = cim('INVENTORY_API_URL', 'http://localhost:54106')
      const fej = { Authorization: `Bearer ${kulcs('INVENTORY_API_KEY')}`, 'Content-Profile': 'pgmq_public', 'Content-Type': 'application/json' }
      const corr = `nyers-${randomBytes(5).toString('hex')}`
      const k = await fetch(`${url}/rpc/send`, { method: 'POST', headers: fej, body: JSON.stringify({ queue_name: 'inventory_commands', message: { ...((a.command as object) ?? {}), corr }, sleep_seconds: 0 }) })
      if (!k.ok) return `HTTP ${k.status}\n${await k.text()}`
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500))
        const r = await fetch(`${url}/rpc/read`, { method: 'POST', headers: fej, body: JSON.stringify({ queue_name: 'inventory_replies', sleep_seconds: 0, n: 100 }) })
        const sajat = ((await r.json()) as { msg_id: number; message: { corr?: string } }[]).find((m) => m.message?.corr === corr)
        if (sajat) {
          await fetch(`${url}/rpc/delete`, { method: 'POST', headers: fej, body: JSON.stringify({ queue_name: 'inventory_replies', message_id: sajat.msg_id }) })
          return JSON.stringify(sajat.message)
        }
      }
      return 'Nincs válasz 20 mp alatt (a raktár nem dolgozta fel a parancsot).'
    },
  },
  {
    nev: 'szamlazo_parancs',
    cim: 'Számlázó (szöveges protokoll)',
    leiras: 'Send one command line to the invoicing system text protocol (the AUTH line is added automatically), e.g. "SZAMLA|LEKER|SZ-2026-000185".',
    schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    olvas: (a) => /^(PARTNER\|(KERES|ADAT)|SZAMLA\|(LEKER|LEJART|LISTA|ADATLAP|TETELEK|PDF|KULSO\|[^|]+$))/i.test(s(a.command).trim()),
    futtat: (a) =>
      http(`${cim('BILLING_URL', 'http://localhost:4103')}/api/legacy/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: `AUTH|${kulcs('LEGACY_BILLING_KEY')}\n${s(a.command).split(/\r?\n/)[0]}`,
      }),
  },
  {
    nev: 'fizetes_rest',
    cim: 'Fizetés (REST)',
    leiras: 'Call the payments REST interface under /api/legacy/payments. path: e.g. "?invoiceRef=DB-2026-000031" or "" (POST creates a payment link).',
    schema: {
      type: 'object',
      properties: { method: { type: 'string', enum: ['GET', 'POST'] }, path: { type: 'string' }, body: { type: 'object' } },
      required: ['method'],
    },
    olvas: (a) => s(a.method).toUpperCase() === 'GET',
    futtat: (a) =>
      http(`${cim('PAYMENTS_URL', 'http://localhost:4104')}/api/legacy/payments${s(a.path) && !s(a.path).startsWith('?') ? `/${ut(a.path)}` : s(a.path)}`, {
        method: s(a.method).toUpperCase() || 'GET',
        headers: { Authorization: `Bearer ${kulcs('LEGACY_PAYMENTS_KEY')}`, 'Content-Type': 'application/json' },
        body: a.body ? JSON.stringify(a.body) : undefined,
      }),
  },
  {
    nev: 'helpdesk_soap',
    cim: 'Helpdesk (SOAP)',
    leiras: 'Call a helpdesk SOAP 1.1 operation. operation: e.g. "GetTicket"; body: the XML of the operation element inside soap:Body (the envelope and the ApiKey header are added automatically).',
    schema: { type: 'object', properties: { operation: { type: 'string' }, body: { type: 'string' } }, required: ['operation', 'body'] },
    olvas: (a) => /^(Get|List|Check|Search|Find)/.test(s(a.operation)),
    futtat: (a) =>
      http(`${cim('SUPPORT_URL', 'http://localhost:4105')}/api/legacy/support/soap`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `urn:helpdesk:v1#${s(a.operation)}` },
        body: `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:hd="urn:helpdesk:v1"><soap:Header><hd:ApiKey>${kulcs('LEGACY_SUPPORT_KEY')}</hd:ApiKey></soap:Header><soap:Body>${s(a.body)}</soap:Body></soap:Envelope>`,
      }),
  },
]

/** A nyers ágens eszközforrása: ugyanaz a felület, mint az MCP-kapcsolaté, így a gráf (jóváhagyás, napló) változatlan. */
export class NyersForras implements EszkozForras {
  private readonly lista = eszkozLista()
  readonly eszkozok: McpEszkoz[] = this.lista.map((e) => ({ nev: e.nev, cim: e.cim, leiras: e.leiras, schema: e.schema, szerver: 'helyi' as const, kockazat: 'write' as Kockazat, idempotens: false }))

  eszkoz(nev: string) {
    return this.eszkozok.find((e) => e.nev === nev)
  }

  hivasKockazat(nev: string, args: Record<string, unknown>): Kockazat {
    return this.lista.find((e) => e.nev === nev)?.olvas(args) ? 'read' : 'write'
  }

  async hiv(nev: string, args: Record<string, unknown>): Promise<HivasEredmeny> {
    const e = this.lista.find((x) => x.nev === nev)
    if (!e) return { ok: false, szoveg: `Nincs ilyen eszköz: ${nev}`, hibakod: 'UNKNOWN_TOOL' }
    try {
      const szoveg = await e.futtat(args)
      // a protokoll szintű hibát (HTTP 4xx/5xx, ERR|…, soap:Fault, JSON-RPC error) nem fordítjuk le – az a modell dolga
      return { ok: !/^HTTP [45]\d\d/.test(szoveg), szoveg: szoveg.slice(0, MAX_VALASZ), hibakod: /^HTTP [45]\d\d/.test(szoveg) ? 'HTTP_ERROR' : null }
    } catch (err) {
      return { ok: false, szoveg: `Hiba: ${err instanceof Error ? err.message : String(err)}`, hibakod: 'ERROR' }
    }
  }

  async zar() {}
}
