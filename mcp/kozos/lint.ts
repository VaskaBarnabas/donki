// Modellfüggetlenségi „lint”: azt ellenőrzi, amit a modell ténylegesen lát (a tools/list válaszát),
// hogy egy kisebb, helyben futó modell is megbízhatóan tudja használni az eszközöket.

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; items?: JsonSchema; [k: string]: unknown }
type Eszkoz = {
  name: string
  title?: string
  description?: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

const RISKS = ['read', 'write', 'financial', 'irreversible']
const NEV = /^[a-z][a-z0-9_]{2,63}$/
const EKEZET = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/

function melyseg(s: JsonSchema | undefined, d = 0): number {
  if (!s) return d
  const gyerekek = [...Object.values(s.properties ?? {}), ...(s.items ? [s.items] : [])]
  return gyerekek.length ? Math.max(...gyerekek.map((g) => melyseg(g, d + 1))) : d
}

function tartalmaz(s: unknown, kulcsok: string[]): boolean {
  if (!s || typeof s !== 'object') return false
  return Object.entries(s).some(([k, v]) => kulcsok.includes(k) || tartalmaz(v, kulcsok))
}

export function lint(eszkozok: Eszkoz[]): string[] {
  const hibak: string[] = []
  for (const t of eszkozok) {
    const h = (m: string) => hibak.push(`${t.name}: ${m}`)
    if (!NEV.test(t.name)) h('a név nem ^[a-z][a-z0-9_]{2,63}$ (pont nem lehet benne)')
    if (!t.title) h('hiányzó magyar title')
    if (!t.description || t.description.length > 400) h('a leírás hiányzik vagy hosszabb 400 karakternél')
    if (t.description && EKEZET.test(t.description)) h('a modellnek szóló leírás legyen angol (ékezetes karaktert tartalmaz)')
    if (melyseg(t.inputSchema) > 3) h('a bemeneti séma túl mély (max. 2 szint objektum + tömb elemei)')
    if (tartalmaz(t.inputSchema, ['oneOf', 'anyOf', 'allOf'])) h('oneOf/anyOf/allOf a bemeneti sémában')
    if (!t.outputSchema) h('hiányzó outputSchema')
    if (!t.annotations || typeof t.annotations.readOnlyHint !== 'boolean') h('hiányzó readOnlyHint annotáció')
    if (Object.keys(t.inputSchema.properties ?? {}).length > 8) h('8-nál több bemeneti mező')
    const risk = t._meta?.['donki/risk']
    if (!RISKS.includes(String(risk))) h('hiányzó vagy ismeretlen kockázati osztály (_meta["donki/risk"])')
    if (risk === 'read' && t.annotations?.readOnlyHint !== true) h('read kockázatú eszköz readOnlyHint nélkül')
    if (risk !== 'read' && t.annotations?.readOnlyHint === true) h('író eszköz readOnlyHint=true-val')
  }
  return hibak
}
