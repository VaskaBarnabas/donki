/**
 * 4. fázis füstteszt: ajánlatmotor JSON-RPC 2.0 (POST /api/legacy/quote-rpc).
 * Futó Next.js szervert igényel (APP_BASE_URL, alapból http://localhost:3000).
 * A létrehozott tesztajánlatok az adatbázisban maradnak (a seed újratöltése eltünteti őket).
 *
 * Futtatás: npx tsx scripts/smoke/04-ajanlat.ts
 */
import { readFileSync } from 'node:fs'

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = { ...loadEnv('.env.local'), ...process.env } as Record<string, string>
const URL = `${env.APP_BASE_URL ?? 'http://localhost:3000'}/api/legacy/quote-rpc`
const KEY = env.LEGACY_QUOTE_KEY
const KIEMELT_PARTNER = '10000000-0000-4000-8000-000000000003' // Bakony Gépgyártó Kft

type RpcValasz = { jsonrpc: string; id: unknown; result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown } }

let szamlalo = 0
async function nyers(body: string): Promise<{ status: number; json: RpcValasz | null }> {
  const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

async function rpc(method: string, params: Record<string, unknown> = {}, apiKey: string | undefined = KEY) {
  const { json } = await nyers(JSON.stringify({ jsonrpc: '2.0', id: ++szamlalo, method, params: { apiKey, ...params } }))
  return json!
}

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)}`}`)
}

async function main() {
  console.log(`4. fázis füstteszt – ajánlatmotor (${URL})\n`)

  // Boríték és hozzáférés
  const rosszKulcs = await rpc('quote.list', {}, 'rossz-kulcs')
  check('rossz apiKey → -32001', rosszKulcs.error?.code === -32001, rosszKulcs)

  const parse = await nyers('{"jsonrpc":"2.0", "id": 1, ')
  check('hibás JSON → -32700', parse.json?.error?.code === -32700 && parse.json.id === null, parse)

  const batch = await nyers(JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'quote.list', params: { apiKey: KEY } }]))
  check('batch (tömb) → -32600', batch.json?.error?.code === -32600, batch)

  const nincs = await rpc('quote.delete', { quoteId: 'AJ-2026-0042' })
  check('ismeretlen metódus → -32601', nincs.error?.code === -32601, nincs)

  const rosszParam = await rpc('quote.addLine', { quoteId: 'AJ-2026-0042', productCode: 'X', qty: -1 })
  check('hibás paraméter → -32602', rosszParam.error?.code === -32602, rosszParam)

  const ertesites = await nyers(JSON.stringify({ jsonrpc: '2.0', method: 'quote.list', params: { apiKey: KEY } }))
  check('értesítés (id nélkül) → HTTP 204, nincs törzs', ertesites.status === 204 && ertesites.json === null, ertesites)

  // Árazás: a seedelt AJ-2026-0041 újraszámolása ugyanarra az összegre
  const seed = await rpc('quote.calculate', { quoteId: 'AJ-2026-0041' })
  check(
    'calculate AJ-2026-0041 = 2 507 503 Ft, 17,86%',
    seed.result?.totalNet === 2507503 && seed.result?.totalDiscountPct === 17.86 && seed.result?.approvalRequired === true,
    seed.result ?? seed
  )

  // Teljes út: >15% kedvezmény → -32010 → jóváhagyás → accept átjut a kedvezményellenőrzésen
  const create = await rpc('quote.create', { partnerId: KIEMELT_PARTNER })
  const quoteId = create.result?.id as string
  check('create → PISZKOZAT', create.result?.status === 'PISZKOZAT' && /^AJ-\d{4}-\d{4,}$/.test(quoteId), create)

  const tetel = await rpc('quote.addLine', { quoteId, productCode: 'TK-00032', qty: 12, lineDiscountPct: 5 })
  check('addLine TK-00032 × 12, 5%', (tetel.result?.lines as unknown[])?.length === 1, tetel)

  const inaktiv = await rpc('quote.addLine', { quoteId, productCode: 'TK-00033', qty: 1 })
  check('addLine inaktív termék → -32013', inaktiv.error?.code === -32013, inaktiv)

  const calc = await rpc('quote.calculate', { quoteId })
  check(
    'calculate: >15%, approvalRequired, sikeres',
    calc.result?.approvalRequired === true && (calc.result?.totalDiscountPct as number) > 15,
    calc
  )

  const accept1 = await rpc('quote.accept', { quoteId })
  const data1 = accept1.error?.data as { discountPct?: number; limit?: number } | undefined
  check(
    'accept jóváhagyás nélkül → -32010 {discountPct, limit}',
    accept1.error?.code === -32010 && data1?.limit === 15 && data1?.discountPct === calc.result?.totalDiscountPct,
    accept1
  )

  const korai = await rpc('quote.approve', { quoteId, approver: 'Horváth Zoltán' })
  check('approve PISZKOZAT állapotban → -32012', korai.error?.code === -32012, korai)

  const kerelem = await rpc('quote.requestApproval', { quoteId, reason: 'Füstteszt: kiemelt partner, nagy tétel' })
  check('requestApproval → JOVAHAGYASRA_VAR', kerelem.result?.status === 'JOVAHAGYASRA_VAR', kerelem)

  const jovahagy = await rpc('quote.approve', { quoteId, approver: 'Horváth Zoltán' })
  check('approve → JOVAHAGYOTT', jovahagy.result?.status === 'JOVAHAGYOTT' && !!jovahagy.result?.approvedOn, jovahagy)

  const accept2 = await rpc('quote.accept', { quoteId })
  const atjutott =
    accept2.result?.status === 'ELFOGADVA' ||
    (accept2.error?.code === -32603 && (accept2.error.data as { reason?: string })?.reason === 'ORDER_CREATE_FAILED')
  check(
    `accept jóváhagyás után: nem -32010 (${accept2.result ? `rendelés ${accept2.result.orderRef}` : 'rendelésmodul még nincs kész – 7. fázis'})`,
    atjutott,
    accept2
  )

  // Lejárt ajánlat
  const lejart = await rpc('quote.accept', { quoteId: 'AJ-2026-0037' })
  check('accept lejárt ajánlatra → -32011', lejart.error?.code === -32011, lejart)

  // get / list
  const get = await rpc('quote.get', { quoteId })
  check('get: tételekkel, YYYY-MM-DD dátum', (get.result?.lines as unknown[])?.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(get.result?.validUntil as string), get)

  const list = await rpc('quote.list', { partnerId: KIEMELT_PARTNER })
  const lista = list.result as unknown as { id: string }[]
  check('list partnerId szűréssel', Array.isArray(lista) && lista.some((q) => q.id === quoteId), list)

  const nemletezo = await rpc('quote.get', { quoteId: 'AJ-2026-9999' })
  check('get ismeretlen ajánlat → -32602', nemletezo.error?.code === -32602, nemletezo)

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni (fut a Next.js szerver?): ${e.message}`)
  process.exit(1)
})
