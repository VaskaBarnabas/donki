/**
 * 18. fázis élő teszt (helyi modell, Ollama): a háttérfigyelő elemzése valódi modellel, három jellemző jelzésen –
 *   J1 valódi készlethiány (a teszt saját rendelésével), J4 minimum alatti készlet, J6 lejárt tartozás (ha van).
 * Ellenőrzi: a válasz a háromsoros formában jön (ELEMZÉS / JAVASLAT / KÉRÉS), a helyes rendelésre, cikkre vagy
 * bizonylatra hivatkozik, az elemzés nem hívott író eszközt, és elkészült egy ésszerű időn belül.
 * A jelzéseket nem írja az adatbázisba (a figyelő zárolását sem kéri – futhat a portál mellett).
 *
 * Előfeltétel: npm run stack:up, Ollama a donki-gemma-e4b modellel (AGENS_MODEL a választható)
 * Futtatás: npx tsx scripts/smoke/18-figyelo-elo.ts   (~1–3 perc)
 */
import { randomUUID } from 'node:crypto'
import '../../agens/kozos/kornyezet'
import { elemez } from '../../agens/figyelo/elemzo'
import type { Elemzendo } from '../../agens/figyelo/jelzesek'
import { esemenySzabaly, j4Keszlet, j6Tartozas, type UjJelzes } from '../../agens/figyelo/szabalyok'
import { Agens } from '../../agens/futtato'
import { BEALLITAS } from '../../agens/kozos/kornyezet'
import { McpKapcsolat } from '../../agens/kozos/mcp'
import { db, dbZar } from '../../agens/kozos/naplo'

let failed = 0
let osszes = 0
function check(name: string, ok: boolean, detail: unknown) {
  osszes++
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 600)}`}`)
}

const elemzendo = (j: UjJelzes): Elemzendo => ({ id: 0, szabaly: j.szabaly, cim: j.cim, forras: j.forras, elemzes: j.elemzes, probak: 0 })

async function main() {
  const kezdet = Date.now()
  console.log(`Modell: ${BEALLITAS.modell}`)
  const agens = await Agens.nyit()
  const admin = await McpKapcsolat.nyit('admin', randomUUID(), ['orders', 'sales', 'inventory'])
  const monitor = await McpKapcsolat.nyit('monitor', randomUUID(), ['inventory', 'finance'])
  const olvasok = new Set(monitor.eszkozok.filter((e) => e.kockazat === 'read').map((e) => e.nev).concat(['get_order', 'get_order_timeline', 'list_orders', 'get_quote', 'list_quotes', 'get_ticket', 'list_tickets']))
  const hiv = async (nev: string, args: Record<string, unknown>) => {
    const r = await admin.hiv(nev, args, randomUUID())
    return { ok: r.ok, hibakod: r.hibakod, data: r.ok ? JSON.parse(r.szoveg) : null }
  }
  let rendeles: string | null = null

  async function eset(nev: string, j: UjJelzes, azonosito: string) {
    console.log(`\n${nev}: ${j.cim}`)
    const t0 = Date.now()
    const { eredmeny, futasId, hiba } = await elemez(agens, elemzendo(j))
    const mp = Math.round((Date.now() - t0) / 1000)
    console.log(`     ELEMZÉS: ${eredmeny?.elemzes}\n     JAVASLAT: ${eredmeny?.javaslat}\n     KÉRÉS: ${eredmeny?.ajanlottKeres}`)
    check(`háromsoros válasz (${mp} s)`, !!eredmeny && !!eredmeny.ajanlottKeres && mp < 180, hiba)
    check(`a(z) ${azonosito} azonosítóra hivatkozik`, !!eredmeny && `${eredmeny.elemzes} ${eredmeny.ajanlottKeres}`.includes(azonosito), eredmeny)
    const lepesek = (await db().query<{ eszkoz: string | null; tipus: string }>('select eszkoz, tipus from agens.lepes where futas_id = $1 order by id', [futasId])).rows
    const eszkozok = lepesek.filter((l) => l.tipus === 'eszkoz' || l.tipus === 'jovahagyas').map((l) => l.eszkoz!)
    check(`csak olvasó eszközök: ${eszkozok.join(', ') || '(nem hívott eszközt)'}`, eszkozok.every((e) => olvasok.has(e)) && !lepesek.some((l) => l.tipus === 'jovahagyas'), eszkozok)
  }

  try {
    // J1: a teszt saját, készlethiányos rendelése
    const vevo = (await hiv('search_customers', { query: 'Bakony' })).data.items[0]
    const k = (await hiv('check_stock', { skus: ['TK-00001'] })).data.items[0]
    let q = (await hiv('create_quote', { customerId: vevo.customerId, lines: [{ sku: 'TK-00001', quantity: k.available + 5 }] })).data.quote
    if (q.nextAction?.tool === 'request_quote_approval') {
      await hiv('request_quote_approval', { quoteId: q.quoteId, reason: 'figyelő élő teszt' })
      q = (await hiv('approve_quote', { quoteId: q.quoteId })).data.quote
    }
    rendeles = (await hiv('accept_quote', { quoteId: q.quoteId })).data.orderId
    const jov = await hiv('approve_order', { orderId: rendeles })
    check(`${rendeles}: a jóváhagyás készlethiány miatt meghiúsul (${jov.hibakod})`, jov.hibakod === 'INSUFFICIENT_STOCK', jov)
    const no = Number(rendeles!.replace('RND-', ''))
    const [j1] = esemenySzabaly({ forras: 'orders', msgId: 0, olvasasok: 1, adat: { event: 'ORDER_ACTION_FAILED', state: 'ROGZITETT', action: 'jovahagyas', reason: 'INVENTORY_SHORTAGE', detail: '4717 (hiany: 5 db)', orderNo: no, orderRef: rendeles } }).uj
    await eset('J1 készlethiány', j1, rendeles!)

    const j4 = (await j4Keszlet(monitor)).jelzesek[0]
    if (j4) await eset('J4 minimum alatti készlet', j4, String((j4.forras as { sku: string }).sku))
    else console.log('\n(J4: most nincs minimum alatti termék – kihagyva)')

    const j6 = (await j6Tartozas(monitor)).jelzesek[0]
    if (j6) await eset('J6 lejárt tartozás', j6, String((j6.forras as { documentNo: string }).documentNo))
    else console.log('\n(J6: most nincs lejárt tartozás – kihagyva)')
  } finally {
    if (rendeles) await hiv('cancel_order', { orderId: rendeles, reason: 'figyelő élő teszt' }).catch(() => null)
    await admin.zar()
    await monitor.zar()
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
