/**
 * 17. fázis füstteszt (determinisztikus, modell nélkül): az ágens gráfja (LangGraph), a jóváhagyási kapu, a
 * checkpointer (megállás és folytatás új folyamatból), az eszközszűrés, a szerepkör, a Skillek, a lépéskorlát és a
 * napló. A „gondolkodást” egy forgatókönyv szerint válaszoló modell adja (agens/teszt-modell.ts); minden más valódi:
 * az MCP szerverek (konténerben), a rendszerek, az agens-db.
 *
 * Előfeltétel: npm run stack:up (benne az agens-db és az MCP szerverek)
 * Futtatás: npx tsx scripts/smoke/17-agens.ts   (~30 mp)
 */
import { execFileSync } from 'node:child_process'
import type { ToolMessage } from '@langchain/core/messages'
import '../../agens/kozos/kornyezet'
import { Agens } from '../../agens/futtato'
import { McpKapcsolat } from '../../agens/kozos/mcp'
import { db, dbZar } from '../../agens/kozos/naplo'
import { skillek } from '../../agens/kozos/skillek'
import { ForgatokonyvModell } from '../../agens/teszt-modell'

let failed = 0
let osszes = 0
function check(name: string, ok: boolean, detail: unknown) {
  osszes++
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}
let lepes = 0
const szakasz = (c: string) => console.log(`\n${++lepes}. ${c}`)

/** Az MCP oldali tool hívások egy ágensfutásra (mcp.tool_calls.agent_run_id). */
function mcpHivasok(futasId: string): { tool: string; ok: boolean; error_code: string | null }[] {
  const ki = execFileSync('docker', ['exec', 'donki-mcp-db-1', 'psql', '-U', 'postgres', '-At', '-c', `select coalesce(json_agg(json_build_object('tool', tool, 'ok', ok, 'error_code', error_code) order by id), '[]') from mcp.tool_calls where agent_run_id = '${futasId}'`], { encoding: 'utf8' })
  return JSON.parse(ki.trim())
}
async function lepesek(futasId: string) {
  return (await db().query<{ agens: string; tipus: string; eszkoz: string | null; jovahagyas: string | null; ok: boolean; hibakod: string | null }>('select agens, tipus, eszkoz, jovahagyas, ok, hibakod from agens.lepes where futas_id = $1 order by id', [futasId])).rows
}
const toolUzenetek = (m: ForgatokonyvModell) => m.hivasok.at(-1)!.uzenetek.filter((u) => u.getType() === 'tool') as ToolMessage[]

