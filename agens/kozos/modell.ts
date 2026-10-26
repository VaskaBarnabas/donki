// A modell az ágens számára (17. fázis): két művelet – strukturált döntés (a front-desk útválasztása) és válasz
// eszközhívásokkal (a szakágensek). Élesben a helyi Ollama modell (ChatOllama, az Ollama saját API-ján); a tesztben
// egy forgatókönyv szerint válaszoló modell (agens/teszt-modell.ts) – ugyanezen a felületen.

import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import { ChatOllama } from '@langchain/ollama'
import type { z } from 'zod'
import { BEALLITAS } from './kornyezet'

/** Eszközleírás a modellnek (OpenAI/LangChain tool-formátum). */
export type EszkozLeiras = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

export type Hasznalat = { tokenBe: number; tokenKi: number }

export interface AgensModell {
  readonly nev: string
  /** Strukturált kimenet a megadott séma szerint (a front-desk döntése). */
  dont<T>(uzenetek: BaseMessage[], sema: z.ZodType<T>, semaNev: string): Promise<{ adat: T; hasznalat: Hasznalat }>
  /** Válasz a megadott eszközökkel: vagy szöveg, vagy eszközhívás(ok) (AIMessage.tool_calls). */
  valaszol(uzenetek: BaseMessage[], eszkozok: EszkozLeiras[]): Promise<{ uzenet: AIMessage; hasznalat: Hasznalat }>
}

export function hasznalat(m: AIMessage | undefined): Hasznalat {
  return { tokenBe: m?.usage_metadata?.input_tokens ?? 0, tokenKi: m?.usage_metadata?.output_tokens ?? 0 }
}

/**
 * Időkorlát és egy újrapróbálás. Az Ollama MLX-futtatója ritkán „beragad” egy kérésnél (még az első válaszdarab előtt;
 * 2026-10-24, a strukturált kimenetnél). A LangChain jelzése (signal) ilyenkor nem zárja le a HTTP-kérést, ezért
 * időtúllépésnél a kliens saját abort()-jával szakítjuk meg – ettől az Ollama felszabadul, és a második próba lefut.
 */
async function idokorlattal<T>(ms: number, kliens: ChatOllama, f: () => Promise<T>): Promise<T> {
  for (let probalkozas = 1; ; probalkozas++) {
    let idozito: NodeJS.Timeout | undefined
    const lejar = new Promise<never>((_, elutasit) => {
      idozito = setTimeout(() => {
        kliens.client.abort()
        elutasit(new Error('IDOTULLEPES'))
      }, ms)
    })
    try {
      return await Promise.race([f(), lejar])
    } catch (e) {
      const idotullepes = e instanceof Error && (e.message === 'IDOTULLEPES' || e.name === 'AbortError')
      if (!idotullepes || probalkozas >= 2) throw idotullepes ? new Error(`A modell ${ms / 1000} mp alatt nem válaszolt (kétszer).`) : e
      console.error(`[agens] a modell ${ms / 1000} mp alatt nem válaszolt – megszakítva, újrapróbálás`)
    } finally {
      clearTimeout(idozito)
    }
  }
}

/**
 * A helyi modell (Ollama). A front-desk döntésénél a gondolkodás mindig ki van kapcsolva (gyorsabb, elég).
 * Kimeneti korlát: strukturált kimenetnél a modell ritkán „belefut” egy végtelen ismétlésbe egy szöveges mezőben
 * (2026-10-24: ~4000 token egy döntésre); a korlát ezt levágja, a csonka JSON-t pedig egy második, kicsit
 * véletlenszerűbb próba váltja ki.
 */
export function ollamaModell(nev = BEALLITAS.modell): AgensModell {
  const alap = { model: nev, baseUrl: BEALLITAS.modellUrl, keepAlive: '30m' }
  const dontesek = [
    new ChatOllama({ ...alap, think: false, temperature: 0.1, numPredict: 120, repeatPenalty: 1.15 }),
    new ChatOllama({ ...alap, think: false, temperature: 0.5, numPredict: 120, repeatPenalty: 1.3 }),
  ]
  const munkak = [
    new ChatOllama({ ...alap, think: BEALLITAS.gondolkodas, numPredict: 1500, repeatPenalty: 1.1 }),
    new ChatOllama({ ...alap, think: BEALLITAS.gondolkodas, numPredict: 1500, repeatPenalty: 1.25, temperature: 0.6 }),
  ]
  return {
    nev,
    async dont(uzenetek, sema, semaNev) {
      let hasznalt: Hasznalat = { tokenBe: 0, tokenKi: 0 }
      let utolsoHiba: unknown
      for (const m of dontesek) {
        try {
          const r = await idokorlattal(60_000, m, () => m.withStructuredOutput(sema, { name: semaNev, includeRaw: true }).invoke(uzenetek))
          const h = hasznalat(r.raw as AIMessage)
          hasznalt = { tokenBe: hasznalt.tokenBe + h.tokenBe, tokenKi: hasznalt.tokenKi + h.tokenKi }
          const ellenorzott = sema.safeParse(r.parsed)
          if (ellenorzott.success) return { adat: ellenorzott.data, hasznalat: hasznalt }
          utolsoHiba = ellenorzott.error
        } catch (e) {
          utolsoHiba = e
        }
      }
      throw new Error(`A modell nem adott érvényes döntést: ${utolsoHiba instanceof Error ? utolsoHiba.message : String(utolsoHiba)}`)
    },
    async valaszol(uzenetek, eszkozok) {
      let osszes: Hasznalat = { tokenBe: 0, tokenKi: 0 }
      let m: AIMessage | undefined
      for (const munka of munkak) {
        m = (await idokorlattal(180_000, munka, () => (eszkozok.length ? munka.bindTools(eszkozok) : munka).invoke(uzenetek))) as AIMessage
        const h = hasznalat(m)
        osszes = { tokenBe: osszes.tokenBe + h.tokenBe, tokenKi: osszes.tokenKi + h.tokenKi }
        // a kimeneti korlátnál elvágott, eszközhívás nélküli válasz = ismétlésbe futott: még egy próba
        const levagva = (m.response_metadata as { done_reason?: string } | undefined)?.done_reason === 'length'
        if (!levagva || m.tool_calls?.length) break
        console.error('[agens] a válasz a kimeneti korlátnál megszakadt (ismétlés) – újrapróbálás')
      }
      return { uzenet: m!, hasznalat: osszes }
    },
  }
}
