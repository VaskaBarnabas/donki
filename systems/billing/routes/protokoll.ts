import { timingSafeEqual } from 'node:crypto'
import { vegrehajt } from '@/legacy/billing/parancsok'
import { hiba, ProtokollHiba } from '@/legacy/billing/protokoll'

export const runtime = 'nodejs'

// Számlázás – egyedi szöveges protokoll (text/plain). Mindig HTTP 200, a válasz OK|… vagy ERR|Exxx|SZOVEG.
// Kérés: két sor – "AUTH|<kulcs>", majd egy parancssor.

function valasz(szoveg: string): Response {
  return new Response(`${szoveg}\n`, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

function kulcsRendben(kapott: string): boolean {
  const vart = process.env.LEGACY_BILLING_KEY
  if (!vart) return false
  const a = Buffer.from(kapott)
  const b = Buffer.from(vart)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const sorok = (await req.text())
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const [auth, ...parancsSorok] = sorok
  const authMezok = (auth ?? '').split('|')
  if (authMezok.length !== 2 || authMezok[0].toUpperCase() !== 'AUTH' || !kulcsRendben(authMezok[1])) {
    return valasz(hiba('E001'))
  }
  if (parancsSorok.length !== 1) {
    return valasz(hiba('E101'))
  }

  try {
    return valasz(await vegrehajt(parancsSorok[0]))
  } catch (e) {
    if (e instanceof ProtokollHiba) return valasz(hiba(e.kod, e.message))
    console.error('[billing]', e)
    return valasz(hiba('E999'))
  }
}
