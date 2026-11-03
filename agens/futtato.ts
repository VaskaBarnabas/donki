// Az ágens futtatása (17. fázis) – ezt hívja a parancssor, a teszt és a 18. fázisban a portál asszisztens-oldala.
//
//   const agens = await Agens.nyit()
//   let v = await agens.kerdez({ threadId, szerep: 'sales', keres: 'A Bakony Gépgyártó 12 monitort kér, mennyi?' })
//   if (v.allapot === 'jovahagyasra_var') v = await agens.dont({ threadId, dontesek: { [v.jovahagyas[0].id]: true } })
//
// A beszélgetés (thread) állapotát a checkpointer menti, így a `dont` akár másik folyamatból is hívható.

import { randomUUID } from 'node:crypto'
import { HumanMessage, type BaseMessage } from '@langchain/core/messages'
import { Command, type BaseCheckpointSaver } from '@langchain/langgraph'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { grafEpites, type Graf, type JovahagyasKeres, type Kornyezet } from './graf'
import { BEALLITAS, type Szerep } from './kozos/kornyezet'
import { HelyiForras, McpKapcsolat, type EszkozForras, type HelyiEszkoz } from './kozos/mcp'
import { ollamaModell, type AgensModell } from './kozos/modell'
import { dbZar, pgNaplo, type FutasEredmeny, type Naplo } from './kozos/naplo'
import { AGENS_DEF, type AgensNev } from './ugynokok'

export type FutasValasz = {
  threadId: string
  futasId: string
  allapot: FutasEredmeny
  agens: AgensNev | null
  /** a válasz a felhasználónak (kész vagy visszakérdezett állapotban) */
  valasz: string | null
  /** jóváhagyásra váró író hívások (jovahagyasra_var állapotban) */
  jovahagyas: JovahagyasKeres[]
  hiba?: string
}

export class Agens {
  private constructor(
    private readonly graf: Graf,
    private readonly modell: AgensModell,
    private readonly naplo: Naplo,
    private readonly sajatDb: boolean
  ) {}

  /** Alapból: helyi Ollama modell, Postgres checkpointer és napló az agens-db-ben. A teszt bármelyiket lecserélheti. */
  static async nyit(o: { modell?: AgensModell; checkpointer?: BaseCheckpointSaver; naplo?: Naplo } = {}): Promise<Agens> {
    let checkpointer = o.checkpointer
    if (!checkpointer) {
      const pg = PostgresSaver.fromConnString(BEALLITAS.dbUrl(), { schema: 'langgraph' })
      await pg.setup()
      checkpointer = pg
    }
    return new Agens(grafEpites(checkpointer), o.modell ?? ollamaModell(), o.naplo ?? pgNaplo, !o.naplo)
  }

  /**
   * Új kérés egy beszélgetésben. `helyi`: a portál helyi eszközei (pl. felhasználókezelés a felhasználó munkamenetével);
   * nélkülük a helyi eszközös szakágensek nem érhetők el (parancssor).
   */
  async kerdez(p: { threadId?: string; szerep: Szerep; keres: string; felhasznalo?: string | null; helyi?: HelyiEszkoz[] }): Promise<FutasValasz> {
    const threadId = p.threadId ?? randomUUID()
    const futasId = randomUUID()
    await this.naplo.futasIndit({ id: futasId, threadId, szerep: p.szerep, keres: p.keres, modell: this.modell.nev, felhasznalo: p.felhasznalo })
    return this.futtat(threadId, futasId, p.szerep, { messages: [new HumanMessage(p.keres)], futasId, szerep: p.szerep, agens: null, eredmeny: null, elore: null, hatter: false }, p.helyi)
  }

  /**
   * Háttérfutás (18. fázis, a háttérfigyelő elemzése): a megadott szakágens dolgozik, front-desk nélkül, és a gráf
   * nem áll meg jóváhagyásra – minden író hívást elutasít. Mindig új, felhasználó nélküli beszélgetés.
   */
  async hatterben(p: { agens: AgensNev; szerep: Szerep; keres: string }): Promise<FutasValasz> {
    const threadId = randomUUID()
    const futasId = randomUUID()
    await this.naplo.futasIndit({ id: futasId, threadId, szerep: p.szerep, keres: p.keres, modell: this.modell.nev, felhasznalo: null })
    return this.futtat(threadId, futasId, p.szerep, { messages: [new HumanMessage(p.keres)], futasId, szerep: p.szerep, agens: null, eredmeny: null, elore: p.agens, hatter: true })
  }

