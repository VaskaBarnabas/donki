// A 19. fázis mérésének közös része: a környezet (a rendszerek kulcsai – a nyers ágensnek és az előkészítésnek kell),
// egy admin MCP-kapcsolat az előkészítéshez és az ellenőrzéshez (az „igazság” a rendszerből), és a feladatok közös
// segédei (rendelés adott állapotban, kiszállított rendelések készlete, szövegbeli számok).

import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import '../smoke/rendszerek' // .env.local + .env.stack → process.env (a nyers eszközök kulcsai is)
import { McpKapcsolat } from '../../agens/kozos/mcp'
import { psqlFuttat } from '../smoke/rendszerek'

export type Adat = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- MCP strukturált eredmény

export class Mcp {
  private constructor(private readonly k: McpKapcsolat) {}
  static async nyit(): Promise<Mcp> {
    return new Mcp(await McpKapcsolat.nyit('admin', randomUUID(), ['orders', 'sales', 'inventory', 'finance', 'support']))
  }
  /** Eszközhívás az előkészítéshez és az ellenőrzéshez; hibánál kivétel. */
  async hiv(nev: string, args: Record<string, unknown> = {}): Promise<Adat> {
    const r = await this.probal(nev, args)
    if (!r.ok) throw new Error(`${nev}: ${r.hibakod} ${r.szoveg.slice(0, 300)}`)
    return r.adat!
  }
  async probal(nev: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; hibakod: string | null; adat: Adat | null; szoveg: string }> {
    // olvasásnál a teljes strukturált eredmény (a hiv() a modellnek szánt szöveget 6000 karakternél levágja)
    if (this.k.eszkoz(nev)?.kockazat === 'read') {
      try {
        const adat = await this.k.olvas<Adat>(nev, args)
        return { ok: true, hibakod: null, adat, szoveg: JSON.stringify(adat) }
      } catch (e) {
        const szoveg = e instanceof Error ? e.message : String(e)
        return { ok: false, hibakod: /: (\w+) /.exec(szoveg)?.[1] ?? 'ERROR', adat: null, szoveg }
      }
    }
    const r = await this.k.hiv(nev, args, randomUUID())
    let adat: Adat | null = null
    try {
      adat = r.ok ? JSON.parse(r.szoveg) : null
    } catch {
      adat = null
    }
    return { ok: r.ok, hibakod: r.hibakod, adat, szoveg: r.szoveg }
  }
  zar() {
    return this.k.zar()
  }
}

// ---------------------------------------------------------------- szövegbeli számok és szavak

/** A válasz számjegyei egybeírva (65 540 Ft, 65.540 Ft, 65540,00 → 65540): így kereshető benne egy összeg. */
export function szamok(szoveg: string): string {
  return szoveg.replace(/(\d)[\s.  ](?=\d{3}(\D|$))/g, '$1').replace(/(\d),00\b/g, '$1')
}
/** Szerepel-e a válaszban a szám (egész forintra kerekítve, ezres tagolástól függetlenül). */
export const szerepel = (valasz: string, n: number | string) => new RegExp(`(^|\\D)${Math.round(Number(n))}(\\D|$)`).test(szamok(valasz))
export const kisbetu = (s: string) => s.toLocaleLowerCase('hu-HU')

// ---------------------------------------------------------------- rendelések adott állapotban

export const VEVO_KERES = 'Bakony'
export const TERMEK = 'TK-00001' // nyomtató, 12 hónap garancia, raktári kóddal
export const MONITOR = 'TK-00010'

let vevoId: string | null = null
export async function bakony(m: Mcp): Promise<{ customerId: string; name: string }> {
  const v = (await m.hiv('search_customers', { query: VEVO_KERES })).items[0]
  vevoId = v.customerId
  return v
}

