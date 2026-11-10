/**
 * 20. fázis: az emberi idő feladatonként a mért ágens mellett: a kérés begépelése + várakozás a gépre + a válasz elolvasása
 * + jóváhagyás (kártyánként feltevés) + a sikertelen futás kézi újracsinálása. Három emberi alapvonal: KLM (alsó korlát),
 * középérték (geometriai közép, saját feltevés), a korábbi becslés (felső).
 * Futtatás: npx tsx scripts/riportok/emberi-megtakaritas.ts   (előbb: emberi-klm.ts)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import '../../agens/kozos/kornyezet'
import { db, dbZar } from '../../agens/kozos/naplo'

const FEL: Record<string, string> = { E1: 'F01', E2: 'F03', E3: 'F05', E4: 'F07', E5: 'F09', E6: 'F12', E7: 'F13', E8: 'F15a', E9: 'F18a', E10: 'F20' }
const K = 0.28
const SZO_PERC = 238
const KARTYA_MP = 20
type Klm = { e: string; cim: string; becslesPerc: number; klmMp: number }

async function main() {
  const klm = JSON.parse(readFileSync('riportok/03-emberi-tenyezo/adatok/klm.json', 'utf8')) as Klm[]
  const { rows } = await db().query<{ feladat: string; modell: string; eredmeny: string; ido_ms: number; jovahagyas: number; keres: string; valasz: string }>(
    `select feladat, modell, eredmeny, ido_ms, jovahagyas, keres, valasz from ertekeles.futas where meres = '2026-11-07-javitott' and valtozat = 'mcp'`
  )
  const ki = klm.flatMap((t) =>
    ['donki-gemma-e4b', 'donki-gemma'].map((modell) => {
      const s = rows.filter((r) => r.feladat === FEL[t.e] && r.modell === modell)
      const siker = s.filter((r) => r.eredmeny === 'siker').length / s.length
      const atl = (f: (r: (typeof s)[number]) => number) => s.reduce((a, r) => a + f(r), 0) / s.length
      const gepido = atl((r) => (r.ido_ms ?? 0) / 1000)
      const keres = atl((r) => (r.keres ?? '').length * K + 1.35)
      const olvas = atl((r) => ((r.valasz ?? '').split(/\s+/).length / SZO_PERC) * 60 + 1.35)
      const kartya = atl((r) => (r.jovahagyas ?? 0) * KARTYA_MP)
      const emberAgenssel = keres + olvas + kartya
      const also = t.klmMp
      const felso = t.becslesPerc * 60
      const kozep = Math.sqrt(also * felso)
      const teljes = (alap: number) => emberAgenssel + (1 - siker) * alap
      const szazalek = (alap: number) => 100 * (1 - teljes(alap) / alap)
      return { e: t.e, cim: t.cim, modell, siker, gepido, emberAgenssel, also, kozep, felso, megtakAlso: szazalek(also), megtakKozep: szazalek(kozep), megtakFelso: szazalek(felso), emberiAlso: teljes(also), emberiKozep: teljes(kozep), emberiFelso: teljes(felso) }
    })
  )
  writeFileSync('riportok/03-emberi-tenyezo/adatok/megtakaritas.json', JSON.stringify(ki, null, 1))
  for (const modell of ['donki-gemma-e4b', 'donki-gemma']) {
    const s = ki.filter((x) => x.modell === modell)
    const o = (k: 'also' | 'kozep' | 'felso' | 'emberiAlso' | 'emberiKozep' | 'emberiFelso') => s.reduce((a, x) => a + x[k], 0) / 60
    console.log(`\n${modell}: ember nélküle ${o('also').toFixed(1)} / ${o('kozep').toFixed(1)} / ${o('felso').toFixed(1)} perc; ágenssel ${o('emberiAlso').toFixed(1)} / ${o('emberiKozep').toFixed(1)} / ${o('emberiFelso').toFixed(1)} perc; megtakarítás ${(100 * (1 - o('emberiAlso') / o('also'))).toFixed(0)}% / ${(100 * (1 - o('emberiKozep') / o('kozep'))).toFixed(0)}% / ${(100 * (1 - o('emberiFelso') / o('felso'))).toFixed(0)}%`)
    for (const x of s) console.log(`${x.e}\tsiker ${(x.siker * 100).toFixed(0)}%\tgép ${x.gepido.toFixed(0)} s\tember+ágens ${x.emberAgenssel.toFixed(0)} s\talap ${x.also.toFixed(0)}/${x.kozep.toFixed(0)}/${x.felso.toFixed(0)} s\tmegtak ${x.megtakAlso.toFixed(0)}% / ${x.megtakKozep.toFixed(0)}% / ${x.megtakFelso.toFixed(0)}%`)
  }
  await dbZar()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
