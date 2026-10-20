import { timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { MUVELETEK } from '@/legacy/support/muveletek'
import { fault, HdHiba, kerestFeldolgoz, valasz } from '@/legacy/support/soap'

export const runtime = 'nodejs'

// Ügyfélszolgálat – SOAP 1.1. GET ?wsdl → statikus WSDL; POST → művelet. Hozzáférés: SOAP Header <hd:ApiKey>.

const XML = { 'Content-Type': 'text/xml; charset=utf-8' }

function kulcsRendben(kapott: string | null): boolean {
  const vart = process.env.LEGACY_SUPPORT_KEY
  if (!vart || !kapott) return false
  const a = Buffer.from(kapott)
  const b = Buffer.from(vart)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  if (!new URL(req.url).searchParams.has('wsdl')) {
    return new Response('Use ?wsdl for the service description, POST for SOAP requests.\n', { status: 405 })
  }
  const wsdl = await readFile(path.join(process.cwd(), 'legacy', 'support', 'helpdesk.wsdl'), 'utf8')
  return new Response(wsdl, { headers: XML })
}

export async function POST(req: Request) {
  try {
    const keres = kerestFeldolgoz(await req.text())
    if (!kulcsRendben(keres.apiKey)) throw new HdHiba('HD-401')
    const muvelet = MUVELETEK[keres.muvelet]
    if (!muvelet) throw new HdHiba('HD-422')
    return new Response(valasz(keres.muvelet, await muvelet(keres.parameterek)), { headers: XML })
  } catch (e) {
    const kod = e instanceof HdHiba ? e.kod : 'HD-500'
    if (kod === 'HD-500') console.error('[support/soap]', e)
    // SOAP 1.1: a Fault HTTP 500-zal megy
    return new Response(fault(kod), { status: 500, headers: XML })
  }
}
