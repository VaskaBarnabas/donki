// A háttérfigyelő szabályai (18. fázis, docs/FAZIS18_TERV.md §4). A riasztásról kód dönt, nem a modell: itt dől el,
// mi számít kivételnek, ki látja, milyen súlyos, és mikor zárul le magától. A modell csak a magyarázatot és a javaslatot
// írja meg (elemzo.ts); ha nem elérhető, a sablonszöveg marad.
//
//   eseményből:  J1 készlethiány a jóváhagyáskor · J2 más okból meghiúsult rendelési lépés · J3 késő csomag
//                J5 sikertelen / lejárt fizetés · (a raktár minimum-figyelmeztetése a J4 azonnali ellenőrzését indítja)
//   időzítve:    J4 minimum alatti készlet · J6 lejárt tartozás · J7 régóta jóváhagyásra váró ajánlat
//                J8 elakadt rendelés · J9 régóta nem változott hibajegy

import type { McpKapcsolat } from '../kozos/mcp'
import type { Esemeny } from './forrasok'

export type Sulyossag = 'alacsony' | 'kozepes' | 'magas'
export type Szabaly = 'J1' | 'J2' | 'J3' | 'J4' | 'J5' | 'J6' | 'J7' | 'J8' | 'J9'

export type UjJelzes = {
  kulcs: string
  szabaly: Szabaly
  sulyossag: Sulyossag
  szerepek: string[]
  cim: string
  forras: Record<string, unknown>
  /** a lezárás ellenőrzéséhez (pl. a rendelés állapota az észleléskor) */
  hivatkozas: Record<string, unknown>
  /** sablonszöveg – ez látszik, amíg (vagy ha) az ágens elemzése nem készül el */
  elemzes: string
  javaslat: string
  ajanlottKeres: string
}

/** Egy nyitott jelzés a lezárás ellenőrzéséhez. */
export type NyitottJelzes = { id: number; kulcs: string; szabaly: Szabaly; hivatkozas: Record<string, unknown> }

/** Küszöbök (egy helyen). */
export const KUSZOB = {
  /** J7: ennyi órája vár jóváhagyásra egy ajánlat (a figyelő első észlelésétől) */
  ajanlatOra: 4,
  /** J8: ennyi munkanapja áll egy rendelés ugyanabban az állapotban */
  rendelesMunkanap: 2,
  /** J9: ennyi munkanapja nem változott egy nyitott hibajegy */
  hibajegyMunkanap: 3,
}

export const SZABALY_NEV: Record<Szabaly, string> = {
  J1: 'Készlethiány a jóváhagyáskor',
  J2: 'Meghiúsult rendelési lépés',
  J3: 'Késő csomag',
  J4: 'Minimum alatti készlet',
  J5: 'Sikertelen vagy lejárt fizetés',
  J6: 'Lejárt tartozás',
  J7: 'Jóváhagyásra váró ajánlat',
  J8: 'Elakadt rendelés',
  J9: 'Régóta nyitott hibajegy',
}

// sima szóköz az ezresek között (mint az ágens válaszaiban: 65 540 Ft), nem a hu-HU nem törő szóköze
const ft = (amount: string | number) => `${Math.round(Number(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft`
const rnd = (orderNo: unknown) => `RND-${String(orderNo).replace(/^RND-/i, '')}`

/** Hétköznapok száma (törtként) két időpont között – a hétvége nem számít. */
export function munkanapok(tol: Date, ig: Date = new Date()): number {
  let ora = 0
  for (let t = tol.getTime(); t < ig.getTime(); t += 3_600_000) {
    const nap = new Date(t).getDay()
    if (nap !== 0 && nap !== 6) ora++
  }
  return ora / 24
}

// ---------------------------------------------------------------- eseményből

export type EsemenyEredmeny = {
  uj: UjJelzes[]
  /** lezárandó kulcsok (pontos egyezés vagy előtag, `*` a végén) */
  lezar: { kulcsok: string[]; ok: string }[]
  /** a raktár minimum-figyelmeztetése: azonnali J4 ellenőrzés */
  keszletEllenorzes: boolean
}

const RENDELES_VEG = ['delivered', 'completed', 'cancelled']
// a rendeléskezelő eseményei a legacy állapotnevet adják; az MCP a kanonikusat (mcp/servers/orders/lekepezes.ts)
const MINTA_ALLAPOT: Record<string, string> = { ROGZITETT: 'received', JOVAHAGYOTT: 'approved', TELJESITES_ALATT: 'in_fulfillment', SZALLITVA: 'delivered', SZAMLAZVA: 'awaiting_payment', LEZART: 'completed', LEMONDOTT: 'cancelled' }

