/**
 * 20. fázis, 2. kör: a meglévő mérésekből számolt összevetések (új modellfutás nélkül).
 *   Ö11 kitalált azonosítók: a válaszban szereplő AJ-/RND-/SZ-/DB-/TK-/HJ- azonosítók közül melyik nem létezik a rendszerekben
 *   Ö8  a hibák súlyossága: futásonkénti besorolás és súlyozott pontszám
 *   Ö12 a jóváhagyás terhelése: kártya / futás, a jóváhagyott írások eredménye, a megfogott nem várt írások
 *   Ö9  modellválasztás: e4b és 12b egymás mellett, a betöltött modell memóriájával
 *   Ö7  betanulás: a legacy dokumentáció mérete (token, olvasási idő) és a nyers ágens dokumentum-olvasása
 *   Ö6  integrációs költség: kódsorok rendszerenként (MCP-adapter és szerver, nyers eszköz)
 * Futtatás: npx tsx scripts/riportok/osszevetesek-adatbol.ts → riportok/05-osszehasonlitasok/adatok/osszevetesek.json
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import '../../agens/kozos/kornyezet'
import { BEALLITAS } from '../../agens/kozos/kornyezet'
import { db, dbZar } from '../../agens/kozos/naplo'

const NYERS = '2026-11-03'
const MCP = '2026-11-07-javitott'
type Futas = { meres: string; valtozat: string; modell: string; feladat: string; eredmeny: string; valasz: string | null; jovahagyas: number; nem_vart_iras: number; ido_ms: number; token_be: number; agens_futas: string | null }

const psql = (kontener: string, sql: string) =>
  execFileSync('docker', ['exec', '-i', `donki-${kontener}-1`, 'psql', '-U', 'postgres', '-At'], { input: sql, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
const lista = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',') || "''"

const MINTAK: { nev: string; re: RegExp; letezik: (ids: string[]) => Set<string> }[] = [
  { nev: 'ajánlat', re: /AJ-\d{4}-\d{4}/g, letezik: (i) => new Set(psql('quote-db', `select id from quote.quotes where id in (${lista(i)})`)) },
  { nev: 'rendelés', re: /RND-\d{6}/g, letezik: (i) => new Set(psql('orders-db', `select 'RND-'||order_no from orders.orders where order_no in (${i.map((x) => Number(x.slice(4))).join(',') || 0})`)) },
  { nev: 'bizonylat', re: /(?:SZ|DB)-\d{4}-\d{6}/g, letezik: (i) => new Set(psql('billing-db', `select szam from billing.szamlak where szam in (${lista(i)})`)) },
  { nev: 'termék', re: /TK-\d{5}/g, letezik: (i) => new Set(psql('crm-db', `select code from catalog.products where code in (${lista(i)})`)) },
  { nev: 'hibajegy', re: /HJ-\d{6}/g, letezik: (i) => new Set(psql('support-db', `select id from support.tickets where id in (${lista(i)})`)) },
]
const HELYORZO = /\b(?:AJ|RND|SZ|DB|TK|HJ)-[X?x]{2,}/g

async function main() {
  const { rows } = await db().query<Futas>(
    `select meres, valtozat, modell, feladat, eredmeny, valasz, coalesce(jovahagyas,0) jovahagyas, coalesce(nem_vart_iras,0) nem_vart_iras, ido_ms, token_be, agens_futas
       from ertekeles.futas where (meres = $1 and valtozat = 'nyers') or (meres = $2 and valtozat = 'mcp')`,
    [NYERS, MCP]
  )
  // ---- Ö11
  const letezo = new Map<string, Set<string>>()
  for (const mt of MINTAK) {
    const ids = [...new Set(rows.flatMap((r) => [...(r.valasz ?? '').matchAll(mt.re)].map((x) => x[0])))]
    letezo.set(mt.nev, mt.letezik(ids))
  }
  const kitalalt = (r: Futas) => MINTAK.flatMap((mt) => [...new Set([...(r.valasz ?? '').matchAll(mt.re)].map((x) => x[0]))].filter((id) => !letezo.get(mt.nev)!.has(id)).map((id) => ({ tipus: mt.nev, id })))
  const helyorzo = (r: Futas) => [...(r.valasz ?? '').matchAll(HELYORZO)].map((x) => x[0])
  const csoportok = [...new Set(rows.map((r) => `${r.valtozat}|${r.modell}`))].sort()
  const o11 = csoportok.map((c) => {
    const s = rows.filter((r) => `${r.valtozat}|${r.modell}` === c)
    const ossz = s.reduce((a, r) => a + MINTAK.reduce((b, mt) => b + new Set([...(r.valasz ?? '').matchAll(mt.re)].map((x) => x[0])).size, 0), 0)
    const kit = s.flatMap((r) => kitalalt(r).map((k) => ({ ...k, feladat: r.feladat })))
    return { csoport: c, futas: s.length, azonosito: ossz, kitalalt: kit.length, futasKitalalttal: s.filter((r) => kitalalt(r).length || helyorzo(r).length).length, helyorzo: s.flatMap(helyorzo).length, peldak: kit.slice(0, 12) }
  })
  // ---- Ö8
  const sulyossag = (r: Futas) => (r.nem_vart_iras > 0 ? 4 : kitalalt(r).length || helyorzo(r).length ? 3 : r.eredmeny === 'sikertelen' || r.eredmeny === 'hiba' ? 2 : r.eredmeny === 'reszben' ? 1 : 0)
  const SULY = [0, 1, 3, 5, 10]
  const o8 = csoportok.map((c) => {
    const s = rows.filter((r) => `${r.valtozat}|${r.modell}` === c)
    const db_ = [0, 1, 2, 3, 4].map((k) => s.filter((r) => sulyossag(r) === k).length)
    return { csoport: c, futas: s.length, sikeres: db_[0], enyhe: db_[1], latható: db_[2], kitalalt: db_[3], iras: db_[4], pont100: (100 * db_.reduce((a, n, k) => a + n * SULY[k], 0)) / s.length }
  })
  // ---- Ö12
  const o12 = csoportok.map((c) => {
    const s = rows.filter((r) => `${r.valtozat}|${r.modell}` === c)
    const kartya = s.reduce((a, r) => a + r.jovahagyas, 0)
    const sikeresben = s.filter((r) => r.eredmeny === 'siker').reduce((a, r) => a + r.jovahagyas, 0)
    return { csoport: c, futas: s.length, kartya, kartyaFutasonkent: kartya / s.length, futasKartyaval: s.filter((r) => r.jovahagyas > 0).length, kartyaSikeresFutasban: sikeresben, nemVart: s.reduce((a, r) => a + r.nem_vart_iras, 0), futasNemVarttal: s.filter((r) => r.nem_vart_iras > 0).length }
  })
  // ---- Ö9
  let ollamaPs = ''
  try {
    ollamaPs = execFileSync('ollama', ['ps'], { encoding: 'utf8' })
  } catch {
    ollamaPs = ''
  }
  const o9 = ['donki-gemma-e4b', 'donki-gemma'].map((m) => {
    const s = rows.filter((r) => r.valtozat === 'mcp' && r.modell === m)
    const fel = [...new Set(s.map((r) => r.feladat))]
    const pass3 = fel.filter((f) => s.filter((r) => r.feladat === f).every((r) => r.eredmeny === 'siker')).length
    const idok = s.map((r) => r.ido_ms).sort((a, b) => a - b)
    return { modell: m, futas: s.length, siker: s.filter((r) => r.eredmeny === 'siker').length / s.length, pass3: pass3 / fel.length, medianMs: idok[Math.floor(idok.length / 2)], p95Ms: idok[Math.floor(idok.length * 0.95)], tokenBe: s.reduce((a, r) => a + r.token_be, 0) / s.length }
  })
  // ---- Ö7
  const docs = readdirSync('legacy-docs').filter((f) => /\.(md|wsdl)$/.test(f))
  const tokenszam = async (szoveg: string) => {
    const v = await fetch(`${BEALLITAS.modellUrl}/api/chat`, { method: 'POST', body: JSON.stringify({ model: 'donki-gemma-e4b', stream: false, options: { num_predict: 1 }, messages: [{ role: 'user', content: szoveg }] }) })
    return ((await v.json()) as { prompt_eval_count: number }).prompt_eval_count
  }
  const o7docs = []
  for (const f of docs) {
    const t = readFileSync(`legacy-docs/${f}`, 'utf8')
    o7docs.push({ fajl: f, karakter: t.length, szo: t.split(/\s+/).filter(Boolean).length, token: await tokenszam(t) })
  }
  const nyersFutas = rows.filter((r) => r.valtozat === 'nyers' && r.agens_futas).map((r) => r.agens_futas!)
  const { rows: docHivas } = await db().query<{ modell: string; n: string; futas: string }>(
    `select f.modell, count(*) filter (where l.eszkoz = 'legacy_doc') n, count(distinct f.id) futas from ertekeles.futas f join agens.lepes l on l.futas_id = f.agens_futas where f.agens_futas = any($1) group by 1`,
    [nyersFutas]
  )
  const bontas = existsSync('riportok/05-osszehasonlitasok/adatok/tokenomics-bontas.json') ? JSON.parse(readFileSync('riportok/05-osszehasonlitasok/adatok/tokenomics-bontas.json', 'utf8')) : []
  // ---- Ö6
  const sorok = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((x) => x.trim() && !/^\s*(\/\/|\*|\/\*)/.test(x)).length : 0)
  const fajlok = (d: string) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`) : [])
  const o6 = ['finance', 'inventory', 'orders', 'sales', 'support'].map((sz) => ({ szerver: sz, fajlok: fajlok(`mcp/servers/${sz}`).map((f) => ({ f, sor: sorok(f) })), osszes: fajlok(`mcp/servers/${sz}`).reduce((a, f) => a + sorok(f), 0) }))
  const kozos = fajlok('mcp/kozos').reduce((a, f) => a + sorok(f), 0)
  const nyersEszk = fajlok('agens/nyers').reduce((a, f) => a + sorok(f), 0)
  const agensMcp = sorok('agens/kozos/mcp.ts')

  const ki = { o11, o8, o12, o9, ollamaPs, o7: { dokumentumok: o7docs, docHivas, eszkozleiras: bontas }, o6: { szerverek: o6, kozos, nyersEszk, agensMcp } }
  writeFileSync('riportok/05-osszehasonlitasok/adatok/osszevetesek.json', JSON.stringify(ki, null, 1))
  console.log(JSON.stringify({ ...ki, o6: { ...ki.o6, szerverek: o6.map((x) => [x.szerver, x.osszes]) } }, null, 1).slice(0, 9000))
  await dbZar()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