/** Új rendelés a Bakonynak (ajánlat → elfogadás), és ha kell: jóváhagyás, kiszállítás indítása. */
export async function rendeles(m: Mcp, o: { sku?: string; db?: number; allapot: 'received' | 'approved' | 'in_fulfillment' }): Promise<string> {
  const customerId = vevoId ?? (await bakony(m)).customerId
  let q = (await m.hiv('create_quote', { customerId, lines: [{ sku: o.sku ?? TERMEK, quantity: o.db ?? 1 }] })).quote
  if (q.nextAction?.tool === 'request_quote_approval') {
    await m.hiv('request_quote_approval', { quoteId: q.quoteId, reason: 'mérés előkészítése' })
    q = (await m.hiv('approve_quote', { quoteId: q.quoteId })).quote
  }
  const orderId: string = (await m.hiv('accept_quote', { quoteId: q.quoteId })).orderId
  if (o.allapot === 'received') return orderId
  // a kiszállított és a lemondott előkészítő rendelések fogyasztják a készletet: jóváhagyás előtt pótolja
  const szabad = (await m.hiv('check_stock', { skus: [o.sku ?? TERMEK] })).items[0].available as number
  if (szabad < (o.db ?? 1)) await m.hiv('adjust_stock', { sku: o.sku ?? TERMEK, type: 'receipt', quantity: (o.db ?? 1) - szabad + 10, reason: 'mérés: előkészítés' })
  await m.hiv('approve_order', { orderId })
  if (o.allapot === 'approved') return orderId
  await m.hiv('start_fulfillment', { orderId })
  return orderId
}

/** Kiszállított rendelések: kiszállítás indítása, a fuvarozó „kézbesít” (a fuvarozó adatbázisa), majd a folyamat átveszi. */
export async function kiszallitott(m: Mcp, db: number): Promise<string[]> {
  if (db <= 0) return []
  await m.hiv('adjust_stock', { sku: TERMEK, type: 'receipt', quantity: db, reason: 'mérés: kiszállítandó készlet' })
  const rendelesek: string[] = []
  for (let i = 0; i < db; i += 4) rendelesek.push(...(await Promise.all(Array.from({ length: Math.min(4, db - i) }, () => rendeles(m, { allapot: 'in_fulfillment' })))))
  const nok = rendelesek.map((r) => r.replace('RND-', '')).join(',')
  psqlFuttat('orders', `update orders.shipments set carrier_status = 'KEZBESITVE' where order_no in (${nok})`)
  await Promise.all(
    rendelesek.map(async (orderId) => {
      for (let i = 0; i < 4; i++) if ((await m.hiv('wait_for_order_status', { orderId, status: 'delivered', timeoutSeconds: 60 })).reached) return
      throw new Error(`nem lett kiszállítva: ${orderId}`)
    })
  )
  return rendelesek
}

/** Egyszer előkészített, a futások között megosztott helyzet (csak olvasó feladatokhoz). */
export class Kozos {
  private t = new Map<string, Promise<unknown>>()
  egyszer<T>(kulcs: string, f: () => Promise<T>): Promise<T> {
    if (!this.t.has(kulcs)) this.t.set(kulcs, f().catch((e) => (this.t.delete(kulcs), Promise.reject(e))))
    return this.t.get(kulcs) as Promise<T>
  }
}

/** A kiszállított rendelések készlete a mérés elején (egyszerre szállítva – így csak egyszer kell várni a fuvarozóra). */
export class Keszlet {
  private kezbesitett: string[] = []
  constructor(private readonly m: Mcp) {}
  async feltolt(db: number) {
    this.kezbesitett.push(...(await kiszallitott(this.m, db)))
  }
  async vesz(): Promise<string> {
    return this.kezbesitett.shift() ?? (await kiszallitott(this.m, 1))[0]
  }
}

/** A rendelés teljesítését (SZALLITVA) a múltba teszi – a lejárt garancia esetéhez. */
export function teljesitesMultba(orderId: string, ev = 3) {
  const no = Number(orderId.replace('RND-', ''))
  psqlFuttat('orders', `update orders.process_history set ts = ts - interval '${Math.trunc(ev)} years' where order_no = ${no} and to_state = 'SZALLITVA'`)
}

/** Érvényes magyar adószám (a 8. számjegy ellenőrző: 9,7,3,1,9,7,3 súlyokkal), egyedi törzsszámmal. */
export function adoszam(): string {
  const torzs = String(Math.floor(1_000_000 + Math.random() * 8_999_999))
  const sum = [9, 7, 3, 1, 9, 7, 3].reduce((s, w, i) => s + w * Number(torzs[i]), 0)
  return `${torzs}${(10 - (sum % 10)) % 10}-2-41`
}

/** Egy rendszer konténerének leállítása / indítása (a kiesés-feladathoz), és megvárja az egészséget. */
export function kontener(rendszer: string, muvelet: 'stop' | 'start') {
  execFileSync('docker', [muvelet, `donki-${rendszer}-1`], { stdio: 'ignore' })
}
export async function egeszseges(url: string, mp = 60) {
  for (let i = 0; i < mp; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return
    } catch {
      /* még indul */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`nem lett egészséges: ${url}`)
}
