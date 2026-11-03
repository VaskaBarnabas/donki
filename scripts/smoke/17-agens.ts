/**
 * 17. fázis füstteszt (determinisztikus, modell nélkül): az ágens gráfja (LangGraph), a jóváhagyási kapu, a
 * checkpointer (megállás és folytatás új folyamatból), az eszközszűrés, a szerepkör, a Skillek, a lépéskorlát és a
 * napló, és a felhasználókezelés (a portál helyi eszközei, két ideiglenes Supabase-felhasználóval). A „gondolkodást” egy forgatókönyv szerint válaszoló modell adja (agens/teszt-modell.ts); minden más valódi:
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
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { felhasznaloEszkozok } from '../../lib/portal/felhasznalo-eszkozok'
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
    check(`11 skill betöltve: ${[...skillek().keys()].join(', ')}`, skillek().size === 11 && [...skillek().values()].every((s) => s.leiras && s.tartalom.length > 100), null)
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

    // ------------------------------------------------------------ 6b. raktár szakágens (L1)
    szakasz('A Raktár szakágens: csak logisztikának, vezetőnek, adminnak – a raktári eszközökkel')
    const raktarAjanlott = async (szerep: 'logistics' | 'sales' | 'viewer') => {
      modell.forgatokonyv({ dontes: { agens: 'visszakerdez', kerdes: '?' } })
      await agens.kerdez({ szerep, keres: 'Beérkezett 20 monitor' })
      return String(modell.hivasok.at(-1)!.uzenetek[0].content).includes('- raktar:')
    }
    check('a front-desk a raktárt logisztikának ajánlja, értékesítőnek és megtekintőnek nem', (await raktarAjanlott('logistics')) && !(await raktarAjanlott('sales')) && !(await raktarAjanlott('viewer')), null)
    modell.forgatokonyv({ dontes: { agens: 'raktar' } }, { szoveg: 'ok' })
    await agens.kerdez({ szerep: 'logistics', keres: 'Mi fogy ki?' })
    const raktarEszkozok = modell.hivasok.at(-1)!.eszkozok
    check(`raktár szakágens: ${raktarEszkozok.join(', ')}`, ['check_stock', 'list_low_stock', 'adjust_stock', 'start_fulfillment', 'load_skill'].every((e) => raktarEszkozok.includes(e)) && !raktarEszkozok.includes('create_quote') && !raktarEszkozok.includes('cancel_order'), raktarEszkozok)

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

    // ------------------------------------------------------------ 9. felhasználókezelés (helyi eszközök)
    szakasz('Felhasználókezelés: csak rendszergazdának, jóváhagyással, a Supabase szabályaival')
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const ideiglenes: string[] = []
    try {
      const uj = async (nev: string, szerep: string) => {
        const email = `smoke17-${nev}-${Date.now()}@example.com`
        const jelszo = `Smoke17-${crypto.randomUUID()}`
        const { data, error } = await admin.auth.admin.createUser({ email, password: jelszo, email_confirm: true })
        if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
        ideiglenes.push(data.user.id)
        await admin.from('profiles').update({ role: szerep }).eq('id', data.user.id)
        const kliens: SupabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
        await kliens.auth.signInWithPassword({ email, password: jelszo })
        return { id: data.user.id, email, kliens }
      }
      const szerepe = async (id: string) => (await admin.from('profiles').select('role').eq('id', id).single()).data?.role
      const rg = await uj('admin', 'admin')
      const cel = await uj('cel', 'viewer')
      const helyi = felhasznaloEszkozok(rg.kliens)

      const ajanlott = async (szerep: 'admin' | 'sales', h?: typeof helyi) => {
        modell.forgatokonyv({ dontes: { agens: 'visszakerdez', kerdes: '?' } })
        await agens.kerdez({ szerep, keres: 'Adj szerepkört valakinek', helyi: h })
        return String(modell.hivasok.at(-1)!.uzenetek[0].content).includes('- felhasznalok:')
      }
      check('a front-desk csak rendszergazdának ajánlja fel a felhasználókezelést (és csak a portálban, helyi eszközökkel)', (await ajanlott('admin', helyi)) && !(await ajanlott('sales', helyi)) && !(await ajanlott('admin')), null)

      modell.forgatokonyv({ dontes: { agens: 'felhasznalok' } }, { eszkoz: [{ name: 'list_users', args: {} }] }, { szoveg: 'lista' })
      await agens.kerdez({ szerep: 'admin', keres: 'Kik a felhasználók?', helyi })
      const lathatoF = modell.hivasok.at(-1)!.eszkozok
      check(`felhasználókezelő eszközei: ${lathatoF.join(', ')} (nincs MCP eszköz, nincs load_skill)`, lathatoF.join() === 'list_users,set_user_role', lathatoF)
      check('list_users jóváhagyás nélkül fut, a célfelhasználó benne van', toolUzenetek(modell).some((t) => String(t.content).includes(cel.email)), null)

      const beallit = (email: string, role: string) => {
        modell.forgatokonyv({ dontes: { agens: 'felhasznalok' } }, { eszkoz: [{ name: 'set_user_role', args: { email, role } }] }, { fuggveny: (u) => String(u.at(-1)?.content) })
      }
      beallit(cel.email, 'finance')
      const s1 = await agens.kerdez({ szerep: 'admin', keres: `${cel.email} legyen pénzügyes`, helyi })
      check(`set_user_role → jóváhagyásra vár: „${s1.jovahagyas[0]?.cim}” (${s1.jovahagyas[0]?.kockazat})`, s1.allapot === 'jovahagyasra_var' && s1.jovahagyas[0]?.cim === 'Szerepkör beállítása' && s1.jovahagyas[0]?.kockazat === 'write' && (await szerepe(cel.id)) === 'viewer', s1)
      await agens.dont({ threadId: s1.threadId, dontesek: { [s1.jovahagyas[0].id]: false }, helyi })
      check('elutasítva → a szerepkör nem változott', (await szerepe(cel.id)) === 'viewer', await szerepe(cel.id))

      beallit(cel.email, 'finance')
      const s2 = await agens.kerdez({ szerep: 'admin', keres: `${cel.email} legyen pénzügyes`, helyi })
      const s2b = await agens.dont({ threadId: s2.threadId, dontesek: { [s2.jovahagyas[0].id]: true }, helyi })
      check(`jóváhagyva → a szerepkör: ${await szerepe(cel.id)}; a modell ezt kapta: ${s2b.valasz?.slice(0, 90)}`, (await szerepe(cel.id)) === 'finance' && /"changed":true/.test(s2b.valasz ?? ''), s2b.valasz)

      beallit(rg.email, 'viewer')
      const s3 = await agens.kerdez({ szerep: 'admin', keres: 'Legyek megtekintő', helyi })
      const s3b = await agens.dont({ threadId: s3.threadId, dontesek: { [s3.jovahagyas[0].id]: true }, helyi })
      check('a saját admin szerepkörét jóváhagyás után sem veheti el (FORBIDDEN, a Supabase szabálya)', (await szerepe(rg.id)) === 'admin' && /FORBIDDEN/.test(s3b.valasz ?? ''), s3b.valasz)

      beallit('nincs-ilyen@example.com', 'sales')
      const s4 = await agens.kerdez({ szerep: 'admin', keres: 'nincs-ilyen legyen értékesítő', helyi })
      const s4b = await agens.dont({ threadId: s4.threadId, dontesek: { [s4.jovahagyas[0].id]: true }, helyi })
      check('ismeretlen e-mail-cím → NOT_FOUND', /NOT_FOUND/.test(s4b.valasz ?? ''), s4b.valasz)

      const nemAdmin = felhasznaloEszkozok(cel.kliens) // most pénzügyes
      const tilos = await nemAdmin.find((e) => e.nev === 'set_user_role')!.futtat({ email: rg.email, role: 'viewer' })
      check('nem admin munkamenetével az eszköz maga is elutasít (FORBIDDEN)', tilos.hibakod === 'FORBIDDEN' && (await szerepe(rg.id)) === 'admin', tilos)
    } finally {
      for (const id of ideiglenes) await admin.auth.admin.deleteUser(id)
    }
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
