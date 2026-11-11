// 21. fázis, UCP-átjáró: a kereskedői logika. A checkout mögött a meglévő ajánlat áll; az átjáró csak az MCP-n éri el a
// rendszereket, a szűk `ucp` szerepkörrel (olvasás + create_quote, accept_quote). Nyelvi modell nincs benne.
//
//   create/update → tételek ellenőrzése (katalógus, készlet) → vevő azonosítása (kapcsolattartói e-mail vagy adószám)
//                 → ajánlat (ügyfélcsoport-ár) → incomplete | requires_escalation | ready_for_complete
//   complete      → complete_in_progress, jóváhagyásra vár a portálon (D1: mindig emberi jóváhagyás)
//   jóváhagyás    → accept_quote → rendelés → completed + rendelés-webhook

import { createHash, randomUUID } from 'node:crypto'
import { McpKapcsolat } from '../agens/kozos/mcp'
import { AFA, ALAP_URL, B2B_BOVITMENY, FIZETESI_HANDLER, fillerre, KONFORMANCIA, LEJARAT_ORA, log, PENZNEM, SHOPPING_URL } from './beallitas'
import { boritek, type Platform } from './profil'
import * as t from './tarolo'

// ---------------------------------------------------------------- MCP

let kapcsolat: Promise<McpKapcsolat> | null = null
const mcp = () => (kapcsolat ??= McpKapcsolat.nyit('ucp', randomUUID(), ['sales', 'inventory', 'orders', 'finance']).catch((e) => ((kapcsolat = null), Promise.reject(e))))
type Valasz<T> = { ok: true; adat: T } | { ok: false; hibakod: string; uzenet: string }
async function hiv<T = Record<string, unknown>>(nev: string, args: Record<string, unknown>, idempotencia?: string): Promise<Valasz<T>> {
  const r = await (await mcp()).vegrehajt<T>(nev, args, idempotencia)
  if (!r.ok && r.hibakod === 'MCP_UNAVAILABLE') kapcsolat = null
  return r
}

// ---------------------------------------------------------------- típusok

type Uzenet = { type: 'error' | 'warning' | 'info'; code?: string; content: string; severity?: 'recoverable' | 'requires_buyer_input' | 'requires_buyer_review' | 'unrecoverable'; path?: string }
type Termek = { sku: string; name: string; listPrice: { amount: number }; active: boolean; stockTracked: boolean }
type Ajanlat = { quoteId: string; lines: { sku: string; name: string; quantity: number; listUnitPrice: { amount: number }; lineTotal: { amount: number } | null }[]; totalNet: { amount: number }; totalListPrice: { amount: number }; totalDiscountPct: number; approvalRequired: boolean }
export type Keres = Record<string, unknown> & {
  line_items?: { id?: string; item?: { id?: string }; quantity?: number }[]
  buyer?: Record<string, unknown>
  currency?: string
  fulfillment?: { methods?: Szallitas[] }
}
type Cim = { id?: string; street_address?: string; address_locality?: string; address_region?: string; postal_code?: string; address_country?: string }
type Szallitas = { id?: string; type?: string; destinations?: Cim[]; selected_destination_id?: string; groups?: { id?: string; selected_option_id?: string }[] }
export const SZALLITASI_OPCIO = { id: 'std-ship', title: 'Futárszolgálat (díjmentes, B2B)', carrier: 'GLS / MPL / DPD' }

const uzenet = (type: Uzenet['type'], code: string, content: string, severity?: Uzenet['severity'], path?: string): Uzenet => ({ type, code, content, ...(severity ? { severity } : {}), ...(path ? { path } : {}) })
const folytatas = (id: string) => `${SHOPPING_URL}/folytatas/${encodeURIComponent(id)}`
export const permalink = (rendeles: string) => `${SHOPPING_URL}/rendelesek/${encodeURIComponent(rendeles)}`

// ---------------------------------------------------------------- a checkout kiszámolása

