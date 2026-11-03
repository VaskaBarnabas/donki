/**
 * 18. fázis füstteszt (determinisztikus, modell nélkül): a háttérfigyelő – eseményvezérelt kivételkezelő.
 * A teszt maga hozza létre a helyzeteket (tesztadat nélkül):
 *   - valódi készlethiány a rendelés jóváhagyásakor (J1) – a rendeléskezelő eseménysorán át;
 *   - valódi minimum alá csökkenés a raktárban (J4) – a raktár figyelmeztetése, majd a visszatöltés utáni lezárás;
 *   - késő csomag (J3) és sikertelen fizetés (J5) – szintetikus esemény a rendszer saját sorában;
 *   - lejárt tartozások (J6) a számlázó aktuális állapota szerint;
 *   - a J7–J9 időküszöbei egy kitalált MCP-válasszal.
 * Ellenőrzi: jelzés a megfelelő szerepkörnek és súlyossággal, duplikáció-szűrés, magától lezárás, két párhuzamos
 * figyelő, a monitor szerepkör csak olvas (az MCP-n FORBIDDEN), a sor-kulcs a táblákat nem éri el, az elemzés
 * (tesztmodellel) és a modellhiba utáni sablonszöveg, a háttér-mód jóváhagyás nélkül elutasít.
 *
 * Előfeltétel: npm run stack:up; a portál háttérfigyelője ne fusson közben (állítsd le az npm run dev-et, vagy
 * AGENS_FIGYELO=ki) – a teszt ugyanazt a zárolást kéri.
 * Futtatás: npx tsx scripts/smoke/18-figyelo.ts   (~1–2 perc)
 */
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { AIMessage } from '@langchain/core/messages'
import '../../agens/kozos/kornyezet'
import { elemzoKeres, valaszBontas } from '../../agens/figyelo/elemzo'
import { Figyelo, zarolas } from '../../agens/figyelo/figyelo'
import { FIGYELO } from '../../agens/kozos/kornyezet'
import { j7Ajanlat, j8Rendeles, j9Hibajegy, KUSZOB, munkanapok } from '../../agens/figyelo/szabalyok'
import { Agens } from '../../agens/futtato'
import { McpKapcsolat } from '../../agens/kozos/mcp'
import type { AgensModell } from '../../agens/kozos/modell'
import { db, dbZar } from '../../agens/kozos/naplo'
import { ForgatokonyvModell } from '../../agens/teszt-modell'

let failed = 0
let osszes = 0
function check(name: string, ok: boolean, detail: unknown) {
  osszes++
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}
let lepes = 0
const szakasz = (c: string) => console.log(`\n${++lepes}. ${c}`)
const var_ = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Tesztmodell az elemzéshez: a háromsoros formában válaszol, vagy (hiba módban) nem érhető el. */
class ElemzoModell implements AgensModell {
  readonly nev = 'teszt-elemzo'
  hiba = false
  async dont<T>(): Promise<{ adat: T; hasznalat: { tokenBe: number; tokenKi: number } }> {
    throw new Error('az elemzés háttér-módban fut, front-desk nélkül')
  }
  async valaszol() {
    if (this.hiba) throw new Error('a modell nem érhető el (teszt)')
    return { uzenet: new AIMessage('ELEMZÉS: Teszt elemzés a jelzésről.\nJAVASLAT: Teszt javaslat.\nKÉRÉS: Teszt kérés az asszisztensnek.'), hasznalat: { tokenBe: 100, tokenKi: 30 } }
  }
}

type Sor = { id: number; kulcs: string; szabaly: string; sulyossag: string; szerepek: string[]; allapot: string; eszlelesek: number; elemzes: string; elemzes_modell: boolean; futas_id: string | null; kovetkezo_elemzes: Date | null; lezarta: string | null; lezaras_oka: string | null }
async function jelzesek(kulcs: string): Promise<Sor[]> {
  return (await db().query<Sor>('select * from agens.jelzes where kulcs = $1 order by id', [kulcs])).rows
}
const nyitott = async (kulcs: string) => (await jelzesek(kulcs)).find((j) => ['UJ', 'NYITOTT', 'FOLYAMATBAN'].includes(j.allapot))

