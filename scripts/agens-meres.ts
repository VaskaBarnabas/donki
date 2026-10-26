/**
 * Ágens-mérés (17. fázis, 0. lépés; a 19. fázisban bővül): ugyanazok a csak olvasó kérések több modellel, ismételve.
 * Kérésenként: a front-desk a jó szakágenshez irányított-e, a szakágens a várt eszközt hívta-e a várt paraméterrel
 * (az MCP naplójából, mcp.tool_calls.agent_run_id), kész lett-e, mennyi idő és token kellett.
 *
 * Futtatás: npx tsx scripts/agens-meres.ts [--modellek donki-gemma,donki-gemma-e4b] [--ismetles 2]
 */
import { execFileSync } from 'node:child_process'
import '../agens/kozos/kornyezet'
import { Agens } from '../agens/futtato'
import type { Szerep } from '../agens/kozos/kornyezet'
import { ollamaModell } from '../agens/kozos/modell'
import { db } from '../agens/kozos/naplo'
import { env, URL } from './smoke/rendszerek'

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : d
}
const MODELLEK = arg('modellek', 'donki-gemma,donki-gemma-e4b').split(',')
const ISMETLES = Number(arg('ismetles', '2'))

type Feladat = { nev: string; szerep: Szerep; keres: string; agens: string; eszkoz: string; parameter?: RegExp }

async function main() {
  // a mérés a saját adatát a rendszerből keresi (nem seed): a legutóbb kiszállított rendelés
  const rend = (await (await fetch(`${URL.orders}/api/legacy/orders/list?state=SZALLITVA`, { headers: { 'X-Legacy-Key': env.LEGACY_ORDERS_KEY } })).json()) as { data: { order_no: number }[] }
  const rnd = `RND-${rend.data[0]?.order_no}`
  if (!rend.data.length) throw new Error('Nincs kiszállított rendelés a méréshez (futtasd előbb a 07-es tesztet)')

  const FELADATOK: Feladat[] = [
    { nev: 'rendelés állapota', szerep: 'viewer', keres: `Hol tart az ${rnd} rendelés?`, agens: 'rendeles', eszkoz: 'get_order', parameter: new RegExp(rnd) },
    { nev: 'vevőkeresés', szerep: 'sales', keres: 'Keresd meg a Bakony nevű vevőnket, milyen ügyfélcsoportban van?', agens: 'ertekesites', eszkoz: 'search_customers', parameter: /bakony/i },
    { nev: 'készlet', szerep: 'sales', keres: 'Hány darab van raktáron a TK-00010-es monitorból?', agens: 'ertekesites', eszkoz: 'check_stock', parameter: /TK-00010/ },
    { nev: 'lejárt számlák', szerep: 'finance', keres: 'Milyen lejárt számláink vannak, és mennyi az összesen?', agens: 'rendeles|kivetel', eszkoz: 'list_overdue_documents' },
    { nev: 'garancia', szerep: 'sales', keres: `Az ${rnd} rendelésben szereplő termékre van még garancia?`, agens: 'ugyfelszolgalat', eszkoz: 'check_warranty', parameter: new RegExp(rnd) },
  ]

  const sorok: { modell: string; feladat: string; utvonal: boolean; eszkoz: boolean; kesz: boolean; ido: number; token: number; hivasok: number }[] = []
  for (const modell of MODELLEK) {
    const agens = await Agens.nyit({ modell: ollamaModell(modell) })
    for (let n = 1; n <= ISMETLES; n++) {
      for (const f of FELADATOK) {
        const t = Date.now()
        const v = await agens.kerdez({ szerep: f.szerep, keres: f.keres })
        const ido = Date.now() - t
        const { rows } = await db().query<{ token: number }>('select token_be + token_ki as token from agens.futas where id = $1', [v.futasId])
        const hivasok = execFileSync('docker', ['exec', 'donki-mcp-db-1', 'psql', '-U', 'postgres', '-At', '-c', `select tool || ' ' || input_summary::text from mcp.tool_calls where agent_run_id = '${v.futasId}' order by id`], { encoding: 'utf8' })
          .trim()
          .split('\n')
          .filter(Boolean)
        const sor = {
          modell,
          feladat: f.nev,
          utvonal: new RegExp(`^(${f.agens})$`).test(v.agens ?? ''),
          eszkoz: hivasok.some((h) => h.startsWith(`${f.eszkoz} `) && (!f.parameter || f.parameter.test(h))),
          kesz: v.allapot === 'kesz',
          ido,
          token: rows[0]?.token ?? 0,
          hivasok: hivasok.length,
        }
        sorok.push(sor)
        console.log(`${modell} #${n} ${f.nev}: útvonal ${sor.utvonal ? '✓' : `✗ (${v.agens})`} · eszköz ${sor.eszkoz ? '✓' : `✗ (${hivasok.map((h) => h.split(' ')[0]).join(',') || '—'})`} · ${v.allapot} · ${(ido / 1000).toFixed(1)} s · ${sor.token} token`)
        if (process.argv.includes('--valaszok')) console.log(`   ${v.valasz?.replace(/\s+/g, ' ').slice(0, 300)}`)
      }
    }
    await agens.zar()
  }

  console.log('\nÖsszesítés')
  console.log('modell             | útvonal | jó eszköz | kész | átl. idő | átl. token')
  for (const m of MODELLEK) {
    const s = sorok.filter((x) => x.modell === m)
    const arany = (k: 'utvonal' | 'eszkoz' | 'kesz') => `${s.filter((x) => x[k]).length}/${s.length}`
    console.log(`${m.padEnd(18)} | ${arany('utvonal').padEnd(7)} | ${arany('eszkoz').padEnd(9)} | ${arany('kesz').padEnd(4)} | ${(s.reduce((a, x) => a + x.ido, 0) / s.length / 1000).toFixed(1).padStart(6)} s | ${Math.round(s.reduce((a, x) => a + x.token, 0) / s.length)}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
