/**
 * 20. fázis, tokenomika: miből áll egy szakágens modellhívásának bemenete? Az Ollama számolja meg a tokeneket
 * (rendszerutasítás, eszközleírás teljes sémával, opcionális paraméterleírás nélkül, minden paraméterleírás nélkül). A modell nem generál érdemben (num_predict = 1).
 * Előfeltétel: npm run stack:up, Ollama. Futtatás: npx tsx scripts/riportok/tokenomics-bontas.ts
 * Kimenet: riportok/05-osszehasonlitasok/adatok/tokenomics-bontas.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { BEALLITAS } from '../../agens/kozos/kornyezet'
import { McpKapcsolat } from '../../agens/kozos/mcp'
import { loadSkillEszkoz, skillek, skillKatalogus } from '../../agens/kozos/skillek'
import { semaOptimalizal } from '../../agens/kozos/tokenopt'
import { AGENS_DEF } from '../../agens/ugynokok'

const MODELL = 'donki-gemma-e4b'
const AGENSEK = ['ertekesites', 'rendeles', 'raktar', 'ugyfelszolgalat', 'kivetel'] as const
const KERES = 'Hogy áll a dolog?'

async function szamol(rendszer: string, eszkozok: unknown[]) {
  const v = await fetch(`${BEALLITAS.modellUrl}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model: MODELL, stream: false, options: { num_predict: 1 }, messages: [{ role: 'system', content: rendszer }, { role: 'user', content: KERES }], ...(eszkozok.length ? { tools: eszkozok } : {}) }),
  })
  return ((await v.json()) as { prompt_eval_count: number }).prompt_eval_count
}

async function main() {
  const ki = []
  const stilus = skillek().get('kommunikacios-stilus')?.tartalom ?? ''
  process.env.AGENS_TOKEN_OPT = ''
  for (const a of AGENSEK) {
    const d = AGENS_DEF[a]
    const sajat = d.skillek.filter((x) => x !== 'kommunikacios-stilus')
    const rendszer = `${d.utasitas}\n\nAnswering style (always follow):\n${stilus}${sajat.length ? `\n\nSkills you can load with load_skill before following a procedure:\n${skillKatalogus(sajat)}` : ''}\n\nThe user's role: admin. Today: 2026-11-10.`
    const k = await McpKapcsolat.nyit('admin', '00000000-0000-4000-8000-000000000000', d.szerverek)
    const e = k.eszkozok.filter((x) => !d.eszkozok || d.eszkozok.includes(x.nev))
    const lista = () => [...e.map((x) => ({ type: 'function', function: { name: x.nev, description: x.leiras, parameters: semaOptimalizal(x.schema) } })), ...(sajat.length ? [loadSkillEszkoz(sajat)] : [])]
    const ures = await szamol('', [])
    const csakRendszer = await szamol(rendszer, [])
    process.env.AGENS_TOKEN_OPT = ''
    const teljes = await szamol(rendszer, lista())
    process.env.AGENS_TOKEN_OPT = 'sema'
    const tomoritett = await szamol(rendszer, lista())
    process.env.AGENS_TOKEN_OPT = 'sema-mind'
    const leirasNelkul = await szamol(rendszer, lista())
    process.env.AGENS_TOKEN_OPT = ''
    ki.push({ agens: a, eszkozok: e.length, keret: ures, rendszer: csakRendszer - ures, eszkozToken: teljes - csakRendszer, eszkozTokenTomoritett: tomoritett - csakRendszer, eszkozTokenLeirasNelkul: leirasNelkul - csakRendszer, osszes: teljes, osszesTomoritett: tomoritett, osszesLeirasNelkul: leirasNelkul })
    console.log(JSON.stringify(ki.at(-1)))
  }
  mkdirSync('riportok/05-osszehasonlitasok/adatok', { recursive: true })
  writeFileSync('riportok/05-osszehasonlitasok/adatok/tokenomics-bontas.json', JSON.stringify(ki, null, 1))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
