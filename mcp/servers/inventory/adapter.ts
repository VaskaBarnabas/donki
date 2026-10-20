// Az inventory szerver legacy-kliense: a raktárnak nincs HTTP végpontja, csak üzenetsora (pgmq, a PostgREST
// pgmq_public sémáján). Parancs az inventory_commands sorra, a válasz az inventory_replies sorból a `corr`
// alapján – csak a saját válaszát törli, a többi hívóét érintetlenül hagyja (0 mp-es láthatósági idő).

import { randomBytes } from 'node:crypto'
import { McpHiba } from '../../kozos/hiba'
import { raktarSor } from '../../kozos/kornyezet'

export const RENDSZER = 'inventory-queue'

export type RaktarParancs =
  | { cmd: 'LEKERDEZ'; cikkek: number[] }
  | { cmd: 'MOZGAS'; cikk: number; tipus: 'BE' | 'KORREKCIO'; db: number; ref: string }

export type RaktarValasz = { corr: string; status: 'OK' | 'NOK'; hibakod?: string; uzenet?: string; [mezo: string]: unknown }

export type RaktarTetel = { cikk: number; megnevezes: string; keszlet: number; foglalt: number; szabad: number; min: number }

const IDOKORLAT_MS = 15_000
const POLL_MS = 500

/** Egy raktári parancs; közben másodpercenként `varakozik()` hívódik (progress értesítéshez). */
export async function raktarHivas(parancs: RaktarParancs, varakozik?: (mp: number) => Promise<void>): Promise<RaktarValasz> {
  const corr = `mcp-${randomBytes(5).toString('hex')}`
  const sorok = raktarSor().schema('pgmq_public')

  const { error } = await sorok.rpc('send', { queue_name: 'inventory_commands', message: { ...parancs, corr }, sleep_seconds: 0 })
  if (error) {
    throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A raktári rendszer nem érhető el, próbáld újra később.', { retryable: true, upstream: { system: RENDSZER, raw: error.message } })
  }

  const kezdet = Date.now()
  let utolsoJelzes = 0
  while (Date.now() - kezdet < IDOKORLAT_MS) {
    const { data, error: olvasasHiba } = await sorok.rpc('read', { queue_name: 'inventory_replies', sleep_seconds: 0, n: 100 })
    if (olvasasHiba) {
      throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A raktári rendszer nem érhető el, próbáld újra később.', { retryable: true, upstream: { system: RENDSZER, raw: olvasasHiba.message } })
    }
    const sajat = ((data ?? []) as { msg_id: number; message: RaktarValasz }[]).find((m) => m.message?.corr === corr)
    if (sajat) {
      await sorok.rpc('delete', { queue_name: 'inventory_replies', message_id: sajat.msg_id })
      return sajat.message
    }
    const mp = Math.floor((Date.now() - kezdet) / 1000)
    if (varakozik && mp > utolsoJelzes) {
      utolsoJelzes = mp
      await varakozik(mp)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new McpHiba('UPSTREAM_UNAVAILABLE', 'A raktári rendszer nem válaszolt időben, próbáld újra később.', {
    retryable: true,
    upstream: { system: RENDSZER, raw: `nincs valasz ${IDOKORLAT_MS / 1000} mp alatt (corr ${corr})` },
  })
}
