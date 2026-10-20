import { adminEllenorzes, rendszerAllapotok, VezerlesHiba } from '@/lib/admin/vezerles'

// GET /api/rendszerek – a független rendszerek állapota (konténerek, egészség, memória). Csak admin.
export async function GET() {
  try {
    await adminEllenorzes()
    return Response.json({ rendszerek: await rendszerAllapotok(), ido: new Date().toISOString() })
  } catch (e) {
    if (e instanceof VezerlesHiba) return Response.json({ hiba: e.message }, { status: e.status })
    throw e
  }
}
