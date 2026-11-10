/**
 * 19–20. fázis: a riport a mérésből (ertekeles.futas) – Markdown + CSV. Bármikor újragenerálható; a mérés nem fut újra.
 *   --meres   a mérés címkéje (alapból a legutóbbi)
 *   --nyers   a nyers változat ebből a mérésből (a javítás után csak az MCP-s fut újra; alapból ugyanaz)
 *   --elozo   egy korábbi MCP-s mérés az előtte–utána összevetéshez (20. fázis)
 *   --ki, --csv  a kimenet (alapból riportok/01-meres/ertekeles-<mérés>.md és riportok/01-meres/adatok/<mérés>.csv)
 *
 * Futtatás: npx tsx scripts/ertekeles/riport.ts [--meres 2026-11-07-javitott --nyers 2026-11-03 --elozo 2026-11-03]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import '../../agens/kozos/kornyezet'
import { db, dbZar } from '../../agens/kozos/naplo'
import { FELADATOK } from './feladatok'

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : d
}

type Sor = {
  feladat: string
  valtozat: 'nyers' | 'mcp'
  modell: string
  ismetles: number
  eredmeny: 'siker' | 'reszben' | 'sikertelen' | 'hiba'
  megjegyzes: string | null
  keres: string | null
  valasz: string | null
  ido_ms: number | null
  modell_hivas: number | null
  eszkoz_hivas: number | null
  hibas_eszkoz: number | null
  token_be: number | null
  token_ki: number | null
  jovahagyas: number | null
  nem_vart_iras: number | null
  visszakerdezett: boolean | null
}

/**
 * Az emberi alapvonal – EGYELŐRE BECSLÉS, nem mérés (a mérőlap később készül): a régi munkamódban, a „Rendszerek
 * felületei” oldalain, percben. Forrás: a legacy forgatókönyv (docs/LEGACY_FORGATOKONYV.md §4) és a munkaerő-becslés
 * (docs/MUNKAERO_BECSLES.md) azonos folyamatainak percei, a mérési feladat szűkebb tartalmára igazítva.
 */
const EMBER: { e: string; feladat: string; perc: number; indok: string }[] = [
  { e: 'E1', feladat: 'F01', perc: 8, indok: 'CRM-ben a vevő csoportja, ajánlat a tétellel, kiszámolás (az e-mail megírása nélkül; a teljes érdeklődés 20 perc)' },
  { e: 'E2', feladat: 'F03', perc: 5, indok: 'katalógus: keresés, inaktív, helyettesítő ugyanabban a kategóriában' },
  { e: 'E3', feladat: 'F05', perc: 6, indok: 'ajánlat kedvezménnyel + jóváhagyás kérése (a teljes kedvezmény-folyamat 15 perc a vezetővel együtt)' },
  { e: 'E4', feladat: 'F07', perc: 4, indok: 'ajánlat elfogadása, a rendelés ellenőrzése (a teljes megrendelés 10 perc)' },
  { e: 'E5', feladat: 'F09', perc: 4, indok: 'rendelés adatlap, szállítás állapota (5 perc a vevőnek írt válasszal)' },
  { e: 'E6', feladat: 'F12', perc: 15, indok: 'raktári lista a minimum alatt, cikkszámokhoz a terméknevek a katalógusból (30 perc a beszállítói rendeléssel)' },
  { e: 'E7', feladat: 'F13', perc: 6, indok: 'díjbekérő kiállítása, a bruttó leolvasása (7,5 perc a kiküldéssel)' },
  { e: 'E8', feladat: 'F15a', perc: 3, indok: 'számlázó + fizetés: van-e fizetés a bizonylathoz' },
  { e: 'E9', feladat: 'F18a', perc: 8, indok: 'kézbesítés dátuma a rendelésből, garanciaidő a katalógusból, kiszámolás' },
  { e: 'E10', feladat: 'F20', perc: 45, indok: 'négy rendszerből a négy szám (a teljes vezetői riport 90 perc, magyarázattal)' },
]

const MODELL_NEV: Record<string, string> = { 'donki-gemma-e4b': 'gemma4:e4b', 'donki-gemma': 'gemma4:12b' }
const VALTOZAT_NEV = { nyers: 'nyers', mcp: 'MCP' }
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–')
const atl = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
const kerek = (x: number, j = 1) => x.toLocaleString('hu-HU', { maximumFractionDigits: j })
const mp = (ms: number) => kerek(ms / 1000)

