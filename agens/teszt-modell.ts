// Forgatókönyv szerint válaszoló modell a determinisztikus tesztekhez (17. fázis): ugyanazon a felületen, mint a
// helyi modell (AgensModell), így a gráf, a jóváhagyás, az MCP-hívások és a napló valódi – csak a „gondolkodás” előre
// megírt. Minden hívásnál feljegyzi, milyen üzeneteket és eszközöket kapott a modell (az eszközszűrés ellenőrzéséhez).

import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { z } from 'zod'
import type { AgensModell, EszkozLeiras } from './kozos/modell'

export type Lepes =
  | { dontes: Record<string, unknown> }
  | { eszkoz: { name: string; args: Record<string, unknown> }[] }
  | { szoveg: string }
  /** a modell az előző eszközválaszok alapján dönt (pl. kiolvassa belőlük az azonosítót) */
  | { fuggveny: (uzenetek: BaseMessage[]) => { name: string; args: Record<string, unknown> }[] | string }

export type Hivas = { tipus: 'dont' | 'valaszol'; uzenetek: BaseMessage[]; eszkozok: string[] }

export class ForgatokonyvModell implements AgensModell {
  readonly nev = 'forgatokonyv'
  readonly hivasok: Hivas[] = []
  private lepesek: Lepes[] = []
  private sorszam = 0

  /** Új forgatókönyv (a korábbi lépések elvesznek). */
  forgatokonyv(...lepesek: Lepes[]): this {
    this.lepesek = lepesek
    this.vegtelenEszkoz = null
    return this
  }

  /** Végtelen eszközhívás (a lépéskorlát teszteléséhez): mindig ugyanazt az olvasó eszközt kéri. */
  vegtelen(eszkoz: { name: string; args: Record<string, unknown> }): this {
    this.vegtelenEszkoz = eszkoz
    return this
  }
  private vegtelenEszkoz: { name: string; args: Record<string, unknown> } | null = null

  private kovetkezo(): Lepes {
    const l = this.lepesek.shift()
    if (l) return l
    if (this.vegtelenEszkoz) return { eszkoz: [this.vegtelenEszkoz] }
    throw new Error('A forgatókönyv elfogyott')
  }

  async dont<T>(uzenetek: BaseMessage[], sema: z.ZodType<T>): Promise<{ adat: T; hasznalat: { tokenBe: number; tokenKi: number } }> {
    this.hivasok.push({ tipus: 'dont', uzenetek, eszkozok: [] })
    const l = this.kovetkezo()
    if (!('dontes' in l)) throw new Error(`A forgatókönyv döntést vár, nem: ${JSON.stringify(l)}`)
    return { adat: sema.parse(l.dontes), hasznalat: { tokenBe: 100, tokenKi: 10 } }
  }

  async valaszol(uzenetek: BaseMessage[], eszkozok: EszkozLeiras[]): Promise<{ uzenet: AIMessage; hasznalat: { tokenBe: number; tokenKi: number } }> {
    this.hivasok.push({ tipus: 'valaszol', uzenetek, eszkozok: eszkozok.map((e) => e.function.name) })
    let l = this.kovetkezo()
    if ('fuggveny' in l) {
      const r = l.fuggveny(uzenetek)
      l = typeof r === 'string' ? { szoveg: r } : { eszkoz: r }
    }
    if ('dontes' in l) throw new Error('A forgatókönyv választ vár, nem döntést')
    const uzenet =
      'szoveg' in l
        ? new AIMessage(l.szoveg)
        : new AIMessage({ content: '', tool_calls: l.eszkoz.map((e) => ({ id: `hivas-${++this.sorszam}-${Date.now()}`, name: e.name, args: e.args, type: 'tool_call' as const })) })
    return { uzenet, hasznalat: { tokenBe: 200, tokenKi: 20 } }
  }
}