/** Szintetikus esemény a rendszer saját sorában (a figyelő sor-kulcsával; ugyanaz az alak, mint a rendszeré). */
async function kuld(forras: keyof typeof FIGYELO.sorok, message: Record<string, unknown>) {
  const s = FIGYELO.sorok[forras]
  const r = await fetch(`${s.url}/rpc/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.kulcs()}`, 'Content-Profile': 'pgmq_public', 'Content-Type': 'application/json' },
    body: JSON.stringify({ queue_name: s.sor, message, sleep_seconds: 0 }),
  })
  if (!r.ok) throw new Error(`send ${forras}: ${r.status}`)
}

function mcpHivasok(futasId: string): { tool: string }[] {
  const ki = execFileSync('docker', ['exec', 'donki-mcp-db-1', 'psql', '-U', 'postgres', '-At', '-c', `select coalesce(json_agg(json_build_object('tool', tool) order by id), '[]') from mcp.tool_calls where agent_run_id = '${futasId}'`], { encoding: 'utf8' })
  return JSON.parse(ki.trim())
}

/** Az események feldolgozása, amíg a feltétel nem teljesül (a rendszerek aszinkron küldenek). */
async function amig(f: Figyelo, felt: () => Promise<boolean>, mp = 60): Promise<boolean> {
  for (let i = 0; i < mp / 3; i++) {
    await f.esemenyKor()
    if (await felt()) return true
    await var_(3000)
  }
  return false
}

