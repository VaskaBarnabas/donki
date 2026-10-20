import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { ApiHiba, fizetesLekerdezes, fizetesLetrehozas } from '@/legacy/payments/api'

export const runtime = 'nodejs'

// Fizetés – REST. Hozzáférés: Authorization: Bearer <LEGACY_PAYMENTS_KEY>.

function hibaValasz(status: number, type: string, message: string) {
  return Response.json({ error: { type, message } }, { status })
}

function jogosult(req: Request): boolean {
  const vart = process.env.LEGACY_PAYMENTS_KEY
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')
  if (!vart || !m) return false
  const a = Buffer.from(m[1])
  const b = Buffer.from(vart)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function vedett(req: Request, fn: () => Promise<Response>): Promise<Response> {
  if (!jogosult(req)) return hibaValasz(401, 'authentication_error', 'Invalid or missing bearer token')
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ApiHiba) return hibaValasz(e.status, e.type, e.message)
    console.error('[payments]', e)
    return hibaValasz(500, 'api_error', 'Internal server error')
  }
}

export async function POST(req: Request) {
  return vedett(req, async () => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      throw new ApiHiba(400, 'invalid_request_error', 'Request body must be valid JSON')
    }
    return Response.json(await fizetesLetrehozas(createServiceClient(), body), { status: 201 })
  })
}

export async function GET(req: Request) {
  return vedett(req, async () => Response.json(await fizetesLekerdezes(createServiceClient(), new URL(req.url).searchParams)))
}
