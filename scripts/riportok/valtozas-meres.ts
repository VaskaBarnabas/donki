/**
 * 20. fázis, változástűrés-mérés: mi történik, ha egy legacy rendszer interfésze megváltozik?
 *   V1 HTTP-homlokzat: mező-átnevezés (carrier_status → delivery_state)  – F09
 *   V2 üzenetsor:      mező-átnevezés (szabad → elerheto)                – F04
 *   V3 JSON-RPC:       metódus-átnevezés (quote.accept/approve → …)      – F06, F07
 * Változatonként három állapot, MCP és nyers ágenssel, a 12b modellel (a nyers e4b-nek eleve 9% az alapja), háromszor:
 *   S0 nincs változás · S1 a változás megtörtént, senki nem frissített semmit · S2 javítva
 * A javítás: MCP-nél valódi kódmódosítás az adapterben és újraépítés; a nyers ágensnél a legacy-docs frissítése.
 * A szimuláció: scripts/riportok/valtozas/mutacio.cjs. A forrásfájlokat a futás végén visszaállítja.
 *
 * Futtatás: VALTOZAS_JELZO=$PWD/scripts/riportok/valtozas/aktiv NODE_OPTIONS="--require $PWD/scripts/riportok/valtozas/mutacio.cjs" \
 *           AGENS_FIGYELO=ki npx tsx scripts/riportok/valtozas-meres.ts [--csak V1:S1:mcp] [--utotag -javitott] [--build]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Agens } from '../../agens/futtato'
import { ollamaModell } from '../../agens/kozos/modell'
import { db, dbZar } from '../../agens/kozos/naplo'
import { futas, meroszamok } from '../ertekeles/futtat'
import { FELADATOK, type Eset, type Kornyezet } from '../ertekeles/feladatok'
import { Keszlet, Kozos, Mcp } from '../ertekeles/kozos'

const JELZO = 'scripts/riportok/valtozas/aktiv'
const MODELL = 'donki-gemma'
const ISMETLES = 3
const jelez = (v: string) => writeFileSync(JELZO, v)
type Csere = { fajl: string; regi: string; uj: string }
type Valtozas = { id: string; cim: string; feladatok: string[]; mcp: Csere[]; docs: Csere[] }

const VALTOZASOK: Valtozas[] = [
  {
    id: 'V1',
    cim: 'HTTP-homlokzat: mező-átnevezés',
    feladatok: ['F09'],
    mcp: [
      { fajl: 'mcp/servers/orders/adapter.ts', regi: 'carrier_status: string; eta', uj: 'carrier_status?: string; delivery_state?: string; eta' },
      { fajl: 'mcp/servers/orders/lekepezes.ts', regi: 'SZALLITAS[sz.carrier_status]?.status', uj: 'SZALLITAS[sz.delivery_state ?? sz.carrier_status ?? \'\']?.status' },
      { fajl: 'mcp/servers/orders/lekepezes.ts', regi: 'SZALLITAS[sz.carrier_status]?.label', uj: 'SZALLITAS[sz.delivery_state ?? sz.carrier_status ?? \'\']?.label' },
    ],
    docs: [{ fajl: 'legacy-docs/orders.md', regi: 'carrier_status', uj: 'delivery_state' }],
  },
  {
    id: 'V2',
    cim: 'Üzenetsor: mező-átnevezés',
    feladatok: ['F04'],
    mcp: [{ fajl: 'mcp/servers/inventory/adapter.ts', regi: 'return sajat.message', uj: `return JSON.parse(JSON.stringify(sajat.message).replaceAll('"elerheto":', '"szabad":')) as RaktarValasz` }],
    docs: [{ fajl: 'legacy-docs/raktar.md', regi: '"szabad":', uj: '"elerheto":' }],
  },
  {
    id: 'V3',
    cim: 'JSON-RPC: metódus-átnevezés',
    feladatok: ['F06', 'F07'],
    mcp: [
      { fajl: 'mcp/servers/sales/index.ts', regi: "hivas('quote.approve'", uj: "hivas('quote.authorize'" },
      { fajl: 'mcp/servers/sales/index.ts', regi: "'quote.accept'", uj: "'quote.order'" },
    ],
    docs: [
      { fajl: 'legacy-docs/ajanlat-jsonrpc.md', regi: 'quote.accept', uj: 'quote.order' },
      { fajl: 'legacy-docs/ajanlat-jsonrpc.md', regi: 'quote.approve', uj: 'quote.authorize' },
    ],
  },
]

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : d
}
/** részmérés, pl. --csak V1:S1:mcp --utotag -javitott --build (a 20. fázis hibajavításának igazolása) */
const CSAK = arg('csak').split(':')
const UTOTAG = arg('utotag')
const kell = (v: string, a: string, x?: string) => !CSAK[0] || (CSAK[0] === v && (!CSAK[1] || CSAK[1] === a) && (!CSAK[2] || x === undefined || CSAK[2] === x))