export function esemenySzabaly(e: Esemeny): EsemenyEredmeny {
  const ki: EsemenyEredmeny = { uj: [], lezar: [], keszletEllenorzes: false }
  const a = e.adat
  if (e.forras === 'orders') {
    const orderId = rnd(a.orderNo)
    const no = String(a.orderNo)
    if (a.event === 'ORDER_ACTION_FAILED' && a.reason === 'INVENTORY_SHORTAGE') {
      // a részlet a raktár belső cikkszámát is tartalmazza („4717 (hiany: 5 db)”) – abból csak a hiány kerül a szövegbe
      const hiany = /hiany:\s*(\d+)/.exec(String(a.detail ?? ''))?.[1]
      ki.uj.push({
        kulcs: `rendeles:${no}:keszlethiany`,
        szabaly: 'J1',
        sulyossag: 'magas',
        szerepek: ['logistics', 'sales_manager'],
        cim: `Készlethiány: ${orderId} nem hagyható jóvá`,
        forras: a,
        hivatkozas: { orderId, allapot: a.state },
        elemzes: `A(z) ${orderId} rendelés jóváhagyása készlethiány miatt meghiúsult${hiany ? `: ${hiany} db hiányzik` : ''}; a raktár nem tudta lefoglalni a tételeket.`,
        javaslat: 'Egyeztess a vevővel: a mennyiség csökkentése a szabad készletre, másik termék ugyanabból a kategóriából, vagy várakozás a beérkezésig (részszállítás nincs).',
        ajanlottKeres: `A(z) ${orderId} rendelés jóváhagyása készlethiány miatt meghiúsult. Nézd meg, melyik tételből mennyi hiányzik és mennyi van raktáron, és javasolj megoldást.`,
      })
    } else if (a.event === 'ORDER_ACTION_FAILED') {
      ki.uj.push({
        kulcs: `rendeles:${no}:${String(a.action ?? 'lepes')}`,
        szabaly: 'J2',
        sulyossag: 'kozepes',
        szerepek: ['sales_manager'],
        cim: `Meghiúsult lépés: ${orderId} (${String(a.action ?? '?')})`,
        forras: a,
        hivatkozas: { orderId, allapot: a.state },
        elemzes: `A(z) ${orderId} rendelés „${String(a.action ?? '?')}” lépése meghiúsult: ${String(a.reason ?? 'ismeretlen ok')}.`,
        javaslat: 'Nézd meg a rendelés történetét, és döntsd el, újrapróbálható-e a lépés.',
        ajanlottKeres: `A(z) ${orderId} rendelés egyik lépése meghiúsult (${String(a.reason ?? '')}). Nézd meg a rendelés történetét, és mondd meg, mit tegyünk.`,
      })
    } else if (a.event === 'SHIPMENT_DELAYED') {
      ki.uj.push({
        kulcs: `szallitas:${no}`,
        szabaly: 'J3',
        sulyossag: 'kozepes',
        szerepek: ['logistics', 'sales'],
        cim: `Késő csomag: ${orderId}`,
        forras: a,
        hivatkozas: { orderId },
        elemzes: `A(z) ${orderId} rendelés csomagja késik (${String(a.carrier || 'futár')}${a.eta ? `, várható érkezés: ${String(a.eta).slice(0, 10)}` : ''}).`,
        javaslat: 'Tájékoztasd a vevőt a késésről.',
        ajanlottKeres: `A(z) ${orderId} rendelés csomagja késik. Nézd meg a szállítás állapotát, és írj egy rövid tájékoztató e-mailt a vevőnek.`,
      })
    } else if (a.event === 'ORDER_STATE_CHANGED') {
      // a rendelés továbblépett: a rá vonatkozó meghiúsult-lépés és elakadás jelzések okafogyottak
      ki.lezar.push({ kulcsok: [`rendeles:${no}:*`, `elakadt:${no}`], ok: `a rendelés továbblépett (${String(a.to)})` })
      if (RENDELES_VEG.includes(MINTA_ALLAPOT[String(a.to)] ?? String(a.to))) ki.lezar.push({ kulcsok: [`szallitas:${no}`], ok: 'a rendelés lezárult vagy kézbesítve' })
    }
  } else if (e.forras === 'payments') {
    const ref = String(a.invoiceRef ?? '')
    if ((a.type === 'payment.failed' || a.type === 'payment.expired') && ref) {
      const lejart = a.type === 'payment.expired'
      ki.uj.push({
        kulcs: `fizetes:${ref}`,
        szabaly: 'J5',
        sulyossag: 'kozepes',
        szerepek: ['finance', 'sales'],
        cim: `${lejart ? 'Lejárt' : 'Sikertelen'} fizetés: ${ref}`,
        forras: a,
        hivatkozas: { documentNo: ref },
        elemzes: `A(z) ${ref} bizonylat ${ft(Number(a.amountMinor ?? 0) / 100)} összegű kártyás fizetése ${lejart ? 'nem történt meg, a fizetési link lejárt' : `sikertelen volt${a.failureMessage ? ` (${String(a.failureMessage)})` : ''}`}.`,
        javaslat: 'Küldj a vevőnek új fizetési linket, vagy egyeztess vele más fizetési módról.',
        ajanlottKeres: `A(z) ${ref} bizonylat fizetése ${lejart ? 'lejárt' : 'sikertelen volt'}. Nézd meg a bizonylatot, és ha még fizetendő, készíts új fizetési linket.`,
      })
    } else if (a.type === 'payment.succeeded' && ref) {
      ki.lezar.push({ kulcsok: [`fizetes:${ref}`, `tartozas:${ref}`], ok: 'kifizették' })
    }
  } else if (e.forras === 'inventory' && a.tipus === 'MIN_KESZLET_ALATT') {
    // a figyelmeztetés a raktár belső cikkszámát adja – a jelzés a termékkód (SKU) szerint készül, az MCP-n
    ki.keszletEllenorzes = true
  }
  return ki
}