/** A kért tételek a kérésből (a platform sorazonosítóját megtartjuk). */
export function tetelek(k: Keres): { tetelek: t.Tetel[]; hibak: Uzenet[] } {
  const hibak: Uzenet[] = []
  const ki: t.Tetel[] = []
  for (const [i, li] of (k.line_items ?? []).entries()) {
    const sku = String(li.item?.id ?? '')
    const db = Number(li.quantity)
    if (!sku) hibak.push(uzenet('error', 'missing', 'A tételnél hiányzik a termékazonosító.', 'recoverable', `$.line_items[${i}].item.id`))
    else if (!Number.isInteger(db) || db < 1) hibak.push(uzenet('error', 'invalid', 'A mennyiség pozitív egész legyen.', 'recoverable', `$.line_items[${i}].quantity`))
    else ki.push({ id: li.id ? String(li.id) : `li_${i + 1}`, sku, quantity: db })
  }
  if (!ki.length && !hibak.length) hibak.push(uzenet('error', 'missing', 'Legalább egy tétel kell.', 'recoverable', '$.line_items'))
  return { tetelek: ki, hibak }
}

async function vevoAzonositas(vevo: Record<string, unknown> | null, b2b: Record<string, unknown> | null): Promise<{ ugyfel: t.Ugyfel | null; uzenetek: Uzenet[]; eszkalacio: boolean }> {
  const email = typeof vevo?.email === 'string' ? vevo.email.trim() : ''
  const adoszam = typeof b2b?.tax_number === 'string' ? b2b.tax_number.trim() : ''
  if (!email && !adoszam) return (await tesztPartner()) ?? { ugyfel: null, eszkalacio: false, uzenetek: [uzenet('error', 'missing', 'A vevő azonosításához add meg a kapcsolattartó e-mail-címét (buyer.email) vagy a cég adószámát.', 'recoverable', '$.buyer.email')] }
  type Lista = { items: { customerId: string; name: string; taxNumber: string }[] }
  const r = email ? await hiv<Lista>('search_customers', { contactEmail: email, limit: 2 }) : null
  let talalat = r?.ok ? r.adat.items : []
  if (!talalat.length && adoszam) {
    const r2 = await hiv<Lista>('search_customers', { taxNumber: adoszam, limit: 2 })
    talalat = r2.ok ? r2.adat.items : []
  }
  // Figyelem: a kapcsolattartói e-mail nem hitelesített azonosítás (UCP identity linking nélkül). Ezért a válasz nem ad ki
  // vevőadatot, és minden rendelést ember hagy jóvá, aki a portálon látja az azonosítás módját.
  if (talalat.length === 1) return { ugyfel: { customerId: talalat[0].customerId, name: talalat[0].name, taxNumber: talalat[0].taxNumber, azonositas: r?.ok && r.adat.items.length ? 'kapcsolattartói e-mail (nem hitelesített)' : 'adószám (nem hitelesített)' }, uzenetek: [], eszkalacio: false }
  const teszt = await tesztPartner()
  if (teszt) return teszt
  return {
    ugyfel: null,
    eszkalacio: true,
    uzenetek: [uzenet('error', 'buyer_not_recognized', 'B2B kereskedő vagyunk: a vevő nem szerepel a partnereink között. A regisztrációhoz a kereskedő munkatársa felveszi a kapcsolatot.', 'requires_buyer_input', '$.buyer')],
  }
}

/**
 * Konformancia-tesztmód: a hivatalos tesztcsomag névtelen (vagy általa kitalált e-mailű) vásárlóval dolgozik, a mi B2B-átjárónk
 * viszont azonosított partnert kér. Tesztmódban ezért az azonosítatlan vásárlót a futtató szkript által felvett
 * tesztkapcsolattartó (john.doe@example.com) partneréhez rendeljük. Éles módban ilyen nincs.
 */
async function tesztPartner(): Promise<{ ugyfel: t.Ugyfel; uzenetek: Uzenet[]; eszkalacio: false } | null> {
  if (!KONFORMANCIA) return null
  const r = await hiv<{ items: { customerId: string; name: string; taxNumber: string }[] }>('search_customers', { contactEmail: 'john.doe@example.com', limit: 1 })
  const v = r.ok ? r.adat.items[0] : undefined
  return v ? { ugyfel: { customerId: v.customerId, name: v.name, taxNumber: v.taxNumber, azonositas: 'konformancia-tesztpartner' }, uzenetek: [], eszkalacio: false } : null
}

/**
 * A szállítás (fulfillment bővítmény): egy módszer, egy csoport, egy díjmentes futáros opció. A címet a platform adja.
 */
