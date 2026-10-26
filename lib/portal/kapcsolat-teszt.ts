// Egy rendszer-integráció kapcsolattesztje (16. fázis): elérhető-e, és jó-e a kulcs – egy ártalmatlan olvasó hívás a
// rendszer SAJÁT protokollján, a rendszer saját hibaformája szerint értelmezve. (server-only nélkül: a füstteszt is hívja.)

import { existsSync } from 'node:fs'

export type RendszerAzon = 'crm' | 'quote' | 'orders' | 'inventory' | 'billing' | 'payments' | 'support'

// A bekötött címek a rendszerek konténeres hálózatán érvényesek (http://billing:4103). Natív futásnál (npm run dev, a
// gépen) ezek a nevek nem oldhatók fel, ezért a gépre kivezetett portot használjuk. A konténerben (/.dockerenv) a cím
// változatlan; a tárolt integráció sem változik.
const GEPI_CIM: Record<string, string> = {
  'crm-api:3000': '127.0.0.1:4100',
  'quote:4101': '127.0.0.1:4101',
  'orders:4102': '127.0.0.1:4102',
  'inventory-api:3000': '127.0.0.1:54106',
  'billing:4103': '127.0.0.1:4103',
  'payments:4104': '127.0.0.1:4104',
  'support:4105': '127.0.0.1:4105',
}
const kontenerben = existsSync('/.dockerenv')

/** A cím, amelyen ez a folyamat a rendszert eléri (natívan a konténeres név helyett a gépi port). */
export function elerhetoCim(url: string): string {
  const alap = url.replace(/\/+$/, '')
  if (kontenerben) return alap
  try {
    const u = new URL(alap)
    const gepi = GEPI_CIM[u.host]
    return gepi ? `${u.protocol}//${gepi}${u.pathname.replace(/\/+$/, '')}` : alap
  } catch {
    return alap
  }
}


export type TesztEredmeny = { elerheto: boolean; kulcsOk: boolean; uzenet: string }

async function idokorlattal(url: string, init: RequestInit = {}, ms = 5000) {
  return fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(ms) })
}

/** Elérhető-e, és jó-e a kulcs: egy ártalmatlan olvasó hívás a rendszer SAJÁT protokollján, a saját hibaformája szerint. */
export async function kapcsolatTeszt(rendszer: RendszerAzon, url: string, kulcs: string): Promise<TesztEredmeny> {
  const alap = elerhetoCim(url)
  const pr = rendszer === 'crm' || rendszer === 'inventory'
  try {
    const h = await idokorlattal(pr ? `${alap}/` : `${alap}/health`, { method: pr ? 'HEAD' : 'GET' }, 3000)
    if (h.status >= 500) return { elerheto: false, kulcsOk: false, uzenet: `A rendszer nem egészséges (HTTP ${h.status}).` }
  } catch {
    return { elerheto: false, kulcsOk: false, uzenet: 'A rendszer nem érhető el ezen a címen.' }
  }
  try {
    switch (rendszer) {
      case 'crm': {
        const r = await idokorlattal(`${alap}/categories?limit=1`, { headers: { Authorization: `Bearer ${kulcs}`, 'Accept-Profile': 'catalog' } })
        return r.ok ? ok('a katalógus olvasható') : rossz(`HTTP ${r.status}`)
      }
      case 'inventory': {
        const r = await idokorlattal(`${alap}/rpc/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${kulcs}`, 'Content-Profile': 'pgmq_public', 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue_name: 'inventory_alerts', sleep_seconds: 0, n: 1 }),
        })
        return r.ok ? ok('az üzenetsor elérhető') : rossz(`HTTP ${r.status}`)
      }
      case 'quote': {
        const r = await idokorlattal(`${alap}/api/legacy/quote-rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'quote.list', params: { apiKey: kulcs } }),
        })
        const v = (await r.json()) as { error?: { code: number } }
        return v.error?.code === -32001 ? rossz('-32001 UNAUTHORIZED') : v.error ? rossz(`${v.error.code}`) : ok('quote.list rendben')
      }
      case 'orders': {
        const r = await idokorlattal(`${alap}/api/legacy/orders/list?state=LEZART`, { headers: { 'X-Legacy-Key': kulcs } })
        const v = (await r.json()) as { success: boolean; msg?: string }
        return v.success ? ok('a homlokzat válaszol') : rossz(v.msg ?? 'ismeretlen válasz')
      }
      case 'billing': {
        const r = await idokorlattal(`${alap}/api/legacy/billing`, { method: 'POST', body: `AUTH|${kulcs}\nSZAMLA|LEJART\n` })
        const v = (await r.text()).trim()
        return v.startsWith('OK') ? ok('a protokoll válaszol') : rossz(v.slice(0, 60))
      }
      case 'payments': {
        const r = await idokorlattal(`${alap}/api/legacy/payments?limit=1`, { headers: { Authorization: `Bearer ${kulcs}` } })
        return r.ok ? ok('a REST API válaszol') : rossz(`HTTP ${r.status}`)
      }
      case 'support': {
        const r = await idokorlattal(`${alap}/api/legacy/support/soap`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'urn:helpdesk:v1#ListTickets' },
          body:
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:hd="urn:helpdesk:v1">' +
            `<soap:Header><hd:ApiKey>${kulcs.replace(/[<&>]/g, '')}</hd:ApiKey></soap:Header><soap:Body><hd:ListTickets/></soap:Body></soap:Envelope>`,
        })
        const v = await r.text()
        return /<faultstring>HD-401<\/faultstring>/.test(v) ? rossz('HD-401') : r.ok ? ok('a SOAP szolgáltatás válaszol') : rossz(`HTTP ${r.status}`)
      }
    }
  } catch (e) {
    return { elerheto: true, kulcsOk: false, uzenet: `A kulcs-próba nem sikerült: ${e instanceof Error ? e.message : e}` }
  }
}

const ok = (mi: string): TesztEredmeny => ({ elerheto: true, kulcsOk: true, uzenet: `Kapcsolat rendben – ${mi}.` })
const rossz = (jel: string): TesztEredmeny => ({ elerheto: true, kulcsOk: false, uzenet: `A rendszer elérhető, de a kulcsot elutasította (${jel}).` })
