// 20. fázis, változástűrés-mérés: egy legacy rendszer interfészének megváltozását szimulálja a hívó oldalán, a fetch
// becsomagolásával – az MCP-konténerekben és a nyers ágens folyamatában is. A rendszer kódja és adatai nem változnak.
// Mindig csak az éppen aktív változás él (a jelzőfájl tartalma: V1, V2, V3 vagy üres); az előkészítés és az ellenőrzés
// alatt a futtató kikapcsolja, hogy a mérés igazsága ne a megváltozott interfészből jöjjön.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a Node --require előtöltője CommonJS
const fs = require('node:fs')

const JELZO = process.env.VALTOZAS_JELZO || '/meres/aktiv'
const aktiv = () => {
  try {
    return fs.readFileSync(JELZO, 'utf8').trim()
  } catch {
    return ''
  }
}
const METODUS = { 'quote.order': 'quote.accept', 'quote.authorize': 'quote.approve' }
const REGI = Object.values(METODUS)

function atnevez(x, regi, uj) {
  if (Array.isArray(x)) return x.map((e) => atnevez(e, regi, uj))
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k === regi ? uj : k, atnevez(v, regi, uj)]))
  return x
}
const valasz = (r, adat) => new Response(JSON.stringify(adat), { status: r.status, headers: { 'Content-Type': 'application/json' } })

const eredeti = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const test = typeof init?.body === 'string' ? init.body : ''
  const v = aktiv()

  // V3: az ajánlatmotor két metódusa új nevet kap; az új név mindig működik (a javított kliens és az ellenőrzés miatt)
  if (url.includes('/api/legacy/quote-rpc') && test) {
    const k = JSON.parse(test)
    if (METODUS[k.method]) return eredeti(input, { ...init, body: JSON.stringify({ ...k, method: METODUS[k.method] }) })
    if (v === 'V3' && REGI.includes(k.method)) return new Response(JSON.stringify({ jsonrpc: '2.0', id: k.id, error: { code: -32601, message: 'Method not found' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const r = await eredeti(input, init)
  // V1: a rendeléskezelő szállítási válaszában a carrier_status mező delivery_state lesz
  if (v === 'V1' && /\/api\/legacy\/orders\/\d+\/shipping/.test(url) && r.ok) return valasz(r, atnevez(await r.json(), 'carrier_status', 'delivery_state'))
  // V2: a raktár válaszaiban a szabad mező elerheto lesz
  if (v === 'V2' && url.includes('/rpc/read') && test.includes('inventory_replies') && r.ok) return valasz(r, atnevez(await r.json(), 'szabad', 'elerheto'))
  return r
}