  /** A jóváhagyásra váró hívások eldöntése (hívásazonosító → igen/nem), és a beszélgetés folytatása. */
  async dont(p: { threadId: string; dontesek: Record<string, boolean>; helyi?: HelyiEszkoz[] }): Promise<FutasValasz> {
    const allapot = await this.graf.getState({ configurable: { thread_id: p.threadId } })
    const { futasId, szerep } = allapot.values as { futasId: string; szerep: Szerep }
    if (!futasId) throw new Error(`Nincs ilyen beszélgetés: ${p.threadId}`)
    return this.futtat(p.threadId, futasId, szerep, new Command({ resume: p.dontesek }), p.helyi)
  }

  /** A beszélgetés aktuális helyzete (pl. folytatás előtt): függő jóváhagyások és az eddigi üzenetek. */
  async helyzet(threadId: string): Promise<{ jovahagyas: JovahagyasKeres[]; uzenetek: BaseMessage[]; szerep: Szerep | null }> {
    const a = await this.graf.getState({ configurable: { thread_id: threadId } })
    return { jovahagyas: fuggoJovahagyas(a), uzenetek: ((a.values as { messages?: BaseMessage[] }).messages ?? []), szerep: (a.values as { szerep?: Szerep }).szerep ?? null }
  }

  async zar(): Promise<void> {
    if (this.sajatDb) await dbZar()
  }

  private async futtat(threadId: string, futasId: string, szerep: Szerep, bemenet: unknown, helyi?: HelyiEszkoz[]): Promise<FutasValasz> {
    const kezdet = Date.now()
    const kapcsolatok = new Map<AgensNev, Promise<EszkozForras>>()
    const context: Kornyezet = {
      modell: this.modell,
      naplo: this.naplo,
      helyiVan: !!helyi?.length,
      mcp: (agens) => {
        if (!kapcsolatok.has(agens)) {
          const def = AGENS_DEF[agens]
          kapcsolatok.set(agens, def.helyi ? Promise.resolve(new HelyiForras(helyi ?? [])) : McpKapcsolat.nyit(szerep, futasId, def.szerverek))
        }
        return kapcsolatok.get(agens)!
      },
    }
    const config = { configurable: { thread_id: threadId }, context, recursionLimit: 100 }
    try {
      await this.graf.invoke(bemenet as never, config)
      const a = await this.graf.getState(config)
      const v = a.values as { eredmeny: FutasEredmeny | null; agens: AgensNev | null; messages: BaseMessage[] }
      const jovahagyas = fuggoJovahagyas(a)
      const allapot: FutasEredmeny = jovahagyas.length ? 'jovahagyasra_var' : (v.eredmeny ?? 'kesz')
      const utolso = v.messages.at(-1)
      const valasz = jovahagyas.length ? null : typeof utolso?.content === 'string' ? utolso.content : null
      await this.naplo.futasZar(futasId, { eredmeny: allapot, agens: v.agens, valasz, idoMs: Date.now() - kezdet })
      return { threadId, futasId, allapot, agens: v.agens, valasz, jovahagyas }
    } catch (e) {
      const hiba = e instanceof Error ? e.message : String(e)
      await this.naplo.futasZar(futasId, { eredmeny: 'hiba', hiba, idoMs: Date.now() - kezdet })
      return { threadId, futasId, allapot: 'hiba', agens: null, valasz: null, jovahagyas: [], hiba }
    } finally {
      await Promise.all([...kapcsolatok.values()].map((k) => k.then((x) => x.zar()).catch(() => null)))
    }
  }
}

function fuggoJovahagyas(a: { tasks: readonly { interrupts?: readonly { value?: unknown }[] }[] }): JovahagyasKeres[] {
  return a.tasks.flatMap((t) => t.interrupts ?? []).flatMap((i) => (i.value as { jovahagyas?: JovahagyasKeres[] } | undefined)?.jovahagyas ?? [])
}