function szallitasSzamol(sor: t.Sor, sorok: string[]): { fulfillment: unknown; uzenetek: Uzenet[] } {
  const uzenetek: Uzenet[] = []
  const kert = (sor.szallitas as { methods?: Szallitas[] } | null)?.methods?.[0]
  // a partner nyilvántartott címét nem töltjük ki és nem adjuk vissza: a vevő azonosítása (kapcsolattartói e-mail) nem
  // hitelesített, így a cím kiadása adatszivárgás lenne. A címet a platform adja meg; az ember a jóváhagyáskor ellenőrzi.
  const celok: Cim[] = (kert?.destinations ?? []).map((d, i) => ({ ...d, id: d.id ?? `dest_${i + 1}` }))
  const valasztott = kert?.selected_destination_id ?? (celok.length === 1 ? celok[0].id : undefined)
  if (celok.length && !valasztott) uzenetek.push(uzenet('error', 'missing', 'Válaszd ki a szállítási címet.', 'recoverable', '$.fulfillment.methods[0].selected_destination_id'))
  if (!celok.length) uzenetek.push(uzenet('error', 'missing', 'Adj meg szállítási címet.', 'recoverable', '$.fulfillment.methods[0].destinations'))
  const csoport = kert?.groups?.[0]
  if (csoport?.selected_option_id && csoport.selected_option_id !== SZALLITASI_OPCIO.id) uzenetek.push(uzenet('error', 'invalid', `Ismeretlen szállítási opció; elérhető: ${SZALLITASI_OPCIO.id}.`, 'recoverable', '$.fulfillment.methods[0].groups[0].selected_option_id'))
  return {
    uzenetek,
    fulfillment: {
      methods: [
        {
          id: kert?.id ?? 'method_1',
          type: 'shipping',
          line_item_ids: sorok,
          destinations: celok,
          ...(valasztott ? { selected_destination_id: valasztott } : {}),
          groups: [{ id: csoport?.id ?? 'group_1', line_item_ids: sorok, options: [{ ...SZALLITASI_OPCIO, totals: [{ type: 'total', amount: 0 }] }], selected_option_id: SZALLITASI_OPCIO.id }],
        },
      ],
    },
  }
}

