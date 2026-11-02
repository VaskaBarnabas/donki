/**
 * Munkaerő-becslés: a legacy folyamatok emberi munkaigénye vs. az ágensekkel digitalizált folyamatok emberi
 * (human-in-the-loop) munkaigénye, adott napi gyakoriságok mellett. Minden feltevés itt van, egy helyen – a
 * docs/MUNKAERO_BECSLES.md táblázatai ennek a kimenetei. Futtatás: npx tsx scripts/munkaero-becsles.ts [--rendeles 500] [--erdeklodes 2000]
 *
 * Idők percben, darabonként. A „legacy” idők a docs/LEGACY_FORGATOKONYV.md becsléseiből jönnek; a HITL-idők az
 * ágens jóváhagyási kártyáinak, a vázlatok átnézésének és a kivételek kézi kezelésének becslései. Az ágens gépideje a
 * 17. fázis méréseiből: kb. 9 s és kb. 5000 token egy kérésre (gemma4:e4b, egy Apple M5 gépen).
 */

type Tetel = {
  folyamat: string
  csoport: 'Értékesítés' | 'Rendelés' | 'Raktár' | 'Pénzügy' | 'Ügyfélszolgálat' | 'Vezetés, admin'
  /** darab / nap */
  db: number
  /** legacy: emberi perc / darab */
  legacy: number
  /** ágens: emberi perc / darab a normál esetben (jóváhagyás, vázlat átnézése) */
  hitl: number
  /** ágens: a darabok hány százaléka megy kivételre (az ágens nem tudja, ember viszi végig) */
  kivetelArany: number
  /** ágens: emberi perc egy kivételre (a legacy út egy része, de az ágens által előkészítve) */
  kivetelPerc: number
  /** ágensfuttatások (kérések) darabonként – a gépidőhöz */
  futas: number
  /** jóváhagyási kártyák darabonként (írás előtt) */
  kartya: number
  /** kockázatalapú jóváhagyásnál: HITL perc/db, ha az alacsony kockázatú, visszafordítható írás szabály szerint megy (szúrópróbával) */
  hitlKockazatalapu?: number
  megjegyzes: string
}

const arg = (n: string, d: number) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? Number(process.argv[i + 1]) : d
}
// Alapból a megadott példa-volumen; a 40 fős cégre: --rendeles 40 --erdeklodes 150
const NAPI_RENDELES = arg('rendeles', 500)
const NAPI_ERDEKLODES_EMAIL = arg('erdeklodes', 2000)

