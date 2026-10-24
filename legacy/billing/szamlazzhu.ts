// A számlázó kapcsolata a Számlázz.hu-val, a Számla Agent API-n (16. fázis). A bizonylatok GAZDÁJA a Számlázz.hu:
// minden díjbekérő, számla és sztornó ott jön létre, a számlázó saját adatbázisa csak hivatkozást és a
// szinkron állapotát tartja – így a portálon és a Számlázz.hu felületén ugyanaz látszik.
// Dokumentáció: https://docs.szamlazz.hu/agent (XSD-k: https://www.szamlazz.hu/szamla/docs/xsds/…)
//
// BIZTOSÍTÉK (NAV): csak teszt üzemben (SZAMLABRIDGE_MODE=test + Stripe teszt kulcs), és csak IGAZOLT
// tesztfiókkal. Az igazolás: egy próba-díjbekérő, amelynek a lekérdezésében <teszt>true</teszt> és a sorszámában
// TST áll; utána a próbadarab törlődik. Díjbekérőről nincs NAV-adatszolgáltatás; számlát csak igazolt
// tesztfiók mellett állítunk ki.

import { randomBytes } from 'node:crypto'
import { tesztUzemEllenorzes } from './szamlabridge'

const AGENT_URL = 'https://www.szamlazz.hu/szamla/'

