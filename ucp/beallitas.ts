// 21. fázis, UCP-átjáró: beállítások és állandók (docs/FAZIS21_TERV.md §11).

import '../agens/kozos/kornyezet'

/** A támogatott UCP-verzió: erre van hivatalos konformancia-teszt és SDK (ucp-sdk 0.4.6, @ucp-js/sdk 0.4.6). */
export const UCP_VERZIO = '2026-04-08'
/** D2: helyőrző névtér a saját bővítményekhez – az example.com dokumentációs célra fenntartott domain. Élesítés előtt cserélendő. */
export const NEVTER = 'com.example.donki'
export const B2B_BOVITMENY = `${NEVTER}.b2b_buyer`
export const FIZETESI_HANDLER = { csoport: `${NEVTER}.proforma`, id: 'donki_proforma' }

export const PORT = Number(process.env.UCP_PORT ?? 4110)
/** A kívülről látható alapcím (élesben HTTPS). */
export const ALAP_URL = (process.env.UCP_ALAP_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
export const SHOPPING_URL = `${ALAP_URL}/ucp`

/**
 * Konformancia-tesztmód (alapból kikapcsolva): szimulált jóváhagyó dönt azonnal, és a teszt kártyás handlerét a
 * díjbekérővel egyenértékűnek kezeljük. Csak a hivatalos UCP-konformanciateszt futtatásához.
 */
export const KONFORMANCIA = process.env.UCP_KONFORMANCIA === '1'
/** Fejlesztési mód: helyi (localhost) platformprofil is letölthető. Élesben tilos (SSRF). */
export const FEJLESZTES = KONFORMANCIA || process.env.UCP_FEJLESZTES === '1'
/** Engedélyezett platformprofilok (URL-előtagok, vesszővel). Üres lista: egyik sem – kivéve tesztmódban. */
export const PLATFORMOK = (process.env.UCP_PLATFORMOK ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export const LEJARAT_ORA = 24
export const AFA = 0.27
export const PENZNEM = 'HUF'
/** ISO 4217: a forint legkisebb egysége a fillér (2 tizedes) – 38 100 Ft = 3 810 000. */
export const fillerre = (ft: number) => Math.round(ft * 100)

export const SPEC = {
  overview: `https://ucp.dev/${UCP_VERZIO}/specification/overview/`,
  checkout: `https://ucp.dev/${UCP_VERZIO}/specification/checkout/`,
  checkoutSchema: `https://ucp.dev/${UCP_VERZIO}/schemas/shopping/checkout.json`,
  order: `https://ucp.dev/${UCP_VERZIO}/specification/order/`,
  fulfillment: `https://ucp.dev/${UCP_VERZIO}/specification/fulfillment/`,
  fulfillmentSchema: `https://ucp.dev/${UCP_VERZIO}/schemas/shopping/fulfillment.json`,
  orderSchema: `https://ucp.dev/${UCP_VERZIO}/schemas/shopping/order.json`,
  rest: `https://ucp.dev/${UCP_VERZIO}/services/shopping/rest.openapi.json`,
  // saját bővítmény: a névtér szerint az example.com alatt (helyőrző)
  b2b: 'https://example.com/',
}

export const log = (s: string) => console.error(`[ucp] ${new Date().toISOString()} ${s}`)
