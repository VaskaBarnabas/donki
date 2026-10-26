// A tool hívások naplója (mcp.tool_calls) – a tokenomics mérés egyik alapja. A naplózás hibája soha nem
// akaszthatja meg az eszközhívást.

import { db, log } from './kornyezet'

export type NaploSor = {
  server: string
  tool: string
  client_id: string
  role: string
  transport: 'http' | 'stdio'
  input_summary: Record<string, unknown>
  ok: boolean
  error_code: string | null
  duration_ms: number
  response_bytes: number
  /** az ágensfutás azonosítója (X-Agens-Futas fejléc), ha ágens hívta */
  agent_run_id?: string | null
}

const ERZEKENY = /key|token|secret|password/i

/** A bemenet naplózható kivonata: érzékeny mezők nélkül, hosszú szövegek levágva. */
export function bemenetKivonat(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args ?? {}).map(([k, v]) => [
      k,
      ERZEKENY.test(k) ? '***' : typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…` : v,
    ])
  )
}

export async function naploz(sor: NaploSor): Promise<void> {
  try {
    const { error } = await db().schema('mcp').from('tool_calls').insert(sor)
    if (error) log('naplozas sikertelen:', error.message)
  } catch (e) {
    log('naplozas sikertelen:', e instanceof Error ? e.message : e)
  }
}