/** A checkout teljes újraszámolása a rendszerek aktuális állapotából. A lezárt (végső) állapotokhoz nem nyúl. */
export async function szamol(sor: t.Sor): Promise<t.Sor> {
  if (['complete_in_progress', 'completed', 'canceled'].includes(sor.allapot)) return sor
  const uzenetek: Uzenet[] = []
  const termekek = new Map<string, Termek>()
  for (const [i, tt] of sor.tetelek.entries()) {
    const r = await hiv<{ items: Termek[] }>('search_products', { query: tt.sku, includeInactive: true, limit: 5 })
    const p = r.ok ? r.adat.items.find((x) => x.sku === tt.sku) : undefined
    if (!r.ok) uzenetek.push(uzenet('error', 'unavailable', 'A katalógus most nem érhető el, próbáld újra később.', 'recoverable'))
    else if (!p) uzenetek.push(uzenet('error', 'not_found', `Nincs ilyen termék: ${tt.sku}.`, 'recoverable', `$.line_items[${i}].item.id`))
    else if (!p.active || !p.stockTracked) uzenetek.push(uzenet('error', 'item_unavailable', `A(z) ${tt.sku} termék nem rendelhető (kivezetett vagy nem raktári termék).`, 'recoverable', `$.line_items[${i}]`))
    else termekek.set(tt.sku, p)
  }
  const raktari = sor.tetelek.filter((x) => termekek.has(x.sku))
  if (raktari.length) {
    const r = await hiv<{ items: { sku: string; available: number }[] }>('check_stock', { skus: [...new Set(raktari.map((x) => x.sku))] })
    if (r.ok)
      for (const [i, tt] of sor.tetelek.entries()) {
        const k = r.adat.items.find((x) => x.sku === tt.sku)
        if (k && k.available < tt.quantity) uzenetek.push(uzenet('error', 'out_of_stock', `A(z) ${tt.sku} termékből csak ${k.available} db van szabad készleten.`, 'recoverable', `$.line_items[${i}].quantity`))
      }
    else uzenetek.push(uzenet('error', 'unavailable', 'A raktár most nem érhető el, próbáld újra később.', 'recoverable'))
  }
  const azon = await vevoAzonositas(sor.vevo, sor.b2b)
  uzenetek.push(...azon.uzenetek)

  // ár: azonosított vevőnél ajánlat (ügyfélcsoport- és mennyiségi kedvezménnyel), különben listaár
  let ajanlat: Ajanlat | null = null
  const hibas = uzenetek.some((u) => u.type === 'error')
  if (azon.ugyfel && !hibas) {
    const kulcs = `ucp-${createHash('sha256').update(JSON.stringify([sor.id, azon.ugyfel.customerId, sor.tetelek.map((x) => [x.sku, x.quantity])])).digest('hex').slice(0, 32)}`
    const r = await hiv<{ quote: Ajanlat }>('create_quote', { customerId: azon.ugyfel.customerId, lines: sor.tetelek.map((x) => ({ sku: x.sku, quantity: x.quantity })) }, kulcs)
    if (r.ok) ajanlat = r.adat.quote
    else uzenetek.push(uzenet('error', 'unavailable', `Az ajánlat nem készült el: ${r.uzenet}`, 'recoverable'))
  }
  if (ajanlat?.approvalRequired) uzenetek.push(uzenet('info', 'discount_review', 'A kedvezmény mértéke vezetői jóváhagyást igényel; ezt a rendelés jóváhagyásakor a kereskedő elvégzi.'))

  const lineItems = sor.tetelek
    .filter((x) => termekek.has(x.sku))
    .map((x) => {
      const p = termekek.get(x.sku)!
      const q = ajanlat?.lines.find((l) => l.sku === x.sku && l.quantity === x.quantity)
      const lista = fillerre(p.listPrice.amount) * x.quantity
      const netto = q?.lineTotal ? fillerre(q.lineTotal.amount) : lista
      return {
        id: x.id,
        item: { id: x.sku, title: p.name, price: fillerre(p.listPrice.amount) },
        quantity: x.quantity,
        totals: [{ type: 'subtotal', amount: lista }, ...(netto < lista ? [{ type: 'discount', amount: netto - lista }] : []), { type: 'total', amount: netto }],
      }
    })
  const szall = szallitasSzamol(sor, lineItems.map((l) => l.id))
  uzenetek.push(...szall.uzenetek)
  const subtotal = lineItems.reduce((a, l) => a + l.totals[0].amount, 0)
  const netto = ajanlat ? fillerre(ajanlat.totalNet.amount) : subtotal
  const afa = Math.round(netto * AFA)
  const totals = [
    { type: 'subtotal', amount: subtotal, display_text: 'Nettó listaár' },
    ...(netto < subtotal ? [{ type: 'discount', amount: netto - subtotal, display_text: 'Ügyfélcsoport- és mennyiségi kedvezmény' }] : []),
    { type: 'fulfillment', amount: 0, display_text: 'Szállítás (díjmentes)' },
    { type: 'tax', amount: afa, display_text: 'ÁFA 27%' },
    { type: 'total', amount: netto + afa, display_text: 'Fizetendő (bruttó)' },
  ]
  uzenetek.push(uzenet('info', 'b2b_terms', 'B2B ár: nettó + 27% ÁFA. Fizetés díjbekérő alapján, a kiszállítás után (átutalás vagy a díjbekérőhöz kapott fizetési link).'))
  const allapot: t.Allapot = uzenetek.some((u) => u.type === 'error' && u.severity === 'recoverable') ? 'incomplete' : azon.eszkalacio ? 'requires_escalation' : 'ready_for_complete'
  return t.ment({ id: sor.id, allapot, ugyfel: azon.ugyfel, ajanlat: ajanlat?.quoteId ?? null, valasz: { line_items: lineItems, totals, messages: uzenetek, fulfillment: szall.fulfillment } })
}