// Származtatott gyakoriságok (feltevések):
const T: Tetel[] = [
  { folyamat: 'Érdeklődés e-mailben (ár, készlet)', csoport: 'Értékesítés', db: NAPI_ERDEKLODES_EMAIL, legacy: 20, hitl: 1.5, kivetelArany: 0.15, kivetelPerc: 8, futas: 1.5, kartya: 1, hitlKockazatalapu: 1, megjegyzes: 'az ágens ajánlatot és e-mail-vázlatot készít; ember átnézi, jóváhagyja az ajánlatot és elküldi' },
  { folyamat: '  ebből új érdeklődő felvétele (30%)', csoport: 'Értékesítés', db: NAPI_ERDEKLODES_EMAIL * 0.3, legacy: 8, hitl: 0.3, kivetelArany: 0.05, kivetelPerc: 5, futas: 0, kartya: 1, hitlKockazatalapu: 0.05, megjegyzes: 'create_customer jóváhagyása; legacyben CRM + később a számlázó külön' },
  { folyamat: 'Kedvezmény-jóváhagyás (a rendelések 10%-a)', csoport: 'Értékesítés', db: NAPI_RENDELES * 0.1, legacy: 15, hitl: 1.5, kivetelArany: 0, kivetelPerc: 0, futas: 1, kartya: 1, megjegyzes: 'a vezető a kártyán dönt, az indoklással együtt; legacyben e-mail és telefon' },
  { folyamat: 'Megrendelés (ajánlat elfogadása → rendelés)', csoport: 'Rendelés', db: NAPI_RENDELES, legacy: 10, hitl: 0.5, kivetelArany: 0.03, kivetelPerc: 6, futas: 1, kartya: 1, megjegyzes: 'egy jóváhagyási kártya' },
  { folyamat: 'Rendelés jóváhagyása (vezető)', csoport: 'Rendelés', db: NAPI_RENDELES, legacy: 3, hitl: 0.3, kivetelArany: 0, kivetelPerc: 0, futas: 1, kartya: 1, megjegyzes: 'kártya; legacyben ráadásul a vezetőt külön értesíteni kell' },
  { folyamat: 'Készlethiány a jóváhagyáskor (5%)', csoport: 'Rendelés', db: NAPI_RENDELES * 0.05, legacy: 25, hitl: 6, kivetelArany: 0, kivetelPerc: 0, futas: 2, kartya: 1, megjegyzes: 'az ágens termékkel és alternatívával jelzi; a döntés és a vevő felhívása emberi' },
  { folyamat: '„Hol a csomag?” (a rendelések 30%-a)', csoport: 'Ügyfélszolgálat', db: NAPI_RENDELES * 0.3, legacy: 5, hitl: 0.2, kivetelArany: 0.05, kivetelPerc: 5, futas: 1, kartya: 0, megjegyzes: 'csak olvasás, jóváhagyás nélkül; ügyféloldali chattel 0' },
  { folyamat: 'Kiszállítás indítása', csoport: 'Raktár', db: NAPI_RENDELES, legacy: 2, hitl: 0.3, kivetelArany: 0, kivetelPerc: 0, futas: 0.2, kartya: 1, hitlKockazatalapu: 0.02, megjegyzes: 'kártya rendelésenként (vagy kötegben: „indítsd a jóváhagyottakat”)' },
  { folyamat: 'Árubeérkezés', csoport: 'Raktár', db: 20, legacy: 15, hitl: 3, kivetelArany: 0.1, kivetelPerc: 10, futas: 1, kartya: 1, megjegyzes: 'cikkszám-párosítás nélkül, termékkóddal; a szállítólevél ellenőrzése emberi' },
  { folyamat: 'Kifogyó készlet, utánrendelési lista', csoport: 'Raktár', db: 1, legacy: 30, hitl: 3, kivetelArany: 0, kivetelPerc: 0, futas: 1, kartya: 0, megjegyzes: 'napi egy lekérdezés; a megrendelés a beszállítónak emberi (nincs beszerzés)' },
  { folyamat: 'Díjbekérő kiállítása és kiküldése', csoport: 'Pénzügy', db: NAPI_RENDELES, legacy: 7.5, hitl: 1, kivetelArany: 0.02, kivetelPerc: 10, futas: 1, kartya: 1, megjegyzes: 'kártya + e-mail-vázlat; eltérő vevőnév nincs (közös azonosítás)' },
  { folyamat: 'Kártyás fizetés ellenőrzése (70%)', csoport: 'Pénzügy', db: NAPI_RENDELES * 0.7, legacy: 1, hitl: 0, kivetelArany: 0.02, kivetelPerc: 3, futas: 0, kartya: 0, megjegyzes: 'automatikus (webhook + egyeztetés); csak az eltérés kerül emberhez' },
  { folyamat: 'Átutalás egyeztetése (30%)', csoport: 'Pénzügy', db: NAPI_RENDELES * 0.3, legacy: 3, hitl: 3, kivetelArany: 0, kivetelPerc: 0, futas: 0, kartya: 0, megjegyzes: 'NEM digitalizált: bankkivonat nincs a rendszerben (rés)' },
  { folyamat: 'Lejárt tartozás, felszólítás (5%)', csoport: 'Pénzügy', db: NAPI_RENDELES * 0.05, legacy: 10, hitl: 2, kivetelArany: 0.1, kivetelPerc: 10, futas: 1, kartya: 0, megjegyzes: 'lista + felszólító e-mail-vázlat; ember küldi' },
  { folyamat: 'Lemondás, sztornó (2%)', csoport: 'Pénzügy', db: NAPI_RENDELES * 0.02, legacy: 15, hitl: 2, kivetelArany: 0.1, kivetelPerc: 10, futas: 1, kartya: 1, megjegyzes: '„nem visszavonható” kártya – gondos ellenőrzés' },
  { folyamat: 'Reklamáció, garancia, RMA (1%)', csoport: 'Ügyfélszolgálat', db: NAPI_RENDELES * 0.01, legacy: 25, hitl: 6, kivetelArany: 0.2, kivetelPerc: 15, futas: 2, kartya: 2, megjegyzes: 'hibajegy, garancia-kód magyarázattal, RMA kártya; a vevővel beszélni emberi' },
  { folyamat: 'Vezetői helyzetkép (napi)', csoport: 'Vezetés, admin', db: 1, legacy: 90, hitl: 5, kivetelArany: 0, kivetelPerc: 0, futas: 1, kartya: 0, megjegyzes: 'egy kérdés; legacyben 4 ember és Excel' },
  { folyamat: 'Hozzáférés, szerepkör (heti 2 → napi 0,4)', csoport: 'Vezetés, admin', db: 0.4, legacy: 90, hitl: 12, kivetelArany: 0, kivetelPerc: 0, futas: 1, kartya: 1, megjegyzes: 'szerepkör az asszisztensből; új felhasználó és meghívás még kézi' },
]