async function main() {
  console.log('17. fázis – ágens réteg (LangGraph), determinisztikus teszt')
  const kezdet = Date.now()
  const modell = new ForgatokonyvModell()
  const agens = await Agens.nyit({ modell })

  // törzsadat a CRM-ből (nem seedelt bizonylat): a Bakony Gépgyártó vevőazonosítója és egy termék
  const tmp = await McpKapcsolat.nyit('sales', crypto.randomUUID(), ['sales'])
  const vevo = JSON.parse((await tmp.hiv('search_customers', { query: 'Bakony' }, 'elokeszites')).szoveg).items[0]
  await tmp.zar()
  const AJANLAT = { customerId: vevo.customerId, lines: [{ sku: 'TK-00010', quantity: 2 }] }

  try {
    // ------------------------------------------------------------ 1. környezet
    szakasz('Környezet: helyi adat, Skillek, saját adatbázis')
    check('a LangSmith nyomkövetés ki van kapcsolva, nincs LangSmith kulcs', process.env.LANGSMITH_TRACING === 'false' && !process.env.LANGSMITH_API_KEY && !process.env.LANGCHAIN_API_KEY, process.env.LANGSMITH_TRACING)
    check(`7 skill betöltve: ${[...skillek().keys()].join(', ')}`, skillek().size === 7 && [...skillek().values()].every((s) => s.leiras && s.tartalom.length > 100), null)
    const { rows: tablak } = await db().query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'langgraph'")
    check(`a checkpointer táblái az agens-db langgraph sémájában (${tablak[0].n} tábla)`, tablak[0].n >= 3, tablak)

    // ------------------------------------------------------------ 2. útválasztás, olvasás, eszközszűrés
    szakasz('Front-desk → értékesítés; olvasó hívás jóváhagyás nélkül; csak a saját eszközök')
    modell.forgatokonyv(
      { dontes: { agens: 'ertekesites' } },
      { eszkoz: [{ name: 'search_customers', args: { query: 'Bakony' } }] },
      { szoveg: 'A Bakony Gépgyártó Kft kiemelt vevő.' }
    )
    const v1 = await agens.kerdez({ szerep: 'sales', keres: 'Keresd meg a Bakony nevű vevőt' })
    check(`kész, az értékesítési ágens válaszolt: „${v1.valasz}”`, v1.allapot === 'kesz' && v1.agens === 'ertekesites' && v1.valasz === 'A Bakony Gépgyártó Kft kiemelt vevő.', v1)
    const lathato = modell.hivasok.find((h) => h.tipus === 'valaszol')!.eszkozok
    check(`az értékesítési ágens ${lathato.length} eszközt lát, a helpdeskét nem`, lathato.includes('create_quote') && lathato.includes('check_stock') && lathato.includes('load_skill') && !lathato.includes('create_ticket') && !lathato.includes('adjust_stock') && !lathato.includes('cancel_order'), lathato)
    const feladatUzenet = modell.hivasok.find((h) => h.tipus === 'valaszol')!.uzenetek[1]
    check('a szakágens a felhasználó szó szerinti kérését kapja (a front-desk nem fogalmazza át)', String(feladatUzenet.content) === 'Keresd meg a Bakony nevű vevőt', feladatUzenet.content)
    check('a modell nem kapja meg az idempotencia-kulcsot (azt a végrehajtó adja)', !JSON.stringify(modell.hivasok.at(-1)!.uzenetek).includes('idempotencyKey'), null)
    check('az eszköz válasza (a vevő) visszajutott a modellhez', toolUzenetek(modell).some((t) => String(t.content).includes(vevo.customerId)), null)
    check('MCP: a search_customers lefutott, a futás azonosítójával naplózva', mcpHivasok(v1.futasId).map((h) => h.tool).join() === 'search_customers', mcpHivasok(v1.futasId))
    const l1 = await lepesek(v1.futasId)
    check(`agens.lepes: ${l1.map((l) => `${l.agens}/${l.tipus}${l.eszkoz ? `/${l.eszkoz}` : ''}`).join(' → ')}`, l1.length === 4 && l1[2].jovahagyas === 'nem_kell', l1)
    const { rows: f1 } = await db().query<{ eredmeny: string; token_be: number; token_ki: number; agens: string }>('select eredmeny, token_be, token_ki, agens from agens.futas where id = $1', [v1.futasId])
    check(`agens.futas: kész, tokenek összesítve (${f1[0]?.token_be}/${f1[0]?.token_ki})`, f1[0]?.eredmeny === 'kesz' && f1[0].token_be === 100 + 200 + 200 && f1[0].token_ki === 10 + 20 + 20 && f1[0].agens === 'ertekesites', f1)

    // ------------------------------------------------------------ 3. jóváhagyás: elutasítás
    szakasz('Író hívás → a gráf megáll; elutasításnál nem jut el az MCP-ig')
    modell.forgatokonyv(
      { dontes: { agens: 'ertekesites' } },
      { eszkoz: [{ name: 'create_quote', args: AJANLAT }] },
      { szoveg: 'Rendben, nem készítettem ajánlatot.' }
    )
    const v2 = await agens.kerdez({ szerep: 'sales', keres: 'Készíts ajánlatot 2 monitorra a Bakonynak' })
    check(`megállt: jóváhagyásra vár (${v2.jovahagyas.map((j) => `${j.eszkoz}, ${j.kockazat}`).join('; ')})`, v2.allapot === 'jovahagyasra_var' && v2.jovahagyas.length === 1 && v2.jovahagyas[0].eszkoz === 'create_quote' && v2.jovahagyas[0].kockazat === 'write', v2)
    check('megállás közben az MCP-hez nem ment író hívás', mcpHivasok(v2.futasId).length === 0, mcpHivasok(v2.futasId))
    const v2b = await agens.dont({ threadId: v2.threadId, dontesek: { [v2.jovahagyas[0].id]: false } })
    check(`elutasítva → az ágens ezt mondja: „${v2b.valasz}”`, v2b.allapot === 'kesz' && v2b.valasz === 'Rendben, nem készítettem ajánlatot.', v2b)
    check('a modell APPROVAL_DENIED eredményt kapott', toolUzenetek(modell).some((t) => String(t.content).includes('APPROVAL_DENIED')), null)
    check('elutasítás után sincs create_quote az MCP naplójában', mcpHivasok(v2.futasId).length === 0, mcpHivasok(v2.futasId))
    check('agens.lepes: jovahagyas = elutasitva', (await lepesek(v2.futasId)).some((l) => l.tipus === 'jovahagyas' && l.jovahagyas === 'elutasitva'), null)

    // ------------------------------------------------------------ 4. jóváhagyás: folytatás új folyamatból
    szakasz('Jóváhagyás egy új ágens-példányból (a checkpointerből folytatva), egyszeri végrehajtás')
    modell.forgatokonyv(
      { dontes: { agens: 'ertekesites' } },
      { eszkoz: [{ name: 'create_quote', args: AJANLAT }] },
      { fuggveny: (u) => `Elkészült: ${/AJ-\d{4}-\d{4}/.exec(JSON.stringify(u.at(-1)?.content))?.[0]}` }
    )
    const v3 = await agens.kerdez({ szerep: 'sales', keres: 'Készíts ajánlatot 2 monitorra a Bakonynak' })
    const masik = await Agens.nyit({ modell }) // mintha a weboldal egy későbbi kérése folytatná
    const h3 = await masik.helyzet(v3.threadId)
    check('az új példány látja a függő jóváhagyást', h3.jovahagyas.length === 1 && h3.jovahagyas[0].id === v3.jovahagyas[0].id && h3.szerep === 'sales', h3.jovahagyas)
    const v3b = await masik.dont({ threadId: v3.threadId, dontesek: { [v3.jovahagyas[0].id]: true } })
    const ajanlat = /AJ-\d{4}-\d{4}/.exec(v3b.valasz ?? '')?.[0]
    check(`jóváhagyva → az ajánlat elkészült: ${ajanlat}`, v3b.allapot === 'kesz' && !!ajanlat, v3b)
    const h3mcp = mcpHivasok(v3.futasId)
    check('MCP: pontosan egy create_quote, sikeres', h3mcp.length === 1 && h3mcp[0].tool === 'create_quote' && h3mcp[0].ok, h3mcp)
    check('agens.lepes: jovahagyas = jovahagyva', (await lepesek(v3.futasId)).some((l) => l.eszkoz === 'create_quote' && l.jovahagyas === 'jovahagyva' && l.ok), null)
    // ugyanaz a hívásazonosító → ugyanaz az idempotencia-kulcs → nem jön létre második ajánlat
    const ujra = await McpKapcsolat.nyit('sales', v3.futasId, ['sales'])
    const ismetles = await ujra.hiv('create_quote', AJANLAT, `${v3.futasId}:${v3.jovahagyas[0].id}`)
    await ujra.zar()
    check(`ugyanannak a lépésnek az ismétlése ugyanazt az ajánlatot adja (${JSON.parse(ismetles.szoveg).quote?.quoteId})`, JSON.parse(ismetles.szoveg).quote?.quoteId === ajanlat, ismetles)
    await masik.zar()

    // ------------------------------------------------------------ 5. szerepkör
    szakasz('Szerepkör: a megtekintő írását az MCP utasítja el, akkor is, ha jóváhagyják')
    modell.forgatokonyv(
      { dontes: { agens: 'ertekesites' } },
      { eszkoz: [{ name: 'create_quote', args: AJANLAT }] },
      { szoveg: 'Ehhez nincs jogosultságod.' }
    )
    const v4 = await agens.kerdez({ szerep: 'viewer', keres: 'Készíts ajánlatot' })
    const v4b = await agens.dont({ threadId: v4.threadId, dontesek: { [v4.jovahagyas[0]?.id ?? '-']: true } })
    const t4 = toolUzenetek(modell).map((t) => String(t.content)).join()
    check('a modell FORBIDDEN hibát kapott az MCP-től', v4b.allapot === 'kesz' && t4.includes('FORBIDDEN'), t4.slice(0, 200))
    check('MCP: a create_quote FORBIDDEN-nel naplózva', mcpHivasok(v4.futasId).some((h) => h.tool === 'create_quote' && h.error_code === 'FORBIDDEN'), mcpHivasok(v4.futasId))

    // ------------------------------------------------------------ 6. kivételkezelő: csak olvas
    szakasz('A kivételkezelő csak olvasó eszközöket lát')
    modell.forgatokonyv({ dontes: { agens: 'kivetel' } }, { szoveg: 'Nincs elakadt rendelés.' })
    await agens.kerdez({ szerep: 'sales_manager', keres: 'Mi akadt el?' })
    const kivEszkozok = modell.hivasok.at(-1)!.eszkozok
    check(`kivételkezelő: ${kivEszkozok.length} eszköz, egyik sem ír`, kivEszkozok.includes('list_low_stock') && kivEszkozok.includes('list_overdue_documents') && !kivEszkozok.some((e) => /create|approve|accept|cancel|start|issue|adjust|update|receive|modify/.test(e)), kivEszkozok)

    // ------------------------------------------------------------ 7. skill, ismeretlen eszköz, lépéskorlát
    szakasz('Skill betöltése, ismeretlen eszköz, lépéskorlát')
    modell.forgatokonyv(
      { dontes: { agens: 'ugyfelszolgalat' } },
      { eszkoz: [{ name: 'load_skill', args: { name: 'garancia-rma' } }, { name: 'load_skill', args: { name: 'rendelesfelvetel' } }, { name: 'drop_database', args: {} }] },
      { szoveg: 'ok' }
    )
    const v5 = await agens.kerdez({ szerep: 'sales', keres: 'Van garancia?' })
    const t5 = toolUzenetek(modell).map((t) => String(t.content))
    check('a saját skill betöltődik (W-OK, W-EXP …)', t5.some((t) => t.includes('W-NOTDELIVERED')), t5.map((t) => t.slice(0, 60)))
    check('más ágens skillje nem tölthető be', t5.some((t) => t.startsWith('Unknown skill: rendelesfelvetel')), null)
    check('ismeretlen eszköz → UNKNOWN_TOOL, nem jut el az MCP-ig', t5.some((t) => t.includes('UNKNOWN_TOOL')) && mcpHivasok(v5.futasId).length === 0, mcpHivasok(v5.futasId))

    modell.forgatokonyv({ dontes: { agens: 'rendeles' } }).vegtelen({ name: 'list_orders', args: { limit: 1 } })
    const v6 = await agens.kerdez({ szerep: 'viewer', keres: 'Listázd végtelenül' })
    const l6 = await lepesek(v6.futasId)
    check(`lépéskorlát: ${l6.filter((l) => l.tipus === 'eszkoz').length} eszközhívás után összefoglal („megszakítva”)`, v6.allapot === 'megszakitva' && l6.filter((l) => l.tipus === 'eszkoz').length === 15 && mcpHivasok(v6.futasId).length === 15, { allapot: v6.allapot, n: l6.length })

    // ------------------------------------------------------------ 8. visszakérdezés
    szakasz('Front-desk: nem egyértelmű kérésre visszakérdez')
    modell.forgatokonyv({ dontes: { agens: 'visszakerdez', kerdes: 'Melyik rendelésre gondolsz?' } })
    const v7 = await agens.kerdez({ szerep: 'sales', keres: 'És az?' })
    check(`visszakérdez: „${v7.valasz}”`, v7.allapot === 'visszakerdezett' && v7.valasz === 'Melyik rendelésre gondolsz?' && v7.agens === null, v7)
  } finally {
    await agens.zar()
    await dbZar()
  }

  console.log(`\n${osszes - failed}/${osszes} OK (${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