/** A checkout UCP-válasza. */
export function valasz(sor: t.Sor, p: Platform | null) {
  const v = (sor.valasz ?? {}) as { line_items?: unknown[]; totals?: unknown[]; messages?: Uzenet[]; fulfillment?: unknown }
  const vegso = ['completed', 'canceled'].includes(sor.allapot)
  return {
    ucp: boritek(p),
    id: sor.id,
    status: sor.allapot,
    currency: sor.penznem,
    line_items: v.line_items ?? [],
    totals: v.totals ?? [{ type: 'subtotal', amount: 0 }, { type: 'total', amount: 0 }],
    messages: v.messages ?? [],
    // a kiválasztott fizetési eszköz (a lezárás után, token nélkül); előtte üres
    payment: { instruments: sor.fizetes ? [sor.fizetes] : [] },
    ...(v.fulfillment ? { fulfillment: v.fulfillment } : {}),
    links: [
      { type: 'terms_of_service', url: `${SHOPPING_URL}/aszf`, title: 'Általános szerződési feltételek' },
      { type: 'privacy_policy', url: `${SHOPPING_URL}/adatvedelem`, title: 'Adatvédelem' },
    ],
    ...(sor.vevo ? { buyer: sor.vevo } : {}),
    ...(sor.b2b ? { [B2B_BOVITMENY]: sor.b2b } : {}),
    ...(vegso ? {} : { continue_url: folytatas(sor.id), expires_at: new Date(sor.lejar).toISOString() }),
    ...(sor.allapot === 'completed' && sor.rendeles ? { order: { id: sor.rendeles, permalink_url: permalink(sor.rendeles) } } : {}),
  }
}

// ---------------------------------------------------------------- műveletek

export async function letrehoz(k: Keres, p: Platform): Promise<t.Sor> {
  const { tetelek: tt, hibak } = tetelek(k)
  if (k.currency && k.currency !== PENZNEM) hibak.push(uzenet('error', 'invalid', `Csak forintban (${PENZNEM}) árazunk.`, 'recoverable', '$.currency'))
  const sor = await t.ment({
    id: `chk_${randomUUID()}`,
    platform: p.profil,
    allapot: 'incomplete',
    penznem: PENZNEM,
    vevo: (k.buyer as Record<string, unknown>) ?? null,
    b2b: (k[B2B_BOVITMENY] as Record<string, unknown>) ?? null,
    tetelek: tt,
    szallitas: (k.fulfillment as Record<string, unknown>) ?? null,
    webhook_url: p.webhookUrl,
    lejar: new Date(Date.now() + LEJARAT_ORA * 3600_000).toISOString(),
  })
  const kesz = await szamol(sor)
  return hibak.length ? hibakkal(kesz, hibak) : kesz
}

async function hibakkal(sor: t.Sor, hibak: Uzenet[]) {
  const v = (sor.valasz ?? {}) as { messages?: Uzenet[] }
  return t.ment({ id: sor.id, allapot: 'incomplete', valasz: { ...sor.valasz, messages: [...hibak, ...(v.messages ?? [])] } })
}

export class UzletiHiba extends Error {
  constructor(
    public readonly statusz: number,
    public readonly kod: string,
    uzenet: string
  ) {
    super(uzenet)
  }
}

export async function frissit(sor: t.Sor, k: Keres): Promise<t.Sor> {
  if (['complete_in_progress', 'completed', 'canceled'].includes(sor.allapot)) throw new UzletiHiba(409, 'invalid_state', `A checkout ${sor.allapot} állapotban van, nem módosítható.`)
  // teljes csere (a szabvány szerint az Update a teljes erőforrást küldi)
  const { tetelek: tt, hibak } = tetelek(k)
  const uj = await t.ment({ id: sor.id, tetelek: tt, vevo: (k.buyer as Record<string, unknown>) ?? null, b2b: (k[B2B_BOVITMENY] as Record<string, unknown>) ?? null, szallitas: (k.fulfillment as Record<string, unknown>) ?? sor.szallitas })
  const kesz = await szamol(uj)
  return hibak.length ? hibakkal(kesz, hibak) : kesz
}

export async function megszakit(sor: t.Sor): Promise<t.Sor> {
  if (sor.allapot === 'completed' || sor.allapot === 'complete_in_progress') throw new UzletiHiba(409, 'invalid_state', 'A lezárt checkout nem szakítható meg.')
  if (sor.allapot === 'canceled') throw new UzletiHiba(409, 'invalid_state', 'A checkout már meg van szakítva.')
  return t.ment({ id: sor.id, allapot: 'canceled' })
}