const MUNKAPERC_FTE = 6 * 60 // egy fő hasznos munkaideje naponta (6 óra)
const MP_FUTAS = 9 // s / ágensfuttatás (mérés)
const TOKEN_FUTAS = 6000 // token / futás (mérés: 4–13 ezer, átlag ~6 ezer)

const kerek = (n: number, j = 1) => (Math.round(n * 10 ** j) / 10 ** j).toLocaleString('hu-HU')
const ora = (perc: number) => perc / 60

function sorok() {
  return T.map((t) => {
    const legacyPerc = t.db * t.legacy
    const agensPerc = t.db * ((1 - t.kivetelArany) * t.hitl + t.kivetelArany * (t.hitl + t.kivetelPerc))
    return { ...t, legacyPerc, agensPerc, futasok: t.db * t.futas }
  })
}

function tabla(szorzoHitl = 1, szorzoKivetel = 1, kockazatalapu = false) {
  return T.map((t) => {
    const k = Math.min(1, t.kivetelArany * szorzoKivetel)
    const h = (kockazatalapu && t.hitlKockazatalapu !== undefined ? t.hitlKockazatalapu : t.hitl) * szorzoHitl
    return t.db * ((1 - k) * h + k * (h + t.kivetelPerc))
  }).reduce((a, b) => a + b, 0)
}

const s = sorok()
console.log(`### Folyamatonként (napi ${NAPI_RENDELES} rendelés, ${NAPI_ERDEKLODES_EMAIL} e-mailes érdeklődés)\n`)
console.log('| Folyamat | db/nap | Legacy perc/db | Ágens: HITL perc/db (kivétel %) | Legacy munkaóra/nap | Ágens: HITL munkaóra/nap | Megtakarítás |')
console.log('|---|---:|---:|---:|---:|---:|---:|')
for (const r of s) {
  const megt = r.legacyPerc ? 1 - r.agensPerc / r.legacyPerc : 0
  console.log(`| ${r.folyamat} | ${kerek(r.db, 1)} | ${kerek(r.legacy)} | ${kerek(r.hitl)}${r.kivetelArany ? ` (${Math.round(r.kivetelArany * 100)}% → +${r.kivetelPerc} p)` : ''} | ${kerek(ora(r.legacyPerc))} | ${kerek(ora(r.agensPerc))} | ${Math.round(megt * 100)}% |`)
}
const L = s.reduce((a, r) => a + r.legacyPerc, 0)
const A = s.reduce((a, r) => a + r.agensPerc, 0)
console.log(`| **Összesen** | | | | **${kerek(ora(L))}** | **${kerek(ora(A))}** | **${Math.round((1 - A / L) * 100)}%** |\n`)