async function main() {
  const kezdet = Date.now()
  const zar = await zarolas()
  if (!zar) {
    console.error('A háttérfigyelőt most egy másik folyamat futtatja (a portál?). Állítsd le az npm run dev-et, vagy indítsd AGENS_FIGYELO=ki-vel, és futtasd újra.')
    process.exit(1)
  }
  const modell = new ElemzoModell()
  const agens = await Agens.nyit({ modell })
  const figyelo = new Figyelo(agens)
  const masodik = new Figyelo(agens)
  const admin = await McpKapcsolat.nyit('admin', randomUUID(), ['orders', 'sales', 'inventory'])
  const hiv = async (nev: string, args: Record<string, unknown>) => {
    const r = await admin.hiv(nev, args, randomUUID())
    return { ok: r.ok, hibakod: r.hibakod, data: r.ok ? JSON.parse(r.szoveg) : null, szoveg: r.szoveg }
  }
  let tesztRendeles: string | null = null
  let visszatolt: { sku: string; db: number } | null = null

  try {
    szakasz('Jogosultság: a monitor szerepkör csak olvas, a sor-kulcs csak a sort éri el')
    const monitor = await McpKapcsolat.nyit('monitor', randomUUID(), ['orders', 'sales'])
    const olvas = await monitor.olvas<{ items: unknown[] }>('list_orders', { limit: 1 })
    check('monitor: olvasó eszköz (list_orders) működik', Array.isArray(olvas.items), olvas)
    const ir = await monitor.hiv('create_customer', { name: 'Figyelő Teszt Kft', taxNumber: '12345676-2-42' }, randomUUID())
    check('monitor: író eszköz (create_customer) → FORBIDDEN az MCP-n', !ir.ok && ir.hibakod === 'FORBIDDEN', ir)
    let olvasoTilt = false
    try {
      await monitor.olvas('create_customer', {})
    } catch {
      olvasoTilt = true
    }
    check('a figyelő kódbeli olvasója (olvas) író eszközt nem is hív', olvasoTilt, null)
    await monitor.zar()
    const tabla = await fetch(`${FIGYELO.sorok.orders.url}/orders?limit=1`, { headers: { Authorization: `Bearer ${FIGYELO.sorok.orders.kulcs()}` } })
    check(`sor-kulcs: a rendeléskezelő táblái nem érhetők el (HTTP ${tabla.status})`, tabla.status === 401 || tabla.status === 403, tabla.status)

    szakasz('Előkészítés: a sorokban várakozó korábbi események feldolgozása')
    const elso = await figyelo.esemenyKor()
    check(`${elso.esemeny} korábbi esemény feldolgozva, hiba nélkül`, elso.hibak.length === 0, elso.hibak)

    szakasz('J5: sikertelen fizetés (szintetikus esemény) – duplikáció, két párhuzamos figyelő, lezárás fizetéskor')
    const ref = `DB-2099-${String(Date.now()).slice(-6)}`
    const fizetes = { paymentId: randomUUID(), invoiceRef: ref, amountMinor: 6554000, currency: 'HUF', stripeEventId: 'evt_teszt', failureMessage: 'kártya elutasítva (teszt)', occurredAt: new Date().toISOString() }
    await kuld('payments', { ...fizetes, type: 'payment.failed' })
    await Promise.all([figyelo.esemenyKor(), masodik.esemenyKor()])
    let j5 = await jelzesek(`fizetes:${ref}`)
    check(`két párhuzamos figyelő után pontosan egy jelzés (${j5.length})`, j5.length === 1 && j5[0].eszlelesek === 1, j5)
    check(`J5: közepes, pénzügy + értékesítő látja, „${j5[0]?.elemzes?.slice(0, 60)}…”`, j5[0]?.szabaly === 'J5' && j5[0].sulyossag === 'kozepes' && j5[0].szerepek.join() === 'finance,sales' && /65 540 Ft/.test(j5[0].elemzes), j5[0])
    await kuld('payments', { ...fizetes, type: 'payment.failed' })
    await figyelo.esemenyKor()
    j5 = await jelzesek(`fizetes:${ref}`)
    check('ugyanaz az esemény még egyszer: nincs új jelzés, az észlelések száma 2', j5.length === 1 && j5[0].eszlelesek === 2, j5)

    modell.hiba = true
    await figyelo.elemzesKor({ korlat: false, id: j5[0].id })
    let j5e = (await jelzesek(`fizetes:${ref}`))[0]
    check('modellhiba: a jelzés megjelenik (NYITOTT) a sablonszöveggel, és később újrapróbálja', j5e.allapot === 'NYITOTT' && !j5e.elemzes_modell && !!j5e.kovetkezo_elemzes && /bizonylat/.test(j5e.elemzes), j5e)
    modell.hiba = false

    await kuld('payments', { ...fizetes, type: 'payment.succeeded' })
    await figyelo.esemenyKor()
    j5e = (await jelzesek(`fizetes:${ref}`))[0]
    check(`kifizették → magától lezárva (${j5e.allapot}, ${j5e.lezarta}: ${j5e.lezaras_oka})`, j5e.allapot === 'MEGOLDVA' && j5e.lezarta === 'figyelo', j5e)

    szakasz('J3: késő csomag (szintetikus esemény), lezárás kézbesítéskor')
    const no = 900000 + Math.floor(Math.random() * 99999)
    await kuld('orders', { event: 'SHIPMENT_DELAYED', carrier: 'GLS', trackingNo: 'TESZT123', eta: '2099-01-02', orderNo: no, orderRef: `RND-${no}`, ts: new Date().toISOString() })
    await figyelo.esemenyKor()
    const j3 = await nyitott(`szallitas:${no}`)
    check(`J3: „${j3?.elemzes}” – logisztika + értékesítő`, j3?.szabaly === 'J3' && j3.szerepek.join() === 'logistics,sales' && /GLS/.test(j3.elemzes), j3)
    await kuld('orders', { event: 'ORDER_STATE_CHANGED', from: 'TELJESITES_ALATT', to: 'SZALLITVA', action: 'szallitas', orderNo: no, orderRef: `RND-${no}`, ts: new Date().toISOString() })
    await figyelo.esemenyKor()
    check('kézbesítve (ORDER_STATE_CHANGED → SZALLITVA) → J3 lezárva', (await jelzesek(`szallitas:${no}`))[0]?.allapot === 'MEGOLDVA', await jelzesek(`szallitas:${no}`))

    szakasz('J1: valódi készlethiány a rendelés jóváhagyásakor (rendeléskezelő → order_events → jelzés)')
    const vevo = (await hiv('search_customers', { query: 'Bakony' })).data.items[0]
    const keszlet = (await hiv('check_stock', { skus: ['TK-00001'] })).data.items[0]
    let q = (await hiv('create_quote', { customerId: vevo.customerId, lines: [{ sku: 'TK-00001', quantity: keszlet.available + 5 }] })).data.quote
    if (q.nextAction?.tool === 'request_quote_approval') {
      await hiv('request_quote_approval', { quoteId: q.quoteId, reason: 'figyelő teszt' })
      q = (await hiv('approve_quote', { quoteId: q.quoteId })).data.quote
    }
    const elfogad = await hiv('accept_quote', { quoteId: q.quoteId })
    tesztRendeles = elfogad.data?.orderId ?? null
    check(`rendelés ${tesztRendeles}: ${keszlet.available + 5} db TK-00001 (szabad: ${keszlet.available})`, !!tesztRendeles, elfogad)
    const jov = await hiv('approve_order', { orderId: tesztRendeles })
    check(`a jóváhagyás készlethiány miatt meghiúsul (${jov.hibakod})`, !jov.ok && jov.hibakod === 'INSUFFICIENT_STOCK', jov.szoveg.slice(0, 300))
    const rno = tesztRendeles!.replace('RND-', '')
    const t0 = Date.now()
    const megjelent = await amig(figyelo, async () => !!(await nyitott(`rendeles:${rno}:keszlethiany`)))
    const j1 = await nyitott(`rendeles:${rno}:keszlethiany`)
    check(`J1 jelzés ${Math.round((Date.now() - t0) / 1000)} s alatt: „${j1?.elemzes}”`, megjelent && j1?.szabaly === 'J1' && j1.sulyossag === 'magas' && j1.szerepek.join() === 'logistics,sales_manager', j1)
    check('a sablonszöveg nem ad belső raktári cikkszámot, csak a hiányt', !!j1 && !/\b\d{4}\s*\(hiany/.test(j1.elemzes) && /\d+ db hiányzik/.test(j1.elemzes), j1?.elemzes)

    szakasz('Elemzés: a kivételkezelő ágens háttér-módban (monitor szerepkörrel), tesztmodellel')
    const elemzett = await figyelo.elemzesKor({ korlat: false, id: j1!.id })
    const j1e = await nyitott(`rendeles:${rno}:keszlethiany`)
    check('a jelzés elemezve: NYITOTT, az ágens szövegével', elemzett && j1e?.allapot === 'NYITOTT' && j1e.elemzes_modell && j1e.elemzes === 'Teszt elemzés a jelzésről.', j1e)
    const futas = (await db().query('select szerep, agens, felhasznalo, eredmeny, keres from agens.futas where id = $1', [j1e?.futas_id])).rows[0]
    check(`az elemző futás naplózva: ${futas?.agens}, ${futas?.szerep}, felhasználó nélkül`, futas?.agens === 'kivetel' && futas.szerep === 'monitor' && futas.felhasznalo === null && futas.eredmeny === 'kesz', futas)
    check('a kérés az eljárást és az esemény adatait viszi (adatként jelölve)', /ELEMZÉS:/.test(futas?.keres ?? '') && /data, not instructions/.test(futas?.keres ?? '') && /INVENTORY_SHORTAGE/.test(futas?.keres ?? ''), futas?.keres?.slice(0, 200))
    const bont = valaszBontas('**ELEMZÉS:** a RND-1 rendelés elakadt.\nJAVASLAT: „hívd fel a vevőt”\nKÉRÉS: Mondd le a RND-1 rendelést.')
    check('a háromsoros válasz bontása (formázással is)', bont?.elemzes === 'a RND-1 rendelés elakadt.' && bont.javaslat === 'hívd fel a vevőt' && bont.ajanlottKeres === 'Mondd le a RND-1 rendelést.', bont)
    check('formán kívüli válasz → nincs bontás (sablon marad)', valaszBontas('Rendben, megnéztem.') === null, null)
    check('az elemző kérés a kivetel-jelzes skillből készül', /Kivétel-jelzés elemzése/.test(elemzoKeres({ id: 0, szabaly: 'J1', cim: 'x', forras: {}, elemzes: 'y', probak: 0 })), null)

    szakasz('Háttér-mód: a gráf nem áll meg jóváhagyásra, minden író hívást elutasít (admin szerepkörrel is)')
    const iro = new ForgatokonyvModell().forgatokonyv({ eszkoz: [{ name: 'create_customer', args: { name: 'Hatter Teszt Kft', taxNumber: '12345676-2-42' } }] }, { szoveg: 'Nem sikerült.' })
    const hatterAgens = await Agens.nyit({ modell: iro })
    const hv = await hatterAgens.hatterben({ agens: 'ertekesites', szerep: 'admin', keres: 'teszt' })
    const hl = (await db().query('select eszkoz, jovahagyas, hibakod from agens.lepes where futas_id = $1 and tipus = $2', [hv.futasId, 'jovahagyas'])).rows
    check(`nincs megállás (${hv.allapot}), az írás elutasítva (${hl[0]?.hibakod})`, hv.allapot === 'kesz' && hl.length === 1 && hl[0].jovahagyas === 'elutasitva', { hv, hl })
    check('az MCP-hez el sem jutott író hívás', mcpHivasok(hv.futasId).length === 0, mcpHivasok(hv.futasId))
    await hatterAgens.zar()

    szakasz('J4: valódi minimum alá csökkenés (raktár → inventory_alerts → MCP-n SKU szerint), lezárás visszatöltés után')
    const jeloltek = (await hiv('check_stock', { skus: Array.from({ length: 12 }, (_, i) => `TK-${String(i + 1).padStart(5, '0')}`) })).data.items as { sku: string; onHand: number; reserved: number; available: number; minimum: number }[]
    const c = jeloltek.find((x) => x.minimum > 0 && x.onHand >= x.minimum && x.available >= x.onHand - x.minimum + 1)
    check(`teszttermék: ${c?.sku} (készlet ${c?.onHand}, minimum ${c?.minimum}, szabad ${c?.available})`, !!c, jeloltek)
    if (c) {
      const le = c.onHand - c.minimum + 1
      const kor = await hiv('adjust_stock', { sku: c.sku, type: 'correction', quantity: -le, reason: 'figyelő teszt (ideiglenes)' })
      visszatolt = kor.ok ? { sku: c.sku, db: le } : null
      check(`korrekció −${le} db → minimum alá`, kor.ok, kor.szoveg.slice(0, 200))
      const j4ok = await amig(figyelo, async () => !!(await nyitott(`keszlet:${c.sku}`)))
      const j4 = await nyitott(`keszlet:${c.sku}`)
      check(`J4: „${j4?.elemzes}”`, j4ok && j4?.szabaly === 'J4' && j4.szerepek.join() === 'logistics' && new RegExp(c.sku).test(j4.elemzes), j4)
      await hiv('adjust_stock', { sku: c.sku, type: 'correction', quantity: le, reason: 'figyelő teszt (visszatöltés)' })
      visszatolt = null
      const r = await figyelo.idozitettKor()
      const j4z = (await jelzesek(`keszlet:${c.sku}`)).at(-1)
      check(`visszatöltés után az időzített kör lezárja (${j4z?.allapot}: ${j4z?.lezaras_oka})`, j4z?.allapot === 'MEGOLDVA', { j4z, hibak: r.hibak })
    }

    szakasz('J6: lejárt tartozások a számlázó állapota szerint; ismételt kör: nincs új jelzés')
    const lejart = await (async () => {
      const m = await McpKapcsolat.nyit('monitor', randomUUID(), ['finance'])
      try {
        return await m.olvas<{ items: { documentNo: string }[]; totalCount: number }>('list_overdue_documents', { limit: 50 })
      } finally {
        await m.zar()
      }
    })()
    const nyitottJ6 = async () => (await db().query<{ kulcs: string; eszlelesek: number }>(`select kulcs, eszlelesek from agens.jelzes where szabaly = 'J6' and allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN')`)).rows
    const j6a = await nyitottJ6()
    check(`${j6a.length} nyitott J6 = ${lejart.items.length} lejárt bizonylat`, j6a.length === lejart.items.length && lejart.items.every((d) => j6a.some((j) => j.kulcs === `tartozas:${d.documentNo}`)), { j6a, lejart: lejart.items.map((d) => d.documentNo) })
    const r2 = await figyelo.idozitettKor()
    const j6b = await nyitottJ6()
    check('második időzített kör: ugyanannyi J6, az észlelések száma nőtt', j6b.length === j6a.length && j6b.every((j) => j.eszlelesek >= 2), { j6b, hibak: r2.hibak })

    szakasz('J7–J9: időküszöbök (kitalált MCP-válasszal) és a munkanapok')
    check('munkanapok: péntek 12:00 → hétfő 12:00 = 1 munkanap', Math.abs(munkanapok(new Date('2026-10-30T12:00:00'), new Date('2026-11-02T12:00:00')) - 1) < 0.01, munkanapok(new Date('2026-10-30T12:00:00'), new Date('2026-11-02T12:00:00')))
    const regen = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const frissen = new Date().toISOString()
    const hamis = {
      olvas: async (nev: string, args: Record<string, unknown>) => {
        if (nev === 'list_quotes') return { items: [{ quoteId: 'AJ-2026-0001', status: 'pending_approval', customer: { name: 'Teszt' }, totalNet: { amount: '100000', currency: 'HUF' }, totalDiscountPct: 20 }, { quoteId: 'AJ-2026-0002', status: 'pending_approval', customer: { name: 'Teszt' }, totalNet: { amount: '1', currency: 'HUF' }, totalDiscountPct: 18 }], nextCursor: null }
        if (nev === 'list_orders') return { items: args.status === 'received' ? [{ orderId: 'RND-100001', status: 'received', statusLabel: 'Rögzítve', customer: { name: 'Teszt' }, updatedAt: regen, processManaged: true }, { orderId: 'RND-100002', status: 'received', statusLabel: 'Rögzítve', customer: { name: 'Teszt' }, updatedAt: frissen, processManaged: true }] : [], nextCursor: null }
        if (nev === 'list_tickets') return { items: args.status === 'new' ? [{ ticketId: 'HJ-000001', status: 'new', statusLabel: 'Új', customer: { name: 'Teszt' }, orderId: null, updatedAt: regen }, { ticketId: 'HJ-000002', status: 'new', statusLabel: 'Új', customer: { name: 'Teszt' }, orderId: null, updatedAt: frissen }] : [], nextCursor: null }
        throw new Error(nev)
      },
    } as unknown as McpKapcsolat
    const j7 = await j7Ajanlat(hamis, async () => new Map([['ajanlat:AJ-2026-0001', new Date(Date.now() - (KUSZOB.ajanlatOra + 1) * 3_600_000)], ['ajanlat:AJ-2026-0002', new Date()]]))
    check(`J7: csak a ${KUSZOB.ajanlatOra} óránál régebben váró ajánlat jelez, de mindkettő „fennáll”`, j7.jelzesek.map((j) => j.kulcs).join() === 'ajanlat:AJ-2026-0001' && j7.fennall.size === 2, j7)
    const j8 = await j8Rendeles(hamis)
    check(`J8: csak a ${KUSZOB.rendelesMunkanap}+ munkanapja álló rendelés`, j8.jelzesek.map((j) => j.kulcs).join() === 'elakadt:100001', j8.jelzesek)
    const j9 = await j9Hibajegy(hamis)
    check(`J9: csak a ${KUSZOB.hibajegyMunkanap}+ munkanapja nem változott hibajegy`, j9.jelzesek.map((j) => j.kulcs).join() === 'hibajegy:HJ-000001', j9.jelzesek)

    szakasz('Lezárás eseményből: a tesztrendelés lemondása → a J1 jelzés magától lezárul')
    const lemond = await hiv('cancel_order', { orderId: tesztRendeles, reason: 'figyelő teszt' })
    check(`${tesztRendeles} lemondva`, lemond.ok, lemond.szoveg.slice(0, 200))
    const lezart = await amig(figyelo, async () => (await jelzesek(`rendeles:${rno}:keszlethiany`)).every((j) => j.allapot === 'MEGOLDVA'))
    check('J1 → MEGOLDVA (a rendelés továbblépett)', lezart, await jelzesek(`rendeles:${rno}:keszlethiany`))
    tesztRendeles = null
  } finally {
    if (visszatolt) await hiv('adjust_stock', { sku: visszatolt.sku, type: 'correction', quantity: visszatolt.db, reason: 'figyelő teszt (visszatöltés)' }).catch(() => null)
    if (tesztRendeles) await hiv('cancel_order', { orderId: tesztRendeles, reason: 'figyelő teszt' }).catch(() => null)
    await admin.zar()
    await agens.zar()
    await zar.end()
    await dbZar()
  }

  console.log(`\n${osszes - failed}/${osszes} OK (${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
