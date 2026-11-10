/**
 * 19. fázis füstteszt (modell nélkül): a mérés eszközeinek ellenőrzése, mielőtt bármelyik modell futna.
 *   1. a nyers eszközök: minden interfészen egy olvasó hívás; az írás/olvasás minősítése; a kulcs nem jut a modellhez;
 *   2. a nyers ágens a gráfban: előre megadott szakágensként fut, a front-desk soha nem kínálja fel, írásnál megáll
 *      jóváhagyásra (hívásonkénti kockázat), olvasásnál nem;
 *   3. az ellenőrzők ellenőrzése: minden feladatnál az „ideális” megoldás (a helyes lépések az MCP-n, helyes válasz)
 *      sikeres, egy semmit nem csináló, kitalált válasz pedig nem;
 *   4. a riport elkészül egy kis próbaadatból.
 *
 * Előfeltétel: npm run stack:up (a Számlázz.hu és a Stripe tesztfiók elérhető)
 * Futtatás: npx tsx scripts/smoke/19-ertekeles.ts [--feladatok F01,F08]   (~5–8 perc)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agens } from '../../agens/futtato'
import { db, dbZar } from '../../agens/kozos/naplo'
import { NyersForras } from '../../agens/nyers/eszkozok'
import { ForgatokonyvModell } from '../../agens/teszt-modell'
import { elerhetoAgensek } from '../../agens/ugynokok'
import { FELADATOK, type Kornyezet } from '../ertekeles/feladatok'
import { futas, meroszamok } from '../ertekeles/futtat'
import { Keszlet, Kozos, Mcp } from '../ertekeles/kozos'
import { env } from './rendszerek'

let failed = 0
let osszes = 0
function check(name: string, ok: boolean, detail: unknown) {
  osszes++
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}
let lepes = 0
const szakasz = (c: string) => console.log(`\n${++lepes}. ${c}`)
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : ''
}
const ROSSZ = 'Kész, minden rendben. Összesen 987 654 Ft.'

async function main() {
  const kezdet = Date.now()
  const kulcsok = ['CRM_API_KEY', 'LEGACY_QUOTE_KEY', 'LEGACY_ORDERS_KEY', 'INVENTORY_API_KEY', 'LEGACY_BILLING_KEY', 'LEGACY_PAYMENTS_KEY', 'LEGACY_SUPPORT_KEY'].map((k) => env[k]).filter(Boolean)

  szakasz('A nyers eszközök: minden interfész, minősítés, kulcs')
  const n = new NyersForras()
  const olvasok: [string, Record<string, unknown>, RegExp][] = [
    ['legacy_doc', { name: 'orders.md' }, /homlokzat/i],
    ['crm_rest', { method: 'GET', path: 'partners?select=name&name=ilike.*bakony*', profile: 'crm' }, /Bakony/],
    ['ajanlat_rpc', { method: 'quote.list', params: {} }, /"result"/],
    ['rendeles_http', { method: 'GET', path: 'list' }, /"success":true/],
    ['raktar_sor', { command: { cmd: 'LISTA' } }, /"status":"OK"/],
    ['szamlazo_parancs', { command: 'SZAMLA|LEJART' }, /^HTTP 200\nOK\|/],
    ['fizetes_rest', { method: 'GET', path: '?limit=1' }, /"data"/],
    ['helpdesk_soap', { operation: 'ListTickets', body: '<hd:ListTickets/>' }, /ListTicketsResponse/],
  ]
  for (const [nev, args, minta] of olvasok) {
    const r = await n.hiv(nev, args)
    check(`${nev}: olvasás működik, olvasásnak minősül`, r.ok && minta.test(r.szoveg) && n.hivasKockazat(nev, args) === 'read', r.szoveg.slice(0, 200))
    check(`${nev}: a válaszban nincs kulcs`, !kulcsok.some((k) => r.szoveg.includes(k)), null)
  }
  const irasok: [string, Record<string, unknown>][] = [
    ['crm_rest', { method: 'PATCH', path: 'products?code=eq.X', profile: 'catalog', body: {} }],
    ['ajanlat_rpc', { method: 'quote.accept', params: {} }],
    ['rendeles_http', { method: 'POST', path: '100045/approve' }],
    ['raktar_sor', { command: { cmd: 'MOZGAS' } }],
    ['szamlazo_parancs', { command: 'SZAMLA|STORNO|SZ-2026-000001' }],
    ['fizetes_rest', { method: 'POST', path: '' }],
    ['helpdesk_soap', { operation: 'CreateTicket', body: '' }],
  ]
  check('az író hívások mind írásnak minősülnek (jóváhagyás kell)', irasok.every(([nev, a]) => n.hivasKockazat(nev, a) === 'write'), irasok.map(([nev, a]) => `${nev}:${n.hivasKockazat(nev, a)}`))

  szakasz('A nyers ágens a gráfban')
  check('a front-desk egyik szerepkörnek sem kínálja fel', (['viewer', 'sales', 'admin', 'monitor'] as const).every((s) => !elerhetoAgensek(s, true).includes('nyers')), null)
  const modell = new ForgatokonyvModell()
  const agens = await Agens.nyit({ modell })
  modell.forgatokonyv({ eszkoz: [{ name: 'szamlazo_parancs', args: { command: 'SZAMLA|LEJART' } }] }, { szoveg: 'Ennyi.' })
  const o = await agens.kerdez({ szerep: 'admin', keres: 'lejárt számlák', agens: 'nyers' })
  check(`olvasó nyers hívás: nincs megállás (${o.allapot}), és a modell nem a kulcsot kapta vissza`, o.allapot === 'kesz' && !modell.hivasok.flatMap((h) => h.uzenetek).some((u) => kulcsok.some((k) => JSON.stringify(u.content).includes(k))), o)
  check('a nyers ágens nem kap skillt és MCP eszközt, csak a nyers eszközöket', modell.hivasok.at(-1)!.eszkozok.every((e) => n.eszkozok.some((x) => x.nev === e)), modell.hivasok.at(-1)!.eszkozok)
  modell.forgatokonyv({ eszkoz: [{ name: 'szamlazo_parancs', args: { command: 'SZAMLA|STORNO|SZ-2099-000001' } }] }, { szoveg: 'Nem tettem.' })
  const w = await agens.kerdez({ szerep: 'admin', keres: 'sztornó', agens: 'nyers' })
  check(`író nyers hívás: jóváhagyásra vár (${w.jovahagyas.map((j) => `${j.eszkoz}, ${j.kockazat}`).join('; ')})`, w.allapot === 'jovahagyasra_var' && w.jovahagyas[0]?.kockazat === 'write', w)
  const wd = await agens.dont({ threadId: w.threadId, dontesek: { [w.jovahagyas[0].id]: false } })
  check('elutasítás után nem futott le', wd.allapot === 'kesz', wd)

  szakasz('A futtató: jóváhagyás az elvárt írásokra, a többi elutasítva; mérőszámok a naplóból')
  modell.forgatokonyv({ dontes: { agens: 'ertekesites' } }, { eszkoz: [{ name: 'create_customer', args: { name: 'Nem Kellene Kft', taxNumber: '12345676-2-42' } }] }, { szoveg: 'Nem sikerült.' })
  const f = await futas(agens, 'mcp', { keres: 'teszt', szerep: 'sales', irasok: ['create_quote'], ellenoriz: async () => ({ eredmeny: 'siker', megjegyzes: '' }), idealis: async () => '' })
  check(`nem várt írás: elutasítva és megszámolva (${f.nemVart})`, f.nemVart === 1 && f.jovahagyas === 0, f)
  const ms = await meroszamok(f.v.futasId)
  check(`mérőszámok: ${ms.modell_hivas} modell-, ${ms.eszkoz_hivas} eszközhívás, ${ms.token_be} token be`, ms.modell_hivas >= 2 && ms.token_be > 0 && ms.ido_ms !== null, ms)
  await agens.zar()

  szakasz('Az ellenőrzők ellenőrzése: ideális megoldás → siker, semmit nem csináló válasz → nem siker')
  const szuro = arg('feladatok')
  const feladatok = szuro ? FELADATOK.filter((x) => szuro.split(',').includes(x.id)) : FELADATOK
  const m = await Mcp.nyit()
  const k: Kornyezet = { m, keszlet: new Keszlet(m), kozos: new Kozos() }
  await k.keszlet.feltolt(feladatok.reduce((s, x) => s + 2 * (x.kezbesitett ?? 0) + (x.kezbesitettEgyszer ?? 0), 0))
  try {
    for (const fel of feladatok) {
      for (const mod of ['ideális', 'rossz'] as const) {
        const eset = await fel.elokeszit(k)
        try {
          const valasz = mod === 'ideális' ? await eset.idealis() : ROSSZ
          const ert = await eset.ellenoriz(valasz)
          check(`${fel.id} ${fel.cim} – ${mod}: ${ert.eredmeny} (${ert.megjegyzes})`, mod === 'ideális' ? ert.eredmeny === 'siker' : ert.eredmeny !== 'siker', { valasz, ert })
        } catch (e) {
          check(`${fel.id} ${fel.cim} – ${mod}`, false, e instanceof Error ? e.message : e)
        } finally {
          await eset.takarit?.().catch((e) => console.error('  takarítás:', e instanceof Error ? e.message : e))
        }
      }
    }
  } finally {
    await m.zar()
  }

  szakasz('A riport egy kis próbaadatból')
  const meres = `proba-${Date.now()}`
  await db().query(
    `insert into ertekeles.futas (meres, feladat, valtozat, modell, ismetles, eredmeny, megjegyzes, ido_ms, eszkoz_hivas, token_be, token_ki, jovahagyas, nem_vart_iras, modell_hivas, hibas_eszkoz, visszakerdezett)
     values ($1, 'F01', 'nyers', 'donki-gemma-e4b', 1, 'sikertelen', 'próba', 20000, 6, 9000, 300, 1, 0, 7, 2, false),
            ($1, 'F01', 'mcp', 'donki-gemma-e4b', 1, 'siker', 'próba', 8000, 1, 4000, 100, 1, 0, 3, 0, false)`,
    [meres]
  )
  try {
    const ki = join(tmpdir(), `${meres}.md`)
    const csvUt = join(tmpdir(), `${meres}.csv`)
    execFileSync('npx', ['tsx', 'scripts/ertekeles/riport.ts', '--meres', meres, '--ki', ki, '--csv', csvUt], { stdio: 'pipe' })
    const riport = readFileSync(ki, 'utf8')
    const csv = readFileSync(csvUt, 'utf8')
    check('a riport elkészül: összesítő, pass^k, MCP-hatás, feladatonként, ember (becslés), hibák', /## 1\. Összesítő/.test(riport) && /pass\^k/.test(riport) && /0% → \*\*100%\*\*/.test(riport) && /becslés, nem mérés/.test(riport) && /F01/.test(riport), riport.slice(0, 300))
    check('a CSV-ben a két futás', csv.trim().split('\n').length === 3, csv)
  } finally {
    await db().query('delete from ertekeles.futas where meres = $1', [meres])
  }

  await dbZar()
  console.log(`\n${osszes - failed}/${osszes} OK (${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