/** A fizetési eszköz ellenőrzése: pontosan egy, a mi handlerünkkel (tesztmódban a konformanciateszt handlerével is). */
function fizetesEllenorzes(k: Keres): { eszkoz: Record<string, unknown> } | { hiba: Uzenet } {
  const eszkozok = ((k.payment as { instruments?: Record<string, unknown>[] } | undefined)?.instruments ?? []) as Record<string, unknown>[]
  if (eszkozok.length !== 1) return { hiba: uzenet('error', 'payment_failed', 'Pontosan egy fizetési eszköz kell a lezáráshoz.', 'recoverable', '$.payment.instruments') }
  const e = eszkozok[0]
  const token = (e.credential as { token?: string } | undefined)?.token
  const sajat = e.handler_id === FIZETESI_HANDLER.id
  const teszt = KONFORMANCIA && e.handler_id === 'mock_payment_handler' && token === 'success_token'
  if (!sajat && !teszt) return { hiba: uzenet('error', 'payment_failed', 'Ezt a fizetési módot nem fogadjuk el; díjbekérő alapján fizetünk (donki_proforma).', 'recoverable', '$.payment.instruments[0].handler_id') }
  // a tokent nem tároljuk
  return { eszkoz: { id: e.id ?? null, handler_id: e.handler_id, type: e.type ?? null, display: e.display ?? null } }
}

export async function lezar(sor: t.Sor, k: Keres, p: Platform): Promise<t.Sor> {
  if (sor.allapot === 'canceled') throw new UzletiHiba(409, 'invalid_state', 'A megszakított checkout nem zárható le.')
  // az ugyanazzal az Idempotency-Key-jel ismételt lezárás a tárolt választ kapja (szerver.ts); új kulccsal ez már hiba
  if (sor.allapot === 'completed' || sor.allapot === 'complete_in_progress') throw new UzletiHiba(409, 'invalid_state', 'A checkout már le van zárva.')
  const friss = await szamol(sor)
  const f = fizetesEllenorzes(k)
  if ('hiba' in f) return hibakkal(friss, [f.hiba])
  if (friss.allapot !== 'ready_for_complete') return friss
  const var_ = await t.ment({ id: sor.id, allapot: 'complete_in_progress', jovahagyas: 'var', fizetes: f.eszkoz, webhook_url: p.webhookUrl ?? sor.webhook_url })
  if (!KONFORMANCIA) return var_
  // konformancia-tesztmód: szimulált jóváhagyó dönt azonnal (az éles működésben a portálon ember)
  await t.ment({ id: sor.id, jovahagyas: 'jovahagyva', dontotte: 'konformancia-teszt (szimulált jóváhagyó)', dontes_ido: new Date().toISOString() })
  return vegrehajt((await t.olvas(sor.id))!)
}

/** A jóváhagyott checkout végrehajtása: az ajánlat elfogadása → rendelés. Hibánál a checkout megszakad, üzenettel. */
export async function vegrehajt(sor: t.Sor): Promise<t.Sor> {
  if (sor.jovahagyas === 'elutasitva') {
    const v = sor.valasz as { messages?: Uzenet[] } | null
    return t.ment({ id: sor.id, allapot: 'canceled', valasz: { ...sor.valasz, messages: [uzenet('error', 'order_rejected', `A kereskedő nem fogadta el a rendelést${sor.dontes_oka ? `: ${sor.dontes_oka}` : '.'}`, 'unrecoverable'), ...(v?.messages ?? [])] } })
  }
  if (sor.jovahagyas !== 'jovahagyva' || !sor.ajanlat) return sor
  const r = await hiv<{ orderId?: string; quote?: { orderId: string | null } }>('accept_quote', { quoteId: sor.ajanlat }, `ucp-accept-${sor.id}`)
  const rendeles = r.ok ? (r.adat.orderId ?? r.adat.quote?.orderId ?? null) : null
  if (!r.ok || !rendeles) {
    log(`végrehajtás sikertelen ${sor.id}: ${r.ok ? 'nincs rendelésazonosító' : `${r.hibakod} ${r.uzenet}`}`)
    const v = sor.valasz as { messages?: Uzenet[] } | null
    return t.ment({ id: sor.id, allapot: 'canceled', jovahagyas: 'hiba', hiba: r.ok ? 'nincs rendelésazonosító' : `${r.hibakod}: ${r.uzenet}`, valasz: { ...sor.valasz, messages: [uzenet('error', 'order_failed', 'A rendelés rögzítése nem sikerült; a kereskedő felveszi a kapcsolatot.', 'unrecoverable'), ...(v?.messages ?? [])] } })
  }
  const kesz = await t.ment({ id: sor.id, allapot: 'completed', jovahagyas: 'vegrehajtva', rendeles })
  if (kesz.webhook_url) {
    const o = await rendelesValasz(kesz, null)
    if (o) {
      await t.webhookSorba(rendeles, kesz.webhook_url, o)
      await t.ment({ id: kesz.id, utolso_esemeny: ujjlenyomat(o) })
    }
  }
  return kesz
}

