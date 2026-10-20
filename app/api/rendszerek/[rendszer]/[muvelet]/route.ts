import { adminEllenorzes, rendszerMuvelet, rendszerNaplo, VezerlesHiba, type Muvelet } from '@/lib/admin/vezerles'

// POST /api/rendszerek/<rendszer>/start|stop|restart – egy rendszer (a teljes konténercsoportja) ki/be kapcsolása
// GET  /api/rendszerek/<rendszer>/naplo                – a konténerek utolsó naplósorai
// Csak admin; a művelet naplózódik (a portál konténerének naplójába).

type Ctx = { params: Promise<{ rendszer: string; muvelet: string }> }

function hiba(e: unknown) {
  if (e instanceof VezerlesHiba) return Response.json({ hiba: e.message }, { status: e.status })
  throw e
}

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const ki = await adminEllenorzes()
    const { rendszer, muvelet } = await params
    if (!['start', 'stop', 'restart'].includes(muvelet)) return Response.json({ hiba: 'Ismeretlen művelet.' }, { status: 400 })
    const eredmeny = await rendszerMuvelet(rendszer, muvelet as Muvelet)
    console.log(`[vezerles] ${new Date().toISOString()} ${ki.email ?? ki.id}: ${rendszer} ${muvelet} (${eredmeny.kontenerek.join(', ')})`)
    return Response.json({ rendszer, muvelet, ...eredmeny })
  } catch (e) {
    return hiba(e)
  }
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    await adminEllenorzes()
    const { rendszer, muvelet } = await params
    if (muvelet !== 'naplo') return Response.json({ hiba: 'Ismeretlen lekérdezés.' }, { status: 404 })
    const n = Math.min(Number(new URL(req.url).searchParams.get('sorok') ?? 100) || 100, 500)
    return Response.json({ rendszer, naplo: await rendszerNaplo(rendszer, n) })
  } catch (e) {
    return hiba(e)
  }
}
