// A háttérfigyelő eseményforrásai (18. fázis): a rendszerek saját üzenetsorai (pgmq) a rendszer PostgREST-jén, sorra
// korlátozott kulccsal (sor_kliens szerepkör – a rendszer tábláit nem éri el). A figyelő az egyetlen fogyasztójuk:
// olvasás láthatósági időkorláttal, archiválás csak sikeres feldolgozás után – így hiba esetén az üzenet az időkorlát
// lejárta után újra előjön. A kulcsot a modell nem látja; a rendszeradatot a figyelő is MCP-n kéri.

import { FIGYELO } from '../kozos/kornyezet'

export type Forras = keyof typeof FIGYELO.sorok

export type Esemeny = { forras: Forras; msgId: number; olvasasok: number; adat: Record<string, unknown> }

/** Egy üzenet legfeljebb ennyiszer próbálható; utána archiválva (dead letter), hogy ne akassza meg a sort. */
export const MAX_OLVASAS = 5

async function rpc<T>(forras: Forras, fuggveny: string, body: Record<string, unknown>): Promise<T> {
  const s = FIGYELO.sorok[forras]
  const kulcs = s.kulcs()
  if (!kulcs) throw new Error(`Nincs sor-kulcs: ${forras} (npm run stack:secrets)`)
  const r = await fetch(`${s.url}/rpc/${fuggveny}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kulcs}`, 'Content-Profile': 'pgmq_public', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`${forras} sor (${fuggveny}): HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T
}

/** Legfeljebb `n` üzenet a forrás sorából; a kiolvasottak `lathatatlan` másodpercig mások (és a figyelő) elől rejtve. */
export async function olvas(forras: Forras, n = 20, lathatatlan = 60): Promise<Esemeny[]> {
  const sorok = await rpc<{ msg_id: number; read_ct: number; message: Record<string, unknown> }[]>(forras, 'read', {
    queue_name: FIGYELO.sorok[forras].sor,
    sleep_seconds: lathatatlan,
    n,
  })
  return sorok.map((m) => ({ forras, msgId: m.msg_id, olvasasok: m.read_ct, adat: m.message }))
}

/** Feldolgozott üzenet áthelyezése az archívumba (pgmq). */
export async function archival(e: Esemeny): Promise<void> {
  await rpc(e.forras, 'archive', { queue_name: FIGYELO.sorok[e.forras].sor, message_id: e.msgId })
}

export const FORRASOK = Object.keys(FIGYELO.sorok) as Forras[]
