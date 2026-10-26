/**
 * 17. fázis élő teszt: az ágens a helyi modellel (Ollama, donki-gemma), valódi rendszereken. A modell válasza
 * futásonként eltérhet, ezért minden feladat többször fut, és az eredmény sikerességi arány (nem OK/HIBA).
 * A teszt a lekérdezett adatot maga hozza létre az MCP-n át (saját rendelés, saját kiszállított rendelés);
 * törzsadatként csak a CRM vevőit és termékeit használja. Az író lépéseket automatikusan hagyja jóvá.
 *
 *   1. „Hol tart az RND-…?” (saját, rögzített rendelés) → a get_order lefut, a válasz a helyes állapotot mondja
 *   2. „A Bakony Gépgyártó 12 db TK-00010 monitort kér, mennyi?” → create_quote, a válaszban az ajánlat nettója
 *   3. ugyanez elfogadással → accept_quote, létrejön a rendelés (az elfogadási feltétel)
 *   4. „… elromlott, van még garancia?” (saját, kiszállított rendelés) → check_warranty, helyes eredmény
 *
 * Előfeltétel: npm run stack:up, Ollama (ollama create donki-gemma-e4b -f agens/Modelfile.e4b; a 12b: donki-gemma)
 * Futtatás: npx tsx scripts/smoke/17-agens-elo.ts [--ismetles 3] [--modell donki-gemma-e4b] [--kuszob 2]   (~10 perc)
 */
import { execFileSync } from 'node:child_process'
import '../../agens/kozos/kornyezet'
import { Agens } from '../../agens/futtato'
import type { Szerep } from '../../agens/kozos/kornyezet'
import { McpKapcsolat } from '../../agens/kozos/mcp'
import { ollamaModell } from '../../agens/kozos/modell'
import { db, dbZar } from '../../agens/kozos/naplo'
import { adat } from './rendszerek'

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : d
}
const ISMETLES = Number(arg('ismetles', '3'))
const MODELL = arg('modell', 'donki-gemma-e4b')
const KUSZOB = Number(arg('kuszob', String(Math.ceil((ISMETLES * 2) / 3))))

const var_ = (ms: number) => new Promise((r) => setTimeout(r, ms))

function mcpHivasok(futasId: string): { tool: string; ok: boolean; input: Record<string, unknown> }[] {
  const ki = execFileSync('docker', ['exec', 'donki-mcp-db-1', 'psql', '-U', 'postgres', '-At', '-c', `select coalesce(json_agg(json_build_object('tool', tool, 'ok', ok, 'input', input_summary) order by id), '[]') from mcp.tool_calls where agent_run_id = '${futasId}'`], { encoding: 'utf8' })
  return JSON.parse(ki.trim())
}

/** Közvetlen MCP-hívás a teszt előkészítéséhez (nem az ágens): a szerepkör tokenjével. */
async function mcp<T = Record<string, unknown>>(szerep: Szerep, szerver: 'sales' | 'orders' | 'support', eszkoz: string, args: Record<string, unknown>): Promise<T> {
  const k = await McpKapcsolat.nyit(szerep, crypto.randomUUID(), [szerver])
  try {
    const r = await k.hiv(eszkoz, args, crypto.randomUUID())
    if (!r.ok) throw new Error(`${eszkoz}: ${r.szoveg}`)
    return JSON.parse(r.szoveg) as T
  } finally {
    await k.zar()
  }
}

const ft = (s: string) => Math.round(Number(s)).toLocaleString('hu-HU').replace(/\s/g, ' ')
/** A válaszban szereplő összeg (ezres tagolással, szóközzel vagy ponttal) a vártra illeszkedik-e. */
const osszegbenVan = (szoveg: string, osszeg: string) => {
  const n = String(Math.round(Number(osszeg)))
  return szoveg.replace(/[\s.  ]/g, '').includes(n) || szoveg.includes(ft(osszeg))
}

