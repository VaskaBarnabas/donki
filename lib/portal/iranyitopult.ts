// Az irányítópult adatai (16. fázis): kártyánként a saját rendszer bekötött interfészéről, a rendszer saját
// formátumából egységes megjelenítésre (Ft, dátum) alakítva. Ez az „integrációs platform” értéke a modul-oldalak
// nyers formátumaival szemben. Minden függvény csak a saját rendszerét kérdezi – egy kiesés csak egy kártyát érint.

import 'server-only'
import { ajanlatRpc, fizetesRest, helpdeskSoap, rendelesHomlokzat, szamlazoParancs } from '@/lib/admin/interfeszek'
import { raktar, szamlak } from '@/lib/admin/rendszerek'

const ft = (s: string) => Number(s.replace(',', '.'))
const ma = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date())

const ALLAPOT_NEV: Record<string, string> = {
  ROGZITETT: 'Rögzítve, jóváhagyásra vár',
  JOVAHAGYOTT: 'Jóváhagyva',
  TELJESITES_ALATT: 'Szállítás alatt',
  SZALLITVA: 'Kiszállítva, számlázásra vár',
  SZAMLAZVA: 'Fizetésre vár',
  LEZART: 'Lezárva',
  LEMONDOTT: 'Lemondva',
}

export async function rendelesek() {
  const v = await rendelesHomlokzat<{ order_no: number; state: string; updated_at: string }[]>('GET', 'list')
  if (!v.success) throw new Error(v.msg)
  const szerint = new Map<string, number>()
  for (const r of v.data) szerint.set(r.state, (szerint.get(r.state) ?? 0) + 1)
  const nyitott = v.data.filter((r) => !['LEZART', 'LEMONDOTT'].includes(r.state))
  const legregebbi = nyitott.sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0]
  return {
    nyitott: nyitott.length,
    allapotok: Object.keys(ALLAPOT_NEV)
      .filter((k) => szerint.has(k) && !['LEZART', 'LEMONDOTT'].includes(k))
      .map((k) => ({ allapot: ALLAPOT_NEV[k], db: szerint.get(k)! })),
    legregebbi: legregebbi ? { orderNo: legregebbi.order_no, allapot: ALLAPOT_NEV[legregebbi.state] ?? legregebbi.state, ota: legregebbi.updated_at } : null,
  }
}

export async function jovahagyasok() {
  const [q, o] = await Promise.all([
    ajanlatRpc<{ id: string; totalDiscountPct: number }[]>('quote.list', { status: 'JOVAHAGYASRA_VAR' }),
    rendelesHomlokzat<{ order_no: number }[]>('GET', 'list?state=ROGZITETT'),
  ])
  if (q.error) throw new Error(`${q.error.code} ${q.error.message}`)
  if (!o.success) throw new Error(o.msg)
  return { ajanlatok: (q.result ?? []).map((a) => ({ id: a.id, kedvezmeny: a.totalDiscountPct })), rendelesek: o.data.map((r) => r.order_no) }
}

export async function tartozasok() {
  const v = await szamlazoParancs('SZAMLA|LEJART')
  if (!v.startsWith('OK|')) throw new Error(v)
  const tetelek = v.split('|').slice(2).filter(Boolean).map((t) => {
    const [szam, vevo, brutto, hatarido] = t.split(';')
    return { szam, vevo, brutto: ft(brutto), hatarido: hatarido.replaceAll('.', '-') }
  })
  return { db: tetelek.length, osszeg: tetelek.reduce((s, t) => s + t.brutto, 0), legregebbi: tetelek[0] ?? null }
}

export async function keszlet() {
  const { valasz } = await raktar({ cmd: 'LISTA' })
  if (!valasz) throw new Error('A raktár nem válaszolt (a worker áll?)')
  if (valasz.status !== 'OK') throw new Error(`${valasz.hibakod} ${valasz.uzenet}`)
  const cikkek = (valasz.tetelek ?? []) as { cikk: number; megnevezes: string; keszlet: number; min: number }[]
  const alatta = cikkek.filter((c) => c.keszlet < c.min).sort((a, b) => a.keszlet / Math.max(a.min, 1) - b.keszlet / Math.max(b.min, 1))
  return { osszes: cikkek.length, alatta: alatta.map((c) => ({ cikk: c.cikk, nev: c.megnevezes, keszlet: c.keszlet, min: c.min })) }
}

export async function hibajegyek() {
  const v = await helpdeskSoap('ListTickets', {})
  if (v.fault) throw new Error(v.fault)
  const jegyek = ((v.ok?.Ticket ?? []) as { Status: string; Rma?: { Status: string }[] }[])
  const nyitott = jegyek.filter((j) => j.Status !== 'LEZART')
  return {
    nyitott: nyitott.length,
    ujak: nyitott.filter((j) => j.Status === 'UJ').length,
    nyitottRma: jegyek.flatMap((j) => j.Rma ?? []).filter((r) => r.Status !== 'LEZART').length,
  }
}

export async function fizetesek() {
  const v = await fizetesRest<{ data: { status: string; amountMinor: number; createdAt: string; updatedAt: string }[] }>('GET', '?limit=200')
  if (v.body.error) throw new Error(`${v.body.error.type}: ${v.body.error.message}`)
  const maiak = (v.body.data ?? []).filter((f) => f.updatedAt.slice(0, 10) === ma())
  return {
    sikeres: maiak.filter((f) => f.status === 'SUCCEEDED').length,
    osszeg: maiak.filter((f) => f.status === 'SUCCEEDED').reduce((s, f) => s + f.amountMinor / 100, 0),
    sikertelen: maiak.filter((f) => f.status === 'FAILED').length,
    nyitott: (v.body.data ?? []).filter((f) => f.status === 'CREATED').length,
  }
}

/** Egyeztetés: a számlázó utolsó Számlázz.hu-egyeztetése (15 percenként) és a fizetés azonnali Stripe-egyeztetése. */
export async function egyeztetes() {
  const [b, p] = await Promise.all([
    szamlak(),
    fizetesRest<{ checked: number; matched: number; legacyImport: number; mismatches: { kind: string; invoiceRef: string | null }[] }>('GET', '/reconcile'),
  ])
  if (b.hiba) throw new Error(b.hiba)
  if (p.body.error) throw new Error(`${p.body.error.type}: ${p.body.error.message}`)
  const elteresek = b.sorok.filter((s) => s.szinkron !== 'OK')
  return {
    szamlazo: { osszes: b.sorok.length, egyezik: b.sorok.length - elteresek.length, elteresek: elteresek.map((s) => `${s.szam}: ${s.szinkron}`) },
    stripe: { osszes: p.body.checked, egyezik: p.body.matched, korabbi: p.body.legacyImport, elteresek: p.body.mismatches.map((m) => `${m.invoiceRef ?? '?'}: ${m.kind}`) },
  }
}
