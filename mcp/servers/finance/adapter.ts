// A finance szerver legacy-kliensei:
//   számlázó – szöveges protokoll (AUTH sor + egy parancssor, válasz: OK|… vagy ERR|kód|SZÖVEG, mindig HTTP 200)
//   fizetés  – „modern” REST (Bearer, valódi HTTP státuszok, {"error":{"type","message"}})

import { McpHiba } from '../../kozos/hiba'
import { env } from '../../kozos/kornyezet'

export const SZAMLAZO = 'billing-text-protocol'
export const FIZETES = 'payments-rest'

/** A számlázó ERR válasza – a lekepezes.ts fordítja kanonikus hibára. */
export class SzamlazoHiba extends Error {
  constructor(
    public readonly kod: string,
    public readonly szoveg: string
  ) {
    super(`ERR|${kod}|${szoveg}`)
  }
}

/** Egy protokoll-parancs; siker esetén az OK utáni mezők. A mezőkben nem lehet | és ; (a protokollban nincs escape). */
export async function szamlazo(...mezok: string[]): Promise<string[]> {
  if (mezok.some((m) => /[|;\r\n]/.test(m))) throw new McpHiba('VALIDATION', 'A megadott azonosító nem tartalmazhat | vagy ; karaktert.')
  let res: Response
  try {
    res = await fetch(`${env('BILLING_URL')}/api/legacy/billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `AUTH|${env('LEGACY_BILLING_KEY')}\n${mezok.join('|')}`,
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A számlázó rendszer nem érhető el, próbáld újra később.', {
      retryable: true,
      upstream: { system: SZAMLAZO, raw: e instanceof Error ? e.name : 'fetch hiba' },
    })
  }
  const sor = (await res.text()).trim().split(/\r?\n/)[0] ?? ''
  const [eleje, ...tobbi] = sor.split('|')
  if (eleje === 'OK') return tobbi
  if (eleje === 'ERR') throw new SzamlazoHiba(tobbi[0] ?? '', tobbi.slice(1).join('|'))
  throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A számlázó rendszer érvénytelen választ adott.', { retryable: true, upstream: { system: SZAMLAZO, raw: sor.slice(0, 200) } })
}

export type LegacyFizetes = {
  id: string
  invoiceRef: string
  status: 'CREATED' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'
  url: string | null
  amountMinor: number
  currency: string
  createdAt: string
  updatedAt: string
}

/** A fizetési REST hibája – a lekepezes.ts fordítja. */
export class FizetesHiba extends Error {
  constructor(
    public readonly status: number,
    public readonly tipus: string,
    public readonly uzenet: string
  ) {
    super(`${status} ${tipus}: ${uzenet}`)
  }
}

export async function fizetes<T>(method: 'GET' | 'POST', query = '', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${env('PAYMENTS_URL')}/api/legacy/payments${query}`, {
      method,
      headers: { Authorization: `Bearer ${env('LEGACY_PAYMENTS_KEY')}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A fizetési rendszer nem érhető el, próbáld újra később.', {
      retryable: true,
      upstream: { system: FIZETES, raw: e instanceof Error ? e.name : 'fetch hiba' },
    })
  }
  let v: unknown
  try {
    v = await res.json()
  } catch {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A fizetési rendszer érvénytelen választ adott.', { retryable: true, upstream: { system: FIZETES, raw: `HTTP ${res.status}` } })
  }
  if (!res.ok) {
    const e = (v as { error?: { type?: string; message?: string } }).error ?? {}
    throw new FizetesHiba(res.status, e.type ?? 'unknown', e.message ?? '')
  }
  return v as T
}