export class AgentHiba extends Error {
  constructor(
    public readonly kod: string,
    message: string
  ) {
    super(message)
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const kerekit = (n: number) => Math.round(n * 100) / 100

function kulcs(): string {
  tesztUzemEllenorzes()
  const k = process.env.SZAMLAZZHU_AGENT_KEY
  if (!k) throw new AgentHiba('KONFIG', 'Hianyzo SZAMLAZZHU_AGENT_KEY')
  return k
}

type Valasz = { fejlecek: Record<string, string>; torzs: string; pdf?: Uint8Array }

async function kuld(mezo: string, xml: string, binaris = false): Promise<Valasz> {
  const fd = new FormData()
  fd.append(mezo, new Blob([xml], { type: 'text/xml' }), 'keres.xml')
  let r: Response
  try {
    r = await fetch(AGENT_URL, { method: 'POST', body: fd, signal: AbortSignal.timeout(30_000) })
  } catch (e) {
    throw new AgentHiba('ELERES', `A Szamlazz.hu nem erheto el: ${e instanceof Error ? e.message : e}`)
  }
  const fejlecek = Object.fromEntries([...r.headers].filter(([k]) => k.startsWith('szlahu_')))
  if (fejlecek.szlahu_error_code) {
    throw new AgentHiba(fejlecek.szlahu_error_code, decodeURIComponent(fejlecek.szlahu_error ?? '').replace(/\+/g, ' '))
  }
  if (binaris && (r.headers.get('content-type') ?? '').includes('pdf')) {
    return { fejlecek, torzs: '', pdf: new Uint8Array(await r.arrayBuffer()) }
  }
  const torzs = await r.text()
  if (/<sikeres>false<\/sikeres>/.test(torzs)) {
    const kod = /<hibakod>(?:<!\[CDATA\[)?([^<\]]*)/.exec(torzs)?.[1] ?? '?'
    const uzenet = /<hibauzenet>(?:<!\[CDATA\[)?([^<\]]*)/.exec(torzs)?.[1] ?? ''
    throw new AgentHiba(kod, uzenet)
  }
  return { fejlecek, torzs }
}

const szam = (v: Valasz) => decodeURIComponent(v.fejlecek.szlahu_szamlaszam ?? '') || /<szamlaszam>([^<]+)/.exec(v.torzs)?.[1] || ''

// ---------------------------------------------------------------- tesztfiók igazolása

let igazolt = false
let folyamatban: Promise<void> | null = null
let utolsoHiba = 0
let nemTesztfiok: AgentHiba | null = null

/**
 * Igazolja, hogy a kulcs tesztfiókhoz tartozik (egyszer; átmeneti hiba után legkorábban 1 perc múlva újra).
 * Ha a fiók bizonyítottan NEM tesztfiók, a tiltás a folyamat újraindításáig marad – nem próbálkozunk újra.
 */
export function tesztfiokIgazolas(): Promise<void> {
  if (igazolt) return Promise.resolve()
  if (nemTesztfiok) return Promise.reject(nemTesztfiok)
  if (folyamatban) return folyamatban
  if (Date.now() - utolsoHiba < 60_000) return Promise.reject(new AgentHiba('NEM_IGAZOLT', 'A tesztfiok igazolasa nemreg sikertelen volt, kesobb ujraprobalja'))
  folyamatban = (async () => {
    const kulso = `TESZTFIOK-PROBA-${randomBytes(4).toString('hex')}`
    const ma = new Date().toISOString().slice(0, 10)
    const d = await kiallitNyers({
      dijbekero: true,
      kulsoAzon: kulso,
      kelt: ma,
      hatarido: ma,
      rendelesRef: kulso,
      megjegyzes: 'Automatikus tesztfiok-ellenorzes - torlodik',
      vevo: { nev: 'TESZTFIOK ELLENORZES', irsz: '1111', telepules: 'BUDAPEST', cim: 'PROBA UTCA 1.', adoszam: '' },
      tetelek: [{ megnevezes: 'PROBA', mennyiseg: 1, egysegar: 1 }],
    })
    try {
      const x = await kuld('action-szamla_agent_xml', lekerdezesXml(kulso))
      const teszt = /<teszt>true<\/teszt>/.test(x.torzs)
      if (!teszt || !d.szamlazzSzam.includes('TST')) {
        nemTesztfiok = new AgentHiba('NEM_TESZTFIOK', `A Szamlazz.hu fiok NEM tesztfiok (teszt=${teszt}, sorszam=${d.szamlazzSzam}) - szamlat nem allitunk ki`)
        throw nemTesztfiok
      }
    } finally {
      await dijbekeroTorles(d.szamlazzSzam).catch(() => null)
    }
    igazolt = true
  })()
    .catch((e) => {
      utolsoHiba = Date.now()
      throw e
    })
    .finally(() => {
      folyamatban = null
    })
  return folyamatban
}

export const tesztfiokAllapot = () => (igazolt ? 'igazolt' : nemTesztfiok ? 'NEM tesztfiok' : 'nem igazolt')

// ---------------------------------------------------------------- kiállítás

export type Vevo = { nev: string; irsz: string; telepules: string; cim: string; adoszam: string }
export type Tetel = { megnevezes: string; mennyiseg: number; egysegar: number }

/** A számlázó egysoros címe ("1133 BUDAPEST, VACI UT 118.") → irányítószám, település, utca */
export function cimBontas(cim: string | null): Pick<Vevo, 'irsz' | 'telepules' | 'cim'> {
  const m = /^\s*(\d{4})\s+([^,]+),\s*(.+)$/.exec(cim ?? '')
  return m ? { irsz: m[1], telepules: m[2].trim(), cim: m[3].trim() } : { irsz: '0000', telepules: 'ISMERETLEN', cim: (cim ?? '').trim() || 'ISMERETLEN' }
}

type Kiallitas = {
  dijbekero: boolean
  kulsoAzon: string
  kelt: string
  hatarido: string
  rendelesRef: string | null
  megjegyzes?: string
  vevo: Vevo
  tetelek: Tetel[]
}

async function kiallitNyers(k: Kiallitas): Promise<{ szamlazzSzam: string; netto: number; brutto: number }> {
  const tetelek = k.tetelek
    .map((t) => {
      const netto = kerekit(t.mennyiseg * t.egysegar)
      const afa = kerekit(netto * 0.27)
      return (
        `<tetel><megnevezes>${esc(t.megnevezes)}</megnevezes><mennyiseg>${t.mennyiseg}</mennyiseg><mennyisegiEgyseg>db</mennyisegiEgyseg>` +
        `<nettoEgysegar>${t.egysegar}</nettoEgysegar><afakulcs>27</afakulcs><nettoErtek>${netto}</nettoErtek><afaErtek>${afa}</afaErtek>` +
        `<bruttoErtek>${kerekit(netto + afa)}</bruttoErtek></tetel>`
      )
    })
    .join('')
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">' +
    `<beallitasok><szamlaagentkulcs>${esc(kulcs())}</szamlaagentkulcs><eszamla>false</eszamla><szamlaLetoltes>false</szamlaLetoltes>` +
    `<valaszVerzio>2</valaszVerzio><szamlaKulsoAzon>${esc(k.kulsoAzon)}</szamlaKulsoAzon></beallitasok>` +
    `<fejlec><keltDatum>${k.kelt}</keltDatum><teljesitesDatum>${k.kelt}</teljesitesDatum><fizetesiHataridoDatum>${k.hatarido}</fizetesiHataridoDatum>` +
    '<fizmod>Átutalás</fizmod><penznem>HUF</penznem><szamlaNyelve>hu</szamlaNyelve>' +
    // A rendelésszámot a megjegyzésbe tesszük, nem a rendelesSzam mezőbe: a Számlázz.hu alapból nem enged két
    // bizonylatot ugyanazzal a rendelésszámmal, nálunk pedig egy rendeléshez több bizonylat is tartozhat.
    `<megjegyzes>${esc([k.megjegyzes, k.rendelesRef ? `Rendeles: ${k.rendelesRef}` : ''].filter(Boolean).join(' | '))}</megjegyzes>` +
    (k.dijbekero ? '<dijbekero>true</dijbekero>' : '') +
    '</fejlec><elado></elado>' +
    `<vevo><nev>${esc(k.vevo.nev)}</nev><irsz>${esc(k.vevo.irsz)}</irsz><telepules>${esc(k.vevo.telepules)}</telepules><cim>${esc(k.vevo.cim)}</cim>` +
    (k.vevo.adoszam ? `<adoszam>${esc(k.vevo.adoszam)}</adoszam>` : '') +
    `</vevo><tetelek>${tetelek}</tetelek></xmlszamla>`
  const v = await kuld('action-xmlagentxmlfile', xml)
  return { szamlazzSzam: szam(v), netto: Number(v.fejlecek.szlahu_nettovegosszeg), brutto: Number(v.fejlecek.szlahu_bruttovegosszeg) }
}

/** Díjbekérő vagy számla kiállítása a Számlázz.hu-ban. A számlához igazolt tesztfiók kell. */
export async function kiallit(k: Omit<Kiallitas, 'megjegyzes'> & { sajatSzam: string }) {
  await tesztfiokIgazolas()
  return kiallitNyers({ ...k, megjegyzes: `Rendszerbeli sorszam: ${k.sajatSzam}` })
}

/** Számla sztornózása a Számlázz.hu-ban (új, negatív sztornó számla). */
export async function sztornoz(eredetiSzamlazzSzam: string, kulsoAzon: string) {
  await tesztfiokIgazolas()
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamlast xmlns="http://www.szamlazz.hu/xmlszamlast" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.szamlazz.hu/xmlszamlast https://www.szamlazz.hu/szamla/docs/xsds/agentst/xmlszamlast.xsd">' +
    `<beallitasok><szamlaagentkulcs>${esc(kulcs())}</szamlaagentkulcs><eszamla>false</eszamla><szamlaLetoltes>false</szamlaLetoltes>` +
    `<valaszVerzio>2</valaszVerzio><szamlaKulsoAzon>${esc(kulsoAzon)}</szamlaKulsoAzon></beallitasok>` +
    // A sztornó kelte a Számlázz.hu szabálya szerint csak a mai nap lehet – ezért nem adjuk meg (alapértelmezés: ma).
    `<fejlec><szamlaszam>${esc(eredetiSzamlazzSzam)}</szamlaszam></fejlec>` +
    '<elado></elado><vevo></vevo></xmlszamlast>'
  const v = await kuld('action-szamla_agent_st', xml)
  return { szamlazzSzam: szam(v), netto: Number(v.fejlecek.szlahu_nettovegosszeg), brutto: Number(v.fejlecek.szlahu_bruttovegosszeg) }
}

/** A teljes kifizetés rögzítése (additiv=false: a korábbiakat felülírja – ismételhető). */
export async function kifizet(szamlazzSzam: string, datum: string, osszeg: number, jogcim = 'bankkártya') {
  tesztUzemEllenorzes()
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamlakifiz xmlns="http://www.szamlazz.hu/xmlszamlakifiz" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.szamlazz.hu/xmlszamlakifiz https://www.szamlazz.hu/szamla/docs/xsds/agentkifiz/xmlszamlakifiz.xsd">' +
    `<beallitasok><szamlaagentkulcs>${esc(kulcs())}</szamlaagentkulcs><szamlaszam>${esc(szamlazzSzam)}</szamlaszam><additiv>false</additiv></beallitasok>` +
    `<kifizetes><datum>${datum}</datum><jogcim>${esc(jogcim)}</jogcim><osszeg>${osszeg}</osszeg></kifizetes></xmlszamlakifiz>`
  await kuld('action-szamla_agent_kifiz', xml)
}

// ---------------------------------------------------------------- lekérdezés, PDF, törlés

function lekerdezesXml(kulsoAzon: string) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamlaxml xmlns="http://www.szamlazz.hu/xmlszamlaxml" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.szamlazz.hu/xmlszamlaxml https://www.szamlazz.hu/szamla/docs/xsds/agentxml/xmlszamlaxml.xsd">' +
    `<szamlaagentkulcs>${esc(kulcs())}</szamlaagentkulcs><szamlaKulsoAzon>${esc(kulsoAzon)}</szamlaKulsoAzon></xmlszamlaxml>`
  )
}

export type Mester = { szamlazzSzam: string; tipus: string; brutto: number; kintlevoseg: number; teszt: boolean }

/** A bizonylat a gazda rendszerben (külső azonosító alapján); null, ha nincs ilyen. */
export async function lekerdez(kulsoAzon: string): Promise<Mester | null> {
  try {
    const v = await kuld('action-szamla_agent_xml', lekerdezesXml(kulsoAzon))
    return {
      szamlazzSzam: szam(v),
      tipus: /<tipus>([^<]+)<\/tipus>/.exec(v.torzs)?.[1] ?? '',
      brutto: Number(v.fejlecek.szlahu_bruttovegosszeg ?? /<totalossz>[\s\S]*?<brutto>([^<]+)/.exec(v.torzs)?.[1]),
      kintlevoseg: Number(v.fejlecek.szlahu_kintlevoseg ?? NaN),
      teszt: /<teszt>true<\/teszt>/.test(v.torzs),
    }
  } catch (e) {
    if (e instanceof AgentHiba && e.kod !== 'ELERES' && e.kod !== 'KONFIG') return null
    throw e
  }
}

/** A bizonylat PDF-je a Számlázz.hu-ból. */
export async function pdf(szamlazzSzam: string): Promise<Uint8Array> {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamlapdf xmlns="http://www.szamlazz.hu/xmlszamlapdf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.szamlazz.hu/xmlszamlapdf https://www.szamlazz.hu/szamla/docs/xsds/agentpdf/xmlszamlapdf.xsd">' +
    `<szamlaagentkulcs>${esc(kulcs())}</szamlaagentkulcs><szamlaszam>${esc(szamlazzSzam)}</szamlaszam><valaszVerzio>1</valaszVerzio></xmlszamlapdf>`
  const v = await kuld('action-szamla_agent_pdf', xml, true)
  if (!v.pdf) throw new AgentHiba('PDF', 'A Szamlazz.hu nem adott PDF-et')
  return v.pdf
}

/** Díjbekérő törlése (a tesztek takarításához és a próbadarabhoz). */
export async function dijbekeroTorles(szamlazzSzam: string) {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xmlszamladbkdel xmlns="http://www.szamlazz.hu/xmlszamladbkdel" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.szamlazz.hu/xmlszamladbkdel http://www.szamlazz.hu/docs/xsds/szamladbkdel/xmlszamladbkdel.xsd">' +
    `<beallitasok><szamlaagentkulcs>${esc(kulcs())}</szamlaagentkulcs></beallitasok><fejlec><szamlaszam>${esc(szamlazzSzam)}</szamlaszam></fejlec></xmlszamladbkdel>`
  await kuld('action-szamla_agent_dijbekero_torlese', xml)
}
