/**
 * 19–20. fázis: a riport a mérésből (ertekeles.futas) – Markdown + CSV. Bármikor újragenerálható; a mérés nem fut újra.
 *   --meres   a mérés címkéje (alapból a legutóbbi)
 *   --nyers   a nyers változat ebből a mérésből (a javítás után csak az MCP-s fut újra; alapból ugyanaz)
 *   --elozo   egy korábbi MCP-s mérés az előtte–utána összevetéshez (20. fázis)
 *   --ki, --csv  a kimenet (alapból riportok/01-meres/ertekeles-<mérés>.md és riportok/01-meres/adatok/<mérés>.csv)
 *
 * Futtatás: npx tsx scripts/ertekeles/riport.ts [--meres 2026-11-07-javitott --nyers 2026-11-03 --elozo 2026-11-03]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
 * Az emberi alapvonal: a Keystroke-Level Model (Card, Moran, Newell 1980) szerinti végrehajtási idő (alsó korlát) és a
 * tipikus felhasználó ideje (KLM forrásolt korrekciókkal). Számítás: scripts/riportok/emberi-klm.ts → riportok/03-emberi-tenyezo/adatok/klm.json.
 */
const EMBER_FELADAT: Record<string, string> = { E1: 'F01', E2: 'F03', E3: 'F05', E4: 'F07', E5: 'F09', E6: 'F12', E7: 'F13', E8: 'F15a', E9: 'F18a', E10: 'F20' }
type Klm = { e: string; cim: string; kor?: string; klmMp: number; tipikusMp: number; rendszervaltas: number; hibalehetoseg: number }
const KLM_FAJL = 'riportok/03-emberi-tenyezo/adatok/klm.json'

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
  const alapFeladatok = FELADATOK.filter((f) => !f.kontroll && !f.kulon)
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
  const vMcp = valtozatok.includes('mcp')
  const vNyers = valtozatok.includes('nyers')
  p('## 0. A mérés célja és felépítése')
  p()
  p('**A kutatási kérdés.** Képes-e egy helyben futó, kis nyelvi modellre épülő ágens a meglévő, egymástól független legacy rendszereken elvégezni a napi ügyintézést úgy, hogy a legacy rendszereket nem kell átírni? És mekkora ebben az MCP-réteg szerepe?')
  p()
  p('**A két változat: mit hasonlítunk össze.** A kísérlet egyetlen dolgot változtat, azt, hogy az ágens milyen felületen éri el a rendszereket:')
  p()
  p('- A **nyers** ágens közvetlenül a hét legacy interfészt kapja (PostgREST, JSON-RPC, HTTP homlokzat, üzenetsor, szöveges protokoll, REST, SOAP), a `legacy-docs/` leírásaival. A hálózati kapcsolatot és a hitelesítést az eszköz intézi. A formátum, a mezők, a kódok és a hibaüzenetek értelmezése viszont a modellre marad. Ez azt a helyzetet modellezi, amikor egy ágenst integrációs réteg nélkül kötnek a meglévő rendszerekre.')
  p('- Az **MCP**-s ágens a rendszereket öt MCP-szerveren át éri el (35 eszköz, egységes adatmodell, magyar nyelvű hibaüzenetek). A kéréseket egy front-desk ágens irányítja a megfelelő szakágenshez, és a szakágensek feladatleírásokat (skilleket) is kapnak.')
  p()
  p('Minden más azonos: ugyanaz a gráf, ugyanazok az általános szabályok, ugyanaz a jóváhagyási kapu és ugyanaz a modell. A két változat különbsége így az integrációs rétegnek tulajdonítható.')
  p()
  p(`**A két modell: miért kettő.** A \`gemma4:e4b\` kicsi és gyors modell (kb. 4 milliárd effektív paraméter), a \`gemma4:12b\` háromszor akkora és lassabb. A kérdés az, hogy kell-e nagyobb modell, vagy a jól megtervezett eszközréteg a kisebb modellt is elegendővé teszi. Ha az MCP-vel a két modell közel azonos eredményt ad, a nyers változatban viszont nagy köztük a különbség, akkor a feladat nehezét az integrációs réteg veszi át a modelltől. Ez azért fontos, mert a kisebb modell olcsóbb gépen fut, és gyorsabban válaszol.`)
  p()
  p('**Az ismétlés: miért háromszor.** A nyelvi modell ugyanarra a kérésre nem mindig ugyanúgy válaszol. Az átlagos sikeresség elfedheti, hogy egy feladat hol sikerül, hol nem. Ezért minden feladat modellenként és változatonként háromszor fut, és a *megbízható feladat* (pass^k) mutató azt méri, hogy hány feladat sikerült mindhárom alkalommal. Üzleti használatban ez a fontosabb szám.')
  p()
  p('**Az eredmény eldöntése.** A sikert nem a modell és nem ember ítéli meg, hanem egy program. Két dolgot néz: a rendszer **végállapotát** (például létrejött-e az ajánlat a jó tétellel, változatlan maradt-e a rendelés) és a válaszban szereplő **kulcsadatot** (összeg, bizonylatszám, állapot). Mindkettőt a rendszerből lekért aktuális adattal veti össze.')
  p()
  p('**A feladatok.** A feladatok a legacy forgatókönyv történeteit követik: ajánlat, kedvezmény, megrendelés, logisztika, számlázás, fizetés, garancia, vezetői összefoglaló, valamint robusztussági esetek. A feladatonkénti leírás, a kérés mintája, az érintett legacy rendszerek és a siker feltétele: [feladatok.md](feladatok.md).')
  p()

  // ---- összesítő
  p('## 1. Összesítő')
  p()
  p('**Mit mutat a táblázat?** Oszloponként egy változat és egy modell, soronként a mérőszámok. A *sikeres* arány a futások százaléka. A *megbízható feladat* a feladatok százaléka, amelyek mindhárom ismétlésben sikeresek voltak. Az idő az ágens gépideje a kéréstől a válaszig, emberi idő nélkül. Az eszközhívás a legacy rendszer vagy az MCP-szerver felé indított hívás. A token a modell be- és kimenetének mérete, ez határozza meg a futás költségét és idejét. A jóváhagyás az emberi kattintások száma. A *nem várt írási kísérlet* azt számolja, hányszor próbált az ágens olyan író műveletet, amely nem tartozott a feladathoz; ezeket a futtató elutasította.')
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
  if (vMcp && vNyers) {
    const sz = (v: string, m: string) => cella(resz(v, m, alap))
    const mn = (m: string) => MODELL_NEV[m] ?? m
    p('**Mit jelent?**')
    p()
    p(`- **Az MCP-réteg a döntő tényező.** ${modellek.map((m, i) => `${i ? 'a' : 'A'} ${mn(m)} sikeressége ${sz('nyers', m).siker}-ról ${sz('mcp', m).siker}-ra`).join(', ')} nő, ugyanazzal a modellel és ugyanazokkal a szabályokkal. A legacy interfészek értelmezése (protokoll, mezőnevek, kódok, hibaüzenetek) a kis modelleknek túl nehéz; ha ezt a fordítást az MCP-réteg végzi, a feladatok nagy többsége sikerül.`)
    for (const m of modellek) {
      const n = resz('nyers', m, alap)
      const c = resz('mcp', m, alap)
      const ido = [atl(n.map((r) => r.ido_ms ?? 0)), atl(c.map((r) => r.ido_ms ?? 0))]
      const esz = atl(n.map((r) => r.eszkoz_hivas ?? 0))
      if (ido[0] < ido[1] && cella(n).s / n.length < 0.2)
        p(`- **A rövid idő a ${mn(m)} nyers változatában nem gyorsaság.** A modell átlagosan ${kerek(esz)} eszközhívás után feladja, és visszakérdez vagy hibát jelez. Ezért gyorsabb, mint az MCP-s változat, de szinte semmit nem végez el.`)
      else if (ido[0] > 2 * ido[1])
        p(`- **A ${mn(m)} nyers változata lassú.** Egy feladat átlagosan ${mp(ido[0])} s, mert a modell hosszan próbálkozik: többször hívja rossz paraméterrel a rendszert, és hosszú leírásokat olvas. Az MCP-vel ugyanez ${mp(ido[1])} s.`)
    }
    p('- **A biztonsági szabályok mindkét változatban érvényesek.** Minden írás jóváhagyási kártyán megy át, és a feladaton kívüli írást a futtató elutasítja. A nem várt írási kísérletek sora mutatja, mennyiszer kellett ennek a védelemnek működésbe lépnie.')
    p()
  }

  // ---- az MCP hatása modellenként
  if (valtozatok.length === 2) {
    p('## 2. Mennyit segít az MCP? (modellenként)')
    p()
    p('**Mit mutat?** Ugyanazt a modellt veti össze a két változatban. A százalékos változás az MCP-s változatnak a nyershez viszonyított eltérése.')
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
    if (modellek.length === 2) {
      const [m1, m2] = [...modellek].sort((a, b) => cella(resz('nyers', b, alap)).s - cella(resz('nyers', a, alap)).s)
      const k = (v: string, m: string) => Math.round((100 * cella(resz(v, m, alap)).s) / Math.max(1, resz(v, m, alap).length))
      p(`**A két modell összevetése: mit bizonyít?** A nyers változatban a nagyobb és a kisebb modell között ${k('nyers', m1) - k('nyers', m2)} százalékpont a különbség (${MODELL_NEV[m1] ?? m1}: ${k('nyers', m1)}%, ${MODELL_NEV[m2] ?? m2}: ${k('nyers', m2)}%). Az MCP-vel ez ${Math.abs(k('mcp', m1) - k('mcp', m2))} százalékpontra szűkül (${k('mcp', m1)}% és ${k('mcp', m2)}%). Integrációs réteg nélkül tehát a modell mérete dönt; az MCP-réteggel a kisebb modell is közel ugyanazt teljesíti. A feladat nehéz részét, a heterogén interfészek értelmezését, az MCP-réteg veszi át. Ez a gyakorlatban azt jelenti, hogy elég a kisebb, olcsóbb gépen futó, gyorsabban válaszoló modell. A tokenszám a nagyobb modellnél a nyers változatban azért magas, mert a hosszú interfészleírásokat és a sikertelen próbálkozások eredményét is újra és újra beolvassa.`)
      p()
    }
  }

  // ---- 20. fázis: a javítás előtt → után (csak MCP)
  if (elozoSorok.length) {
    const ujMcp = rows.filter((r) => r.valtozat === 'mcp')
    p(`## 2/a. A javítás hatása (MCP: ${elozo} → ${meres})`)
    p()
    p('**Mi volt a kísérlet?** Az első mérés naplóiból kiderült, hogy a sikertelen MCP-s futások többsége nem a modell hibája: ugyanaz a feladat mindkét modellel, mindhárom ismétlésben ugyanúgy bukott. Ez rendszerszintű okra utal. Kilenc ilyen okot javítottunk az MCP-rétegben (eszközkimenetek, keresés), az ágensek irányításában és a skillekben, majd az MCP-s változatot újramértük. A feladatok, az ellenőrzők, a modellek és a jóváhagyási szabályok nem változtak. A javítások listája: [javitasok.md](javitasok.md).')
    p()
    p('**Mit bizonyít?** Azt, hogy az ágens hibáinak jelentős része az integrációs réteg tervezésén múlik, és ott, egy helyen javítható. A javítás minden jövőbeni futásra érvényes, nem kell a modellt újratanítani vagy cserélni.')
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
    p('**Mi volt a kísérlet?** A javítás veszélye, hogy a mért feladatokra szabjuk, és azokon kívül nem segít. Ennek ellenőrzésére a javítások után, de még modellfutás előtt hat új feladatot írtunk. Mindegyik egy javított eset rokona más adattal és más megfogalmazással (a párosítás: [feladatok.md](feladatok.md#4-kontrollfeladatok-6-csak-mcp)). Csak MCP-vel futnak, a nyers összevetéshez nem tartoznak.')
    p()
    p('**Mit bizonyít?** Ha a kontrollfeladatokon is magas a sikeresség, a javítás általánosít: a hiba okát szüntette meg, nem az adott feladatra illesztett választ.')
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
  p('**Mit mutat?** A feladatokat a vizsgált képesség szerint csoportosítja (a típusok leírása: [feladatok.md](feladatok.md#6-a-feladattípusok)). Megmutatja, hogy melyik feladatfajta nehéz a modellnek, és hol segít a legtöbbet az MCP-réteg.')
  p()
  const tipusok = [...new Set(alapFeladatok.map((f) => f.tipus))]
  p(`| Típus (feladatok) | ${oszlop.map((o) => o.nev).join(' | ')} |`)
  p(`|---|${oszlop.map(() => '---:').join('|')}|`)
  for (const t of tipusok) {
    const ids = alapFeladatok.filter((f) => f.tipus === t).map((f) => f.id)
    p(`| ${t} (${ids.join(', ')}) | ${oszlop.map((o) => cella(resz(o.v, o.m, (r) => ids.includes(r.feladat))).siker).join(' | ')} |`)
  }
  p()
  if (vMcp && vNyers) {
    const tipusArany = (v: string, t: string) => {
      const ids = alapFeladatok.filter((f) => f.tipus === t).map((f) => f.id)
      const s = rows.filter((r) => r.valtozat === v && ids.includes(r.feladat))
      return s.length ? s.filter((r) => r.eredmeny === 'siker').length / s.length : 0
    }
    const rendez = (v: string) => [...tipusok].sort((a, b) => tipusArany(v, a) - tipusArany(v, b))
    const nyersGyenge = rendez('nyers').slice(0, 3)
    const mcpGyenge = rendez('mcp')[0]
    p(`**Mit jelent?** A nyers változat a két modellt együtt nézve a(z) ${nyersGyenge.join(', ')} feladatokon a leggyengébb. Ezekben kell a legtöbb legacy formátumot értelmezni (szöveges protokoll, SOAP, kódolt állapotok), és a választ a kiolvasott adatból összerakni. Az írási feladat a nyers változatban viszonylag jobban megy, mert egy-egy írás egyetlen, jól dokumentált hívás. Az MCP-s változatban a leggyengébb típus a(z) ${mcpGyenge} (${Math.round(100 * tipusArany('mcp', mcpGyenge))}% a két modellen együtt); a feladatonkénti okokat a 4. és a 6. szakasz mutatja.`)
    p()
  }

  // ---- feladatonként
  p('## 4. Feladatonként')
  p()
  p('**Mit mutat?** A teljes részletezés: feladatonként és oszloponként a sikeres, a részben sikeres és az összes futás száma, és az átlagos gépidő. A feladatok leírása és az érintett rendszerek: [feladatok.md](feladatok.md). A „–” azt jelzi, hogy a feladat abban a változatban nem futott (a kontrollfeladatok csak MCP-vel).')
  p()
  p('Cellánként: sikeres / részben / összes futás, és az átlagos idő.')
  p()
  p(`| Feladat | ${oszlop.map((o) => o.nev).join(' | ')} |`)
  p(`|---|${oszlop.map(() => '---').join('|')}|`)
  for (const f of FELADATOK.filter((x) => !x.kulon)) {
    const cellak = oszlop.map((o) => {
      const s = resz(o.v, o.m, (r) => r.feladat === f.id)
      if (!s.length) return '–'
      const c = cella(s)
      return `${c.s}/${c.r}/${c.n} · ${mp(atl(s.map((r) => r.ido_ms ?? 0)))} s`
    })
    p(`| ${f.id} ${f.cim} | ${cellak.join(' | ')} |`)
  }
  p()

  // ---- ember: KLM alsó korlát
  const klm: Klm[] = (existsSync(KLM_FAJL) ? (JSON.parse(readFileSync(KLM_FAJL, 'utf8')) as Klm[]) : []).filter((t) => (t.kor ?? 'alap') === 'alap')
  if (klm.length) {
    p('## 5. Viszonyítás az emberhez: tipikus felhasználó és KLM szerinti alsó korlát')
    p()
    p('**Mit mutat?** Tíz gyakori feladatnál összeveti az ágens gépidejét és sikerességét azzal, amennyi idő alatt egy ember a régi munkamódban, a legacy rendszerek saját felületén elvégezné. Az emberi időt nem stopperrel mértük, hanem a **Keystroke-Level Model** (KLM; Card, Moran és Newell, 1980) szerint számoltuk: a munkát elemi műveletekre bontottuk (gépelés, egérmozdulat, mentális előkészület, várakozás a rendszerre, olvasás), és mindegyikhez a szakirodalmi időt rendeltük.')
    p()
    p('**Hogyan kell érteni?** A KLM a begyakorlott, hibátlanul dolgozó felhasználó idejét adja, keresgélés, tévedés és megszakítás nélkül. Ezért **alsó korlát**: a valós emberi idő ennél csak hosszabb lehet. A **tipikus felhasználó** gyakorlott, de nem szakértő ügyintéző: a KLM-idő 1,2-szerese (a KLM ismert eltérése gyakorlott felhasználóknál), rendszerváltásonként 2 s visszazökkenéssel és a kézi hibák miatti újracsinálással; ez az alapeset. A gépidő nem emberi munkaidő; az ember a futás alatt mással foglalkozhat. Az ágens melletti emberi munka (a kérés megírása, a válasz elolvasása, a jóváhagyás, a sikertelen futás kézi újracsinálása) és az ebből adódó megtakarítás: [emberi-ido-pontositas.md](../03-emberi-tenyezo/emberi-ido-pontositas.md).')
    p()
    p(`| | Feladat | Ember, tipikus | Ember, KLM (alsó korlát) | Rendszerváltás | ${oszlop.map((o) => `${o.nev}: idő, siker`).join(' | ')} |`)
    p(`|---|---|---:|---:|---:|${oszlop.map(() => '---:').join('|')}|`)
    for (const t of klm) {
      const fid = EMBER_FELADAT[t.e]
      const f = FELADATOK.find((x) => x.id === fid)
      const cellak = oszlop.map((o) => {
        const s = resz(o.v, o.m, (r) => r.feladat === fid)
        return s.length ? `${mp(atl(s.map((r) => r.ido_ms ?? 0)))} s, ${cella(s).siker}` : '–'
      })
      p(`| ${t.e} (${fid}) | ${f?.cim ?? t.cim} | ${Math.round(t.tipikusMp)} s | ${Math.round(t.klmMp)} s | ${t.rendszervaltas} | ${cellak.join(' | ')} |`)
    }
    const osszKlm = klm.reduce((x, t) => x + t.klmMp, 0)
    p(`| | **Összesen** | **${kerek(klm.reduce((x, t) => x + t.tipikusMp, 0) / 60)} perc** | ${kerek(osszKlm / 60)} perc | | ${oszlop.map((o) => `${kerek(klm.reduce((x, t) => x + atl(resz(o.v, o.m, (r) => r.feladat === EMBER_FELADAT[t.e]).map((r) => r.ido_ms ?? 0)), 0) / 60000)} perc`).join(' | ')} |`)
    p()
    p('**Mit jelent?** Az MCP-s ágens gépideje a legtöbb feladatnál a tipikus, sőt a leggyorsabb ember idejének is töredéke, és a különbség ott a legnagyobb, ahol az embernek több rendszer között kell váltania (rendszerváltás oszlop). A rövid, egyetlen rendszert érintő kérdéseknél a két idő közel van egymáshoz. A sikerességi oszlop ugyanilyen fontos: ahol a siker 100% alatt van, ott a sikertelen futást az embernek kézzel kell megismételnie, és ez az előnyt csökkenti.')
    p()
  }

  // ---- tipikus hibák
  p('## 6. Tipikus hibák (példák)')
  p()
  p('**Mit mutat?** Oszloponként legfeljebb nyolc nem sikeres futás az ellenőrző megjegyzésével és a válasz elejével. A példák a hibák jellegét mutatják: a nyers változatban jellemzően az, hogy a modell nem találja meg az adatot a legacy felületen, vagy rosszul értelmezi; az MCP-s változatban inkább az, hogy a válaszban egy szám vagy állapot pontatlan. A modell válaszai szó szerint szerepelnek, a nyelvi hibáikkal együtt.')
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
