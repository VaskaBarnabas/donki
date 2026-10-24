// Üzemeltetési végpont a sorokat birtokló rendszereken (16. fázis): betekintés a saját üzenetsorba
//   GET /ops/sor/<név>[?archiv=1]  → a legutóbbi 50 üzenet (csak olvassa a sortáblát, nem pgmq.read: nem növeli a read_ct-t)
// Hozzáférés: X-Ops-Key fejléc = a rendszer integrációs kulcsa (amit a portál varázslójában is megadnak).

import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/rendszer/adat'
import type { Handler } from './host'

function kulcsRendben(kapott: string | null, vart: string | undefined): boolean {
  if (!kapott || !vart) return false
  const a = Buffer.from(kapott)
  const b = Buffer.from(vart)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** A sor-betekintő handler; `sema` a sorpanel-függvények sémája, `kulcsValtozo` a rendszer integrációs kulcsa. */
export function sorBetekintes(sema: string, kulcsValtozo: string): Handler {
  return async (req, { params }) => {
    if (!kulcsRendben(req.headers.get('x-ops-key'), process.env[kulcsValtozo])) return Response.json({ hiba: 'Hozzaferes megtagadva' }, { status: 401 })
    const nev = String((await params).nev)
    const archiv = new URL(req.url).searchParams.get('archiv') === '1'
    const { data, error } = await createServiceClient().schema(sema).rpc('sor_tartalom', { p_sor: nev, p_archiv: archiv, p_n: 50 })
    if (error) return Response.json({ hiba: error.message }, { status: error.code === 'PT400' ? 404 : 500 })
    return Response.json({ sor: nev, archiv, uzenetek: data ?? [] })
  }
}

/** A sorpanel-metrikák a /health-hez. */
export function sorMetrikak(sema: string) {
  return async () => {
    const { data, error } = await createServiceClient().schema(sema).rpc('sor_metrikak')
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown[]
  }
}
