// A háttérfigyelő (18. fázis, docs/FAZIS18_TERV.md): eseményvezérelt kivételkezelő. Három kör fut, egymástól függetlenül:
//
//   események   (15 mp)  a rendszerek eseménysorai → szabályok (J1–J3, J5) → jelzés / magától lezárás
//   időzített   (10 perc) MCP-lekérdezések a monitor szerepkörrel (J4, J6–J9) és a nyitott jelzések lezárása
//   elemzés     (10 mp)  egy új jelzés elemzése a kivételkezelő ágenssel (háttér-mód) – percenként legfeljebb néhány,
//                        és csak ha nem fut chat-kérés (a helyi modell a felhasználóé)
//
// A figyelő semmit nem módosít: a rendszereket csak olvasó MCP szerepkörrel éri el, az eseménysorokat csak sor-kulccsal.
// Egy példányban fut: Postgres advisory lock az agens-db-ben (ha két portál futna, a második vár).
// Indítás: a portál instrumentation.ts-éből (npm run dev), kikapcsolás: AGENS_FIGYELO=ki vagy a Rendszerek oldal kapcsolója.

import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { Agens } from '../futtato'
import { BEALLITAS, FIGYELO, type SzerverNev } from '../kozos/kornyezet'
import { McpKapcsolat } from '../kozos/mcp'
import { chatFut } from '../kozos/terheles'
import { elemez } from './elemzo'
import { archival, FORRASOK, MAX_OLVASAS, olvas, type Esemeny } from './forrasok'
import * as J from './jelzesek'
import { esemenySzabaly, fennallMeg, j4Keszlet, j6Tartozas, j7Ajanlat, j8Rendeles, j9Hibajegy, type IdozitettEredmeny } from './szabalyok'

const SZERVEREK: SzerverNev[] = ['orders', 'inventory', 'finance', 'sales', 'support']
const ZAR_KULCS = 18_018
const ADAG = 50
const MAX_ADAG = 10

const hibaSzoveg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export type KorEredmeny = { uj: number; lezart: number; esemeny: number; hibak: string[] }

export class Figyelo {
  private elemzesek: number[] = []

  constructor(
    private readonly agens: Agens,
    private readonly mcpNyit: () => Promise<McpKapcsolat> = () => McpKapcsolat.nyit('monitor', randomUUID(), SZERVEREK)
  ) {}

  /** Az eseménysorok feldolgozása. Egy üzenet csak sikeres feldolgozás után kerül archívumba. */
  async esemenyKor(): Promise<KorEredmeny> {
    const ki: KorEredmeny = { uj: 0, lezart: 0, esemeny: 0, hibak: [] }
    let keszlet = false
    for (const forras of FORRASOK) {
      // nagy forgalomnál egy körben több adag is (legfeljebb ADAG × MAX_ADAG üzenet), hogy a figyelő ne maradjon le
      for (let adag = 0; adag < MAX_ADAG; adag++) {
        let esemenyek: Esemeny[]
        try {
          esemenyek = await olvas(forras, ADAG)
        } catch (e) {
          ki.hibak.push(hibaSzoveg(e))
          break
        }
        for (const e of esemenyek) {
          try {
            const r = esemenySzabaly(e)
            for (const j of r.uj) if ((await J.eszlel(j)).uj) ki.uj++
            for (const l of r.lezar) ki.lezart += await J.lezar(l.kulcsok, l.ok)
            keszlet ||= r.keszletEllenorzes
            await archival(e)
            ki.esemeny++
          } catch (err) {
            ki.hibak.push(`${forras} #${e.msgId}: ${hibaSzoveg(err)}`)
            if (e.olvasasok >= MAX_OLVASAS) await archival(e).catch(() => null) // ne akassza meg a sort
          }
        }
        if (esemenyek.length < ADAG) break
      }
    }
    if (keszlet) {
      const r = await this.idozitett([j4Keszlet])
      ki.uj += r.uj
      ki.lezart += r.lezart
      ki.hibak.push(...r.hibak)
    }
    return ki
  }

  /** Az időzített szabályok és a nyitott (eseményből született) jelzések lezárásának ellenőrzése. */
  async idozitettKor(): Promise<KorEredmeny> {
    return this.idozitett([j4Keszlet, j6Tartozas, (m) => j7Ajanlat(m, (k) => J.elsoEszleles('ajanlat:', k)), j8Rendeles, j9Hibajegy], true)
  }

