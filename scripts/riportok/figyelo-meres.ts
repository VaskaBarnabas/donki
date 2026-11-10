/**
 * 20. fázis, „a háttérfigyelő haszna” mérés: valós ütemezéssel (események 15 mp, időzített szabályok 10 perc, elemzés
 * 10 mp, helyi modellel) futtatja a figyelőt, közben szándékosan elrontott helyzeteket hoz létre a J1–J9 szabályokra és
 * normál (hibátlan) rendeléseket is. Méri: észlelési idő, kihagyott eset, téves riasztás, az elemzés ideje és tartalma,
 * a magától lezárás a probléma megszűnése után.
 *
 * Előfeltétel: npm run stack:up, Ollama; a portál ne fusson (ugyanazt a zárolást kéri). Kb. 50 perc.
 * Futtatás: caffeinate -dims npx tsx scripts/riportok/figyelo-meres.ts [--csak-j9]   → riportok/05-osszehasonlitasok/adatok/figyelo-meres[-j9].json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import '../../agens/kozos/kornyezet'
import { Figyelo, zarolas } from '../../agens/figyelo/figyelo'
import { Agens } from '../../agens/futtato'
import { FIGYELO } from '../../agens/kozos/kornyezet'
import { db, dbZar } from '../../agens/kozos/naplo'
import { bakony, Mcp, rendeles, MONITOR, TERMEK } from '../ertekeles/kozos'
import { lejartSzamla, maPont, szamlazo, tesztVevo, ujDijbekero } from '../smoke/bizonylatok'
import { psqlFuttat } from '../smoke/rendszerek'

const CSAK_J9 = process.argv.includes('--csak-j9')
const KI = `riportok/05-osszehasonlitasok/adatok/figyelo-meres${CSAK_J9 ? '-j9' : ''}.json`
const ZARAS_PERC = CSAK_J9 ? 11 : 31.5
const VEG_PERC = CSAK_J9 ? 21.5 : 42
const var_ = (ms: number) => new Promise((r) => setTimeout(r, ms))
const PERC = 60_000
const no = (orderId: string) => orderId.replace('RND-', '')

type Beoltas = { szabaly: string; kulcs: string; like: boolean; t0: number; szintetikus: boolean; rendeles?: string; sku?: string; visszatolt?: number; bizonylat?: string; ajanlat?: string; jegy?: string; javitas?: number }

async function kuld(forras: keyof typeof FIGYELO.sorok, message: Record<string, unknown>) {
  const s = FIGYELO.sorok[forras]
  const r = await fetch(`${s.url}/rpc/send`, { method: 'POST', headers: { Authorization: `Bearer ${s.kulcs()}`, 'Content-Profile': 'pgmq_public', 'Content-Type': 'application/json' }, body: JSON.stringify({ queue_name: s.sor, message, sleep_seconds: 0 }) })
  if (!r.ok) throw new Error(`send ${forras}: ${r.status}`)
}

async function main() {
  const kezdet = Date.now()
  const zar = await zarolas()
  if (!zar) throw new Error('A figyelőt más folyamat futtatja (portál?).')
  const agens = await Agens.nyit()
  const figyelo = new Figyelo(agens)
  const m = await Mcp.nyit()
  const vevo = await tesztVevo('Mérés Figyelő Kft')
  const v = await bakony(m)
  const hibak: string[] = []
  const log = (s: string) => console.log(`[${Math.round((Date.now() - kezdet) / 1000)} s] ${s}`)

  // ---- bemelegítés: a korábbi események és jelzések feldolgozása, hogy a mérésbe ne számítson bele a régi torlódás
  log('bemelegítés')
  for (let i = 0; i < 12; i++) if ((await figyelo.esemenyKor()).esemeny === 0) break
  await figyelo.idozitettKor()
  for (let i = 0; i < 80 && (await figyelo.elemzesKor({ korlat: false })); i++);
  const { rows: el } = await db().query<{ m: string }>('select coalesce(max(id), 0) as m from agens.jelzes')
  const startId = Number(el[0].m)
  const { rows: nyitva } = await db().query<{ kulcs: string }>(`select kulcs from agens.jelzes where allapot in ('UJ','NYITOTT','FOLYAMATBAN')`)
  const nyitvaKezdetkor = new Set(nyitva.map((r) => r.kulcs))
  log(`bemelegítés kész, ${nyitva.length} nyitott jelzés, utolsó id ${startId}`)

  // ---- a figyelő a valós ütemezésével
  const T0 = Date.now()
  const idozitettKorok: number[] = []
  let leall = false
  const ciklus = async (ms: number, elso: number, f: () => Promise<unknown>) => {
    await var_(elso)
    while (!leall) {
      const k = Date.now()
      await f().catch((e) => hibak.push(String(e)))
      await var_(Math.max(0, ms - (Date.now() - k)))
    }
  }
  const futok = [
    ciklus(FIGYELO.esemenyMs, 5_000, async () => {
      const r = await figyelo.esemenyKor()
      hibak.push(...r.hibak)
    }),
    ciklus(FIGYELO.idozitettMs, 30_000, async () => {
      idozitettKorok.push(Date.now() - T0)
      const r = await figyelo.idozitettKor()
      hibak.push(...r.hibak)
    }),
    ciklus(10_000, 15_000, () => figyelo.elemzesKor()),
  ]

  // ---- a helyzetek
  const beoltasok: Beoltas[] = []
  const ajanlatok: Beoltas[] = []
  const biztos = (nev: string, f: () => Promise<void>) => () => f().catch((e) => { hibak.push(`${nev}: ${e instanceof Error ? e.message : e}`); log(`HIBA ${nev}: ${e}`) })
  const j1 = biztos('J1', async () => {
    const szabad = (await m.hiv('check_stock', { skus: [TERMEK] })).items[0].available as number
    const orderId = await rendeles(m, { db: szabad + 5, allapot: 'received' })
    const r = await m.probal('approve_order', { orderId })
    if (r.ok) throw new Error('a jóváhagyás nem hiúsult meg')
    beoltasok.push({ szabaly: 'J1', kulcs: `rendeles:${no(orderId)}:keszlethiany`, like: false, t0: Date.now(), szintetikus: false, rendeles: orderId })
  })
  const j2 = biztos('J2', async () => {
    const orderId = await rendeles(m, { sku: 'TK-00012', allapot: 'received' }) // nincs raktári kódja: a jóváhagyás nem készlethiány miatt bukik
    await m.probal('approve_order', { orderId })
    beoltasok.push({ szabaly: 'J2', kulcs: `rendeles:${no(orderId)}:%`, like: true, t0: Date.now(), szintetikus: false, rendeles: orderId })
  })
  const j3 = biztos('J3', async () => {
    const orderId = await rendeles(m, { allapot: 'in_fulfillment' })
    await kuld('orders', { event: 'SHIPMENT_DELAYED', carrier: 'GLS', trackingNo: 'MERES1', eta: '2099-01-02', orderNo: Number(no(orderId)), orderRef: orderId, ts: new Date().toISOString() })
    beoltasok.push({ szabaly: 'J3', kulcs: `szallitas:${no(orderId)}`, like: false, t0: Date.now(), szintetikus: true, rendeles: orderId })
  })
  const keszletJelolt = ['TK-00002', 'TK-00003', 'TK-00004', 'TK-00005', 'TK-00006', 'TK-00007', 'TK-00008', 'TK-00009']
  const j4 = biztos('J4', async () => {
    for (const sku of keszletJelolt.filter((s) => !beoltasok.some((b) => b.sku === s))) {
      const t = (await m.hiv('check_stock', { skus: [sku] })).items[0]
      if (t.belowMinimum || !t.minimum || t.available === null) continue
      const el = -(t.available - Math.max(0, t.minimum - 1))
      if (el >= 0) continue
      await m.hiv('adjust_stock', { sku, type: 'correction', quantity: el, reason: 'mérés: figyelő' })
      beoltasok.push({ szabaly: 'J4', kulcs: `keszlet:${sku}`, like: false, t0: Date.now(), szintetikus: false, sku, visszatolt: -el })
      return
    }
    throw new Error('nincs alkalmas termék')
  })
  const j5 = biztos('J5', async () => {
    const ref = (await ujDijbekero(vevo)).szam
    await kuld('payments', { paymentId: randomUUID(), invoiceRef: ref, amountMinor: 127000, currency: 'HUF', stripeEventId: 'evt_meres', failureMessage: 'kártya elutasítva (mérés)', occurredAt: new Date().toISOString(), type: 'payment.failed' })
    beoltasok.push({ szabaly: 'J5', kulcs: `fizetes:${ref}`, like: false, t0: Date.now(), szintetikus: true, bizonylat: ref })
  })
  const j6 = biztos('J6', async () => {
    const szam = (await lejartSzamla(vevo, 10)).szam
    beoltasok.push({ szabaly: 'J6', kulcs: `tartozas:${szam}`, like: false, t0: Date.now(), szintetikus: false, bizonylat: szam })
  })
  const j8 = biztos('J8', async () => {
    const orderId = await rendeles(m, { allapot: 'approved' })
    psqlFuttat('orders', `update orders.orders set updated_at = now() - interval '6 days' where order_no = ${no(orderId)}`)
    beoltasok.push({ szabaly: 'J8', kulcs: `elakadt:${no(orderId)}`, like: false, t0: Date.now(), szintetikus: false, rendeles: orderId })
  })
  const j9 = biztos('J9', async () => {
    const t = (await m.hiv('create_ticket', { customerId: v.customerId, description: 'Mérés: régóta nyitott hibajegy.' })).ticket
    psqlFuttat('support', `update support.tickets set updated_at = now() - interval '9 days' where id = '${t.ticketId}'`)
    beoltasok.push({ szabaly: 'J9', kulcs: `hibajegy:${t.ticketId}`, like: false, t0: Date.now(), szintetikus: false, jegy: t.ticketId })
  })
  const j7Elo = biztos('J7 előkészítés', async () => {
    const q = (await m.hiv('create_quote', { customerId: v.customerId, lines: [{ sku: MONITOR, quantity: 5, discountPct: 20 }] })).quote
    await m.hiv('request_quote_approval', { quoteId: q.quoteId, reason: 'mérés: figyelő' })
    ajanlatok.push({ szabaly: 'J7', kulcs: `ajanlat:${q.quoteId}`, like: false, t0: 0, szintetikus: false, ajanlat: q.quoteId })
  })
  let j7Index = 0
  const j7 = biztos('J7', async () => {
    const b = ajanlatok[j7Index++]
    if (!b) throw new Error('nincs ajánlat')
    await db().query(`update agens.megfigyeles set elso = now() - interval '5 hours' where kulcs = $1`, [b.kulcs])
    b.t0 = Date.now()
    beoltasok.push(b)
  })

  const kontroll: string[] = []
  const egeszseges = biztos('kontroll', async () => {
    kontroll.push(await rendeles(m, { allapot: 'in_fulfillment' }))
  })

  // ütemterv percben a figyelő indulásától: a szabályonkénti esetek szétszórva az időzített körök között
  const terv: [number, () => Promise<void>, string][] = [
    [0.2, j7Elo, 'J7 ajánlat'], [0.3, j7Elo, 'J7 ajánlat'], [0.4, j7Elo, 'J7 ajánlat'],
    [1, j1, 'J1'], [2, j3, 'J3'], [3, j5, 'J5'], [4, j2, 'J2'], [4.5, j6, 'J6'], [5, j4, 'J4'],
    [6, j8, 'J8'], [7, j9, 'J9'], [7.5, j1, 'J1'], [8, j3, 'J3'], [9, j5, 'J5'],
    [10.8, j6, 'J6'], [11.5, j2, 'J2'], [12, j7, 'J7'], [12.5, j8, 'J8'], [13, j4, 'J4'],
    [13.5, j9, 'J9'], [14, j1, 'J1'], [15, j3, 'J3'], [15.5, j7, 'J7'], [16, j5, 'J5'], [16.5, j6, 'J6'],
    [17, j8, 'J8'], [17.5, j9, 'J9'], [18, j2, 'J2'], [18.5, j7, 'J7'], [19, j4, 'J4'],
    [19.5, j1, 'J1'], [20, j3, 'J3'], [21, j5, 'J5'], [21.5, j6, 'J6'], [22, j8, 'J8'], [22.5, j9, 'J9'],
  ]
  for (const p of [1.5, 5.5, 9.5, 11, 14.5, 18.2, 20.5, 23]) terv.push([p, egeszseges, 'kontroll'])
  terv.sort((a, b) => a[0] - b[0])
  if (CSAK_J9) terv.splice(0, terv.length, [1, j9, 'J9'], [3.5, j9, 'J9'], [6, j9, 'J9'], [8.5, j9, 'J9'])
  for (const [perc, f, nev] of terv) {
    await var_(Math.max(0, T0 + perc * PERC - Date.now()))
    await f()
    log(`${nev} kész (${beoltasok.length} eset)`)
  }

  // ---- a 3. időzített kör utánig várunk, hogy minden eset észlelhető legyen; utána a problémák megszüntetése
  await var_(Math.max(0, T0 + ZARAS_PERC * PERC - Date.now()))
  log('a problémák megszüntetése')
  for (const b of beoltasok) {
    const r = await (async () => {
      if (b.rendeles) return m.probal('cancel_order', { orderId: b.rendeles, reason: 'mérés: vége' })
      if (b.sku) return m.probal('adjust_stock', { sku: b.sku, type: 'correction', quantity: b.visszatolt, reason: 'mérés: visszatöltés' })
      if (b.bizonylat) return { ok: /^OK/.test(await szamlazo(`SZAMLA|FIZETVE|${b.bizonylat}|${maPont()}`)), szoveg: 'fizetve' }
      if (b.ajanlat) return m.probal('approve_quote', { quoteId: b.ajanlat })
      if (b.jegy) return m.probal('update_ticket_status', { ticketId: b.jegy, status: 'closed' })
      return { ok: false, szoveg: 'ismeretlen' }
    })()
    b.javitas = Date.now()
    if (!r.ok) hibak.push(`megszüntetés ${b.kulcs}: ${r.szoveg?.slice(0, 200)}`)
  }
  for (const o of kontroll) await m.probal('cancel_order', { orderId: o, reason: 'mérés: vége' })

  // a következő időzített kör után zárunk (a J5–J9 lezárása azon múlik)
  await var_(Math.max(0, T0 + VEG_PERC * PERC - Date.now()))
  for (let i = 0; i < 30 && (await figyelo.elemzesKor({ korlat: false })); i++);
  leall = true
  await Promise.race([Promise.all(futok), var_(30_000)])

  // ---- kiértékelés
  const { rows: uj } = await db().query<{ id: number; kulcs: string; szabaly: string; sulyossag: string; allapot: string; letrejott: Date; lezarva: Date | null; lezarta: string | null; lezaras_oka: string | null; elemzes: string; javaslat: string; ajanlott_keres: string | null; elemzes_modell: boolean; elemzes_probak: number; forras: unknown; cim: string; vege: Date | null; ido_ms: number | null; eszlelesek: number }>(
    `select j.id, j.kulcs, j.szabaly, j.sulyossag, j.allapot, j.letrejott, j.lezarva, j.lezarta, j.lezaras_oka, j.elemzes, j.javaslat, j.ajanlott_keres, j.elemzes_modell, j.elemzes_probak, j.forras, j.cim, j.eszlelesek, f.vege, f.ido_ms
       from agens.jelzes j left join agens.futas f on f.id = j.futas_id where j.id > $1 order by j.id`,
    [startId]
  )
  const illik = (b: Beoltas, kulcs: string) => (b.like ? kulcs.startsWith(b.kulcs.slice(0, -1)) : kulcs === b.kulcs)
  const esetek = beoltasok.map((b) => {
    const j = uj.find((x) => illik(b, x.kulcs))
    return { ...b, t0: new Date(b.t0).toISOString(), javitas: b.javitas ? new Date(b.javitas).toISOString() : null, eszlelve: !!j, eszlelesMp: j ? (j.letrejott.getTime() - b.t0) / 1000 : null, jelzes: j ?? null, elemzesKeszMp: j?.vege ? (j.vege.getTime() - b.t0) / 1000 : null, lezarasMp: j?.lezarva && b.javitas ? (j.lezarva.getTime() - b.javitas) / 1000 : null }
  })
  const egyeb = uj.filter((x) => !beoltasok.some((b) => illik(b, x.kulcs)))
  const kontrollKulcsok = kontroll.map(no)
  const kontrollRiasztas = egyeb.filter((x) => kontrollKulcsok.some((n) => x.kulcs.includes(n)))

  mkdirSync('riportok/05-osszehasonlitasok/adatok', { recursive: true })
  writeFileSync(KI, JSON.stringify({ kezdet: new Date(T0).toISOString(), percek: (Date.now() - T0) / PERC, idozitettKorokMp: idozitettKorok.map((x) => x / 1000), nyitvaKezdetkor: nyitvaKezdetkor.size, esetek, egyeb, kontroll, kontrollRiasztas: kontrollRiasztas.map((x) => x.kulcs), hibak }, null, 1))
  log(`kész: ${esetek.length} eset, ${esetek.filter((x) => x.eszlelve).length} észlelve, ${egyeb.length} egyéb új jelzés, ${kontrollRiasztas.length} a kontrollrendelésekre, ${hibak.length} hibaüzenet`)

  await m.zar()
  await agens.zar()
  await zar.end()
  await dbZar()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