console.log('### Csoportonként, létszámegyenértékben (FTE = 6 hasznos óra/nap)\n')
console.log('| Terület | Legacy FTE | Ágens: HITL FTE |')
console.log('|---|---:|---:|')
for (const cs of [...new Set(T.map((t) => t.csoport))]) {
  const r = s.filter((x) => x.csoport === cs)
  console.log(`| ${cs} | ${kerek(r.reduce((a, x) => a + x.legacyPerc, 0) / MUNKAPERC_FTE)} | ${kerek(r.reduce((a, x) => a + x.agensPerc, 0) / MUNKAPERC_FTE)} |`)
}
console.log(`| **Összesen** | **${kerek(L / MUNKAPERC_FTE)}** | **${kerek(A / MUNKAPERC_FTE)}** |\n`)

console.log('### Érzékenység (a HITL-idők és a kivételarány bizonytalansága)\n')
console.log('| Változat | Ágens: HITL munkaóra/nap | FTE | Megtakarítás a legacyhez képest |')
console.log('|---|---:|---:|---:|')
for (const [nev, h, k, kk] of [
  ['Optimista (HITL ×0,5, kivétel ×0,5)', 0.5, 0.5, false],
  ['Alap', 1, 1, false],
  ['Alap + kockázatalapú jóváhagyás', 1, 1, true],
  ['Pesszimista (HITL ×2, kivétel ×2)', 2, 2, false],
  ['Nagyon pesszimista (HITL ×3, kivétel ×3)', 3, 3, false],
] as const) {
  const p = tabla(h, k, kk)
  console.log(`| ${nev} | ${kerek(ora(p))} | ${kerek(p / MUNKAPERC_FTE)} | ${Math.round((1 - p / L) * 100)}% |`)
}

const kartyak = T.reduce((a, t) => a + t.db * t.kartya, 0)
const kartyakKockazatalapu = T.reduce((a, t) => a + (t.hitlKockazatalapu !== undefined ? 0 : t.db * t.kartya), 0)
console.log('\n### Jóváhagyási kártyák naponta\n')
console.log('| Változat | Kártya / nap | Kártya / jóváhagyó (a HITL FTE-re vetítve) |')
console.log('|---|---:|---:|')
console.log(`| Minden írás kártyával (ma) | ${kerek(kartyak, 0)} | ${kerek(kartyak / (A / MUNKAPERC_FTE), 0)} |`)
console.log(`| Kockázatalapú (ajánlat, vevőfelvétel, kiszállítás szabály szerint) | ${kerek(kartyakKockazatalapu, 0)} | ${kerek(kartyakKockazatalapu / (tabla(1, 1, true) / MUNKAPERC_FTE), 0)} |`)

const futasok = s.reduce((a, r) => a + r.futasok, 0)
const gepOra = (futasok * MP_FUTAS) / 3600
console.log('\n### Az ágens gépigénye\n')
console.log('| Mutató | Érték |')
console.log('|---|---:|')
console.log(`| Ágensfuttatás / nap | ${kerek(futasok, 0)} |`)
console.log(`| Gépidő / nap (${MP_FUTAS} s / futás, sorban) | ${kerek(gepOra)} óra |`)
console.log(`| Ehhez szükséges párhuzamos modellpéldány (8 órás munkanap, 70% kihasználtság) | ${Math.ceil(gepOra / (8 * 0.7))} |`)
console.log(`| Token / nap (${TOKEN_FUTAS} / futás) | ${kerek((futasok * TOKEN_FUTAS) / 1e6)} millió |`)
