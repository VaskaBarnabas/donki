// A sales szerver legacy-kliense: az ajánlatmotor JSON-RPC 2.0 interfésze (kulcs a paraméterek között,
// mindig HTTP 200, a hiba az `error` mezőben). A CRM és a katalógus a közös törzsadat-modulból jön.

import { McpHiba } from '../../kozos/hiba'
import { env } from '../../kozos/kornyezet'

export const RENDSZER = 'quote-jsonrpc'

export type RpcHiba = { code: number; message: string; data?: unknown }

/** A JSON-RPC `error` válasza – a lekepezes.ts fordítja kanonikus hibára. */
export class RpcHibaValasz extends Error {
  constructor(public readonly hiba: RpcHiba) {
    super(`${hiba.code} ${hiba.message}`)
  }
}

export type LegacyAjanlat = {
  id: string
  partnerId: string
  templateId: number
  createdOn: string
  validUntil: string
  status: string
  totalNet: number
  totalDiscountPct: number
  approvalReason: string | null
  approvedBy: string | null
  approvedOn: string | null
  orderRef: string | null
  lines?: { lineId: number; productCode: string; qty: number; unitPrice: number; lineDiscountPct: number; lineNet: number | null }[]
  // csak a quote.calculate válaszában; FIGYELEM: a totalGross a kedvezmények előtti listaár-összeg, nem ÁFÁ-s bruttó
  totalGross?: number
  approvalRequired?: boolean
  approvalLimitPct?: number
}

let kovetkezoId = 1

export async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${env('QUOTE_URL')}/api/legacy/quote-rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: kovetkezoId++, method, params: { apiKey: env('LEGACY_QUOTE_KEY'), ...params } }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ajánlatkezelő rendszer nem érhető el, próbáld újra később.', {
      retryable: true,
      upstream: { system: RENDSZER, raw: e instanceof Error ? e.name : 'fetch hiba' },
    })
  }
  let v: { result?: T; error?: RpcHiba }
  try {
    v = await res.json()
  } catch {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'Az ajánlatkezelő rendszer érvénytelen választ adott.', {
      retryable: true,
      upstream: { system: RENDSZER, raw: `HTTP ${res.status}` },
    })
  }
  if (v.error) throw new RpcHibaValasz(v.error)
  return v.result as T
}
