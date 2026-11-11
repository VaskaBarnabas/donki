/**
 * 19. fázis: a mérés futtatója (docs/FAZIS19_TERV.md). Feladat × változat (nyers / MCP) × modell × ismétlés, sorban
 * (a helyi modell egyszerre egy kérést szolgál ki jól). Futásonként: előkészítés → kérés → az elvárt író lépések
 * jóváhagyása (a többi elutasítva, hibának számít) → ellenőrzés a rendszer végállapotából → takarítás. Az eredmény az
 * agens-db ertekeles.futas táblájába kerül; a már meglévő futásokat kihagyja, így egy megszakadt mérés folytatható.
 *
 * Előfeltétel: npm run stack:up, Ollama a modellekkel; a portál háttérfigyelője ne fusson (AGENS_FIGYELO=ki vagy ne
 * fusson az npm run dev), mert elvenné a modellt.
 * Futtatás:
 *   npx tsx scripts/ertekeles/futtat.ts [--valtozatok nyers,mcp] [--modellek donki-gemma-e4b,donki-gemma]
 *                                       [--ismetles 3] [--feladatok F01,F08] [--meres 2026-11-03]
 * Utána: npx tsx scripts/ertekeles/riport.ts [--meres 2026-11-03]
 */
import { Agens, type FutasValasz } from '../../agens/futtato'
import { ollamaModell } from '../../agens/kozos/modell'
import { db, dbZar } from '../../agens/kozos/naplo'
import { FELADATOK, type Eset, type Feladat, type Kornyezet } from './feladatok'
import { Keszlet, Kozos, Mcp } from './kozos'

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : d
}
export const MA = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date())
const VALTOZATOK = arg('valtozatok', 'nyers,mcp').split(',') as ('nyers' | 'mcp')[]
const MODELLEK = arg('modellek', 'donki-gemma-e4b,donki-gemma').split(',')
const ISMETLES = Number(arg('ismetles', '3'))
const MERES = arg('meres', MA)
const SZURO = arg('feladatok', '')
const feladatok = SZURO ? FELADATOK.filter((f) => SZURO.split(',').includes(f.id)) : FELADATOK.filter((f) => !f.kulon)

type Terv = { f: Feladat; valtozat: 'nyers' | 'mcp'; modell: string; ismetles: number }

/** Egy futás: a kérés és a jóváhagyások (az elvárt írások igen, a többi nem). */
export async function futas(agens: Agens, valtozat: 'nyers' | 'mcp', eset: Eset) {
  let v: FutasValasz = await agens.kerdez({ szerep: valtozat === 'nyers' ? 'admin' : eset.szerep, keres: eset.keres, agens: valtozat === 'nyers' ? 'nyers' : undefined })
  let jovahagyas = 0
  let nemVart = 0
  for (let i = 0; i < 8 && v.allapot === 'jovahagyasra_var'; i++) {
    const dontesek: Record<string, boolean> = {}
    for (const j of v.jovahagyas) {
      // a nyers eszközöknek nincs eszközszintű jelölése: írni csak az írós feladatban engedett
      const ok = valtozat === 'mcp' ? eset.irasok.includes(j.eszkoz) : eset.irasok.length > 0
      dontesek[j.id] = ok
      if (ok) jovahagyas++
      else nemVart++
    }
    v = await agens.dont({ threadId: v.threadId, dontesek })
  }
  return { v, jovahagyas, nemVart }
}

/** A futás mérőszámai az ágens naplójából. */
export async function meroszamok(futasId: string) {
  const { rows } = await db().query(
    `select f.ido_ms,
            count(*) filter (where l.tipus = 'modell') as modell_hivas,
            count(*) filter (where l.tipus = 'eszkoz') as eszkoz_hivas,
            count(*) filter (where l.tipus = 'eszkoz' and not l.ok) as hibas_eszkoz,
            coalesce(sum(l.token_be), 0) as token_be, coalesce(sum(l.token_ki), 0) as token_ki
       from agens.futas f left join agens.lepes l on l.futas_id = f.id where f.id = $1 group by f.id`,
    [futasId]
  )
  const r = rows[0] ?? {}
  return { ido_ms: r.ido_ms ?? null, modell_hivas: Number(r.modell_hivas ?? 0), eszkoz_hivas: Number(r.eszkoz_hivas ?? 0), hibas_eszkoz: Number(r.hibas_eszkoz ?? 0), token_be: Number(r.token_be ?? 0), token_ki: Number(r.token_ki ?? 0) }
}

