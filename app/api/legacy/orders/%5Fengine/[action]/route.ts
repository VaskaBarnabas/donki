import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { MOTOR_AKCIOK } from '@/legacy/orders/motor'

export const runtime = 'nodejs'

// Belső motor-végpontok: /api/legacy/orders/_engine/<action> (a mappa neve %5Fengine, mert a Next.js
// az aláhúzással kezdődő mappát privátnak tekinti). Csak a Flowable hívja, X-Engine-Key fejléccel.

function kulcsRendben(kapott: string | null): boolean {
  const vart = process.env.LEGACY_ENGINE_KEY
  if (!vart || !kapott) return false
  const a = Buffer.from(kapott)
  const b = Buffer.from(vart)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!kulcsRendben(req.headers.get('x-engine-key'))) {
    return Response.json({ ok: false, reason: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { action } = await params
  const akcio = MOTOR_AKCIOK[action]
  if (!akcio) return Response.json({ ok: false, reason: 'UNKNOWN_ACTION' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, reason: 'INVALID_JSON' }, { status: 400 })
  }
  const orderNo = Number(body.orderNo)
  if (!Number.isInteger(orderNo)) return Response.json({ ok: false, reason: 'INVALID_ORDER_NO' }, { status: 400 })

  try {
    return Response.json(await akcio(createServiceClient(), { ...body, orderNo }))
  } catch (e) {
    console.error('[orders/_engine]', action, orderNo, e)
    return Response.json({ ok: false, reason: 'ENGINE_ERROR', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
