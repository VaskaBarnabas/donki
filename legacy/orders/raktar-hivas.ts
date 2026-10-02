// Szinkron raktári hívás a rendelésmotor számára: parancs az inventory_commands sorra,
// majd a corr alapján pollozza az inventory_replies sort (max. ~10 mp).
// A más hívókhoz tartozó válaszokat nem törli (0 mp-es láthatósági idővel olvas).
// Szándékosan lassú és ügyetlen – a raktár csak üzenetsoron érhető el.

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type RaktarParancs =
  | { cmd: 'FOGLAL'; cikk: number; db: number; ref: string }
  | { cmd: 'FELOLD'; ref: string }
  | { cmd: 'MOZGAS'; cikk: number; tipus: 'BE' | 'KI' | 'VISSZARU' | 'KORREKCIO'; db: number; ref?: string }
  | { cmd: 'LEKERDEZ'; cikk: number }
  | { cmd: 'LEKERDEZ'; cikkek: number[] }
  | { cmd: 'VISSZARU_BE'; cikk: number; db: number; ref: string }

export type RaktarValasz = {
  corr: string
  status: 'OK' | 'NOK'
  hibakod?: string
  uzenet?: string
  ts: number
  [mezo: string]: unknown
}

type QueueMessage = { msg_id: number; message: { corr?: string } }

const VALASZ_TIMEOUT_MS = 10_000
const POLL_MS = 500
const OLVASASI_KOTEG = 100

export async function raktarHivas(
  supabase: SupabaseClient,
  parancs: RaktarParancs,
  timeoutMs = VALASZ_TIMEOUT_MS
): Promise<{ corr: string; valasz: RaktarValasz | null }> {
  const corr = `c-${randomBytes(4).toString('hex')}`
  const queues = supabase.schema('pgmq_public')

  const { error: sendError } = await queues.rpc('send', {
    queue_name: 'inventory_commands',
    message: { ...parancs, corr },
    sleep_seconds: 0,
  })
  if (sendError) {
    throw new Error(`Raktari parancs kuldese sikertelen: ${sendError.message}`)
  }

  const hatarido = Date.now() + timeoutMs
  while (Date.now() < hatarido) {
    const { data, error } = await queues.rpc('read', {
      queue_name: 'inventory_replies',
      sleep_seconds: 0,
      n: OLVASASI_KOTEG,
    })
    if (error) {
      throw new Error(`Raktari valasz olvasasa sikertelen: ${error.message}`)
    }

    const sajat = ((data ?? []) as QueueMessage[]).find((m) => m.message?.corr === corr)
    if (sajat) {
      await queues.rpc('delete', { queue_name: 'inventory_replies', message_id: sajat.msg_id })
      return { corr, valasz: sajat.message as RaktarValasz }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }

  return { corr, valasz: null }
}