const COMPOSE = ['compose', '--env-file', '.env.local', '--env-file', '.env.stack']
const MERES = [...COMPOSE, '-f', 'docker-compose.yml', '-f', 'scripts/riportok/valtozas/compose.yml']
const MCPK = ['mcp-orders', 'mcp-sales', 'mcp-inventory', 'mcp-finance', 'mcp-support']
const dc = (a: string[]) => execFileSync('docker', a, { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '' }, maxBuffer: 1 << 26 })
const var_ = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function mcpEpit(build: boolean, meres = true) {
  dc([...(meres ? MERES : COMPOSE), 'up', '-d', ...(build ? ['--build'] : []), ...MCPK])
  await var_(6000)
}

function alkalmaz(cserek: Csere[], eredeti: Map<string, string>) {
  for (const c of cserek) {
    const s = readFileSync(c.fajl, 'utf8')
    if (!eredeti.has(c.fajl)) eredeti.set(c.fajl, s)
    if (!s.includes(c.regi)) throw new Error(`nincs meg: ${c.regi} (${c.fajl})`)
    writeFileSync(c.fajl, s.replaceAll(c.regi, c.uj))
  }
}
const visszaallit = (e: Map<string, string>) => {
  for (const [f, s] of e) writeFileSync(f, s)
  e.clear()
}

async function main() {
  const kezdet = Date.now()
  const eredeti = new Map<string, string>()
  jelez('')
  mkdirSync('riportok/05-osszehasonlitasok/adatok', { recursive: true })
  await mcpEpit(process.argv.includes('--build'))
  let m = await Mcp.nyit()
  const agens = await Agens.nyit({ modell: ollamaModell(MODELL) })
  const k = (): Kornyezet => ({ m, keszlet: new Keszlet(m), kozos: new Kozos() })
  const log = (s: string) => console.log(`[${Math.round((Date.now() - kezdet) / 60000)} p] ${s}`)
  try {
    for (const v of VALTOZASOK) {
      for (const allapot of ['S0', 'S1', 'S2'] as const) {
        if (allapot === 'S2') {
          alkalmaz([...v.mcp, ...v.docs], eredeti)
          await m.zar()
          await mcpEpit(true)
          m = await Mcp.nyit()
        }
        if (!kell(v.id, allapot)) continue
        const meres = `valtozas-${v.id}-${allapot}${UTOTAG}`
        for (const fid of v.feladatok) {
          const f = FELADATOK.find((x) => x.id === fid)!
          for (const valtozat of ['mcp', 'nyers'] as const) {
            if (!kell(v.id, allapot, valtozat)) continue
            for (let ismetles = 1; ismetles <= ISMETLES; ismetles++) {
              const { rows } = await db().query('select 1 from ertekeles.futas where meres=$1 and feladat=$2 and valtozat=$3 and modell=$4 and ismetles=$5', [meres, fid, valtozat, MODELL, ismetles])
              if (rows.length) continue
              const sor: Record<string, unknown> = { meres, feladat: fid, valtozat, modell: MODELL, ismetles }
              let eset: Eset | null = null
              try {
                jelez('')
                eset = await f.elokeszit(k())
                sor.keres = eset.keres
                jelez(allapot === 'S0' ? '' : v.id)
                const { v: val, jovahagyas, nemVart } = await futas(agens, valtozat, eset)
                jelez('')
                const ert = val.allapot === 'hiba' ? { eredmeny: 'hiba', megjegyzes: `az ágens hibával állt le: ${val.hiba}` } : await eset.ellenoriz(val.valasz ?? '')
                Object.assign(sor, ert, { valasz: val.valasz, agens_futas: val.futasId, jovahagyas, nem_vart_iras: nemVart, visszakerdezett: val.allapot === 'visszakerdezett' }, await meroszamok(val.futasId))
              } catch (e) {
                Object.assign(sor, { eredmeny: 'hiba', megjegyzes: `előkészítés vagy ellenőrzés: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) })
              } finally {
                jelez('')
                await eset?.takarit?.().catch((e) => console.error(`takarítás: ${e}`))
              }
              const o = Object.keys(sor)
              await db().query(`insert into ertekeles.futas (${o.join(', ')}) values (${o.map((_, j) => `$${j + 1}`).join(', ')})`, Object.values(sor))
              log(`${meres} ${fid} ${valtozat} #${ismetles}: ${sor.eredmeny} – ${sor.megjegyzes ?? ''}`)
            }
          }
        }
      }
      visszaallit(eredeti)
      await m.zar()
      await mcpEpit(true)
      m = await Mcp.nyit()
    }
  } finally {
    jelez('')
    visszaallit(eredeti)
    await m.zar().catch(() => null)
    await agens.zar()
    await mcpEpit(true, false) // a méréses beállítások nélkül, az eredeti kóddal
    await dbZar()
  }
  log('kész')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
