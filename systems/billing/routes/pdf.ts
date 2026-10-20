import { readFile } from 'node:fs/promises'
import { fajlUtvonal, linkEllenorzes } from '@/lib/rendszer/tarhely'

// A számlázó saját PDF-letöltése (a Supabase Storage aláírt linkje helyett): GET /api/legacy/billing/pdf/<útvonal>?exp=…&sig=…
// A linket a SZAMLA|PDF parancs adja ki, 1 óráig érvényes.

const BUCKET = 'szamlak'

export async function GET(req: Request, { params }: { params: Promise<Record<string, string | string[]>> }) {
  const ut = ((await params).ut as string[]).join('/')
  const q = new URL(req.url).searchParams
  if (!linkEllenorzes(BUCKET, ut, Number(q.get('exp')), q.get('sig') ?? '')) {
    return new Response('Lejart vagy ervenytelen link\n', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  try {
    const pdf = await readFile(fajlUtvonal(BUCKET, ut))
    return new Response(new Uint8Array(pdf), { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${ut.split('/').pop()}"` } })
  } catch {
    return new Response('Nem talalhato\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
