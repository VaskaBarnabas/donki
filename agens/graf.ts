// Az ágens gráfja (17. fázis, LangGraph.js):
//
//   START → frontdesk ─(visszakérdez)──────────────────────────────► END
//              │ (melyik szakágens + önálló feladat)
//              ▼
//          szakagens ──(eszközhívás)──► jovahagyas ──► eszkozok ──┐
//              ▲   │                    (interrupt, ha nem          │
//              │   │                     csak olvas)               │
//              │   └──(kész / lépéskorlát)──► valasz ──► END       │
//              └───────────────────────────────────────────────────┘
//
// - A jóváhagyásról a gráf dönt (a kockázati jelölés alapján), nem a modell: a `jovahagyas` csomópont az író hívások
//   előtt megáll (interrupt), és csak a felhasználó döntése után megy tovább. Folytatáskor a LangGraph ezt a
//   csomópontot futtatja újra – benne nincs mellékhatás –, a végrehajtás az `eszkozok` csomópontban, utána történik.
// - Az állapotot minden lépés után a checkpointer menti (Postgres, agens-db), így egy megállított beszélgetés később,
//   másik folyamatból is folytatható (18. fázis: webes jóváhagyás).
// - A futásidejű környezet (modell, MCP-kapcsolat, napló) a `context`-ben jön, nem kerül a mentett állapotba.

