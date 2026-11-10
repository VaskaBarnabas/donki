/**
 * 20. fázis, tokenomika: token-költség és válaszidő a végrehajtási ciklusok mentén, az ertekeles.futas és agens.lepes alapján.
 * Egy futás ciklusai: a modellhívások sorrendben (1. a front-desk, utána a szakágens körei).
 * Futtatás: npx tsx scripts/riportok/tokenomics.ts [--alap 2026-11-07-javitott] [--opt tokenomics-elozmeny,tokenomics-semamind,tokenomics-mind]
 * Kimenet: riportok/05-osszehasonlitasok/adatok/tokenomics-tablazatok.md és tokenomics-ciklus.csv
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import '../../agens/kozos/kornyezet'
import { db, dbZar } from '../../agens/kozos/naplo'

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : d
}
const ALAP = arg('alap', '2026-11-07-javitott')
const OPT = arg('opt', 'tokenomics-elozmeny,tokenomics-semamind,tokenomics-mind').split(',').filter(Boolean)
const MAPPA = 'riportok/05-osszehasonlitasok/adatok'
const F = JSON.parse(readFileSync('riportok/04-penzugy/feltevesek.json', 'utf8')) as Record<string, Record<string, { ertek: number }>>
const EVI_FUTAS = 78118 // a pénzügyi terv 25 felhasználós alapesete

type Futas = { id: string; meres: string; modell: string; feladat: string; ismetles: number; eredmeny: string; ido_ms: number; token_be: number; token_ki: number; agens_futas: string }
type Lepes = { futas_id: string; agens: string; tipus: string; token_be: number; token_ki: number; ido_ms: number }
const atl = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0)
const pct = (x: number[], p: number) => [...x].sort((a, b) => a - b)[Math.min(x.length - 1, Math.floor((x.length * p) / 100))] ?? 0
const n0 = (x: number) => Math.round(x).toLocaleString('hu-HU').replace(/ /g, ' ')
const n1 = (x: number) => x.toFixed(1).replace('.', ',')
const n2 = (x: number) => x.toFixed(2).replace('.', ',')
const sz = (x: number) => `${Math.round(x * 100)}%`
const elt = (o: number, a: number) => (a ? `${o >= a ? '+' : '−'}${Math.round((Math.abs(o - a) / a) * 100)}%` : '–')
const tabla = (f: string[], s: string[][]) => [`| ${f.join(' | ')} |`, `|${f.map(() => '---').join('|')}|`, ...s.map((x) => `| ${x.join(' | ')} |`)].join('\n')
const nev = (m: string) => (m === 'donki-gemma' ? '12b' : 'e4b')

async function main() {
  const meresek = [ALAP, ...OPT]
  const { rows: fut } = await db().query<Futas>(`select id, meres, modell, feladat, ismetles, eredmeny, ido_ms, token_be, token_ki, agens_futas from ertekeles.futas where valtozat = 'mcp' and meres = any($1) and agens_futas is not null`, [meresek])
  const { rows: lep } = await db().query<Lepes>(`select l.futas_id, l.agens, l.tipus, l.token_be, l.token_ki, l.ido_ms from agens.lepes l where l.futas_id = any($1) order by l.id`, [fut.map((f) => f.agens_futas)])
  const per = new Map<string, Lepes[]>()
  for (const l of lep) per.set(l.futas_id, [...(per.get(l.futas_id) ?? []), l])
  const ki: string[] = ['# Tokenomika: generált táblázatok', '', `*\`scripts/riportok/tokenomics.ts\` · alapmérés: \`${ALAP}\` · változatok: ${OPT.map((o) => `\`${o}\``).join(', ')}*`, '']
  const cs = (m: string, mod: string) => fut.filter((f) => f.meres === m && f.modell === mod)
  const modellek = ['donki-gemma-e4b', 'donki-gemma']
  const ls = (f: Futas) => per.get(f.agens_futas) ?? []
  const mh = (f: Futas) => ls(f).filter((l) => l.tipus === 'modell')

  ki.push('## 1. Összkép', '')
  const so: string[][] = []
  for (const m of meresek) for (const mod of modellek) {
    const s = cs(m, mod)
    if (!s.length) continue
    const idok = s.map((f) => f.ido_ms / 1000)
    const mi = atl(s.map((f) => mh(f).reduce((a, l) => a + l.ido_ms, 0))) / 1000
    const ei = atl(s.map((f) => ls(f).filter((l) => l.tipus === 'eszkoz').reduce((a, l) => a + l.ido_ms, 0))) / 1000
    so.push([m, nev(mod), String(s.length), sz(s.filter((f) => f.eredmeny === 'siker').length / s.length), n1(atl(s.map((f) => mh(f).length))), n0(atl(s.map((f) => f.token_be))), n0(atl(s.map((f) => f.token_ki))), n1(atl(idok)), n1(pct(idok, 50)), n1(pct(idok, 95)), n1(mi), n1(ei)])
  }
  ki.push(tabla(['Mérés', 'Modell', 'Futás', 'Siker', 'Modellhívás/futás', 'Token be/futás', 'Token ki/futás', 'Idő (mp)', 'p50', 'p95', 'Modellidő', 'Eszközidő'], so), '')

  ki.push('## 2. Végrehajtási ciklusok (alapmérés)', '')
  const csvSor: string[] = ['meres;modell;ciklus;futasok;token_be;token_ki;ido_ms']
  const ciklus = (m: string, mod: string) => {
    const g = new Map<number, Lepes[]>()
    for (const f of cs(m, mod)) mh(f).forEach((l, i) => g.set(i + 1, [...(g.get(i + 1) ?? []), l]))
    return [...g.entries()].sort((a, b) => a[0] - b[0]).map(([c, l]) => ({ c, n: l.length, be: atl(l.map((x) => x.token_be)), ki: atl(l.map((x) => x.token_ki)), ms: atl(l.map((x) => x.ido_ms)) }))
  }
  for (const m of meresek) for (const mod of modellek) for (const c of ciklus(m, mod)) csvSor.push([m, nev(mod), c.c, c.n, Math.round(c.be), Math.round(c.ki), Math.round(c.ms)].join(';'))
  writeFileSync(`${MAPPA}/tokenomics-ciklus.csv`, csvSor.join('\n') + '\n')
  for (const mod of modellek) {
    ki.push(`**${nev(mod)}**`, '', tabla(['Ciklus', 'Futás', 'Token be', 'Token ki', 'Modellidő (ms)', 'Bemeneti token/mp*'], ciklus(ALAP, mod).map((c) => [c.c === 1 ? '1 (front-desk)' : String(c.c), String(c.n), n0(c.be), n0(c.ki), n0(c.ms), n0(c.be / (c.ms / 1000))])), '')
  }
  ki.push('*A teljes modellidővel osztva, a kimenet generálását is beleértve.', '')

  ki.push('## 3. Szakágensenként (alapmérés, modellhívásonként)', '')
  const g = new Map<string, Lepes[]>()
  for (const f of fut.filter((x) => x.meres === ALAP)) for (const l of mh(f)) g.set(l.agens, [...(g.get(l.agens) ?? []), l])
  ki.push(tabla(['Ágens', 'Modellhívás', 'Token be', 'Token ki', 'Modellidő (ms)'], [...g.entries()].sort((a, b) => b[1].length - a[1].length).map(([a, l]) => [a, String(l.length), n0(atl(l.map((x) => x.token_be))), n0(atl(l.map((x) => x.token_ki))), n0(atl(l.map((x) => x.ido_ms)))])), '')

  const bf = `${MAPPA}/tokenomics-bontas.json`
  if (existsSync(bf)) {
    ki.push('## 4. Egy szakágens-hívás bemenete (Ollama-számlálás, e4b)', '')
    type B = { agens: string; eszkozok: number; keret: number; rendszer: number; eszkozToken: number; eszkozTokenTomoritett: number; eszkozTokenLeirasNelkul: number; osszes: number; osszesTomoritett: number; osszesLeirasNelkul: number }
    ki.push(tabla(['Ágens', 'Eszköz', 'Rendszerutasítás', 'Eszközleírás', 'Eszköz aránya', 'Opcionális leírás nélkül', 'Minden leírás nélkül'], (JSON.parse(readFileSync(bf, 'utf8')) as B[]).map((b) => [b.agens, String(b.eszkozok), n0(b.rendszer), n0(b.eszkozToken), sz(b.eszkozToken / b.osszes), `${n0(b.osszesTomoritett)} (${elt(b.osszesTomoritett, b.osszes)})`, `${n0(b.osszesLeirasNelkul)} (${elt(b.osszesLeirasNelkul, b.osszes)})`])), '')
  }

  ki.push('## 5. A legnagyobb eszközválaszok (MCP-hívásnapló, 2026-11-07 óta)', '')
  const ny = execFileSync('docker', ['exec', 'donki-mcp-db-1', 'psql', '-U', 'postgres', '-At', '-F', ';', '-c', "select tool, count(*), round(avg(response_bytes)), max(response_bytes) from mcp.tool_calls where called_at > '2026-11-07' and response_bytes is not null group by 1 order by 3 desc limit 8"], { encoding: 'utf8' }).trim().split('\n').map((x) => x.split(';'))
  ki.push(tabla(['Eszköz', 'Hívás', 'Átlag (bájt)', 'Maximum (bájt)'], ny), '')

  ki.push('## 6. Költség futásonként', '')
  const usd = F.felho.usdFt.ertek
  const w = F.gep.wattFutasKozben.ertek
  const kwh = F.gep.aramFtKwh.ertek
  const ko: string[][] = []
  for (const mod of modellek) {
    const s = cs(ALAP, mod)
    if (!s.length) continue
    const be = atl(s.map((f) => f.token_be)), kim = atl(s.map((f) => f.token_ki))
    const aram = atl(s.map((f) => mh(f).reduce((a, l) => a + l.ido_ms, 0))) / 3.6e6 * (w / 1000) * kwh
    const sonnet = ((be * 2 + kim * 10) / 1e6) * usd
    const haiku = ((be * 0.1 + kim * 0.5) / 1e6) * usd
    const gyors = atl(s.map((f) => {
      let elozo = 0, ft = 0
      for (const l of mh(f)) {
        if (l.agens === 'frontdesk') { ft += l.token_be * 2; continue }
        const c = Math.min(elozo, l.token_be)
        ft += c * 0.1 + (l.token_be - c) * 2.5
        elozo = l.token_be
      }
      return ft + f.token_ki * 10
    })) / 1e6 * usd
    ko.push([nev(mod), n0(be), n0(kim), `${n2(aram)} Ft`, `${n2(sonnet)} Ft`, `${n2(gyors)} Ft`, `${n2(haiku)} Ft`, `${n0(sonnet * EVI_FUTAS)} Ft`, `${n0(gyors * EVI_FUTAS)} Ft`])
  }
  ki.push(tabla(['Modell', 'Token be', 'Token ki', 'Helyi áram', 'Sonnet 5.5', 'Sonnet 5.5, gyorsítótárral (becslés)', 'Haiku 5.5', 'Sonnet / év', 'Sonnet gyorsítótárral / év'], ko), '', `Évi futásszám: ${n0(EVI_FUTAS)} (a pénzügyi terv 25 felhasználós alapesete). A felhős sorok csak a tokendíjat mutatják azonos token-számmal, a felhőmodell viselkedését nem mértük. A helyi áram ${w} W-tal számol, ami nem mért érték.`, '')

  ki.push('## 7. Optimalizáció az alapméréshez képest', '')
  const ov: string[][] = []
  for (const m of OPT) for (const mod of modellek) {
    const o = cs(m, mod), a = cs(ALAP, mod)
    if (!o.length) continue
    const v = (x: Futas[], f: (y: Futas) => number) => atl(x.map(f))
    const siker = (x: Futas[]) => x.filter((f) => f.eredmeny === 'siker').length / x.length
    const mido = (y: Futas) => mh(y).reduce((s, l) => s + l.ido_ms, 0) / 1000
    ov.push([m, nev(mod), `${sz(siker(a))} → ${sz(siker(o))}`, `${n0(v(a, (y) => y.token_be))} → ${n0(v(o, (y) => y.token_be))} (${elt(v(o, (y) => y.token_be), v(a, (y) => y.token_be))})`, `${n1(v(a, (y) => y.ido_ms / 1000))} → ${n1(v(o, (y) => y.ido_ms / 1000))} (${elt(v(o, (y) => y.ido_ms), v(a, (y) => y.ido_ms))})`, `${n1(v(a, mido))} → ${n1(v(o, mido))} (${elt(v(o, mido), v(a, mido))})`, `${n1(v(a, (y) => mh(y).length))} → ${n1(v(o, (y) => mh(y).length))}`])
  }
  ki.push(ov.length ? tabla(['Változat', 'Modell', 'Siker', 'Token be/futás', 'Idő/futás (mp)', 'Modellidő (mp)', 'Modellhívás/futás'], ov) : 'Még nincs optimalizált mérés.', '')

  ki.push('## 8. Feladatok, ahol romlott a siker (legalább 2 futással az alapméréshez képest)', '')
  const rom: string[][] = []
  for (const m of OPT) for (const mod of modellek) {
    const o = cs(m, mod), a = cs(ALAP, mod)
    for (const fel of [...new Set(o.map((x) => x.feladat))]) {
      const db = (x: Futas[]) => x.filter((y) => y.feladat === fel && y.eredmeny === 'siker').length
      const n = (x: Futas[]) => x.filter((y) => y.feladat === fel).length
      if (n(o) < n(a)) continue // a változat még nem futott le teljesen ezen a feladaton
      if (db(a) - db(o) >= 2) rom.push([m, nev(mod), fel, `${db(a)} → ${db(o)}`, o.filter((y) => y.feladat === fel && y.eredmeny !== 'siker').map((y) => y.eredmeny).join(', ')])
    }
  }
  ki.push(rom.length ? tabla(['Változat', 'Modell', 'Feladat', 'Sikeres (3-ból)', 'Eredmények'], rom) : 'Egyik feladaton sem romlott legalább 2 futással.', '')

  writeFileSync(`${MAPPA}/tokenomics-tablazatok.md`, ki.join('\n'))
  console.log(ki.join('\n'))
  await dbZar()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