async function main() {
  console.log(`17. fázis – élő ágens-teszt (${MODELL}, ${ISMETLES}× feladatonként, küszöb: ${KUSZOB}/${ISMETLES})`)
  const kezdet = Date.now()

  // ------------------------------------------------------------ előkészítés (MCP-n át, nem az ágens)
  const bakony = (await mcp<{ items: { customerId: string; name: string }[] }>('sales', 'sales', 'search_customers', { query: 'Bakony' })).items[0]
  const kovetkezoAllapot = async (orderId: string) => (await mcp<{ order: { status: string; statusLabel: string } }>('viewer', 'orders', 'get_order', { orderId })).order
  // 1) saját, rögzített rendelés
  const q1 = (await mcp<{ quote: { quoteId: string } }>('sales', 'sales', 'create_quote', { customerId: bakony.customerId, lines: [{ sku: 'TK-00001', quantity: 1 }] })).quote
  const rogzitett = (await mcp<{ quote: { orderId: string } }>('sales', 'sales', 'accept_quote', { quoteId: q1.quoteId })).quote.orderId
  // 2) saját, kiszállított rendelés (a garanciához): jóváhagyás → kiszállítás → a fuvarozó kézbesít
  const q2 = (await mcp<{ quote: { quoteId: string } }>('sales', 'sales', 'create_quote', { customerId: bakony.customerId, lines: [{ sku: 'TK-00001', quantity: 1 }] })).quote
  const kiszallitott = (await mcp<{ quote: { orderId: string } }>('sales', 'sales', 'accept_quote', { quoteId: q2.quoteId })).quote.orderId
  await mcp('sales_manager', 'orders', 'approve_order', { orderId: kiszallitott })
  await mcp('logistics', 'orders', 'start_fulfillment', { orderId: kiszallitott })
  await adat().schema('orders').from('shipments').update({ carrier_status: 'KEZBESITVE' }).eq('order_no', Number(kiszallitott.slice(4)))
  for (let i = 0; i < 40 && (await kovetkezoAllapot(kiszallitott)).status !== 'delivered'; i++) await var_(5000)
  const garancia = (await mcp<{ warranty: { valid: boolean; reason: string } }>('sales', 'support', 'check_warranty', { orderId: kiszallitott, sku: 'TK-00001' })).warranty
  const allapot1 = await kovetkezoAllapot(rogzitett)
  console.log(`előkészítve: ${rogzitett} (${allapot1.statusLabel}), ${kiszallitott} (${(await kovetkezoAllapot(kiszallitott)).statusLabel}, garancia: ${garancia.reason})\n`)

  type Feladat = { nev: string; szerep: Szerep; keres: string; ellenoriz: (futasId: string, valasz: string) => Promise<string | null> }
  const FELADATOK: Feladat[] = [
    {
      nev: 'rendelés állapota',
      szerep: 'viewer',
      keres: `Hol tart az ${rogzitett} rendelés?`,
      ellenoriz: async (f, v) => {
        if (!mcpHivasok(f).some((h) => h.tool === 'get_order' && JSON.stringify(h.input).includes(rogzitett))) return 'nem hívta a get_order-t'
        return /jóváhagy|rögzít/i.test(v) ? null : `a válasz nem mondja az állapotot (${allapot1.statusLabel})`
      },
    },
    {
      nev: 'ajánlat ára',
      szerep: 'sales',
      keres: 'A Bakony Gépgyártó 12 darab TK-00010-es monitort kér. Mennyi lenne?',
      ellenoriz: async (f, v) => {
        const h = mcpHivasok(f).find((x) => x.tool === 'create_quote' && x.ok)
        if (!h) return 'nem készített ajánlatot'
        const aj = /AJ-\d{4}-\d{4}/.exec(v)?.[0]
        if (!aj) return 'a válaszban nincs ajánlatszám'
        const q = (await mcp<{ quote: { totalNet: { amount: string }; lines: { sku: string; quantity: number }[]; customer: { customerId: string } } }>('sales', 'sales', 'get_quote', { quoteId: aj })).quote
        if (q.customer.customerId !== bakony.customerId || q.lines[0]?.sku !== 'TK-00010' || q.lines[0]?.quantity !== 12) return `rossz ajánlat: ${JSON.stringify(q.lines)}`
        return osszegbenVan(v, q.totalNet.amount) ? null : `a válasz nem az ajánlat nettóját mondja (${ft(q.totalNet.amount)} Ft)`
      },
    },
    {
      nev: 'rendelésleadás',
      szerep: 'sales',
      keres: 'A Bakony Gépgyártó 3 darab TK-00010-es monitort rendel. Készíts ajánlatot, és vedd is fel a rendelést.',
      ellenoriz: async (f, v) => {
        const h = mcpHivasok(f)
        if (!h.some((x) => x.tool === 'create_quote' && x.ok)) return 'nem készített ajánlatot'
        if (!h.some((x) => x.tool === 'accept_quote' && x.ok)) return 'nem fogadta el az ajánlatot'
        const rnd = /RND-\d+/.exec(v)?.[0]
        if (!rnd) return 'a válaszban nincs rendelésszám'
        const o = await kovetkezoAllapot(rnd)
        return o.status === 'received' ? null : `a rendelés állapota: ${o.status}`
      },
    },
    {
      nev: 'garancia',
      szerep: 'sales',
      keres: `Az ${kiszallitott} rendelésben vett TK-00001-es nyomtató elromlott. Van még rá garancia?`,
      ellenoriz: async (f, v) => {
        if (!mcpHivasok(f).some((x) => x.tool === 'check_warranty' && x.ok)) return 'nem ellenőrizte a garanciát'
        const igen = /van (még )?(rá )?garancia|érvényes|garanciális/i.test(v) && !/nincs (már )?garancia|lejárt/i.test(v)
        return igen === garancia.valid ? null : `a válasz nem egyezik (${garancia.reason})`
      },
    },
  ]

  const agens = await Agens.nyit({ modell: ollamaModell(MODELL) })
  const eredmenyek: { feladat: string; ok: boolean; ido: number; token: number; ok_: string | null }[] = []
  try {
    for (const f of FELADATOK) {
      for (let n = 1; n <= ISMETLES; n++) {
        const t = Date.now()
        let v = await agens.kerdez({ szerep: f.szerep, keres: f.keres })
        while (v.allapot === 'jovahagyasra_var') v = await agens.dont({ threadId: v.threadId, dontesek: Object.fromEntries(v.jovahagyas.map((j) => [j.id, true])) })
        const ido = Date.now() - t
        const hiba = v.allapot === 'hiba' ? `hiba: ${v.hiba}` : await f.ellenoriz(v.futasId, v.valasz ?? '')
        const { rows } = await db().query<{ t: number }>('select coalesce(sum(token_be + token_ki), 0)::int as t from agens.lepes where futas_id = $1', [v.futasId])
        eredmenyek.push({ feladat: f.nev, ok: !hiba, ido, token: rows[0].t, ok_: hiba })
        console.log(`${hiba ? 'HIBA' : 'OK  '} ${f.nev} #${n}: ${(ido / 1000).toFixed(1)} s, ${rows[0].t} token${hiba ? ` – ${hiba}` : ''}\n     „${(v.valasz ?? '').replace(/\s+/g, ' ').slice(0, 220)}”`)
      }
    }
  } finally {
    await agens.zar()
    await dbZar()
  }

  console.log('\nfeladat            | siker | átl. idő | átl. token')
  let bukott = 0
  for (const f of FELADATOK) {
    const s = eredmenyek.filter((e) => e.feladat === f.nev)
    const db_ = s.filter((e) => e.ok).length
    if (db_ < KUSZOB) bukott++
    console.log(`${f.nev.padEnd(18)} | ${`${db_}/${s.length}`.padEnd(5)} | ${(s.reduce((a, e) => a + e.ido, 0) / s.length / 1000).toFixed(1).padStart(6)} s | ${Math.round(s.reduce((a, e) => a + e.token, 0) / s.length)}`)
  }
  console.log(`\n${bukott ? `${bukott} feladat a küszöb (${KUSZOB}/${ISMETLES}) alatt.` : `Minden feladat elérte a küszöböt (${KUSZOB}/${ISMETLES}).`} (${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  process.exit(bukott ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
