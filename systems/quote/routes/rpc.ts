import { kezelKeres } from '@/legacy/quote/rpc'

export const runtime = 'nodejs'

// JSON-RPC 2.0 – az ajánlatmotor egyetlen végpontja. Hiba esetén is HTTP 200 (a hiba a törzsben van);
// értesítésre (id nélküli kérés) 204, üres törzzsel.
export async function POST(req: Request) {
  const valasz = await kezelKeres(await req.text())
  if (valasz === null) return new Response(null, { status: 204 })
  return Response.json(valasz)
}
