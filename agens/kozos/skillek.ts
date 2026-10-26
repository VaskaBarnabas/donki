// Skillek (17. fázis): folyamatleírások és üzleti szabályok SKILL.md fájlokban (agens/skills/<nev>/SKILL.md, a
// szabványos frontmatterrel). A szakágens utasításában csak a nevük és az egysoros leírásuk szerepel; a teljes
// szöveget a load_skill eszközzel tölti be, amikor szüksége van rá.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const KONYVTAR = process.env.AGENS_SKILLEK ?? join(process.cwd(), 'agens', 'skills')

export type Skill = { nev: string; leiras: string; tartalom: string }

let gyorsitotar: Map<string, Skill> | null = null

export function skillek(): Map<string, Skill> {
  if (gyorsitotar) return gyorsitotar
  gyorsitotar = new Map()
  for (const nev of readdirSync(KONYVTAR)) {
    const nyers = readFileSync(join(KONYVTAR, nev, 'SKILL.md'), 'utf8')
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(nyers)
    if (!m) throw new Error(`Hibás SKILL.md (frontmatter): ${nev}`)
    const mezo = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(m[1])?.[1].trim() ?? ''
    if (mezo('name') !== nev) throw new Error(`A skill neve (${mezo('name')}) nem egyezik a könyvtárral (${nev})`)
    gyorsitotar.set(nev, { nev, leiras: mezo('description'), tartalom: m[2].trim() })
  }
  return gyorsitotar
}

/** A load_skill eszköz leírása a modellnek (OpenAI/LangChain tool-formátum), az adott ágens skilljeire szűkítve. */
export function loadSkillEszkoz(nevek: readonly string[]) {
  return {
    type: 'function' as const,
    function: {
      name: 'load_skill',
      description: 'Load the full text of a skill (business procedure) before you follow it.',
      parameters: { type: 'object', properties: { name: { type: 'string', enum: [...nevek] } }, required: ['name'] },
    },
  }
}

/** A skill-katalógus a rendszerutasításba: név + egysoros leírás. */
export function skillKatalogus(nevek: readonly string[]): string {
  return nevek.map((n) => `- ${n}: ${skillek().get(n)?.leiras ?? ''}`).join('\n')
}