// ---------------------------------------------------------------- időzítve (MCP, monitor szerepkör)

type Money = { amount: string; currency: string }
type StockItem = { sku: string; name: string; onHand: number | null; reserved: number | null; available: number | null; minimum: number | null; belowMinimum: boolean | null }
type DocumentSummary = { documentNo: string; documentType: string; customer: { name: string }; total: Money; dueDate: string }
type QuoteSummary = { quoteId: string; status: string; customer: { name: string }; totalNet: Money; totalDiscountPct: number }
type OrderSummary = { orderId: string; status: string; statusLabel: string; customer: { name: string }; updatedAt: string; processManaged: boolean }
type TicketSummary = { ticketId: string; status: string; statusLabel: string; customer: { name: string }; orderId: string | null; updatedAt: string }

/** Egy időzített szabály eredménye: az új vagy ismét észlelt jelzések, és a most is fennálló kulcsok (a többi lezárható). */
export type IdozitettEredmeny = { szabaly: Szabaly; jelzesek: UjJelzes[]; fennall: Set<string>; ok: string }

async function minden<T>(mcp: McpKapcsolat, eszkoz: string, args: Record<string, unknown>, maxOldal = 10): Promise<T[]> {
  const ki: T[] = []
  let cursor: string | null = null
  for (let i = 0; i < maxOldal; i++) {
    const r: { items: T[]; nextCursor: string | null } = await mcp.olvas(eszkoz, { ...args, limit: 50, ...(cursor ? { cursor } : {}) })
    ki.push(...r.items)
    cursor = r.nextCursor
    if (!cursor) break
  }
  return ki
}

export async function j4Keszlet(mcp: McpKapcsolat): Promise<IdozitettEredmeny> {
  const { items } = await mcp.olvas<{ items: StockItem[] }>('list_low_stock')
  const jelzesek = items.map((i): UjJelzes => ({
    kulcs: `keszlet:${i.sku}`,
    szabaly: 'J4',
    sulyossag: (i.available ?? 0) <= 0 ? 'magas' : 'kozepes',
    szerepek: ['logistics'],
    cim: `Minimum alatt: ${i.name} (${i.sku})`,
    forras: i,
    hivatkozas: { sku: i.sku },
    elemzes: `A(z) ${i.name} (${i.sku}) készlete ${i.onHand ?? '?'} db, a minimum ${i.minimum ?? '?'} db; ebből ${i.reserved ?? 0} db le van foglalva, szabad ${i.available ?? '?'} db.`,
    javaslat: `Rendelj utána legalább ${Math.max(0, (i.minimum ?? 0) - (i.onHand ?? 0))} db-ot a minimum eléréséhez.`,
    ajanlottKeres: `A(z) ${i.sku} termék készlete a minimum alá csökkent. Mennyi van raktáron és lefoglalva, és mennyit rendeljünk utána?`,
  }))
  return { szabaly: 'J4', jelzesek, fennall: new Set(jelzesek.map((j) => j.kulcs)), ok: 'a készlet újra a minimum felett' }
}