// ---------------------------------------------------------------- rendelés

type Rendeles = { orderId: string; status: string; statusLabel: string; updatedAt: string; shipment: { carrier: string; trackingNo: string | null; status: string; statusLabel: string; eta: string | null } | null; billing: { documentNo: string; documentType: string } | null }

const CSOMAG: Record<string, string> = { awaiting_pickup: 'processing', picked_up: 'shipped', in_transit: 'in_transit', delayed: 'in_transit', delivered: 'delivered', unknown: 'processing' }

export const ujjlenyomat = (o: { line_items?: unknown; fulfillment?: unknown; messages?: unknown }) => createHash('sha256').update(JSON.stringify([o.line_items, o.fulfillment, o.messages])).digest('hex')

/** A rendelés UCP-alakban a checkoutból és a rendeléskezelő aktuális állapotából. */
export async function rendelesValasz(sor: t.Sor, p: Platform | null) {
  if (!sor.rendeles) return null
  const r = await hiv<{ order: Rendeles }>('get_order', { orderId: sor.rendeles })
  if (!r.ok) throw new UzletiHiba(503, 'unavailable', 'A rendeléskezelő most nem érhető el.')
  const o = r.adat.order
  const v = (sor.valasz ?? {}) as { line_items?: { id: string; item: unknown; quantity: number; totals: unknown[] }[]; totals?: unknown[]; fulfillment?: unknown }
  const kiszallitva = o.shipment?.status === 'delivered' || ['delivered', 'awaiting_payment', 'completed'].includes(o.status)
  const lemondva = o.status === 'cancelled'
  const sorok = (v.line_items ?? []).map((l) => ({
    id: l.id,
    item: l.item,
    quantity: { original: l.quantity, total: lemondva ? 0 : l.quantity, fulfilled: kiszallitva ? l.quantity : 0 },
    totals: l.totals,
    status: lemondva ? 'removed' : kiszallitva ? 'fulfilled' : 'processing',
  }))
  const esemenyek = o.shipment
    ? [
        {
          id: `${o.orderId}-${o.shipment.status}`,
          occurred_at: new Date(o.updatedAt).toISOString(),
          type: CSOMAG[o.shipment.status] ?? 'processing',
          line_items: sorok.map((l) => ({ id: l.id, quantity: l.quantity.original })),
          ...(o.shipment.trackingNo ? { tracking_number: o.shipment.trackingNo, tracking_url: permalink(o.orderId) } : {}),
          carrier: o.shipment.carrier,
          description: o.shipment.statusLabel,
        },
      ].filter((e) => e.type === 'processing' || e.tracking_number)
    : []
  const uzenetek: Uzenet[] = [uzenet('info', 'order_status', `${o.orderId}: ${o.statusLabel}.`)]
  if (o.billing) {
    const f = await hiv<{ items: { checkoutUrl: string | null; status: string }[] }>('get_payments', { documentNo: o.billing.documentNo })
    const link = f.ok ? f.adat.items.find((x) => x.checkoutUrl && x.status !== 'expired')?.checkoutUrl : null
    uzenetek.push(uzenet('info', 'payment_request', `Díjbekérő: ${o.billing.documentNo}.${link ? ` Fizetési link: ${link}` : ' Fizetés átutalással a díjbekérő alapján.'}`))
  }
  return {
    ucp: boritek(p),
    id: o.orderId,
    label: o.orderId,
    checkout_id: sor.id,
    permalink_url: permalink(o.orderId),
    currency: sor.penznem,
    line_items: sorok,
    fulfillment: {
      expectations: (() => {
        const mo = (v.fulfillment as { methods?: { destinations?: Cim[]; selected_destination_id?: string }[] } | undefined)?.methods?.[0]
        const cel = mo?.destinations?.find((d) => d.id === mo.selected_destination_id)
        if (!cel) return []
        const { id: _id, ...cim } = cel
        void _id
        return [{ id: 'exp_1', method_type: 'shipping', destination: cim, line_items: sorok.map((l) => ({ id: l.id, quantity: l.quantity.original })), description: SZALLITASI_OPCIO.title }]
      })(),
      events: esemenyek,
    },
    totals: v.totals ?? [],
    messages: uzenetek,
  }
}

export { ALAP_URL }