  private async idozitett(szabalyok: ((m: McpKapcsolat) => Promise<IdozitettEredmeny>)[], lezarasEllenorzes = false): Promise<KorEredmeny> {
    const ki: KorEredmeny = { uj: 0, lezart: 0, esemeny: 0, hibak: [] }
    let mcp: McpKapcsolat
    try {
      mcp = await this.mcpNyit()
    } catch (e) {
      return { ...ki, hibak: [`MCP: ${hibaSzoveg(e)}`] }
    }
    try {
      for (const szabaly of szabalyok) {
        try {
          const r = await szabaly(mcp)
          for (const j of r.jelzesek) if ((await J.eszlel(j)).uj) ki.uj++
          const megszunt = (await J.nyitottak([r.szabaly])).filter((n) => !r.fennall.has(n.kulcs)).map((n) => n.kulcs)
          ki.lezart += await J.lezar(megszunt, r.ok)
        } catch (e) {
          ki.hibak.push(hibaSzoveg(e))
        }
      }
      if (lezarasEllenorzes) {
        for (const n of await J.nyitottak(['J1', 'J2', 'J3', 'J5'])) {
          try {
            const ok = await fennallMeg(mcp, n)
            if (ok) ki.lezart += await J.lezar([n.kulcs], ok)
          } catch (e) {
            ki.hibak.push(`${n.kulcs}: ${hibaSzoveg(e)}`)
          }
        }
      }
    } finally {
      await mcp.zar()
    }
    return ki
  }

  /**
   * Egy jelzés elemzése, ha van mit, ha nem fut chat-kérés, és ha a percenkénti keret engedi. Visszaad: elemzett-e.
   * (A teszt a korlátot kikapcsolhatja, és megadhatja, melyik jelzést.)
   */
  async elemzesKor(o: { korlat?: boolean; id?: number } = {}): Promise<boolean> {
    if (o.korlat !== false) {
      if (chatFut()) return false
      const most = Date.now()
      this.elemzesek = this.elemzesek.filter((t) => most - t < 60_000)
      if (this.elemzesek.length >= FIGYELO.elemzesPercenkent) return false
    }
    const j = await J.kovetkezoElemzendo(o.id)
    if (!j) return false
    this.elemzesek.push(Date.now())
    const { eredmeny, futasId, hiba } = await elemez(this.agens, j)
    if (eredmeny) await J.elemzesMentes(j.id, { ...eredmeny, futasId })
    else {
      console.error(`[figyelo] a(z) #${j.id} jelzés elemzése nem sikerült: ${hiba}`)
      await J.elemzesSikertelen(j.id, futasId)
    }
    return true
  }
}

// ---------------------------------------------------------------- indítás a portálból (egy példány)

/** Az advisory lock egy saját kapcsolaton (a lock a kapcsolat élettartamáig tart); null, ha más tartja. */
export async function zarolas(): Promise<pg.Client | null> {
  const c = new pg.Client({ connectionString: BEALLITAS.dbUrl() })
  await c.connect()
  const { rows } = await c.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [ZAR_KULCS])
  if (rows[0].ok) return c
  await c.end()
  return null
}

const g = globalThis as { __donkiFigyelo?: boolean }

/** A háttérfigyelő indítása (a portál instrumentation.ts-éből). Többszöri hívásra is csak egyszer indul. */
export function figyeloIndit(): void {
  if (!FIGYELO.bekapcsolva || g.__donkiFigyelo) return
  g.__donkiFigyelo = true
  void inditas()
}

async function inditas(): Promise<void> {
  let utolsoHiba = ''
  const jelez = (h: string) => {
    if (h !== utolsoHiba) console.error(`[figyelo] ${h}`)
    utolsoHiba = h
  }
  // a lock (és az agens-db) megszerzése – ha a stack még nem fut, vagy más tartja a lockot, percenként újrapróbálja
  let zar: pg.Client | null = null
  while (!zar) {
    try {
      zar = await zarolas()
      if (!zar) jelez('egy másik folyamat már futtatja a figyelőt – várakozás')
    } catch (e) {
      jelez(`az agens-db nem érhető el (${hibaSzoveg(e)}) – újrapróbálás percenként`)
    }
    if (!zar) await new Promise((r) => setTimeout(r, 60_000))
  }
  zar.on('error', (e) => jelez(`a lock kapcsolata megszakadt: ${hibaSzoveg(e)}`))
  const figyelo = new Figyelo(await Agens.nyit())
  console.log('[figyelo] elindult')

  const futo = new Set<string>()
  const ismetel = (nev: string, ms: number, elso: number, f: () => Promise<unknown>) => {
    const fut = async () => {
      if (futo.has(nev)) return
      futo.add(nev)
      try {
        if ((await J.figyeloAllapot()).bekapcsolva) await f()
      } catch (e) {
        jelez(`${nev}: ${hibaSzoveg(e)}`)
      } finally {
        futo.delete(nev)
      }
    }
    setTimeout(() => {
      void fut()
      setInterval(() => void fut(), ms).unref()
    }, elso).unref()
  }
  const naploz = async (r: KorEredmeny) => {
    await J.korMentes({ esemeny: r.esemeny, hiba: r.hibak.length ? r.hibak.slice(0, 3).join(' · ') : null })
    if (r.uj || r.lezart) console.log(`[figyelo] ${r.uj} új jelzés, ${r.lezart} lezárva`)
    if (r.hibak.length) jelez(r.hibak[0])
  }
  ismetel('esemenyek', FIGYELO.esemenyMs, 5_000, async () => naploz(await figyelo.esemenyKor()))
  ismetel('idozitett', FIGYELO.idozitettMs, 30_000, async () => naploz(await figyelo.idozitettKor()))
  ismetel('elemzes', 10_000, 15_000, () => figyelo.elemzesKor())
}