export async function j6Tartozas(mcp: McpKapcsolat): Promise<IdozitettEredmeny> {
  const { items } = await mcp.olvas<{ items: DocumentSummary[] }>('list_overdue_documents', { limit: 50 })
  const jelzesek = items.map((d): UjJelzes => {
    const nap = Math.max(1, Math.floor((Date.now() - new Date(d.dueDate).getTime()) / 86_400_000))
    return {
      kulcs: `tartozas:${d.documentNo}`,
      szabaly: 'J6',
      sulyossag: nap > 30 ? 'magas' : nap > 7 ? 'kozepes' : 'alacsony',
      szerepek: ['finance'],
      cim: `Lejárt tartozás: ${d.documentNo} (${d.customer.name})`,
      forras: d,
      hivatkozas: { documentNo: d.documentNo },
      elemzes: `A(z) ${d.documentNo} bizonylat (${d.customer.name}, ${ft(d.total.amount)}) fizetési határideje ${d.dueDate} volt, ${nap} napja lejárt.`,
      javaslat: nap > 30 ? 'Hívd fel a vevőt, és fontold meg a további szállítások felfüggesztését.' : 'Küldj a vevőnek udvarias fizetési emlékeztetőt.',
      ajanlottKeres: `A(z) ${d.documentNo} bizonylat fizetési határideje ${nap} napja lejárt. Nézd meg a bizonylatot, és írj egy udvarias fizetési emlékeztetőt a vevőnek.`,
    }
  })
  return { szabaly: 'J6', jelzesek, fennall: new Set(jelzesek.map((j) => j.kulcs)), ok: 'kifizették vagy már nem lejárt' }
}

/** J7: a jóváhagyásra váró ajánlatok – az ajánlatlista nem ad létrehozási időt, ezért az első észlelés számít. */
export async function j7Ajanlat(mcp: McpKapcsolat, elsoEszleles: (kulcsok: string[]) => Promise<Map<string, Date>>): Promise<IdozitettEredmeny> {
  const varok = await minden<QuoteSummary>(mcp, 'list_quotes', { status: 'pending_approval' })
  const kulcsok = varok.map((q) => `ajanlat:${q.quoteId}`)
  const elso = await elsoEszleles(kulcsok)
  const jelzesek: UjJelzes[] = []
  for (const q of varok) {
    const ora = (Date.now() - (elso.get(`ajanlat:${q.quoteId}`) ?? new Date()).getTime()) / 3_600_000
    if (ora < KUSZOB.ajanlatOra) continue
    jelzesek.push({
      kulcs: `ajanlat:${q.quoteId}`,
      szabaly: 'J7',
      sulyossag: 'alacsony',
      szerepek: ['sales_manager'],
      cim: `Jóváhagyásra vár: ${q.quoteId} (${q.customer.name})`,
      forras: q,
      hivatkozas: { quoteId: q.quoteId },
      elemzes: `A(z) ${q.quoteId} ajánlat (${q.customer.name}, nettó ${ft(q.totalNet.amount)}, ${q.totalDiscountPct}% kedvezmény) legalább ${Math.floor(ora)} órája vár kedvezmény-jóváhagyásra.`,
      javaslat: 'Döntsd el, jóváhagyod-e a kedvezményt, hogy a vevő elfogadhassa az ajánlatot.',
      ajanlottKeres: `A(z) ${q.quoteId} ajánlat kedvezmény-jóváhagyásra vár. Mutasd meg az ajánlat tételeit és a kedvezményt, hogy dönthessek a jóváhagyásáról.`,
    })
  }
  return { szabaly: 'J7', jelzesek, fennall: new Set(kulcsok), ok: 'jóváhagyták vagy elutasították' }
}

const NYITOTT_RENDELES = ['received', 'approved', 'in_fulfillment', 'awaiting_payment'] as const

