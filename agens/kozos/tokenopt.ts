// 20. fázis, tokenomika: két, alapból kikapcsolt bemenet-csökkentés a szakágens modellhívásaihoz. Bekapcsolás:
// AGENS_TOKEN_OPT=sema,elozmeny. A mentett állapot és a szerver oldali ellenőrzés nem változik, csak az, amit a modell lát.
//   sema      az opcionális eszközparaméterek leírását kihagyja (a kötelező mezők leírása, a típus és az enum megmarad)
//   sema-mind minden paraméterleírást kihagy (csak méréshez, a hatás felső korlátja)
//   elozmeny  a legutóbbi eszközválaszoknál régebbi, hosszú eszközválaszokat lerövidíti (a skillek szövege teljes marad)

import { ToolMessage, type BaseMessage } from '@langchain/core/messages'

const bekapcsolva = (n: string) => (process.env.AGENS_TOKEN_OPT ?? '').split(',').includes(n)
const REGI_VALASZ_MAX = 400

/** Egy paraméter leírásának törlése (a beágyazott tömbelemeknél is); a típus, az enum és a kötelező mezők megmaradnak. */
function leirasNelkul(x: unknown): unknown {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return x
  const { description: _leiras, ...tobbi } = x as Record<string, unknown>
  void _leiras
  return 'items' in tobbi ? { ...tobbi, items: leirasNelkul(tobbi.items) } : tobbi
}

export function semaOptimalizal(s: Record<string, unknown>): Record<string, unknown> {
  const mind = bekapcsolva('sema-mind')
  if (!mind && !bekapcsolva('sema')) return s
  const kotelezo = new Set((s.required as string[] | undefined) ?? [])
  const mezok = (s.properties ?? {}) as Record<string, unknown>
  return { ...s, properties: Object.fromEntries(Object.entries(mezok).map(([k, v]) => [k, mind || !kotelezo.has(k) ? leirasNelkul(v) : v])) }
}

export function elozmenyOptimalizal(munka: BaseMessage[]): BaseMessage[] {
  if (!bekapcsolva('elozmeny')) return munka
  let utolso = munka.length
  while (utolso > 0 && ToolMessage.isInstance(munka[utolso - 1])) utolso--
  return munka.map((m, i) => {
    if (i >= utolso || !ToolMessage.isInstance(m) || m.name === 'load_skill' || typeof m.content !== 'string' || m.content.length <= REGI_VALASZ_MAX) return m
    return new ToolMessage({ tool_call_id: m.tool_call_id, name: m.name, status: m.status, content: `${m.content.slice(0, REGI_VALASZ_MAX)} …[older tool result shortened; call the tool again if you need the rest]` })
  })
}