import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { Annotation, END, interrupt, messagesStateReducer, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph'
import { z } from 'zod'
import { BEALLITAS, type Szerep } from './kozos/kornyezet'
import type { McpKapcsolat } from './kozos/mcp'
import type { AgensModell, EszkozLeiras } from './kozos/modell'
import type { FutasEredmeny, Naplo } from './kozos/naplo'
import { loadSkillEszkoz, skillek, skillKatalogus } from './kozos/skillek'
import { AGENS_DEF, AGENSEK, FRONTDESK_UTASITAS, type AgensNev } from './ugynokok'

export type Kornyezet = {
  modell: AgensModell
  /** az adott szakágens MCP-kapcsolata (szerepkör szerint, a futás azonosítójával) */
  mcp: (agens: AgensNev) => Promise<McpKapcsolat>
  naplo: Naplo
}

/** A jóváhagyásra váró hívás – ezt kapja a felhasználó (parancssor, 18. fázisban a weboldal). */
export type JovahagyasKeres = { id: string; eszkoz: string; cim: string; kockazat: string; bemenet: Record<string, unknown>; agens: AgensNev }

export const Allapot = Annotation.Root({
  /** a felhasználói beszélgetés (kérések és válaszok) */
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  futasId: Annotation<string>(),
  szerep: Annotation<Szerep>(),
  agens: Annotation<AgensNev | null>(),
  feladat: Annotation<string | null>(),
  /** az aktuális szakágens munkaüzenetei (rendszerutasítás, feladat, modell- és eszközüzenetek) */
  munka: Annotation<BaseMessage[]>(),
  eszkozHivasok: Annotation<number>(),
  /** a felhasználó döntései az aktuális jóváhagyásokra: hívásazonosító → igen/nem */
  dontesek: Annotation<Record<string, boolean>>(),
  eredmeny: Annotation<FutasEredmeny | null>(),
})
type S = typeof Allapot.State

const kornyezet = (config: unknown): Kornyezet => {
  const k = (config as { context?: Kornyezet }).context
  if (!k) throw new Error('Hiányzó ágens-környezet (context)')
  return k
}

// A front-desk csak választ (rövid kimenet): a feladatot nem fogalmazza át – a szakágens a felhasználó szó szerinti
// kérését és a beszélgetés előzményét kapja a kódtól (a 12B modell magyar átfogalmazása hibákba és ismétlésbe futott).
const DONTES = z.object({
  agens: z.enum([...AGENSEK, 'visszakerdez']),
  kerdes: z.string().optional().describe('short clarifying question in Hungarian, only when agens = visszakerdez'),
})

/** A beszélgetés előzménye a szakágensnek: a korábbi kérések és válaszok (szövegként), a legutóbbi kérés külön. */
function elozmenySzoveg(uzenetek: BaseMessage[]): string {
  const korabbi = uzenetek.slice(0, -1).slice(-6)
  if (!korabbi.length) return ''
  return `Earlier in this conversation:\n${korabbi.map((m) => `${m.getType() === 'human' ? 'User' : 'Assistant'}: ${szoveg(m).slice(0, 600)}`).join('\n')}\n\n`
}

function utolsoAi(uzenetek: BaseMessage[]): AIMessage | undefined {
  for (let i = uzenetek.length - 1; i >= 0; i--) if (AIMessage.isInstance(uzenetek[i])) return uzenetek[i] as AIMessage
  return undefined
}

function szoveg(m: BaseMessage | undefined): string {
  if (!m) return ''
  return typeof m.content === 'string' ? m.content : m.content.map((c) => ('text' in c ? c.text : '')).join('')
}

/** Az aktuális szakágens eszközei a modellnek (a saját listájára szűrve) + a load_skill. */
async function eszkozLeirasok(k: Kornyezet, agens: AgensNev): Promise<EszkozLeiras[]> {
  const def = AGENS_DEF[agens]
  const mcp = await k.mcp(agens)
  const sajat = mcp.eszkozok.filter((e) => !def.eszkozok || def.eszkozok.includes(e.nev))
  return [
    ...sajat.map((e) => ({ type: 'function' as const, function: { name: e.nev, description: e.leiras, parameters: e.schema } })),
    loadSkillEszkoz(def.skillek.filter((s) => s !== 'kommunikacios-stilus')),
  ]
}

async function frontdesk(s: S, config: unknown): Promise<Partial<S>> {
  const k = kornyezet(config)
  const kezdet = Date.now()
  const elozmeny = s.messages.slice(-8)
  let dontes: Awaited<ReturnType<AgensModell['dont']>> & { adat: z.infer<typeof DONTES> }
  try {
    dontes = await k.modell.dont([new SystemMessage(FRONTDESK_UTASITAS), ...elozmeny], DONTES, 'routing')
  } catch (e) {
    await k.naplo.lepes(s.futasId, { agens: 'frontdesk', tipus: 'modell', ok: false, hibakod: 'ROUTING_FAILED', idoMs: Date.now() - kezdet })
    console.error('[agens] front-desk:', e instanceof Error ? e.message : e)
    return { agens: null, feladat: null, eredmeny: 'visszakerdezett', messages: [new AIMessage('Elnézést, ezt most nem sikerült értelmeznem. Megfogalmaznád másképp, röviden?')] }
  }
  const { adat, hasznalat } = dontes
  await k.naplo.lepes(s.futasId, { agens: 'frontdesk', tipus: 'modell', ...hasznalat, idoMs: Date.now() - kezdet })
  if (adat.agens === 'visszakerdez') {
    return { agens: null, feladat: null, eredmeny: 'visszakerdezett', messages: [new AIMessage(adat.kerdes || 'Pontosítanád, miben segíthetek?')] }
  }
  const def = AGENS_DEF[adat.agens]
  const keres = szoveg(s.messages.at(-1))
  const stilus = skillek().get('kommunikacios-stilus')?.tartalom ?? ''
  const rendszer = `${def.utasitas}\n\nAnswering style (always follow):\n${stilus}\n\nSkills you can load with load_skill before following a procedure:\n${skillKatalogus(def.skillek.filter((x) => x !== 'kommunikacios-stilus'))}\n\nThe user's role: ${s.szerep}. Today: ${new Date().toISOString().slice(0, 10)}.`
  return { agens: adat.agens, feladat: keres, munka: [new SystemMessage(rendszer), new HumanMessage(`${elozmenySzoveg(s.messages)}${keres}`)], eszkozHivasok: 0, dontesek: {}, eredmeny: null }
}

async function szakagens(s: S, config: unknown): Promise<Partial<S>> {
  const k = kornyezet(config)
  const kezdet = Date.now()
  const { uzenet, hasznalat } = await k.modell.valaszol(s.munka, await eszkozLeirasok(k, s.agens!))
  await k.naplo.lepes(s.futasId, { agens: s.agens!, tipus: 'modell', ...hasznalat, idoMs: Date.now() - kezdet })
  if (process.env.AGENS_NYOMKOVETES === '1') {
    console.error(`[nyom] ${s.agens} → ${uzenet.tool_calls?.map((h) => `${h.name}(${JSON.stringify(h.args)})`).join(', ') || '(nincs eszközhívás)'} | ${JSON.stringify(szoveg(uzenet)).slice(0, 400)}`)
  }
  return { munka: [...s.munka, uzenet] }
}

function szakagensUtan(s: S): 'jovahagyas' | 'valasz' {
  const ai = utolsoAi(s.munka)
  return ai?.tool_calls?.length && s.eszkozHivasok < BEALLITAS.maxEszkozHivas ? 'jovahagyas' : 'valasz'
}

/** Az író hívások jóváhagyása: megáll (interrupt), amíg a felhasználó nem dönt. Mellékhatás nincs benne. */
async function jovahagyas(s: S, config: unknown): Promise<Partial<S>> {
  const k = kornyezet(config)
  const mcp = await k.mcp(s.agens!)
  const kell: JovahagyasKeres[] = (utolsoAi(s.munka)?.tool_calls ?? [])
    .filter((h) => h.name !== 'load_skill')
    .map((h) => ({ h, e: mcp.eszkoz(h.name) }))
    .filter(({ e }) => e && e.kockazat !== 'read')
    .map(({ h, e }) => ({ id: h.id!, eszkoz: h.name, cim: e!.cim, kockazat: e!.kockazat, bemenet: h.args, agens: s.agens! }))
  if (!kell.length) return { dontesek: {} }
  const dontes = interrupt<{ jovahagyas: JovahagyasKeres[] }, Record<string, boolean>>({ jovahagyas: kell })
  return { dontesek: Object.fromEntries(kell.map((j) => [j.id, dontes?.[j.id] === true])) }
}

async function eszkozok(s: S, config: unknown): Promise<Partial<S>> {
  const k = kornyezet(config)
  const mcp = await k.mcp(s.agens!)
  const engedett = new Set(AGENS_DEF[s.agens!].eszkozok ?? mcp.eszkozok.map((e) => e.nev))
  const valaszok: ToolMessage[] = []
  let db = s.eszkozHivasok
  for (const h of utolsoAi(s.munka)?.tool_calls ?? []) {
    const id = h.id!
    const kezdet = Date.now()
    if (h.name === 'load_skill') {
      const nev = String((h.args as { name?: string }).name ?? '')
      const sk = AGENS_DEF[s.agens!].skillek.includes(nev) ? skillek().get(nev) : undefined
      valaszok.push(new ToolMessage({ tool_call_id: id, name: h.name, content: sk ? sk.tartalom : `Unknown skill: ${nev}` }))
      await k.naplo.lepes(s.futasId, { agens: s.agens!, tipus: 'skill', eszkoz: nev, ok: !!sk, idoMs: Date.now() - kezdet })
      continue
    }
    const e = mcp.eszkoz(h.name)
    if (!e || !engedett.has(h.name)) {
      valaszok.push(new ToolMessage({ tool_call_id: id, name: h.name, content: JSON.stringify({ error: { code: 'UNKNOWN_TOOL', message: `Tool not available for you: ${h.name}` } }) }))
      await k.naplo.lepes(s.futasId, { agens: s.agens!, tipus: 'eszkoz', eszkoz: h.name, ok: false, hibakod: 'UNKNOWN_TOOL' })
      continue
    }
    const kellJovahagyas = e.kockazat !== 'read'
    if (kellJovahagyas && s.dontesek?.[id] !== true) {
      valaszok.push(new ToolMessage({ tool_call_id: id, name: h.name, content: JSON.stringify({ error: { code: 'APPROVAL_DENIED', message: 'A felhasználó nem hagyta jóvá ezt a műveletet; nem történt meg. Ne próbáld újra.' } }) }))
      await k.naplo.lepes(s.futasId, { agens: s.agens!, tipus: 'jovahagyas', eszkoz: h.name, kockazat: e.kockazat, jovahagyas: 'elutasitva', ok: false, hibakod: 'APPROVAL_DENIED' })
      continue
    }
    db++
    const r = await mcp.hiv(h.name, h.args as Record<string, unknown>, `${s.futasId}:${id}`)
    valaszok.push(new ToolMessage({ tool_call_id: id, name: h.name, content: r.szoveg, status: r.ok ? 'success' : 'error' }))
    await k.naplo.lepes(s.futasId, {
      agens: s.agens!,
      tipus: 'eszkoz',
      eszkoz: h.name,
      kockazat: e.kockazat,
      jovahagyas: kellJovahagyas ? 'jovahagyva' : 'nem_kell',
      ok: r.ok,
      hibakod: r.hibakod,
      idoMs: Date.now() - kezdet,
    })
  }
  return { munka: [...s.munka, ...valaszok], eszkozHivasok: db, dontesek: {} }
}

/** A szakágens válasza a felhasználónak; lépéskorlátnál egy utolsó, eszköz nélküli összefoglalás. */
async function valasz(s: S, config: unknown): Promise<Partial<S>> {
  const k = kornyezet(config)
  let ai = utolsoAi(s.munka)
  let eredmeny: FutasEredmeny = 'kesz'
  if (ai?.tool_calls?.length) {
    const kezdet = Date.now()
    // a függő eszközhívásokra válasz kell, különben a modell API elutasítja az üzenetsort
    const fuggo = ai.tool_calls.map((h) => new ToolMessage({ tool_call_id: h.id!, name: h.name, content: 'Nem futott le: lépéskorlát.' }))
    const zaro = new HumanMessage('A lépéskorlát elérve. Ne hívj több eszközt: foglald össze magyarul, mit végeztél el eddig, és mi maradt hátra.')
    const r = await k.modell.valaszol([...s.munka, ...fuggo, zaro], [])
    await k.naplo.lepes(s.futasId, { agens: s.agens!, tipus: 'modell', ...r.hasznalat, idoMs: Date.now() - kezdet })
    ai = r.uzenet
    eredmeny = 'megszakitva'
  }
  return { messages: [new AIMessage(szoveg(ai) || 'Kész.')], munka: [], eredmeny }
}

export function grafEpites(checkpointer: BaseCheckpointSaver) {
  return new StateGraph(Allapot)
    .addNode('frontdesk', frontdesk)
    .addNode('szakagens', szakagens)
    .addNode('jovahagyas', jovahagyas)
    .addNode('eszkozok', eszkozok)
    .addNode('valasz', valasz)
    .addEdge(START, 'frontdesk')
    .addConditionalEdges('frontdesk', (s: S) => (s.agens ? 'szakagens' : END), ['szakagens', END])
    .addConditionalEdges('szakagens', szakagensUtan, ['jovahagyas', 'valasz'])
    .addEdge('jovahagyas', 'eszkozok')
    .addEdge('eszkozok', 'szakagens')
    .addEdge('valasz', END)
    .compile({ checkpointer })
}

export type Graf = ReturnType<typeof grafEpites>
