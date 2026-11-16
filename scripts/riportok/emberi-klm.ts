/**
 * Az emberi idő és hibalehetőség analitikus becslése stopper nélkül, a régi munkamód tíz mérési feladatára
 * (docs/LEGACY_FORGATOKONYV.md §3). Három felhasználótípus:
 *   – KLM (Card, Moran, Newell 1980): begyakorlott, hibátlan végrehajtás – alsó korlát;
 *   – tipikus: gyakorlott, de nem szakértő – KLM × 1,2 (a KLM kb. 21% RMS hibája; Sauro 2009: gyakorlott felhasználónál
 *     10–30% eltérés), + 2 s visszazökkenés rendszerváltásonként (Murty, Dadlani, Das, HBR 2022), + a hiba miatti
 *     újracsinálás várható ideje (1% hibaesély kézi műveletenként, Barchard & Pace 2011);
 *   – nem begyakorolt: a billentyű- és a mentális idő kétszerese (tanulási vizsgálat: 0,95 s/billentyű az első napon a
 *     begyakorolt 0,47 s helyett; másodlagos forrás), egyébként mint a tipikus.
 * Az olvasás: Brysbaert (2019), 238 szó/perc. A hibalehetőség: minden kézi adatátvitel és értékleolvasás egy.
 *
 * Futtatás: npx tsx scripts/riportok/emberi-klm.ts   → riportok/03-emberi-tenyezo/adatok/klm.json (+ táblázat a kimeneten)
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const O = { P: 1.1, B: 0.1, H: 0.4, M: 1.35 } // Card–Moran–Newell (1980), B: Kieras (2001)
const TIPIKUS_SZORZO = 1.2
const VALTAS_MP = 2
const HIBA_P = 0.01
const KEZDO_SZORZO = 2
const SZO_PERC = 238
type Lepes = { mp: (k: number, m: number) => number; hiba: number; nev: string }
const katt = O.P + 2 * O.B
const lap = 1 // oldalbetöltés, saját feltevés

const nav = (): Lepes => ({ nev: 'rendszerváltás', hiba: 0, mp: (_k, m) => m + 2 * katt + lap })
const klikk = (): Lepes => ({ nev: 'kattintás', hiba: 0, mp: (_k, m) => m + katt })
const keres = (b: number): Lepes => ({ nev: 'keresés', hiba: 1, mp: (k, m) => m + katt + O.H + (b + 1) * k + lap + O.H })
const gepel = (b: number, kod = false): Lepes => ({ nev: 'gépelés', hiba: 1, mp: (k, m) => m + katt + O.H + b * (kod ? 0.75 * (k / 0.28) : k) + O.H }) // 0,75 s: bonyolult kód (KLM)
const masol = (): Lepes => ({ nev: 'másolás', hiba: 0, mp: (k, m) => m + O.P + 4 * O.B + O.H + 2 * k + O.H })
const beilleszt = (): Lepes => ({ nev: 'beillesztés', hiba: 1, mp: (k, m) => m + katt + O.H + 2 * k + O.H })
const olvas = (szo: number, ertek = 0): Lepes => ({ nev: 'olvasás', hiba: ertek, mp: (_k, m) => (szo / SZO_PERC) * 60 + m * Math.max(1, ertek) })
const gondol = (db: number): Lepes => ({ nev: 'döntés', hiba: db, mp: (_k, m) => db * m })
const var_ = (s: number): Lepes => ({ nev: 'várakozás', hiba: 0, mp: () => s })

const FELADATOK: { e: string; cim: string; kor?: 'kiegeszito'; lepesek: Lepes[] }[] = [
  { e: 'E1', cim: 'Árajánlat e-mailes érdeklődésre', lepesek: [olvas(35, 2), nav(), keres(6), olvas(25, 1), masol(), nav(), keres(8), olvas(40, 1), nav(), beilleszt(), klikk(), gepel(8, true), gepel(2), klikk(), klikk(), var_(2), olvas(40, 1)] },
  { e: 'E2', cim: 'Kifutott termék – helyettesítő', lepesek: [olvas(20, 1), nav(), keres(5), olvas(30, 1), klikk(), olvas(80, 1), gondol(1)] },
  { e: 'E3', cim: '20%-os kedvezmény – jóváhagyás kérése', lepesek: [olvas(25, 2), nav(), keres(6), masol(), nav(), beilleszt(), klikk(), gepel(8, true), gepel(1), gepel(2), klikk(), klikk(), var_(2), olvas(40, 1), klikk(), gepel(30), klikk()] },
  { e: 'E4', cim: 'Megrendelés: az ajánlat elfogadása', lepesek: [olvas(15, 1), nav(), keres(12), klikk(), olvas(30, 1), klikk(), var_(2), olvas(15, 1), nav(), keres(6), olvas(40, 1)] },
  { e: 'E5', cim: '„Hol a csomag?”', lepesek: [olvas(10, 1), nav(), keres(6), klikk(), olvas(40, 2)] },
  { e: 'E6', cim: '„Mit kell utánrendelni?”', lepesek: [nav(), klikk(), gepel(14), var_(3), olvas(200, 4), nav(), keres(4), olvas(15, 1), keres(4), olvas(15, 1), keres(4), olvas(15, 1), keres(4), olvas(15, 1)] },
  { e: 'E7', cim: 'Díjbekérő kiállítása', lepesek: [olvas(10, 1), nav(), keres(6), klikk(), klikk(), var_(3), olvas(20, 1), nav(), gepel(30, true), var_(1), olvas(25, 1)] },
  { e: 'E8', cim: '„Kifizették már?”', lepesek: [olvas(10, 1), nav(), gepel(30, true), var_(1), olvas(20, 1), nav(), keres(14), olvas(30, 1)] },
  { e: 'E9', cim: 'Garancia – érvényes', lepesek: [olvas(20, 2), nav(), keres(6), klikk(), olvas(40, 1), nav(), keres(8), olvas(20, 1), gondol(3)] },
  { e: 'E10', cim: '„Hogy állunk?”', lepesek: [nav(), klikk(), olvas(150, 5), gondol(5), nav(), gepel(13, true), var_(1), olvas(100, 3), masol(), nav(), beilleszt(), gepel(12), gondol(1), nav(), klikk(), gepel(14), var_(3), olvas(200, 4), nav(), keres(4), olvas(15, 1), keres(4), olvas(15, 1), keres(4), olvas(15, 1), nav(), klikk(), olvas(80, 2), gondol(2)] },
  // kiegészítő feladatok: a mérés további MCP-feladatai (F02, F06, F08, F10, F11, F16, F17, F19), a legacy forgatókönyv 3.1, 3.3–3.6, 3.8, 3.10 lépései
  { e: 'E11', kor: 'kiegeszito', cim: 'Új érdeklődő felvétele és ajánlat', lepesek: [olvas(40, 2), nav(), keres(10), olvas(10, 1), klikk(), gepel(20), gepel(11, true), gepel(30), klikk(), gondol(1), klikk(), var_(1), masol(), nav(), keres(8), olvas(40, 1), nav(), beilleszt(), klikk(), gepel(8, true), gepel(1), klikk(), klikk(), var_(2), olvas(40, 1)] },
  { e: 'E12', kor: 'kiegeszito', cim: 'Vezetői jóváhagyás (kedvezmény)', lepesek: [olvas(30, 1), nav(), keres(12), klikk(), olvas(60, 2), gondol(1), klikk(), var_(1), olvas(10, 1)] },
  { e: 'E13', kor: 'kiegeszito', cim: 'Rendelés jóváhagyása készlethiánnyal', lepesek: [nav(), keres(10), klikk(), klikk(), var_(3), olvas(15, 2), nav(), keres(4), olvas(20, 1), nav(), gepel(14, true), var_(3), olvas(30, 2), gondol(1)] },
  { e: 'E14', kor: 'kiegeszito', cim: 'Kiszállítás indítása', lepesek: [nav(), keres(10), klikk(), olvas(30, 1), klikk(), var_(2), olvas(15, 1)] },
  { e: 'E15', kor: 'kiegeszito', cim: 'Bevételezés', lepesek: [olvas(30, 2), nav(), keres(8), olvas(10, 1), nav(), gepel(25, true), var_(3), olvas(10, 1)] },
  { e: 'E16', kor: 'kiegeszito', cim: 'Rendelés lemondása', lepesek: [nav(), keres(10), klikk(), olvas(30, 1), klikk(), gepel(15), klikk(), var_(2), olvas(10, 1)] },
  { e: 'E17', kor: 'kiegeszito', cim: 'Számla sztornója', lepesek: [olvas(15, 1), nav(), gepel(28, true), var_(2), olvas(20, 1)] },
  { e: 'E18', kor: 'kiegeszito', cim: 'Reklamáció felvétele', lepesek: [nav(), klikk(), gepel(20), gepel(10, true), gepel(8, true), gepel(80), klikk(), var_(1), olvas(15, 1)] },
]

const szamol = (l: Lepes[], k: number, m = O.M) => l.reduce((s, x) => s + x.mp(k, m), 0)
const hibaP = (n: number, p: number) => 1 - (1 - p) ** n
const ki = FELADATOK.map((f) => {
  const n = f.lepesek.reduce((s, x) => s + x.hiba, 0)
  const valtas = f.lepesek.filter((x) => x.nev === 'rendszerváltás').length
  const ujra = 1 + hibaP(n, HIBA_P)
  const tipikusMp = (szamol(f.lepesek, 0.28) * TIPIKUS_SZORZO + valtas * VALTAS_MP) * ujra
  const kezdoMp = (szamol(f.lepesek, 0.28 * KEZDO_SZORZO, O.M * KEZDO_SZORZO) * TIPIKUS_SZORZO + valtas * VALTAS_MP) * ujra
  return { e: f.e, cim: f.cim, kor: f.kor ?? 'alap', klmMp: szamol(f.lepesek, 0.28), tipikusMp, kezdoMp, klmGyorsMp: szamol(f.lepesek, 0.2), klmLassuMp: szamol(f.lepesek, 0.5), hibalehetoseg: n, rendszervaltas: valtas, p05: hibaP(n, 0.005), p1: hibaP(n, 0.01), p2: hibaP(n, 0.02) }
})
mkdirSync('riportok/03-emberi-tenyezo/adatok', { recursive: true })
writeFileSync('riportok/03-emberi-tenyezo/adatok/klm.json', JSON.stringify(ki, null, 1))
for (const x of ki) console.log(`${x.e}\t${x.klmMp.toFixed(0)} s\ttipikus ${x.tipikusMp.toFixed(0)} s\tkezdő ${x.kezdoMp.toFixed(0)} s\t(${x.klmGyorsMp.toFixed(0)}–${x.klmLassuMp.toFixed(0)})\tn=${x.hibalehetoseg}\tváltás ${x.rendszervaltas}\tP: ${(x.p05 * 100).toFixed(1)}% / ${(x.p1 * 100).toFixed(1)}% / ${(x.p2 * 100).toFixed(1)}%`)
const alapKi = ki.filter((x) => x.kor === 'alap')
const ossz = alapKi.reduce((s, x) => s + x.klmMp, 0)
console.log(`a tíz alapfeladat: tipikus ${(alapKi.reduce((s, x) => s + x.tipikusMp, 0) / 60).toFixed(1)} perc, nem begyakorolt ${(alapKi.reduce((s, x) => s + x.kezdoMp, 0) / 60).toFixed(1)} perc`)
console.log(`összesen KLM ${(ossz / 60).toFixed(1)} perc`)
