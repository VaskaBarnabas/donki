import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { kezelGet, kezelPost, type HomlokzatValasz } from '@/legacy/orders/homlokzat'

export const runtime = 'nodejs'

// Régi stílusú rendelési homlokzat. Hozzáférés: X-Legacy-Key. Mindig HTTP 200, a siker a törzsben.

type Ctx = { params: Promise<{ path: string[] }> }

function kulcsRendben(req: Request): boolean {
  const vart = process.env.LEGACY_ORDERS_KEY
  const kapott = req.headers.get('x-legacy-key')
  if (!vart || !kapott) return false
  const a = Buffer.from(kapott)
  const b = Buffer.from(vart)
  return a.length === b.length && timingSafeEqual(a, b)
}

function valasz(v: HomlokzatValasz): Response {
  return Response.json(v, { status: 200 })
}

async function vedett(req: Request, fn: () => Promise<HomlokzatValasz>): Promise<Response> {
  if (!kulcsRendben(req)) return valasz({ success: false, msg: 'Hozzaferes megtagadva' })
  try {
    return valasz(await fn())
  } catch (e) {
    console.error('[orders]', req.method, new URL(req.url).pathname, e)
    return valasz({ success: false, msg: 'Belso hiba, probalja ujra kesobb' })
  }
}

export async function GET(req: Request, { params }: Ctx) {
  const { path } = await params
  return vedett(req, () => kezelGet(createServiceClient(), path, new URL(req.url).searchParams))
}

export async function POST(req: Request, { params }: Ctx) {
  const { path } = await params
  const nyers = await req.text()
  let body: unknown = {}
  if (nyers.trim()) {
    try {
      body = JSON.parse(nyers)
    } catch {
      return valasz({ success: false, msg: 'Hibas JSON' })
    }
  }
  return vedett(req, () => kezelPost(createServiceClient(), path, body))
}
