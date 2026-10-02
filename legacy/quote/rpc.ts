// JSON-RPC 2.0 boríték az ajánlatmotorhoz. Batch (tömb) kérés nincs támogatva.
// Hozzáférés: a kulcs a params.apiKey mezőben érkezik (legacy).

import { timingSafeEqual } from 'node:crypto'
import { ZodError } from 'zod'
import { HIBAKOD, RpcHiba } from './hibak'
import { METODUSOK } from './methods'

type RpcId = string | number | null

type RpcValasz =
  | { jsonrpc: '2.0'; id: RpcId; result: unknown }
  | { jsonrpc: '2.0'; id: RpcId; error: { code: number; message: string; data?: unknown } }

function hibaValasz(id: RpcId, code: number, message: string, data?: unknown): RpcValasz {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } }
}

function kulcsRendben(kapott: unknown): boolean {
  const vart = process.env.LEGACY_QUOTE_KEY
  if (!vart || typeof kapott !== 'string') return false
  const a = Buffer.from(kapott)
  const b = Buffer.from(vart)
  return a.length === b.length && timingSafeEqual(a, b)
}

function ervenyesId(id: unknown): id is RpcId {
  return id === null || typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id))
}

/** Feldolgoz egy nyers kérést. null = értesítés (nincs válasz). */
export async function kezelKeres(nyers: string): Promise<RpcValasz | null> {
  let keres: unknown
  try {
    keres = JSON.parse(nyers)
  } catch {
    return hibaValasz(null, HIBAKOD.PARSE_ERROR, 'Parse error')
  }

  if (Array.isArray(keres)) {
    return hibaValasz(null, HIBAKOD.INVALID_REQUEST, 'Invalid Request', 'Batch keres nem tamogatott')
  }
  if (typeof keres !== 'object' || keres === null) {
    return hibaValasz(null, HIBAKOD.INVALID_REQUEST, 'Invalid Request')
  }

  const { jsonrpc, method, params, id } = keres as Record<string, unknown>
  const ertesites = !('id' in (keres as object))
  const valaszId: RpcId = ervenyesId(id) ? id : null

  if (jsonrpc !== '2.0' || typeof method !== 'string' || (!ertesites && !ervenyesId(id))) {
    return hibaValasz(valaszId, HIBAKOD.INVALID_REQUEST, 'Invalid Request')
  }

  const valasz = await futtat(method, params, valaszId)
  return ertesites ? null : valasz
}

async function futtat(method: string, params: unknown, id: RpcId): Promise<RpcValasz> {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return hibaValasz(id, HIBAKOD.INVALID_PARAMS, 'Invalid params', 'A params objektum kotelezo (nev szerinti parameterek)')
  }
  if (!kulcsRendben((params as Record<string, unknown>).apiKey)) {
    return hibaValasz(id, HIBAKOD.UNAUTHORIZED, 'UNAUTHORIZED')
  }

  const metodus = METODUSOK[method]
  if (!metodus) {
    return hibaValasz(id, HIBAKOD.METHOD_NOT_FOUND, 'Method not found')
  }

  try {
    const result = await metodus(params as Record<string, unknown>)
    return { jsonrpc: '2.0', id, result }
  } catch (e) {
    if (e instanceof RpcHiba) {
      return hibaValasz(id, e.code, e.message, e.data)
    }
    if (e instanceof ZodError) {
      return hibaValasz(
        id,
        HIBAKOD.INVALID_PARAMS,
        'Invalid params',
        e.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      )
    }
    console.error('[quote-rpc]', method, e)
    return hibaValasz(id, HIBAKOD.INTERNAL_ERROR, 'Internal error')
  }
}