async function main() {
  const kezdet = Date.now()
  const { rows: kesz } = await db().query<{ k: string }>(`select feladat || '|' || valtozat || '|' || modell || '|' || ismetles as k from ertekeles.futas where meres = $1`, [MERES])
  const megvan = new Set(kesz.map((r) => r.k))
  const terv: Terv[] = []
  for (const modell of MODELLEK)
    for (let ismetles = 1; ismetles <= ISMETLES; ismetles++)
      for (const valtozat of VALTOZATOK) for (const f of feladatok) if (!megvan.has(`${f.id}|${valtozat}|${modell}|${ismetles}`)) terv.push({ f, valtozat, modell, ismetles })
  console.log(`Mérés „${MERES}”: ${terv.length} futás (${megvan.size} már kész) – ${feladatok.length} feladat × ${VALTOZATOK.join('/')} × ${MODELLEK.join('/')} × ${ISMETLES}`)
  if (!terv.length) return

  const m = await Mcp.nyit()
  const keszlet = new Keszlet(m)
  const k: Kornyezet = { m, keszlet, kozos: new Kozos() }
  const igeny = terv.reduce((s, t) => s + (t.f.kezbesitett ?? 0), 0) + new Set(terv.filter((t) => t.f.kezbesitettEgyszer).map((t) => t.f.id)).size
  if (igeny) {
    console.log(`Előkészítés: ${igeny} kiszállított rendelés…`)
    await keszlet.feltolt(igeny)
  }

  let agens: Agens | null = null
  let aktualis = ''
  try {
    for (const [i, t] of terv.entries()) {
      if (t.modell !== aktualis) {
        await agens?.zar()
        agens = await Agens.nyit({ modell: ollamaModell(t.modell) })
        aktualis = t.modell
      }
      const cimke = `[${i + 1}/${terv.length}] ${t.f.id} ${t.valtozat}/${t.modell} #${t.ismetles}`
      let eset: Eset | null = null
      const sor: Record<string, unknown> = { meres: MERES, feladat: t.f.id, valtozat: t.valtozat, modell: t.modell, ismetles: t.ismetles }
      try {
        eset = await t.f.elokeszit(k)
        sor.keres = eset.keres
        const { v, jovahagyas, nemVart } = await futas(agens!, t.valtozat, eset)
        const ert = v.allapot === 'hiba' ? { eredmeny: 'hiba', megjegyzes: `az ágens hibával állt le: ${v.hiba}` } : await eset.ellenoriz(v.valasz ?? '')
        Object.assign(sor, ert, { valasz: v.valasz, agens_futas: v.futasId, jovahagyas, nem_vart_iras: nemVart, visszakerdezett: v.allapot === 'visszakerdezett' }, await meroszamok(v.futasId))
      } catch (e) {
        Object.assign(sor, { eredmeny: 'hiba', megjegyzes: `előkészítés vagy ellenőrzés: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) })
      } finally {
        await eset?.takarit?.().catch((e) => console.error(`  takarítás: ${e instanceof Error ? e.message : e}`))
      }
      const oszlopok = Object.keys(sor)
      await db().query(`insert into ertekeles.futas (${oszlopok.join(', ')}) values (${oszlopok.map((_, j) => `$${j + 1}`).join(', ')})`, Object.values(sor))
      console.log(`${cimke}: ${sor.eredmeny} – ${sor.megjegyzes ?? ''} (${Math.round(Number(sor.ido_ms ?? 0) / 1000)} s)`)
    }
  } finally {
    await agens?.zar()
    await m.zar()
    await dbZar()
  }
  console.log(`\nKész (${Math.round((Date.now() - kezdet) / 60000)} perc). Riport: npx tsx scripts/ertekeles/riport.ts --meres ${MERES}`)
}

if (process.argv[1]?.endsWith('futtat.ts')) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
