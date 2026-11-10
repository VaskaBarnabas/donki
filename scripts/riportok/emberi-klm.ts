/**
 * 20. fázis: az emberi idő és hibalehetőség analitikus becslése stopper nélkül – Keystroke-Level Model (Card, Moran,
 * Newell 1980) a régi munkamód tíz mérési feladatára (docs/LEGACY_FORGATOKONYV.md §3, riport.ts EMBER-tábla). A KLM egy
 * begyakorlott, hibátlanul dolgozó felhasználó végrehajtási idejét adja: alsó korlát, nem az átlagos munkaidő.
 * Az olvasás: Brysbaert (2019), 238 szó/perc. A hibalehetőség: minden kézi adatátvitel és értékleolvasás egy.
 *
 * Futtatás: npx tsx scripts/riportok/emberi-klm.ts   → riportok/03-emberi-tenyezo/adatok/klm.json (+ táblázat a kimeneten)
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const O = { P: 1.1, B: 0.1, H: 0.4, M: 1.35 } // Card–Moran–Newell (1980), B: Kieras (2001)
const SZO_PERC = 238
type Lepes = { mp: (k: number) => number; hiba: number; nev: string }
const katt = O.P + 2 * O.B
const lap = 1 // oldalbetöltés, saját feltevés

const nav = (): Lepes => ({ nev: 'rendszerváltás', hiba: 0, mp: () => O.M + 2 * katt + lap })
const klikk = (): Lepes => ({ nev: 'kattintás', hiba: 0, mp: () => O.M + katt })
const keres = (b: number): Lepes => ({ nev: 'keresés', hiba: 1, mp: (k) => O.M + katt + O.H + (b + 1) * k + lap + O.H })
const gepel = (b: number, kod = false): Lepes => ({ nev: 'gépelés', hiba: 1, mp: (k) => O.M + katt + O.H + b * (kod ? 0.75 : k) + O.H }) // 0,75 s: bonyolult kód (KLM)
const masol = (): Lepes => ({ nev: 'másolás', hiba: 0, mp: (k) => O.M + O.P + 4 * O.B + O.H + 2 * k + O.H })
const beilleszt = (): Lepes => ({ nev: 'beillesztés', hiba: 1, mp: (k) => O.M + katt + O.H + 2 * k + O.H })
const olvas = (szo: number, ertek = 0): Lepes => ({ nev: 'olvasás', hiba: ertek, mp: () => (szo / SZO_PERC) * 60 + O.M * Math.max(1, ertek) })
const gondol = (db: number): Lepes => ({ nev: 'döntés', hiba: db, mp: () => db * O.M })
const var_ = (s: number): Lepes => ({ nev: 'várakozás', hiba: 0, mp: () => s })

const FELADATOK: { e: string; cim: string; becsles: number; lepesek: Lepes[] }[] = [
  { e: 'E1', cim: 'Árajánlat e-mailes érdeklődésre', becsles: 8, lepesek: [olvas(35, 2), nav(), keres(6), olvas(25, 1), masol(), nav(), keres(8), olvas(40, 1), nav(), beilleszt(), klikk(), gepel(8, true), gepel(2), klikk(), klikk(), var_(2), olvas(40, 1)] },
  { e: 'E2', cim: 'Kifutott termék – helyettesítő', becsles: 5, lepesek: [olvas(20, 1), nav(), keres(5), olvas(30, 1), klikk(), olvas(80, 1), gondol(1)] },
  { e: 'E3', cim: '20%-os kedvezmény – jóváhagyás kérése', becsles: 6, lepesek: [olvas(25, 2), nav(), keres(6), masol(), nav(), beilleszt(), klikk(), gepel(8, true), gepel(1), gepel(2), klikk(), klikk(), var_(2), olvas(40, 1), klikk(), gepel(30), klikk()] },
  { e: 'E4', cim: 'Megrendelés: az ajánlat elfogadása', becsles: 4, lepesek: [olvas(15, 1), nav(), keres(12), klikk(), olvas(30, 1), klikk(), var_(2), olvas(15, 1), nav(), keres(6), olvas(40, 1)] },
  { e: 'E5', cim: '„Hol a csomag?”', becsles: 4, lepesek: [olvas(10, 1), nav(), keres(6), klikk(), olvas(40, 2)] },
  { e: 'E6', cim: '„Mit kell utánrendelni?”', becsles: 15, lepesek: [nav(), klikk(), gepel(14), var_(3), olvas(200, 4), nav(), keres(4), olvas(15, 1), keres(4), olvas(15, 1), keres(4), olvas(15, 1), keres(4), olvas(15, 1)] },
  { e: 'E7', cim: 'Díjbekérő kiállítása', becsles: 6, lepesek: [olvas(10, 1), nav(), keres(6), klikk(), klikk(), var_(3), olvas(20, 1), nav(), gepel(30, true), var_(1), olvas(25, 1)] },
  { e: 'E8', cim: '„Kifizették már?”', becsles: 3, lepesek: [olvas(10, 1), nav(), gepel(30, true), var_(1), olvas(20, 1), nav(), keres(14), olvas(30, 1)] },
  { e: 'E9', cim: 'Garancia – érvényes', becsles: 8, lepesek: [olvas(20, 2), nav(), keres(6), klikk(), olvas(40, 1), nav(), keres(8), olvas(20, 1), gondol(3)] },
  { e: 'E10', cim: '„Hogy állunk?”', becsles: 45, lepesek: [nav(), klikk(), olvas(150, 5), gondol(5), nav(), gepel(13, true), var_(1), olvas(100, 3), masol(), nav(), beilleszt(), gepel(12), gondol(1), nav(), klikk(), gepel(14), var_(3), olvas(200, 4), nav(), keres(4), olvas(15, 1), keres(4), olvas(15, 1), keres(4), olvas(15, 1), nav(), klikk(), olvas(80, 2), gondol(2)] },
]

const szamol = (l: Lepes[], k: number) => l.reduce((s, x) => s + x.mp(k), 0)
const hibaP = (n: number, p: number) => 1 - (1 - p) ** n
const ki = FELADATOK.map((f) => {
  const n = f.lepesek.reduce((s, x) => s + x.hiba, 0)
  return { e: f.e, cim: f.cim, becslesPerc: f.becsles, klmMp: szamol(f.lepesek, 0.28), klmGyorsMp: szamol(f.lepesek, 0.2), klmLassuMp: szamol(f.lepesek, 0.5), hibalehetoseg: n, rendszervaltas: f.lepesek.filter((x) => x.nev === 'rendszerváltás').length, p05: hibaP(n, 0.005), p1: hibaP(n, 0.01), p2: hibaP(n, 0.02) }
})
mkdirSync('riportok/03-emberi-tenyezo/adatok', { recursive: true })
writeFileSync('riportok/03-emberi-tenyezo/adatok/klm.json', JSON.stringify(ki, null, 1))
for (const x of ki) console.log(`${x.e}\t${x.klmMp.toFixed(0)} s\t(${x.klmGyorsMp.toFixed(0)}–${x.klmLassuMp.toFixed(0)})\tbecslés ${x.becslesPerc} p\tarány ${(x.becslesPerc * 60 / x.klmMp).toFixed(1)}×\tn=${x.hibalehetoseg}\tváltás ${x.rendszervaltas}\tP: ${(x.p05 * 100).toFixed(1)}% / ${(x.p1 * 100).toFixed(1)}% / ${(x.p2 * 100).toFixed(1)}%`)
const ossz = ki.reduce((s, x) => s + x.klmMp, 0)
const b = ki.reduce((s, x) => s + x.becslesPerc * 60, 0)
console.log(`összesen KLM ${(ossz / 60).toFixed(1)} perc, becslés ${(b / 60).toFixed(0)} perc, arány ${(b / ossz).toFixed(1)}×`)
