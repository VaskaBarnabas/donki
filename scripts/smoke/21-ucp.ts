/**
 * 21. fázis füstteszt: a UCP-átjáró (Universal Commerce Protocol, kereskedői oldal) modell nélkül, végponttól végpontig.
 * Saját átjáró-példányt indít (4191), és a vásárló platformot is ő játssza (profil + webhook-fogadó a 4192-n).
 *   felfedezés · platform-engedélyezés és verzió · árazás fillérben, ÁFÁ-val · B2B-azonosítás (kapcsolattartói e-mail)
 *   · hibák (ismeretlen termék, készlethiány, ismeretlen vevő) · teljes csere · idempotencia · lezárás → jóváhagyásra vár
 *   · jóváhagyás → rendelés + aláírt webhook · elutasítás · megszakítás · az `ucp` MCP-szerepkör korlátai
 * Előfeltétel: npm run stack:up (az MCP-konténerekben az ucp szerepkörrel), Ollama nem kell.
 * Futtatás: npx tsx scripts/smoke/21-ucp.ts
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash, createPublicKey, generateKeyPairSync, randomUUID, sign, verify, type KeyObject } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import '../../agens/kozos/kornyezet'
import { McpKapcsolat } from '../../agens/kozos/mcp'
import { db, dbZar } from '../../agens/kozos/naplo'
import { Mcp, MONITOR } from '../ertekeles/kozos'
import { check, szakasz, zaras } from './mcp-segedek'

const KAPU = 4191
const PLATFORM = 4192
const ALAP = `http://localhost:${KAPU}`
const PROFIL = `http://localhost:${PLATFORM}/profil.json`
// egy második (szintén engedélyezett) platform: nem láthatja az első checkoutjait
const PROFIL2 = `http://localhost:${PLATFORM}/profil2.json`
const VERZIO = '2026-04-08'

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const webhookok: { fejlec: IncomingMessage['headers']; torzs: string }[] = []

// a platformok aláíró kulcsai (RFC 9421, Ed25519); a nyilvános fele a profiljukban
const kulcs1 = generateKeyPairSync('ed25519')
const kulcs2 = generateKeyPairSync('ed25519')
const jwkKi = (k: KeyObject, kid: string) => ({ ...(k.export({ format: 'jwk' }) as object), kid, use: 'sig', alg: 'EdDSA' })

function alairas(kulcs: { privateKey: KeyObject }, kid: string, metodus: string, url: string, torzs: string | undefined, fejlec: Record<string, string>) {
  const f: Record<string, string> = Object.fromEntries(Object.entries(fejlec).map(([k, v]) => [k.toLowerCase(), v]))
  if (torzs !== undefined) f['content-digest'] = `sha-256=:${createHash('sha256').update(torzs).digest('base64')}:`
  const komp = ['@method', '@target-uri', ...['content-digest', 'content-type', 'ucp-agent', 'idempotency-key'].filter((k) => f[k] !== undefined)]
  const param = `(${komp.map((k) => `"${k}"`).join(' ')});created=${Math.floor(Date.now() / 1000)};keyid="${kid}";alg="ed25519"`
  const alap = [...komp.map((k) => `"${k}": ${k === '@method' ? metodus : k === '@target-uri' ? url : f[k]}`), `"@signature-params": ${param}`].join('\n')
  return { ...f, 'signature-input': `sig1=${param}`, signature: `sig1=:${sign(null, Buffer.from(alap), kulcs.privateKey).toString('base64')}:` }
}

const platformProfil = {
  ucp: {
    version: VERZIO,
    services: { 'dev.ucp.shopping': [{ version: VERZIO, transport: 'rest' }] },
    capabilities: {
      'dev.ucp.shopping.checkout': [{ version: VERZIO }],
      'dev.ucp.shopping.order': [{ version: VERZIO, config: { webhook_url: `http://localhost:${PLATFORM}/webhook` } }],
      'com.example.donki.b2b_buyer': [{ version: VERZIO }],
      'dev.ucp.shopping.fulfillment': [{ version: VERZIO }],
    },
    payment_handlers: {},
  },
  signing_keys: [jwkKi(kulcs1.publicKey, 'platform-1')],
}
const platformProfil2 = { ...platformProfil, signing_keys: [jwkKi(kulcs2.publicKey, 'platform-2')] }

async function keres(metodus: string, ut: string, torzs?: unknown, fejlec: Record<string, string> = {}, o: { masodik?: boolean; alairas?: boolean; rontott?: boolean } = {}) {
  const szoveg = torzs === undefined ? undefined : JSON.stringify(torzs)
  const alap = { 'content-type': 'application/json', 'ucp-agent': `profile="${o.masodik ? PROFIL2 : PROFIL}"`, 'idempotency-key': randomUUID(), 'request-id': randomUUID(), ...fejlec }
  const headers = o.alairas === false ? alap : alairas(o.masodik ? kulcs2 : kulcs1, o.masodik ? 'platform-2' : 'platform-1', metodus, `${ALAP}${ut}`, szoveg, alap)
  const v = await fetch(`${ALAP}${ut}`, { method: metodus, headers, body: o.rontott && szoveg ? szoveg.replace('"quantity":2', '"quantity":20') : szoveg })
  return { statusz: v.status, adat: (await v.json().catch(() => null)) as Json }
}
const kod = (a: Json, c: string) => (a?.messages ?? []).some((m: Json) => m.code === c)
const osszeg = (a: Json, t: string) => (a?.totals ?? []).find((x: Json) => x.type === t)?.amount as number | undefined

async function var_(f: () => Promise<boolean>, mp = 20) {
  for (let i = 0; i < mp * 2; i++) {
    if (await f()) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function main() {
  const kezdet = Date.now()
  const m = await Mcp.nyit()
  // a vásárló platform: profil és webhook-fogadó
  const srv = createServer((req, res) => {
    if (req.url === '/profil.json') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(platformProfil))
    if (req.url === '/profil2.json') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(platformProfil2))
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      if (req.url === '/webhook') webhookok.push({ fejlec: req.headers, torzs: b })
      res.writeHead(200).end('{}')
    })
  }).listen(PLATFORM)
  // a konténeres átjáró ugyanazt a webhook-sort olvasná: a teszt idejére leáll, a végén újraindul
  execFileSync('docker', ['stop', 'donki-ucp-gateway-1'], { stdio: 'ignore' })
  const kapu = spawn('npx', ['tsx', 'ucp/szerver.ts'], { env: { ...process.env, UCP_PORT: String(KAPU), UCP_ALAP_URL: ALAP, UCP_FEJLESZTES: '1', UCP_ALAIRAS_KOTELEZO: '1', UCP_PLATFORMOK: `http://localhost:${PLATFORM}`, UCP_KONFORMANCIA: '0' }, stdio: ['ignore', 'ignore', 'pipe'] })
  let naplo = ''
  kapu.stderr.on('data', (d) => (naplo += d))
  const rendelesek: string[] = []
  try {
    check('az átjáró elindul', await var_(async () => (await fetch(`${ALAP}/health`).catch(() => null))?.ok === true), naplo.slice(-500))

    // ------------------------------------------------------------------ 1. felfedezés
    szakasz('Felfedezés: /.well-known/ucp')
    const p = (await (await fetch(`${ALAP}/.well-known/ucp`)).json()) as Json
    check(`verzió ${VERZIO}, REST shopping szolgáltatás a /ucp végponttal`, p.ucp?.version === VERZIO && p.ucp.services['dev.ucp.shopping'][0].transport === 'rest' && p.ucp.services['dev.ucp.shopping'][0].endpoint === `${ALAP}/ucp`, p.ucp?.services)
    check('képességek: checkout, order és a B2B-bővítmény (com.example.donki)', ['dev.ucp.shopping.checkout', 'dev.ucp.shopping.order', 'com.example.donki.b2b_buyer'].every((k) => !!p.ucp.capabilities[k]), Object.keys(p.ucp?.capabilities ?? {}))
    check('fizetési handler: díjbekérő (donki_proforma)', p.ucp.payment_handlers['com.example.donki.proforma']?.[0]?.id === 'donki_proforma', p.ucp.payment_handlers)
    const jwk = p.signing_keys?.[0]
    check('aláíró kulcs a profilban (Ed25519 JWK)', jwk?.kty === 'OKP' && jwk.crv === 'Ed25519' && !!jwk.x && !jwk.d, jwk)

    // ------------------------------------------------------------------ 2. platform
    szakasz('A platform azonosítása és a verzió')
    const vevo = (await m.hiv('get_customer', { customerId: (await m.hiv('search_customers', { query: 'Bakony', limit: 1 })).items[0].customerId })).customer
    const email = vevo.contacts.find((c: Json) => c.email)?.email as string
    const cim = { id: 'dest_1', street_address: 'Váci út 118.', address_locality: 'Budapest', postal_code: '1133', address_country: 'HU' }
    const szallitas = { methods: [{ id: 'method_1', type: 'shipping', destinations: [cim], selected_destination_id: 'dest_1', groups: [{ id: 'group_1', selected_option_id: 'std-ship' }] }] }
    const kosar = { line_items: [{ id: 'li_1', item: { id: MONITOR }, quantity: 2 }], buyer: { email }, currency: 'HUF', fulfillment: szallitas }
    const alairatlan = await keres('POST', '/ucp/checkout-sessions', kosar, {}, { alairas: false })
    check('aláírás nélkül: 401 signature_required', alairatlan.statusz === 401 && kod(alairatlan.adat, 'signature_required'), alairatlan)
    const rontott = await keres('POST', '/ucp/checkout-sessions', kosar, {}, { rontott: true })
    check('aláírás után módosított törzs: 401 invalid_signature', rontott.statusz === 401 && kod(rontott.adat, 'invalid_signature'), rontott)
    const nincsAgent = await fetch(`${ALAP}/ucp/checkout-sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kosar) })
    check('UCP-Agent nélkül: 400', nincsAgent.status === 400, nincsAgent.status)
    const idegen = await keres('POST', '/ucp/checkout-sessions', kosar, { 'ucp-agent': 'profile="https://nem-engedelyezett.example/p.json"' })
    check('nem engedélyezett platform: 403 platform_not_allowed', idegen.statusz === 403 && kod(idegen.adat, 'platform_not_allowed'), idegen)
    const regi = await keres('POST', '/ucp/checkout-sessions', kosar, { 'ucp-agent': `profile="${PROFIL}"; version="2099-01-01"` })
    check('nem támogatott verzió: 422 version_unsupported', regi.statusz === 422 && kod(regi.adat, 'version_unsupported'), regi)

    // ------------------------------------------------------------------ 3. checkout
    szakasz('Checkout: árazás, B2B-azonosítás')
    const c = await keres('POST', '/ucp/checkout-sessions', kosar)
    const ck = c.adat
    check('201, ready_for_complete, az azonosított vevő ajánlata mögötte', c.statusz === 201 && ck.status === 'ready_for_complete', { statusz: c.statusz, status: ck?.status, msg: ck?.messages })
    const sor = (await db().query('select * from ucp.checkout where id = $1', [ck.id])).rows[0]
    const q = sor?.ajanlat ? (await m.hiv('get_quote', { quoteId: sor.ajanlat })).quote : null
    check(`vevő a kapcsolattartói e-mailből: ${vevo.name}`, sor?.ugyfel?.customerId === vevo.customerId, sor?.ugyfel)
    check('összegek fillérben: subtotal = listaár, a total = ajánlat nettó × 1,27', !!q && osszeg(ck, 'subtotal') === q.totalListPrice.amount * 100 && osszeg(ck, 'total') === q.totalNet.amount * 100 + Math.round(q.totalNet.amount * 100 * 0.27), { totals: ck.totals, q: q && [q.totalListPrice, q.totalNet] })
    const kedv = osszeg(ck, 'discount')
    check('a kedvezmény negatív, a tétel ára egész fillér', (kedv === undefined || kedv < 0) && Number.isInteger(ck.line_items?.[0]?.item?.price), { kedv, li: ck.line_items?.[0] })
    check('szállítás: a megadott cím, díjmentes std-ship opció', ck.fulfillment?.methods?.[0]?.selected_destination_id === 'dest_1' && ck.fulfillment.methods[0].groups[0].selected_option_id === 'std-ship', ck.fulfillment)
    check('a partner nyilvántartott adatai (cím, adószám) nincsenek a válaszban', !JSON.stringify(ck).includes(vevo.taxNumber) && (!vevo.address || !JSON.stringify(ck).includes(vevo.address)), null)
    const idegenNez = await keres('GET', `/ucp/checkout-sessions/${ck.id}`, undefined, {}, { masodik: true })
    check('más platform nem látja a checkoutot: 404', idegenNez.statusz === 404, idegenNez.statusz)
    const szallNelkul = await keres('POST', '/ucp/checkout-sessions', { ...kosar, fulfillment: undefined })
    check('szállítási cím nélkül: incomplete, missing', szallNelkul.adat.status === 'incomplete' && kod(szallNelkul.adat, 'missing'), szallNelkul.adat?.messages)
    check('continue_url és expires_at a nem végső állapotban', /^http/.test(ck.continue_url) && !!ck.expires_at, ck.continue_url)

    const ism = await keres('POST', '/ucp/checkout-sessions', { line_items: [{ item: { id: 'TK-99999' }, quantity: 1 }], buyer: { email } })
    check('ismeretlen termék: incomplete, not_found', ism.adat.status === 'incomplete' && kod(ism.adat, 'not_found'), ism.adat?.messages)
    const sok = await keres('POST', '/ucp/checkout-sessions', { line_items: [{ item: { id: MONITOR }, quantity: 100000 }], buyer: { email } })
    check('készlethiány: incomplete, out_of_stock', sok.adat.status === 'incomplete' && kod(sok.adat, 'out_of_stock'), sok.adat?.messages)
    const uj = await keres('POST', '/ucp/checkout-sessions', { ...kosar, buyer: { email: `ismeretlen-${Date.now()}@pelda.hu` } })
    check('ismeretlen vevő: requires_escalation, buyer_not_recognized', uj.adat.status === 'requires_escalation' && kod(uj.adat, 'buyer_not_recognized') && !!uj.adat.continue_url, uj.adat?.messages)
    const nincsVevo = await keres('POST', '/ucp/checkout-sessions', { line_items: kosar.line_items })
    check('vevő nélkül: incomplete, missing ($.buyer.email)', nincsVevo.adat.status === 'incomplete' && (nincsVevo.adat.messages ?? []).some((x: Json) => x.code === 'missing' && x.path === '$.buyer.email'), nincsVevo.adat?.messages)

    szakasz('Teljes csere és idempotencia')
    const upd = await keres('PUT', `/ucp/checkout-sessions/${ck.id}`, { ...kosar, line_items: [{ id: 'li_1', item: { id: MONITOR }, quantity: 3 }] })
    check('PUT: 3 db, új összeg', upd.statusz === 200 && upd.adat.line_items[0].quantity === 3 && osszeg(upd.adat, 'subtotal')! > osszeg(ck, 'subtotal')!, upd.adat?.line_items)
    const kulcs = randomUUID()
    const i1 = await keres('POST', '/ucp/checkout-sessions', kosar, { 'idempotency-key': kulcs })
    const i2 = await keres('POST', '/ucp/checkout-sessions', kosar, { 'idempotency-key': kulcs })
    check('ugyanaz a kulcs ugyanazzal a kéréssel: ugyanaz a checkout', i1.adat.id === i2.adat.id && i2.statusz === 201, [i1.adat?.id, i2.adat?.id])
    const i3 = await keres('POST', '/ucp/checkout-sessions', { ...kosar, line_items: [{ item: { id: MONITOR }, quantity: 1 }] }, { 'idempotency-key': kulcs })
    check('ugyanaz a kulcs más tartalommal: 409', i3.statusz === 409 && kod(i3.adat, 'idempotency_conflict'), i3)

    // ------------------------------------------------------------------ 4. lezárás és jóváhagyás
    szakasz('Lezárás → jóváhagyásra vár → jóváhagyás → rendelés + webhook')
    const rossz = await keres('POST', `/ucp/checkout-sessions/${ck.id}/complete`, { payment: { instruments: [{ id: 'i1', handler_id: 'google_pay', type: 'card', credential: { type: 'token', token: 'x' } }] } })
    check('idegen fizetési mód: payment_failed, az állapot nem változik', kod(rossz.adat, 'payment_failed') && rossz.adat.status !== 'complete_in_progress', rossz.adat?.status)
    const lz = await keres('POST', `/ucp/checkout-sessions/${ck.id}/complete`, { payment: { instruments: [{ id: 'i1', handler_id: 'donki_proforma', type: 'proforma_invoice' }] } })
    check('díjbekérővel: complete_in_progress, rendelés még nincs', lz.adat.status === 'complete_in_progress' && !lz.adat.order, lz.adat?.status)
    const var1 = (await db().query('select jovahagyas, fizetes from ucp.checkout where id = $1', [ck.id])).rows[0]
    check('a portálon jóváhagyásra vár, token nincs eltárolva', var1.jovahagyas === 'var' && !JSON.stringify(var1.fizetes).includes('credential'), var1)
    const elotteQ = (await m.hiv('get_quote', { quoteId: (await db().query('select ajanlat from ucp.checkout where id = $1', [ck.id])).rows[0].ajanlat })).quote
    check('jóváhagyás nélkül az ajánlat nincs elfogadva', !elotteQ.orderId, elotteQ.statusLabel)
    // a portál döntése (lib/portal/ucp.ts dontes)
    await db().query(`update ucp.checkout set jovahagyas = 'jovahagyva', dontotte = 'fusteszt', dontes_ido = now() where id = $1`, [ck.id])
    const kesz = await var_(async () => (await keres('GET', `/ucp/checkout-sessions/${ck.id}`)).adat.status === 'completed')
    const g = (await keres('GET', `/ucp/checkout-sessions/${ck.id}`)).adat
    if (g.order?.id) rendelesek.push(g.order.id)
    check(`jóváhagyás után: completed, rendelés ${g.order?.id ?? '–'}`, kesz && /^RND-\d+$/.test(g.order?.id ?? '') && /^http/.test(g.order?.permalink_url ?? ''), g.order)
    const o = await keres('GET', `/ucp/orders/${g.order?.id}`)
    const o2 = await keres('GET', `/ucp/orders/${g.order?.id}`, undefined, {}, { masodik: true })
    check('más platform nem látja a rendelést: 404', o2.statusz === 404, o2.statusz)
    check('GET /ucp/orders/{id}: tételek, checkout_id, szállítási elvárás', o.statusz === 200 && o.adat.checkout_id === ck.id && o.adat.line_items?.[0]?.quantity?.total === 3 && o.adat.line_items[0].status === 'processing' && o.adat.fulfillment?.expectations?.[0]?.destination?.postal_code === '1133', o.adat?.line_items)
    check('rendelés-webhook megérkezett', await var_(async () => webhookok.some((w) => JSON.parse(w.torzs).id === g.order?.id), 15), webhookok.length)
    const w = webhookok.find((x) => JSON.parse(x.torzs).id === g.order?.id)
    if (w) {
      const bemenet = String(w.fejlec['signature-input']).replace(/^sig1=/, '')
      const komp = /^\(([^)]*)\)/.exec(bemenet)![1].split(' ').map((x) => x.replace(/"/g, ''))
      const alap = [...komp.map((k) => `"${k}": ${k === '@method' ? 'POST' : k === '@authority' ? `localhost:${PLATFORM}` : k === '@path' ? '/webhook' : k === '@target-uri' ? `http://localhost:${PLATFORM}/webhook` : w.fejlec[k]}`), `"@signature-params": ${bemenet}`].join('\n')
      const sig = Buffer.from(String(w.fejlec.signature).replace(/^sig1=:|:$/g, ''), 'base64')
      check('a webhook aláírása a profil kulcsával ellenőrizhető (RFC 9421, Ed25519)', verify(null, Buffer.from(alap), createPublicKey({ key: jwk, format: 'jwk' }), sig), komp)
      check('Webhook-Id, Webhook-Timestamp, Content-Digest, UCP-Agent fejléc', !!w.fejlec['webhook-id'] && !!w.fejlec['webhook-timestamp'] && /^sha-256=:/.test(String(w.fejlec['content-digest'])) && /profile=/.test(String(w.fejlec['ucp-agent'])), Object.keys(w.fejlec))
    }

    szakasz('Elutasítás és megszakítás')
    const c2 = (await keres('POST', '/ucp/checkout-sessions', kosar)).adat
    await keres('POST', `/ucp/checkout-sessions/${c2.id}/complete`, { payment: { instruments: [{ id: 'i1', handler_id: 'donki_proforma', type: 'proforma_invoice' }] } })
    await db().query(`update ucp.checkout set jovahagyas = 'elutasitva', dontotte = 'fusteszt', dontes_oka = 'teszt: nem vállaljuk', dontes_ido = now() where id = $1`, [c2.id])
    const elut = await var_(async () => (await keres('GET', `/ucp/checkout-sessions/${c2.id}`)).adat.status === 'canceled')
    const g2 = (await keres('GET', `/ucp/checkout-sessions/${c2.id}`)).adat
    check('elutasítás: canceled, order_rejected az indokkal, rendelés nincs', elut && kod(g2, 'order_rejected') && !g2.order && JSON.stringify(g2.messages).includes('nem vállaljuk'), g2.messages)
    const c3 = (await keres('POST', '/ucp/checkout-sessions', kosar)).adat
    const mg = await keres('POST', `/ucp/checkout-sessions/${c3.id}/cancel`, {})
    check('megszakítás: canceled', mg.adat.status === 'canceled', mg.adat?.status)
    const mg2 = await keres('POST', `/ucp/checkout-sessions/${c3.id}/cancel`, {})
    const mod = await keres('PUT', `/ucp/checkout-sessions/${c3.id}`, kosar)
    const lz3 = await keres('POST', `/ucp/checkout-sessions/${c3.id}/complete`, { payment: { instruments: [{ id: 'i1', handler_id: 'donki_proforma' }] } })
    check('megszakított checkout: újra megszakítás, módosítás és lezárás 409', mg2.statusz === 409 && mod.statusz === 409 && lz3.statusz === 409, [mg2.statusz, mod.statusz, lz3.statusz])
    const nincs = await keres('GET', '/ucp/checkout-sessions/chk_nincs')
    check('ismeretlen checkout: 404', nincs.statusz === 404, nincs.statusz)

    // ------------------------------------------------------------------ 5. jogosultság
    szakasz('Az ucp MCP-szerepkör korlátai')
    const u = await McpKapcsolat.nyit('ucp', randomUUID(), ['sales', 'orders', 'finance'])
    try {
      const jov = await u.vegrehajt('approve_quote', { quoteId: elotteQ.quoteId })
      const lem = await u.vegrehajt('cancel_order', { orderId: g.order?.id ?? 'RND-100000', reason: 'teszt' })
      const db_ = await u.vegrehajt('issue_proforma', { orderId: g.order?.id ?? 'RND-100000' })
      check('nem hagyhat jóvá ajánlatot, nem mondhat le rendelést, nem állíthat ki díjbekérőt (FORBIDDEN)', [jov, lem, db_].every((r) => !r.ok && r.hibakod === 'FORBIDDEN'), [jov, lem, db_].map((r) => (r.ok ? 'ok' : r.hibakod)))
      const olv = await u.vegrehajt('get_order', { orderId: g.order?.id ?? 'RND-100000' })
      check('olvashat (get_order)', olv.ok, olv)
    } finally {
      await u.zar()
    }
  } finally {
    for (const r of rendelesek) await m.probal('cancel_order', { orderId: r, reason: 'füstteszt: takarítás' })
    kapu.kill()
    execFileSync('docker', ['start', 'donki-ucp-gateway-1'], { stdio: 'ignore' })
    srv.close()
    await m.zar()
    await dbZar()
  }
  zaras(kezdet, 'Minden ellenőrzés sikeres – a UCP-átjáró kész.')
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
