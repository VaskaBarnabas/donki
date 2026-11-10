/**
 * 20. fázis, pénzügyi terv: a vevő szervert vesz, egyszeri setup díjat és felhasználószám szerinti havidíjat fizet.
 * Két oldal: a vevőé (TCO, NPV, ROI, megtérülés, maximális havidíj) és az eladóé (ügyfelenkénti fedezet, fedezeti ügyfélszám).
 * Bemenet: riportok/04-penzugy/feltevesek.json és riportok/03-emberi-tenyezo/adatok/megtakaritas.json (előbb: emberi-megtakaritas.ts).
 * Kimenet: riportok/04-penzugy/{penzugyi-elemzes.md, feltevesek.md, adatok/*.csv}. Adatbázist és hálózatot nem használ.
 * Futtatás: npx tsx scripts/riportok/penzugy.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const MAPPA = 'riportok/04-penzugy'
type Tetel = { ertek: number; nap?: boolean; tipus: string; forras: string; indok: string }
type Lista = Omit<Tetel, 'ertek'> & { ertek: number[] }
type Alapvonal = 'also' | 'kozep' | 'felso'
type Forg = { cim: string; alapvonal: Alapvonal; realizacio: number; onboardingOra: number; tamogatasOraHo: number; rendszergazdaFte: number }
type FK = 'ovatos' | 'realis' | 'optimista'
type Fel = {
  ceg: { referenciaLetszam: Tetel; letszamok: Lista; rendelesFelhasznalonkent: Tetel; munkanap: Tetel; ertekesitok: Tetel }
  gyakorisag: Record<string, Tetel>
  ber: Record<string, Tetel>
  gep: Record<string, Tetel>
  meres: Record<string, Tetel>
  felho: Record<string, Tetel>
  projekt: Record<string, Tetel>
  arazas: { setupAlap: Tetel; setupRendszerenkent: Tetel; rendszerek: Tetel; havidijMinimum: Tetel; savok: { felso: number | null; ar: number }[]; szerzodesMinimumHo: Tetel }
  szallito: { fixFejlesztoFte: Tetel; fixEgyebEv: Tetel; onboardingOrak: Lista; ugyfelszamok: Lista }
  forgatokonyvek: Record<FK, Forg> & { _forras: Record<string, string> }
  crm: Record<string, Tetel>
}
type Feladat = { e: string; cim: string; modell: string; siker: number; gepido: number; emberAgenssel: number; also: number; kozep: number; felso: number }

const F = JSON.parse(readFileSync(`${MAPPA}/feltevesek.json`, 'utf8')) as Fel
const M = JSON.parse(readFileSync('riportok/03-emberi-tenyezo/adatok/megtakaritas.json', 'utf8')) as Feladat[]
const E4B = 'donki-gemma-e4b'
const G12B = 'donki-gemma'
const MUNKAKOR: Record<string, string> = { E1: 'ertekesito', E2: 'ertekesito', E3: 'ertekesito', E4: 'ertekesito', E5: 'ugyfelszolgalat', E6: 'raktaros', E7: 'penzugyes', E8: 'penzugyes', E9: 'ugyfelszolgalat', E10: 'vezeto' }
const SOROK = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10']
const REF = F.ceg.referenciaLetszam.ertek
const FKK: FK[] = ['ovatos', 'realis', 'optimista']

const berEv = (k: string, szorzo = 1) => F.ber[k].ertek * 12 * (1 + F.ber.szocho.ertek) * szorzo
const oraber = (k: string, szorzo = 1) => berEv(k, szorzo) / F.ber.hasznosOraEv.ertek
const sikerEgyben = (m: string) => (m === E4B ? F.meres.sikerE4b.ertek : F.meres.siker12b.ertek)
const fejlOra = oraber('fejleszto')

function havidij(u: number, szorzo = 1) {
  let also = 0, ossz = 0
  for (const s of F.arazas.savok) {
    const felso = s.felso ?? Infinity
    if (u > also) ossz += (Math.min(u, felso) - also) * s.ar
    also = felso
  }
  return Math.max(F.arazas.havidijMinimum.ertek, ossz) * szorzo
}

type Param = Forg & {
  letszam: number
  rendelesFo: number
  modell: string
  feladatSiker: boolean
  berSzorzo: number
  hibaSzorzo: number
  kartyaDeltaMp: number
  szerverAr: number
  dijSzorzo: number
  setupSzorzo: number
  rendszerek: number
  hibaMod: 'semleges' | 'agens' | 'ketoldali'
}
const alap = (k: FK, p: Partial<Param> = {}): Param => ({
  ...F.forgatokonyvek[k],
  letszam: REF,
  rendelesFo: F.ceg.rendelesFelhasznalonkent.ertek,
  modell: E4B,
  feladatSiker: false,
  berSzorzo: 1,
  hibaSzorzo: 1,
  kartyaDeltaMp: 0,
  szerverAr: F.gep.ar.ertek,
  dijSzorzo: 1,
  setupSzorzo: 1,
  rendszerek: F.arazas.rendszerek.ertek,
  hibaMod: 'semleges',
  ...p,
})

function eves(p: Param) {
  const rendeles = p.letszam * p.rendelesFo
  const hibaArany = p.hibaMod === 'semleges' ? 0 : p.hibaMod === 'agens' ? F.meres.csendesHibaTizFeladat.ertek : F.meres.csendesHiba.ertek - F.meres.emberHiba.ertek
  let legacyOra = 0, agensOra = 0, legacyFt = 0, agensFt = 0, gepMp = 0, futas = 0, hibaFt = 0, ertekesitoMentOra = 0
  for (const e of SOROK) {
    const t = M.find((x) => x.e === e && x.modell === p.modell)!
    const g = F.gyakorisag[e]
    const n = g.nap ? g.ertek * F.ceg.munkanap.ertek : g.ertek * rendeles * 12
    const s = 1 - Math.min(1, (1 - (p.feladatSiker ? t.siker : sikerEgyben(p.modell))) * p.hibaSzorzo)
    const kezi = t[p.alapvonal]
    const emberMp = t.emberAgenssel + p.kartyaDeltaMp + (1 - s) * kezi
    const o = oraber(MUNKAKOR[e], p.berSzorzo)
    legacyOra += (n * kezi) / 3600
    agensOra += (n * emberMp) / 3600
    legacyFt += ((n * kezi) / 3600) * o
    agensFt += ((n * emberMp) / 3600) * o
    gepMp += n * t.gepido
    futas += n
    hibaFt += n * hibaArany * (F.meres.csendesHibaPerc.ertek / 60) * o
    if (MUNKAKOR[e] === 'ertekesito') ertekesitoMentOra += (n * (kezi - emberMp)) / 3600
  }
  return { rendeles, legacyOra, agensOra, legacyFt, agensFt, gepMp, futas, hibaFt, ertekesitoMentOra }
}

const r = (1 + F.projekt.diszkont.ertek) ** (1 / 12) - 1
const AN = Array.from({ length: 36 }, (_, i) => 1 / (1 + r) ** (i + 1)).reduce((a, b) => a + b, 0)

function vevo(p: Param) {
  const a = eves(p)
  const csucsMp = (a.gepMp / F.ceg.munkanap.ertek) * F.gep.csucsOraArany.ertek
  const munka = Math.max(1, Math.ceil(csucsMp / (3600 * F.gep.kihasznaltsag.ertek)))
  const szerverek = munka + (p.letszam >= F.gep.tartalekLetszamtol.ertek ? 1 : 0)
  const szerver = szerverek * (p.szerverAr + F.gep.kiegeszitok.ertek)
  const setup = (F.arazas.setupAlap.ertek + F.arazas.setupRendszerenkent.ertek * p.rendszerek) * p.setupSzorzo
  const betanitas = p.letszam * F.projekt.betanitasOra.ertek * oraber('ertekesito', p.berSzorzo)
  const egyszeri = setup + szerver + betanitas
  const aram = (a.gepMp / 3600) * (F.gep.wattFutasKozben.ertek / 1000) * F.gep.aramFtKwh.ertek
  const rendszergazda = p.rendszergazdaFte * berEv('rendszergazda')
  const dijHo = havidij(p.letszam, p.dijSzorzo)
  const egyebEv = aram + rendszergazda + a.hibaFt
  const uzemEv = dijHo * 12 + egyebEv
  const hasznosEv = (a.legacyFt - a.agensFt) * p.realizacio
  let npv = -egyszeri, kum = -egyszeri, haszon3 = 0, pvHaszon = 0, megterules: number | null = null
  for (let h = 1; h <= 36; h++) {
    const ho = (hasznosEv / 12) * (h <= 12 ? F.projekt.felfutasElsoEv.ertek : 1)
    const net = ho - uzemEv / 12
    haszon3 += ho
    pvHaszon += ho / (1 + r) ** h
    npv += net / (1 + r) ** h
    kum += net
    if (megterules === null && kum >= 0) megterules = h
  }
  const koltseg3 = egyszeri + uzemEv * 3
  const maxDij = (pvHaszon - egyszeri - (egyebEv / 12) * AN) / AN
  return { a, szerverek, szerver, setup, betanitas, egyszeri, aram, rendszergazda, dijHo, uzemEv, hasznosEv, npv, megterules, haszon3, koltseg3, roi: (haszon3 - koltseg3) / koltseg3, maxDij }
}

function szallito(k: FK, u = REF, ora = F.forgatokonyvek[k].onboardingOra) {
  const p = alap(k, { letszam: u, onboardingOra: ora })
  const v = vevo(p)
  const onboarding = ora * fejlOra
  const setupNet = v.setup - onboarding
  const tamogatas = p.tamogatasOraHo * fejlOra
  const fedezetHo = v.dijHo - tamogatas
  const visszaterul = setupNet >= 0 ? 0 : fedezetHo > 0 ? Math.ceil(-setupNet / fedezetHo) : null
  return { onboarding, setupNet, tamogatas, fedezetHo, visszaterul, harom: setupNet + 36 * fedezetHo, dijHo: v.dijHo, setup: v.setup }
}
const fixEv = F.szallito.fixFejlesztoFte.ertek * berEv('fejleszto') + F.szallito.fixEgyebEv.ertek

const ft = (x: number) => (Math.abs(x) < 10 && x !== 0 ? `${x.toFixed(1).replace('.', ',')} Ft` : `${x < 0 ? '−' : ''}${Math.round(Math.abs(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft`)
const mFt = (x: number) => `${x < 0 ? '−' : ''}${(Math.abs(x) / 1e6).toFixed(1).replace('.', ',')} M Ft`
const szam = (x: number, t = 1) => x.toFixed(t).replace('.', ',')
const szaz = (x: number) => `${x < 0 ? '−' : ''}${Math.round(Math.abs(x) * 100)}%`
const ho = (x: number | null) => (x === null ? '36 hónapon belül nincs' : `${x} hónap`)
const csv = (fej: string[], sorok: (string | number)[][]) => [fej.join(';'), ...sorok.map((s) => s.join(';'))].join('\n') + '\n'
const tabla = (fej: string[], sorok: string[][]) => [`| ${fej.join(' | ')} |`, `|${fej.map(() => '---').join('|')}|`, ...sorok.map((s) => `| ${s.join(' | ')} |`)].join('\n')

const ALAPMODELL = [E4B, G12B].map((m) => ({ m, h: vevo(alap('realis', { modell: m })).hasznosEv })).sort((a, b) => a.h - b.h)[0].m
const modellNev = (m: string) => (m === E4B ? 'e4b' : '12b')
const P = (k: FK, p: Partial<Param> = {}) => alap(k, { modell: ALAPMODELL, ...p })
const R = Object.fromEntries(FKK.map((k) => [k, vevo(P(k))])) as Record<FK, ReturnType<typeof vevo>>
const fedezet = (k: FK) => {
  for (let u = 1; u <= 2000; u++) if (vevo(P(k, { letszam: u })).npv >= 0) return u
  return null
}
const FED = Object.fromEntries(FKK.map((k) => [k, fedezet(k)])) as Record<FK, number | null>
const kockazat = (k: FK, p: Partial<Param> = {}) => {
  const x = vevo(P(k, p))
  const buk = x.setup + x.betanitas + x.szerver * (1 - F.gep.maradvanyErtek.ertek) + x.dijHo * F.arazas.szerzodesMinimumHo.ertek
  return F.projekt.g2Siker.ertek * x.npv - (1 - F.projekt.g2Siker.ertek) * buk
}

const npvR = (p: Partial<Param>) => vevo(P('realis', p)).npv
const ERZ = [
  { nev: 'Hibák javítása (30 perc/hiba)', also: 'csak az ágens, 11,7%', felso: 'ágens 4,0%, ember 9,1%', a: npvR({ hibaMod: 'agens' }), f: npvR({ hibaMod: 'ketoldali' }) },
  { nev: 'Emberi alapvonal', also: 'KLM', felso: 'korábbi becslés', a: npvR({ alapvonal: 'also' }), f: npvR({ alapvonal: 'felso' }) },
  { nev: 'Realizált idő aránya', also: '28%', felso: '80%', a: npvR({ realizacio: 0.28 }), f: npvR({ realizacio: 0.8 }) },
  { nev: 'Rendelés / felhasználó / hó', also: '20', felso: '60', a: npvR({ rendelesFo: 20 }), f: npvR({ rendelesFo: 60 }) },
  { nev: 'Feladatszintű siker (n=3)', also: 'e4b', felso: '12b', a: npvR({ modell: E4B, feladatSiker: true }), f: npvR({ modell: G12B, feladatSiker: true }) },
  { nev: 'Havidíj', also: '+30%', felso: '−30%', a: npvR({ dijSzorzo: 1.3 }), f: npvR({ dijSzorzo: 0.7 }) },
  { nev: 'Bérszint', also: '−20%', felso: '+20%', a: npvR({ berSzorzo: 0.8 }), f: npvR({ berSzorzo: 1.2 }) },
  { nev: 'Setup díj', also: '+50%', felso: '−50%', a: npvR({ setupSzorzo: 1.5 }), f: npvR({ setupSzorzo: 0.5 }) },
  { nev: 'Hibás futás aránya', also: '×2', felso: '×0,5', a: npvR({ hibaSzorzo: 2 }), f: npvR({ hibaSzorzo: 0.5 }) },
  { nev: 'Szerverár', also: '×2', felso: '×0,5', a: npvR({ szerverAr: F.gep.ar.ertek * 2 }), f: npvR({ szerverAr: F.gep.ar.ertek * 0.5 }) },
  { nev: 'Kártyaidő (20 s helyett)', also: '40 s', felso: '10 s', a: npvR({ kartyaDeltaMp: 20 * F.meres.kartyaFutasonkent.ertek }), f: npvR({ kartyaDeltaMp: -10 * F.meres.kartyaFutasonkent.ertek }) },
  { nev: 'Bekötött rendszerek', also: '7', felso: '4', a: npvR({ rendszerek: 7 }), f: npvR({ rendszerek: 4 }) },
].sort((x, y) => Math.abs(y.f - y.a) - Math.abs(x.f - x.a))

const fr = F.forgatokonyvek
const ker = (k: FK) => fr[k].cim
const sor = (nev: string, f: (k: FK) => string) => [nev, ...FKK.map(f)]
const SZ = Object.fromEntries(FKK.map((k) => [k, szallito(k)])) as Record<FK, ReturnType<typeof szallito>>
const fedUgyfel = (k: FK, o = fr[k].onboardingOra) => {
  const x = szallito(k, REF, o).harom
  return x > 0 ? Math.ceil((fixEv * 3) / x) : null
}

// költség / ügy
const a0 = R.realis.a
const ember = a0.legacyFt / a0.futas
const maradek = a0.agensFt / a0.futas
const teljes = R.realis.koltseg3 / 3 / a0.futas
const tok = (be: number, ki: number) => ((F.meres.tokenBe.ertek * be + F.meres.tokenKi.ertek * ki) / 1e6) * F.felho.usdFt.ertek
const sonnet = tok(F.felho.sonnetBeUsdM.ertek, F.felho.sonnetKiUsdM.ertek)
const g8Ft = F.felho.g8UsdEmberi.ertek * F.felho.usdFt.ertek
const crmLic = F.crm.licencEurFoHo.ertek * REF * 36 * F.felho.eurFt.ertek
const crm3 = F.crm.bevezetes.ertek + crmLic
const G6 = R.realis.a.ertekesitoMentOra / 52 / F.ceg.ertekesitok.ertek

mkdirSync(`${MAPPA}/adatok`, { recursive: true })
writeFileSync(`${MAPPA}/adatok/forgatokonyvek.csv`, csv(['forgatokonyv', 'legacy_ora_ev', 'agens_ora_ev', 'haszon_ev_realizalt', 'egyszeri', 'uzem_ev', 'koltseg_3ev', 'haszon_3ev', 'npv', 'roi', 'megterules_ho', 'fedezeti_letszam'], FKK.map((k) => [k, Math.round(R[k].a.legacyOra), Math.round(R[k].a.agensOra), Math.round(R[k].hasznosEv), Math.round(R[k].egyszeri), Math.round(R[k].uzemEv), Math.round(R[k].koltseg3), Math.round(R[k].haszon3), Math.round(R[k].npv), R[k].roi.toFixed(3), R[k].megterules ?? '', FED[k] ?? ''])))
writeFileSync(`${MAPPA}/adatok/letszam.csv`, csv(['letszam', 'forgatokonyv', 'rendeles_ho', 'havidij', 'szerverek', 'egyszeri', 'npv', 'roi', 'megterules_ho', 'max_havidij'], F.ceg.letszamok.ertek.flatMap((u) => FKK.map((k) => { const x = vevo(P(k, { letszam: u })); return [u, k, Math.round(x.a.rendeles), Math.round(x.dijHo), x.szerverek, Math.round(x.egyszeri), Math.round(x.npv), x.roi.toFixed(3), x.megterules ?? '', Math.round(x.maxDij)] }))))
writeFileSync(`${MAPPA}/adatok/erzekenyseg.csv`, csv(['tenyezo', 'kedvezotlen', 'kedvezo', 'npv_kedvezotlen', 'npv_kedvezo'], ERZ.map((s) => [s.nev, s.also, s.felso, Math.round(s.a), Math.round(s.f)])))
writeFileSync(`${MAPPA}/adatok/szallito.csv`, csv(['forgatokonyv', 'onboarding_ora', 'setup_netto', 'havi_fedezet', 'visszaterules_ho', 'fedezet_3ev', 'fedezeti_ugyfelszam'], FKK.flatMap((k) => F.szallito.onboardingOrak.ertek.map((o) => { const x = szallito(k, REF, o); return [k, o, Math.round(x.setupNet), Math.round(x.fedezetHo), x.visszaterul ?? '', Math.round(x.harom), fedUgyfel(k, o) ?? ''] }))))

const pozitiv = FKK.filter((k) => R[k].npv >= 0).map(ker)
const nullszaldos = Math.abs(R.realis.npv) < 0.1 * R.realis.koltseg3
const vevoMondat = nullszaldos
  ? `A vevő oldalán a reális forgatókönyv ${REF} felhasználónál három év alatt **nagyjából nullszaldós**: az NPV ${mFt(R.realis.npv)}.`
  : R.realis.npv >= 0
    ? `A vevő oldalán a reális forgatókönyv ${REF} felhasználónál **megtérül**: az NPV ${mFt(R.realis.npv)}, a megtérülés ${ho(R.realis.megterules)}.`
    : `A vevő oldalán a reális forgatókönyv ${REF} felhasználónál három év alatt **nem térül meg**: az NPV ${mFt(R.realis.npv)}.`
const szallitoMondat = SZ.realis.visszaterul === null
  ? 'Az eladó oldalán a havidíj nem fedezi a támogatást.'
  : `Az eladó oldalán egy ${REF} fős ügyfél bekötése ${SZ.realis.setupNet >= 0 ? 'a setup díjból megtérül' : `${ho(SZ.realis.visszaterul)} alatt térül vissza`}, és a vállalkozás fix költségeit reálisan ${fedUgyfel('realis') ?? 'semennyi'} ügyfél fedezi.`

const fv = `# Pénzügyi terv: szerver, setup díj és felhasználószám szerinti előfizetés

*20. fázis · generálta: \`scripts/riportok/penzugy.ts\` · a feltevések és forrásaik: [feltevesek.md](feltevesek.md) · adatok: [adatok/](adatok/)*

> Ezt a fájlt a szkript generálja. Ne kézzel szerkeszd: módosítsd a [feltevesek.json](feltevesek.json) fájlt, és futtasd újra. Minden ár nettó, adóhatások nélkül.

## 1. A terv és a rövid válasz

A megoldás nem egyedi projektként, hanem előfizetésként értékesül. A vevő három dolgot fizet: **egy helyben futó szervert**, **egy egyszeri setup díjat** és **a felhasználók száma szerinti havidíjat**. A karbantartást, a támogatást és a modellfrissítést a havidíj tartalmazza.

${vevoMondat} ${szallitoMondat}

- **Pozitív NPV-t adó vevői forgatókönyvek:** ${pozitiv.length ? pozitiv.join(', ') : 'egyik sem'}.
- **Fedezeti létszám a vevőnél (három év, NPV = 0):** óvatos ${FED.ovatos ? `${FED.ovatos} fő` : 'nincs 2000 főig'}, reális ${FED.realis ? `${FED.realis} fő` : 'nincs 2000 főig'}, optimista ${FED.optimista ? `${FED.optimista} fő` : 'nincs 2000 főig'}.
- **G2-kockázattal korrigált várható NPV (reális):** ${mFt(kockazat('realis'))}.
- **A legnagyobb hatású tényező:** ${ERZ[0].nev.toLowerCase()} (${mFt(ERZ[0].a)} és ${mFt(ERZ[0].f)} között), majd ${ERZ[1].nev.toLowerCase()}.

**A modell szándékosan szűk.** Csak a tíz mért feladat idejét számolja hasznosnak. A háttérfigyelő, a gyorsabb reakció és a volumennövekedés valódi érték lehet, de nincs rá megbízható forintértékünk.

## 2. Az üzleti konstrukció

**Árlista (javaslat, üzleti döntés, nincs mögötte piaci adat).**

${tabla(['Tétel', 'Ár'], [
  ['Setup díj, alap', ft(F.arazas.setupAlap.ertek)],
  ['Setup díj, bekötött rendszerenként', ft(F.arazas.setupRendszerenkent.ertek)],
  ['Havidíj, minimum', `${ft(F.arazas.havidijMinimum.ertek)} / hó`],
  ...F.arazas.savok.map((s, i) => [`${i ? (F.arazas.savok[i - 1].felso as number) + 1 : 1}${s.felso ? `–${s.felso}` : '+'}. felhasználó`, `${ft(s.ar)} / fő / hó`]),
  ['Minimális szerződés', `${F.arazas.szerzodesMinimumHo.ertek} hónap`],
])}

A sávos díj sávonként számít, ezért a sávhatár átlépésekor a díj nem ugrik. Hét bekötött rendszernél a setup díj ${ft(R.realis.setup)}.

**Szerver.** A vevő saját tulajdonába kerül, így az ügyféladat a cégen belül marad. Az ár egy Mac Studio M4 Max 48 GB (${ft(F.gep.ar.ertek)}) és ${ft(F.gep.kiegeszitok.ertek)} kiegészítő szerverenként. A méretezés a mért gépidőből indul: a napi futások ${szaz(F.gep.csucsOraArany.ertek)}-a esik a csúcsórára, ${szaz(F.gep.kihasznaltsag.ertek)}-os kihasználtsággal. ${F.gep.tartalekLetszamtol.ertek} felhasználótól tartalékszerver is van. A szerverek száma létszámonként az 5. szakaszban szerepel. A párhuzamos terhelést nem mértük, és a mérés nem ezen a gépen futott, ezért a méretezés éles bevezetés előtt ellenőrizendő.

**Felhasználószám és haszon.** A díj a létszámtól, a haszon a rendelésszámtól függ. A kettőt a forgatókönyv aránya köti össze: ${szam(F.ceg.rendelesFelhasznalonkent.ertek)} rendelés / felhasználó / hó. Ha egy cégnél ez az arány más, a megtérülés is más lesz (lásd 6. szakasz). Mivel a megoldás épp a kézi munkát csökkenti, hosszabb távon a felhasználók száma is csökkenhet, ami a díjbevételt rontja.

## 3. A módszer

**Haszon.** Feladatonként a régi munkamód emberi ideje mínusz az ember ideje az ágens mellett, évi darabszámmal és a munkakör KSH-bérével szorozva.

**Realizálás.** A felszabadult idő nem automatikusan pénz (Gartner G3, G5, G6). A modell csak a megadott arányt számolja haszonként, az első évben ennek is a ${szaz(F.projekt.felfutasElsoEv.ertek)}-át.

**Hibák.** A sikertelen futás kézi újracsinálása az ember idejében szerepel. A csendes hibák külön javítási költségét az alapeset sem az ágensnél, sem az embernél nem számolja, mert a [2-es teszt](../05-osszehasonlitasok/02-hibak-ember-es-agens.md) szerint azonos nagyságrendűek. A hatását az érzékenységi tábla mutatja.

**Modell.** Az alapesetben a kisebb hasznot adó modell szerepel (most **${modellNev(ALAPMODELL)}**), a 99 futásos sikerességgel (e4b ${szaz(F.meres.sikerE4b.ertek)}, 12b ${szaz(F.meres.siker12b.ertek)}), mert feladatonként három ismétlés a súlyozáshoz túl zajos.

## 4. A vevő oldala, ${REF} felhasználó

${tabla(['', ...FKK.map(ker)], [
  sor('Emberi alapvonal', (k) => ({ also: 'KLM (alsó)', kozep: 'geometriai közép', felso: 'korábbi becslés' })[fr[k].alapvonal]),
  sor('Realizált idő', (k) => szaz(fr[k].realizacio)),
  sor('Kézi munka régen, óra/év', (k) => Math.round(R[k].a.legacyOra).toString()),
  sor('Emberi munka ágenssel, óra/év', (k) => Math.round(R[k].a.agensOra).toString()),
  sor('Felszabaduló érték / év (100%)', (k) => mFt(R[k].a.legacyFt - R[k].a.agensFt)),
  sor('Realizált haszon / év', (k) => mFt(R[k].hasznosEv)),
  sor('Szerverek száma', (k) => R[k].szerverek.toString()),
  sor('Szerver', (k) => mFt(R[k].szerver)),
  sor('Setup díj', (k) => mFt(R[k].setup)),
  sor('Betanítás', (k) => mFt(R[k].betanitas)),
  sor('**Egyszeri összesen**', (k) => `**${mFt(R[k].egyszeri)}**`),
  sor('Havidíj', (k) => `${ft(R[k].dijHo)} / hó`),
  sor('Rendszergazda / év', (k) => mFt(R[k].rendszergazda)),
  sor('Áram / év', (k) => ft(R[k].aram)),
  sor('**Üzem összesen / év**', (k) => `**${mFt(R[k].uzemEv)}**`),
  sor('**TCO 3 évre**', (k) => `**${mFt(R[k].koltseg3)}**`),
  sor('Realizált haszon 3 évre', (k) => mFt(R[k].haszon3)),
  sor(`**NPV (${szaz(F.projekt.diszkont.ertek)})**`, (k) => `**${mFt(R[k].npv)}**`),
  sor('ROI', (k) => szaz(R[k].roi)),
  sor('Megtérülés', (k) => ho(R[k].megterules)),
  sor('G2-kockázattal korrigált várható NPV', (k) => mFt(kockazat(k))),
])}

A kockázati sor a Gartner G2 előrejelzéséből ${szaz(F.projekt.g2Siker.ertek)} sikeresélyt vesz. Bukásnál a vevő elveszíti a setup díjat, a betanítást, ${F.arazas.szerzodesMinimumHo.ertek} havi díjat és a szerver értékének felét. Ez előrejelzés, nem mért valószínűség.

## 5. Létszám szerint

${tabla(['Felhasználó', 'Rendelés/hó', 'Havidíj', 'Szerver', 'Egyszeri', ...FKK.map((k) => `${ker(k)}: NPV`), 'Reális: megtérülés'], F.ceg.letszamok.ertek.map((u) => {
  const x = FKK.map((k) => vevo(P(k, { letszam: u })))
  return [String(u), String(Math.round(x[1].a.rendeles)), ft(x[1].dijHo), String(x[1].szerverek), mFt(x[1].egyszeri), ...x.map((y) => mFt(y.npv)), ho(x[1].megterules)]
}))}

**Mekkora havidíjat bír el a vevő?** Az a díj, amelynél a háromévi NPV éppen nulla, adott setup díj és szerver mellett. Ha a tényleges díj ennél alacsonyabb, a különbség a vevő nyeresége.

${tabla(['Felhasználó', 'Javasolt díj', ...FKK.map((k) => `${ker(k)}: maximum`), 'Reális: maximum / fő'], F.ceg.letszamok.ertek.map((u) => {
  const x = FKK.map((k) => vevo(P(k, { letszam: u })))
  const m = (v: number) => (v > 0 ? ft(v) : 'nincs')
  return [String(u), ft(x[1].dijHo), ...x.map((y) => m(y.maxDij)), x[1].maxDij > 0 ? ft(x[1].maxDij / u) : 'nincs']
}))}

## 6. Érzékenység (vevő, reális, ${REF} felhasználó)

Az alapeset NPV-je ${mFt(R.realis.npv)}. Egyszerre egy feltevést változtatunk.

${tabla(['Tényező', 'Kedvezőtlen', 'NPV', 'Kedvező', 'NPV', 'Terjedelem'], ERZ.map((s) => [s.nev, s.also, mFt(s.a), s.felso, mFt(s.f), mFt(Math.abs(s.f - s.a))]))}

## 7. Az eladó oldala

Az óradíj a KSH fejlesztői bérköltsége (${ft(fejlOra)}/óra), vállalkozói díj és árrés nélkül. A szerver a vevő közvetlen vásárlása, azon nincs bevétel.

**Egy ${REF} fős ügyfél** (setup ${ft(SZ.realis.setup)}, havidíj ${ft(SZ.realis.dijHo)}):

${tabla(['', ...FKK.map(ker)], [
  sor('Bekötés, óra', (k) => String(fr[k].onboardingOra)),
  sor('Bekötés költsége', (k) => mFt(SZ[k].onboarding)),
  sor('Setup díj mínusz bekötés', (k) => mFt(SZ[k].setupNet)),
  sor('Támogatás, óra/hó', (k) => String(fr[k].tamogatasOraHo)),
  sor('Támogatás költsége', (k) => `${ft(SZ[k].tamogatas)} / hó`),
  sor('Havi fedezet', (k) => `${ft(SZ[k].fedezetHo)} / hó`),
  sor('Bekötés visszatérülése', (k) => (SZ[k].visszaterul === 0 ? 'azonnal' : ho(SZ[k].visszaterul))),
  sor('Fedezet 3 évre', (k) => mFt(SZ[k].harom)),
])}

**A bekötési munka a legfontosabb szám** (reális támogatással):

${tabla(['Bekötés, óra', 'Setup díj mínusz bekötés', 'Visszatérülés', 'Fedezet 3 évre', 'Fedezeti ügyfélszám', 'Ügyfél / év / fejlesztő'], F.szallito.onboardingOrak.ertek.map((o) => {
  const x = szallito('realis', REF, o)
  return [String(o), mFt(x.setupNet), x.visszaterul === 0 ? 'azonnal' : ho(x.visszaterul), mFt(x.harom), String(fedUgyfel('realis', o) ?? 'nincs'), szam(F.ber.hasznosOraEv.ertek / o)]
}))}

**A vállalkozás egésze** (fix költség évi ${mFt(fixEv)}: ${szam(F.szallito.fixFejlesztoFte.ertek)} FTE termékfejlesztés és egyéb tételek; ${REF} fős ügyfelek, reális forgatókönyv):

${tabla(['Ügyfelek', 'Havidíj-bevétel / év', 'Támogatás / év', 'Fix költség / év', 'Üzemi eredmény / év', 'Három év, bekötéssel'], F.szallito.ugyfelszamok.ertek.map((n) => {
  const x = SZ.realis
  return [String(n), mFt(n * x.dijHo * 12), mFt(n * x.tamogatas * 12), mFt(fixEv), mFt(n * x.fedezetHo * 12 - fixEv), mFt(n * x.harom - fixEv * 3)]
}))}

Az üzemi eredményben a bekötés nincs benne, a háromévesben igen, minden ügyfél három teljes évével. Az ügyfél-lemorzsolódást a modell nem kezeli.

## 8. Költség / megoldott ügy és felhőalternatíva

${tabla(['Megoldás', 'Ember / ügy', 'Rendszer / ügy', 'Összesen'], [
  ['Kézi, régi munkamód', ft(ember), '–', ft(ember)],
  ['Előfizetés szerverrel (teljes TCO)', ft(maradek), ft(teljes), ft(maradek + teljes)],
  ['Csak a tokendíj felhőben (Claude Sonnet 5.5)', ft(maradek), ft(sonnet), ft(maradek + sonnet)],
])}

Reális forgatókönyv, ${REF} felhasználó, a teljes munkaidő-értékkel. A Gartner G8 asszisztált ügyfélkapcsolatra ${szam(F.felho.g8UsdEmberi.ertek)} $-t, körülbelül ${ft(g8Ft)}-ot mond, ami amerikai, régebbi benchmark, csak nagyságrendi viszonyítás. A felhős sor nem tartalmazza a szoftver díját, és a felhőmodell sikerességét nem mértük. A szerver fő érve az adatok helyben tartása, nem az olcsóság: a szerverköltség három évre ${mFt(R.realis.szerver)}, a Sonnet 5.5 tokendíja ugyanennyi idő alatt ${mFt(sonnet * a0.futas * 3)} lenne.

**Összevetés a Gartner G6-tal.** A reális forgatókönyvben a felszabaduló idő heti ${szam(G6)} óra értékesítőnként, ${F.ceg.ertekesitok.ertek} értékesítővel számolva. A Gartner felmérése heti 4,8 órát mond.

**Teljes CRM-csere (illusztratív, nincs rá forrásunk):** három évre ${mFt(crm3)} a vevő ${mFt(R.realis.koltseg3)}-os TCO-jával szemben. A csere hasznát nem becsültük, ez csak költség-összevetés.

## 9. Ami kimaradt

**Pozitív irányban:** a háttérfigyelő haszna ([03-figyelo-haszna.md](../05-osszehasonlitasok/03-figyelo-haszna.md)), a kapacitásnövekedés felvétel nélkül, a tíz mért feladaton kívüli folyamatok.

**Negatív irányban:** a szervezeti ellenállás, a felhasználószám csökkenése a megoldás hatására, az ügyfél-lemorzsolódás, az értékesítés költsége, az interfészváltozások javítása ([09-valtozastures.md](../05-osszehasonlitasok/09-valtozastures.md)).

## 10. Korlátok

- **Az árlista javaslat.** Nincs mögötte piaci vizsgálat, és fizető ügyféllel nem teszteltük.
- **Az emberi idők nem mért adatok.** A KLM alsó korlát, a korábbi becslés saját, a közép önkényes.
- **A bekötés és a támogatás óraszáma saját feltevés,** pedig az eladó oldalát ez dönti el.
- **A szerver alkalmasságát nem mértük.** A mérés M5 24 GB-on, egy felhasználóval futott, a párhuzamos terhelés (Ö4) nem készült el.
- **A realizált arány a legbizonytalanabb.** A 28% a Gartner G6-ból csak analógia.
- **A cég kitalált,** a felhasználó/rendelés arány a forgatókönyvből való.
- **A szerverár, a szocho-kulcs, az áramár és az árfolyamok** másodlagos vagy nem friss forrásból származnak, idézés előtt ellenőrizendők.
`

const tipusNev: Record<string, string> = { mert: 'mért', forras: 'forrás', sajat: 'saját' }
const blokk = (cim: string, o: object) => `## ${cim}\n\n${tabla(['Név', 'Érték', 'Típus', 'Forrás', 'Indoklás'], Object.entries(o as Record<string, Tetel>).filter(([k, v]) => !k.startsWith('_') && typeof v === 'object' && 'ertek' in v).map(([k, v]) => [k, Array.isArray(v.ertek) ? (v.ertek as number[]).join(', ') : String(v.ertek), tipusNev[v.tipus] ?? v.tipus, v.forras, v.indok]))}\n`
const fmd = `# Pénzügyi feltevések

*A [feltevesek.json](feltevesek.json) fájlból generálva. Típus: **mért** (saját mérésből), **forrás** (külső adat), **saját** (feltevés vagy üzleti döntés, külső alátámasztás nélkül).*

${blokk('Cég és létszám', F.ceg)}
${blokk('Árazás', F.arazas)}
Havidíj-sávok (Ft/fő/hó): ${F.arazas.savok.map((s) => `${s.felso ? `${s.felso} főig` : 'afölött'} ${s.ar}`).join(', ')}.

${blokk('Gyakoriság (rendelésenként)', F.gyakorisag)}
${blokk('Bérek', F.ber)}
${blokk('Szerver és áram', F.gep)}
${blokk('Mérésből', F.meres)}
${blokk('Felhő és árfolyam', F.felho)}
${blokk('Projekt', F.projekt)}
${blokk('Az eladó oldala', F.szallito)}
${blokk('CRM-csere', F.crm)}
## Forgatókönyvek

${tabla(['', ...FKK.map(ker)], [sor('Alapvonal', (k) => fr[k].alapvonal), sor('Realizáció', (k) => szaz(fr[k].realizacio)), sor('Bekötés (óra)', (k) => String(fr[k].onboardingOra)), sor('Támogatás (óra/hó)', (k) => String(fr[k].tamogatasOraHo)), sor('Rendszergazda (FTE)', (k) => String(fr[k].rendszergazdaFte))])}

${Object.entries(fr._forras).map(([k, v]) => `- **${k}:** ${v}`).join('\n')}

## Források

- KSH STADAT 20.1.1.52., foglalkozás szerinti keresetek, 2025.
- Gartner G2, G3, G5, G6, G8, G10, G16: [gartner-forrasok.md](../02-szakirodalom/gartner-forrasok.md).
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing), 2026-11-10.
- [Alza.hu, Mac Studio M4 Max](https://m.alza.hu/mac-studio-m4-max-d13290554.htm), a szerver ára.
- [Apple, Mac mini fogyasztás](https://support.apple.com/103253).
- [Szocho 2026](https://adozona.hu/tb_jarulekok_nyugdij/A_szocialis_hozzajarulasi_ado_2026_januar_1_7IZAR5), [2018. évi LII. törvény](https://njt.jog.gov.hu/jogszabaly/2018-52-00-00).
- [Privátbankár, KKV-áram](https://privatbankar.hu/cikkek/makro/minden-amit-a-kkv-s-rezsicsokkentesrol-tudni-kell.html).
- [MNB egyéb árfolyamok, 2026-07-01](https://www.mnb.hu/letoltes/az-mnb-hivatalos-devizalapjan-nem-szereplo-egyeb-arfolyamok-2026-07-01.pdf), [ING HU FX, 2026-02-09](https://assets.ing.com/m/fc0d1ab4299fbb09/original/HU_FX_20260209.pdf).
`
writeFileSync(`${MAPPA}/penzugyi-elemzes.md`, fv)
writeFileSync(`${MAPPA}/feltevesek.md`, fmd)
console.log(FKK.map((k) => `${k}: NPV ${mFt(R[k].npv)}, ROI ${szaz(R[k].roi)}, megtérülés ${ho(R[k].megterules)}, fedezeti létszám ${FED[k]}, TCO ${mFt(R[k].koltseg3)}, haszon3 ${mFt(R[k].haszon3)}`).join('\n'))
console.log('alapmodell', modellNev(ALAPMODELL))
