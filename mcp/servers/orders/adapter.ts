// Az orders szerver legacy-kliense: a régi rendelési homlokzat (HTTP, X-Legacy-Key, mindig 200 +
// {"success":…}).
// Itt még legacy formátumok vannak; a kanonikus alakra a lekepezes.ts fordít.

import { McpHiba } from '../../kozos/hiba'
import { env } from '../../kozos/kornyezet'

export const RENDSZER = 'orders-facade'

export type HomlokzatValasz<T> = { success: true; data: T } | { success: false; msg: string }

export type LegacySor = {
  order_no: number
  quote_ref: string | null
  partner_id: string
  state: string
  process_instance_id: string | null
  invoice_ref: string | null
  created_at: string
  updated_at: string
}

export type LegacyRendeles = LegacySor & {
  lines: { productCode: string; qty: number; unitPrice: number }[]
  current_task: { key: string; name: string } | null
}

export type LegacySzallitas = { carrier: string; tracking_no: string | null; carrier_status: string; eta: string | null; updated_at: string }

export type LegacyTortenet = {
  from_state: string | null
  to_state: string
  action: string
  ok: boolean
  reason: string | null
  detail: string | null
  ts: string
}

/** Egy homlokzat-hívás. A hálózati hiba és a nem JSON válasz itt lesz kanonikus hiba; a `success:false` nem. */
export async function homlokzat<T>(method: 'GET' | 'POST', ut: string, body?: unknown): Promise<HomlokzatValasz<T>> {
  let res: Response
  try {
    res = await fetch(`${env('ORDERS_URL')}/api/legacy/orders/${ut}`, {
      method,
      headers: { 'X-Legacy-Key': env('LEGACY_ORDERS_KEY'), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A rendeléskezelő rendszer nem érhető el, próbáld újra később.', {
      retryable: true,
      upstream: { system: RENDSZER, raw: e instanceof Error ? e.name : 'fetch hiba' },
    })
  }
  try {
    return (await res.json()) as HomlokzatValasz<T>
  } catch {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A rendeléskezelő rendszer érvénytelen választ adott.', {
      retryable: true,
      upstream: { system: RENDSZER, raw: `HTTP ${res.status}` },
    })
  }
}

// A katalógus (cikkszám → termékkód, ár) és a CRM (vevő neve, csoportja) a közös törzsadat-modulból jön.
export { ar, katalogus, vevok, type Vevo } from '../../kozos/torzsadat'