function cella(sorok: Sor[]) {
  const n = sorok.length
  const s = sorok.filter((r) => r.eredmeny === 'siker').length
  const r = sorok.filter((x) => x.eredmeny === 'reszben').length
  return { n, s, r, siker: pct(s, n), reszben: pct(r, n) }
}

const KONTROLL = new Set(FELADATOK.filter((f) => f.kontroll).map((f) => f.id))
const alap = (r: Sor) => !KONTROLL.has(r.feladat)

/** pass^k: a feladatok hány százaléka sikeres MINDEN ismétlésben (a megbízhatóság; az átlag ezt elfedi). */
function mindig(sorok: Sor[]) {
  const fel = new Map<string, Sor[]>()
  for (const r of sorok) fel.set(r.feladat, [...(fel.get(r.feladat) ?? []), r])
  const jo = [...fel.values()].filter((x) => x.every((r) => r.eredmeny === 'siker')).length
  return { jo, n: fel.size, arany: pct(jo, fel.size) }
}

async function betolt(meres: string, valtozat?: string) {
  const { rows } = await db().query<Sor>(
    `select * from ertekeles.futas where meres = $1 ${valtozat ? 'and valtozat = $2' : ''} order by feladat, valtozat, modell, ismetles`,
    valtozat ? [meres, valtozat] : [meres]
  )
  return rows
}