export async function j8Rendeles(mcp: McpKapcsolat): Promise<IdozitettEredmeny> {
  const rendelesek = (await Promise.all(NYITOTT_RENDELES.map((s) => minden<OrderSummary>(mcp, 'list_orders', { status: s })))).flat().filter((o) => o.processManaged)
  const jelzesek: UjJelzes[] = []
  for (const o of rendelesek) {
    const nap = munkanapok(new Date(o.updatedAt))
    if (nap < KUSZOB.rendelesMunkanap) continue
    const no = o.orderId.replace(/^RND-/i, '')
    jelzesek.push({
      kulcs: `elakadt:${no}`,
      szabaly: 'J8',
      sulyossag: nap >= 2 * KUSZOB.rendelesMunkanap ? 'magas' : 'kozepes',
      szerepek: ['sales_manager'],
      cim: `Elakadt rendelés: ${o.orderId} (${o.statusLabel})`,
      forras: o,
      hivatkozas: { orderId: o.orderId, updatedAt: o.updatedAt },
      elemzes: `A(z) ${o.orderId} rendelés (${o.customer.name}) ${Math.floor(nap)} munkanapja „${o.statusLabel}” állapotban áll.`,
      javaslat: 'Nézd meg, mi a következő lépés, és ki a felelőse.',
      ajanlottKeres: `A(z) ${o.orderId} rendelés ${Math.floor(nap)} munkanapja nem mozdult. Nézd meg az állapotát és a következő lépést, és mondd meg, mit tegyünk.`,
    })
  }
  return { szabaly: 'J8', jelzesek, fennall: new Set(jelzesek.map((j) => j.kulcs)), ok: 'a rendelés továbblépett' }
}

export async function j9Hibajegy(mcp: McpKapcsolat): Promise<IdozitettEredmeny> {
  const jegyek = (await Promise.all(['new', 'in_progress'].map((s) => minden<TicketSummary>(mcp, 'list_tickets', { status: s })))).flat()
  const jelzesek: UjJelzes[] = []
  for (const t of jegyek) {
    const nap = munkanapok(new Date(t.updatedAt))
    if (nap < KUSZOB.hibajegyMunkanap) continue
    jelzesek.push({
      kulcs: `hibajegy:${t.ticketId}`,
      szabaly: 'J9',
      sulyossag: t.status === 'new' ? 'kozepes' : 'alacsony',
      szerepek: ['sales', 'sales_manager'],
      cim: `Régóta nyitott hibajegy: ${t.ticketId} (${t.customer.name})`,
      forras: t,
      hivatkozas: { ticketId: t.ticketId, updatedAt: t.updatedAt },
      elemzes: `A(z) ${t.ticketId} hibajegy (${t.customer.name}${t.orderId ? `, ${t.orderId}` : ''}) ${Math.floor(nap)} munkanapja nem változott („${t.statusLabel}”).`,
      javaslat: 'Nézd meg a hibajegyet, és tájékoztasd a vevőt a következő lépésről.',
      ajanlottKeres: `A(z) ${t.ticketId} hibajegy ${Math.floor(nap)} munkanapja nem változott. Nézd meg a részleteit, és javasolj következő lépést.`,
    })
  }
  return { szabaly: 'J9', jelzesek, fennall: new Set(jelzesek.map((j) => j.kulcs)), ok: 'a hibajegyen történt valami, vagy lezárták' }
}

/**
 * Az eseményből született jelzések (J1–J3, J5) lezárásának ellenőrzése az aktuális állapot szerint – ha a lezáró
 * esemény elveszett vagy a figyelő nem futott. Visszaad: a lezárás oka, vagy null (még fennáll).
 */
export async function fennallMeg(mcp: McpKapcsolat, j: NyitottJelzes): Promise<string | null> {
  if (j.szabaly === 'J1' || j.szabaly === 'J2' || j.szabaly === 'J3') {
    const { order } = await mcp.olvas<{ order: { status: string; shipment: { status: string } | null } }>('get_order', { orderId: j.hivatkozas.orderId })
    if (RENDELES_VEG.includes(order.status) || order.shipment?.status === 'delivered') return j.szabaly === 'J3' ? 'a csomagot kézbesítették' : 'a rendelés lezárult'
    if (j.szabaly !== 'J3' && j.hivatkozas.allapot && MINTA_ALLAPOT[String(j.hivatkozas.allapot)] && MINTA_ALLAPOT[String(j.hivatkozas.allapot)] !== order.status) return 'a rendelés továbblépett'
    return null
  }
  if (j.szabaly === 'J5') {
    const { document } = await mcp.olvas<{ document: { paid: boolean; status: string } }>('get_document', { documentNo: j.hivatkozas.documentNo })
    return document.paid ? 'kifizették' : document.status === 'not_payable' ? 'sztornózták, nem fizetendő' : null
  }
  return null
}