async function main() {
  const { rows: meresek } = await db().query<{ meres: string }>('select meres from ertekeles.futas group by meres order by max(id) desc')
  const meres = arg('meres', meresek[0]?.meres ?? '')
  const nyersMeres = arg('nyers', meres)
  const elozo = arg('elozo', '')
  const KI = arg('ki', `riportok/01-meres/ertekeles-${meres}.md`)
  const CSV = arg('csv', `riportok/01-meres/adatok/${meres}.csv`)
  const rows = nyersMeres === meres ? await betolt(meres) : [...(await betolt(nyersMeres, 'nyers')), ...(await betolt(meres, 'mcp'))]
  if (!rows.length) throw new Error(`Nincs adat ehhez a méréshez: „${meres}”`)
  const elozoSorok = elozo ? await betolt(elozo, 'mcp') : []

  // CSV a nyers adattal (a dolgozat ábráihoz)
  mkdirSync(dirname(CSV), { recursive: true })
  mkdirSync(dirname(KI), { recursive: true })
  const oszlopok = ['feladat', 'valtozat', 'modell', 'ismetles', 'eredmeny', 'ido_ms', 'modell_hivas', 'eszkoz_hivas', 'hibas_eszkoz', 'token_be', 'token_ki', 'jovahagyas', 'nem_vart_iras', 'visszakerdezett', 'megjegyzes'] as const
  const csv = [['meres', ...oszlopok].join(';'), ...rows.map((r) => [r.valtozat === 'nyers' ? nyersMeres : meres, ...oszlopok.map((o) => String(r[o] ?? '').replace(/[;\n\r]/g, ' '))].join(';'))].join('\n')
  writeFileSync(CSV, `${csv}\n`)

  const modellek = [...new Set(rows.map((r) => r.modell))]
  const valtozatok = (['nyers', 'mcp'] as const).filter((v) => rows.some((r) => r.valtozat === v))
  const oszlop = valtozatok.flatMap((v) => modellek.map((m) => ({ v, m, nev: `${VALTOZAT_NEV[v]} · ${MODELL_NEV[m] ?? m}` })))
  const resz = (v: string, m: string, f?: (r: Sor) => boolean) => rows.filter((r) => r.valtozat === v && r.modell === m && (!f || f(r)))
  const alapFeladatok = FELADATOK.filter((f) => !f.kontroll)
  const vanKontroll = rows.some((r) => KONTROLL.has(r.feladat))
  const rel = (cel: string) => `${'../'.repeat(KI.split('/').length - 1)}${cel}`
  const ki: string[] = []
  const p = (s = '') => ki.push(s)

  p('# Értékelés: nyers legacy interfész vs. MCP, két helyi modellel')
  p()
  const forras = nyersMeres === meres ? `Mérés: ${meres}` : `MCP: ${meres}, nyers: ${nyersMeres}`
  const parancs = `npx tsx scripts/ertekeles/riport.ts --meres ${meres}${nyersMeres !== meres ? ` --nyers ${nyersMeres}` : ''}${elozo ? ` --elozo ${elozo}` : ''}`
  p(`*${forras} · ${rows.length} futás · ${alapFeladatok.length} feladat${vanKontroll ? ` + ${KONTROLL.size} kontrollfeladat (csak MCP)` : ''} × ${valtozatok.length} változat × ${modellek.length} modell × ${Math.max(...rows.map((r) => r.ismetles))} ismétlés · a módszer: [FAZIS19_TERV.md](${rel('docs/FAZIS19_TERV.md')}), [FAZIS20_TERV.md](${rel('docs/FAZIS20_TERV.md')}) · a nyers adat: [${CSV}](${rel(CSV)}) · újragenerálás: \`${parancs}\`*`)
  p()
  p('A **nyers** ágens a hét legacy interfészt kapja (PostgREST, JSON-RPC, HTTP homlokzat, üzenetsor, szöveges protokoll, REST, SOAP) a `legacy-docs/` leírásaival; a szállítást és a kulcsot az eszköz intézi, a formátum, a mezők, a kódok és a hibák értelmezése a modellé. Az **MCP**-s ágens a mai: front-desk → szakágens, a 35 MCP eszköz, skillek. Mindkettő ugyanazt a gráfot, ugyanazokat az általános szabályokat és ugyanazt a modellt használja. A sikert a rendszer **végállapota** és a válasz kulcsadata dönti el, a rendszerből lekért igazsággal összevetve.')
  p()

  // ---- összesítő
  p('## 1. Összesítő')
  p()
  if (vanKontroll) p(`A ${alapFeladatok.length} alapfeladaton (a nyers és az MCP-s változat ugyanazokon fut). A kontrollfeladatok külön: lásd lent.`)
  if (vanKontroll) p()
  p(`| | ${oszlop.map((o) => o.nev).join(' | ')} |`)
  p(`|---|${oszlop.map(() => '---:').join('|')}|`)
  const sorok: [string, (s: Sor[]) => string][] = [
    ['Sikeres', (s) => `**${cella(s).siker}**`],
    ['Megbízható feladat (minden ismétlés sikeres, pass^k)', (s) => `${mindig(s).arany} (${mindig(s).jo}/${mindig(s).n})`],
    ['Részben sikeres', (s) => cella(s).reszben],
    ['Sikertelen / hiba', (s) => pct(s.filter((r) => r.eredmeny === 'sikertelen' || r.eredmeny === 'hiba').length, s.length)],
    ['Átlagos idő / feladat (s)', (s) => mp(atl(s.map((r) => r.ido_ms ?? 0)))],
    ['Eszközhívás / feladat', (s) => kerek(atl(s.map((r) => r.eszkoz_hivas ?? 0)))],
    ['ebből hibás', (s) => kerek(atl(s.map((r) => r.hibas_eszkoz ?? 0)))],
    ['Modellhívás / feladat', (s) => kerek(atl(s.map((r) => r.modell_hivas ?? 0)))],
    ['Token be / feladat', (s) => kerek(atl(s.map((r) => r.token_be ?? 0)), 0)],
    ['Token ki / feladat', (s) => kerek(atl(s.map((r) => r.token_ki ?? 0)), 0)],
    ['Jóváhagyás / feladat (emberi kattintás)', (s) => kerek(atl(s.map((r) => r.jovahagyas ?? 0)))],
    ['Nem várt írási kísérlet (összesen)', (s) => String(s.reduce((x, r) => x + (r.nem_vart_iras ?? 0), 0))],
    ['Visszakérdezett', (s) => String(s.filter((r) => r.visszakerdezett).length)],
    ['Gépidő összesen (perc)', (s) => kerek(s.reduce((x, r) => x + (r.ido_ms ?? 0), 0) / 60000)],
  ]
  for (const [nev, f] of sorok) p(`| ${nev} | ${oszlop.map((o) => f(resz(o.v, o.m, alap))).join(' | ')} |`)
  p()

  // ---- az MCP hatása modellenként
  if (valtozatok.length === 2) {
    p('## 2. Mennyit segít az MCP? (modellenként)')
    p()
    p('| Modell | Siker: nyers → MCP | Idő: nyers → MCP | Eszközhívás: nyers → MCP | Token be: nyers → MCP |')
    p('|---|---|---|---|---|')
    for (const m of modellek) {
      const n = resz('nyers', m, alap)
      const c = resz('mcp', m, alap)
      const arany = (a: number, b: number) => (a ? ` (${b < a ? '−' : '+'}${Math.abs(Math.round((100 * (b - a)) / a))}%)` : '')
      const ido = [atl(n.map((r) => r.ido_ms ?? 0)), atl(c.map((r) => r.ido_ms ?? 0))]
      const esz = [atl(n.map((r) => r.eszkoz_hivas ?? 0)), atl(c.map((r) => r.eszkoz_hivas ?? 0))]
      const tok = [atl(n.map((r) => r.token_be ?? 0)), atl(c.map((r) => r.token_be ?? 0))]
      p(`| ${MODELL_NEV[m] ?? m} | ${cella(n).siker} → **${cella(c).siker}** | ${mp(ido[0])} s → ${mp(ido[1])} s${arany(ido[0], ido[1])} | ${kerek(esz[0])} → ${kerek(esz[1])} | ${kerek(tok[0], 0)} → ${kerek(tok[1], 0)}${arany(tok[0], tok[1])} |`)
    }
    p()
  }

  // ---- 20. fázis: a javítás előtt → után (csak MCP)
  if (elozoSorok.length) {
    const ujMcp = rows.filter((r) => r.valtozat === 'mcp')
    p(`## 2/a. A javítás hatása (MCP: ${elozo} → ${meres})`)
    p()
    p('Ugyanazok az alapfeladatok és ellenőrzők; közben csak az MCP-réteg (eszközkimenetek, keresés), az ágensek irányítása és a skillek változtak (lásd a javítási jegyzéket).')
    p()
    p('| Modell | Siker előtte → utána | Részben előtte → utána | Megbízható feladat (pass^k) előtte → utána | Idő / feladat előtte → utána |')
    p('|---|---|---|---|---|')
    for (const m of modellek) {
      const a = elozoSorok.filter((r) => r.modell === m && alap(r))
      const b = ujMcp.filter((r) => r.modell === m && alap(r))
      p(`| ${MODELL_NEV[m] ?? m} | ${cella(a).siker} → **${cella(b).siker}** | ${cella(a).reszben} → ${cella(b).reszben} | ${mindig(a).arany} → **${mindig(b).arany}** | ${mp(atl(a.map((r) => r.ido_ms ?? 0)))} s → ${mp(atl(b.map((r) => r.ido_ms ?? 0)))} s |`)
    }
    p()
    p('Feladatonként, ahol változott (sikeres / összes futás):')
    p()
    p(`| Feladat | ${modellek.map((m) => `${MODELL_NEV[m] ?? m}: előtte → utána`).join(' | ')} |`)
    p(`|---|${modellek.map(() => '---').join('|')}|`)
    for (const f of alapFeladatok) {
      const cellak = modellek.map((m) => {
        const a = cella(elozoSorok.filter((r) => r.modell === m && r.feladat === f.id))
        const b = cella(ujMcp.filter((r) => r.modell === m && r.feladat === f.id))
        return { a, b, txt: `${a.s}/${a.n} → ${b.s === b.n && b.n ? `**${b.s}/${b.n}**` : `${b.s}/${b.n}`}` }
      })
      if (cellak.some((c) => c.a.s * c.b.n !== c.b.s * c.a.n)) p(`| ${f.id} ${f.cim} | ${cellak.map((c) => c.txt).join(' | ')} |`)
    }
    p()
  }

  if (vanKontroll) {
    const k = rows.filter((r) => r.valtozat === 'mcp' && KONTROLL.has(r.feladat))
    p('## 2/b. Kontrollfeladatok (általánosít-e a javítás?)')
    p()
    p('A javítások után, de modellfutás előtt írt új feladatok – a javított esetek rokonai, más adattal és megfogalmazással. Ha itt is jó az arány, a javítás nem a mért feladatokra „tanult rá”. Csak MCP-vel futnak (a nyers összevetéshez nem tartoznak).')
    p()
    p(`| | ${modellek.map((m) => `MCP · ${MODELL_NEV[m] ?? m}`).join(' | ')} |`)
    p(`|---|${modellek.map(() => '---:').join('|')}|`)
    p(`| Sikeres | ${modellek.map((m) => `**${cella(k.filter((r) => r.modell === m)).siker}**`).join(' | ')} |`)
    p(`| Megbízható feladat (pass^k) | ${modellek.map((m) => mindig(k.filter((r) => r.modell === m)).arany).join(' | ')} |`)
    for (const f of FELADATOK.filter((x) => x.kontroll)) {
      p(`| ${f.id} ${f.cim} | ${modellek.map((m) => { const c = cella(k.filter((r) => r.modell === m && r.feladat === f.id)); return `${c.s}/${c.r}/${c.n}` }).join(' | ')} |`)
    }
    p()
    p('Cellánként: sikeres / részben / összes futás.')
    p()
  }

  // ---- típusonként
  p('## 3. Feladattípusonként (sikeres arány)')
  p()
  const tipusok = [...new Set(alapFeladatok.map((f) => f.tipus))]
  p(`| Típus (feladatok) | ${oszlop.map((o) => o.nev).join(' | ')} |`)
  p(`|---|${oszlop.map(() => '---:').join('|')}|`)
  for (const t of tipusok) {
    const ids = alapFeladatok.filter((f) => f.tipus === t).map((f) => f.id)
    p(`| ${t} (${ids.join(', ')}) | ${oszlop.map((o) => cella(resz(o.v, o.m, (r) => ids.includes(r.feladat))).siker).join(' | ')} |`)
  }
  p()

  // ---- feladatonként
  p('## 4. Feladatonként')
  p()
  p('Cellánként: sikeres / részben / összes futás, és az átlagos idő.')
  p()
  p(`| Feladat | ${oszlop.map((o) => o.nev).join(' | ')} |`)
  p(`|---|${oszlop.map(() => '---').join('|')}|`)
  for (const f of FELADATOK) {
    const cellak = oszlop.map((o) => {
      const s = resz(o.v, o.m, (r) => r.feladat === f.id)
      if (!s.length) return '–'
      const c = cella(s)
      return `${c.s}/${c.r}/${c.n} · ${mp(atl(s.map((r) => r.ido_ms ?? 0)))} s`
    })
    p(`| ${f.id} ${f.cim} | ${cellak.join(' | ')} |`)
  }
  p()

  // ---- ember (becslés)
  p('## 5. A régi munkamód (ember) – becslés')
  p()
  p('> **Ez becslés, nem mérés.** A legacy forgatókönyv és a munkaerő-becslés azonos folyamatainak percei, a mérési feladat szűkebb tartalmára igazítva; a mérőlappal később lemérhető. Az ágens ideje gépidő; az ember ideje mellette a jóváhagyás (kártyánként kb. 15–30 s becsült ellenőrzés).')
  p()
  p(`| | Feladat | Ember, régi munkamód (becslés) | ${oszlop.map((o) => `${o.nev}: idő, siker`).join(' | ')} | Indoklás |`)
  p(`|---|---|---:|${oszlop.map(() => '---:').join('|')}|---|`)
  for (const e of EMBER) {
    const f = FELADATOK.find((x) => x.id === e.feladat)
    const cellak = oszlop.map((o) => {
      const s = resz(o.v, o.m, (r) => r.feladat === e.feladat)
      return s.length ? `${mp(atl(s.map((r) => r.ido_ms ?? 0)))} s, ${cella(s).siker}` : '–'
    })
    p(`| ${e.e} | ${f?.cim ?? e.feladat} | ${e.perc} perc | ${cellak.join(' | ')} | ${e.indok} |`)
  }
  p()

  // ---- tipikus hibák
  p('## 6. Tipikus hibák (példák)')
  p()
  for (const o of oszlop) {
    const hibak = resz(o.v, o.m, (r) => r.eredmeny !== 'siker').slice(0, 8)
    p(`### ${o.nev}`)
    p()
    if (!hibak.length) p('Nem volt sikertelen futás.')
    for (const h of hibak) p(`- **${h.feladat}** #${h.ismetles} (${h.eredmeny}): ${h.megjegyzes ?? ''}${h.valasz ? ` – „${h.valasz.replace(/\s+/g, ' ').slice(0, 160)}${h.valasz.length > 160 ? '…' : ''}”` : ''}`)
    p()
  }

  writeFileSync(KI, `${ki.join('\n')}\n`)
  console.log(`${KI} és ${CSV} kész (${rows.length} futás, „${meres}”)`)
  await dbZar()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
