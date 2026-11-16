/**
 * Pénzügyi terv: a szoftvert használó munkatársak fejenként 25 €/hó díjat, a cég egyszer 800 € beüzemelést fizet.
 * Két változat: nálunk hosztolva (alapeset; a bérelt GPU-szerver költsége az eladóé, több ügyfél között a mért terhelés
 * szerint megosztva) és saját szerver (a vevő megveszi és üzemelteti a gépet).
 * A vevő haszna két forrásból: (a) a felszabadult munkaidő bérértéke (tipikus felhasználó, emberi-klm.ts),
 * (b) a pluszforgalom bruttó árrése (az árbevétel és az árrés: Eurostat SBS, Magyarország, 2022).
 * Három üzletág, öt cégméret (5–100 fő).
 * Bemenet: riportok/04-penzugy/feltevesek.json és riportok/03-emberi-tenyezo/adatok/megtakaritas.json (előbb: emberi-megtakaritas.ts).
 * Kimenet: riportok/04-penzugy/{penzugyi-elemzes.md, feltevesek.md, adatok/*.csv}. Adatbázist és hálózatot nem használ.
 * Futtatás: npx tsx scripts/riportok/penzugy.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const MAPPA = 'riportok/04-penzugy'
type Tetel = { ertek: number; nap?: boolean; tipus: string; forras: string; indok: string }
type Lista = Omit<Tetel, 'ertek'> & { ertek: number[] }
type FK = 'ovatos' | 'realis' | 'optimista'
type Forg = { cim: string; realizacio: number; bevetelNoveles: number; kereses: boolean; onboardingOra: number; tamogatasOraHasznalo: number; rendszergazdaFte: number }
type UK = 'b2b' | 'web' | 'szerviz'
type Sav = '10-49' | '50-249'
type Uzletag = { cim: string; leiras: string; nace: string; felhasznaloArany: Tetel; rendelesFo: Tetel; arbevetelFo: Record<Sav, Tetel>; arres: Tetel; gyakorisag: Record<string, Tetel> }
type Fel = {
  ceg: { cegmeretek: Lista; referenciaLetszam: Tetel; munkanap: Tetel; ertekesitok: Tetel }
  ber: Record<string, Tetel>
  gep: Record<string, Tetel>
  meres: Record<string, Tetel>
  felho: Record<string, Tetel>
  projekt: Record<string, Tetel>
  arazas: { havidijEurFo: Tetel; setupEur: Tetel; szerzodesMinimumHo: Tetel }
  hosting: { gepEurHo: Tetel; gepSetupEur: Tetel }
  szallito: { fixFejlesztoFte: Tetel; fixEgyebEv: Tetel; onboardingOrak: Lista; ugyfelszamok: Lista }
  forgatokonyvek: Record<FK, Forg> & { _forras: Record<string, string> }
  uzletagak: Record<UK, Uzletag>
  crm: Record<string, Tetel>
  kereses: { arany: Tetel }
  figyelo: { kesoFizetesArany: Tetel; eszlelesNap: Tetel; kamat: Tetel; keszlethianyVeszteseg: Tetel; megelozott: Lista }
}
type Alapvonal = 'klm' | 'tipikus' | 'kezdo'
type Feladat = { e: string; cim: string; kor: string; modell: string; siker: number; gepido: number; emberAgenssel: number } & Record<Alapvonal, number>

const F = JSON.parse(readFileSync(`${MAPPA}/feltevesek.json`, 'utf8')) as Fel
const M = JSON.parse(readFileSync('riportok/03-emberi-tenyezo/adatok/megtakaritas.json', 'utf8')) as Feladat[]
const E4B = 'donki-gemma-e4b'
const G12B = 'donki-gemma'
const MUNKAKOR: Record<string, string> = { E1: 'ertekesito', E2: 'ertekesito', E3: 'ertekesito', E4: 'ertekesito', E5: 'ugyfelszolgalat', E6: 'raktaros', E7: 'penzugyes', E8: 'penzugyes', E9: 'ugyfelszolgalat', E10: 'vezeto', E11: 'ertekesito', E12: 'vezeto', E13: 'vezeto', E14: 'raktaros', E15: 'raktaros', E16: 'ertekesito', E17: 'penzugyes', E18: 'ugyfelszolgalat' }
const SOROK = Array.from({ length: 18 }, (_, i) => `E${i + 1}`)
const KERESES = 1 / (1 - F.kereses.arany.ertek)
const FIG = F.figyelo
const REF = F.ceg.referenciaLetszam.ertek
const MERETEK = F.ceg.cegmeretek.ertek
const FKK: FK[] = ['ovatos', 'realis', 'optimista']
const UKK: UK[] = ['b2b', 'web', 'szerviz']
const EUR = F.felho.eurFt.ertek
const DIJ_FO = F.arazas.havidijEurFo.ertek * EUR
const SETUP = F.arazas.setupEur.ertek * EUR
const HOST_HO = F.hosting.gepEurHo.ertek * EUR
const HOST_SETUP = F.hosting.gepSetupEur.ertek * EUR
type Valtozat = 'hoszt' | 'sajat'

const berEv = (k: string, szorzo = 1) => F.ber[k].ertek * 12 * (1 + F.ber.szocho.ertek) * szorzo
const oraber = (k: string, szorzo = 1) => berEv(k, szorzo) / F.ber.hasznosOraEv.ertek
const sikerEgyben = (m: string) => (m === E4B ? F.meres.sikerE4b.ertek : F.meres.siker12b.ertek)
const fejlOra = oraber('fejleszto')
const sav = (n: number): Sav => (n < 50 ? '10-49' : '50-249')

type Param = Forg & {
  uzletag: UK
  valtozat: Valtozat
  letszam: number
  alapvonal: Alapvonal
  modell: string
  feladatSiker: boolean
  berSzorzo: number
  hibaSzorzo: number
  kartyaDeltaMp: number
  dijSzorzo: number
  felfutas: number
  figyelo: boolean
  dedikalt: boolean
  hibaMod: 'semleges' | 'agens' | 'ketoldali'
}
const alap = (k: FK, p: Partial<Param> = {}): Param => ({
  ...F.forgatokonyvek[k],
  uzletag: 'b2b',
  valtozat: 'hoszt',
  letszam: REF,
  alapvonal: 'tipikus',
  modell: E4B,
  feladatSiker: false,
  berSzorzo: 1,
  hibaSzorzo: 1,
  kartyaDeltaMp: 0,
  dijSzorzo: 1,
  felfutas: 1,
  figyelo: true,
  dedikalt: false,
  hibaMod: 'semleges',
  ...p,
})

/** A cég adatai a létszámból: használók, rendelés, árbevétel (Eurostat), árrés. */
function ceg(p: Param) {
  const U = F.uzletagak[p.uzletag]
  const hasznalok = Math.max(1, Math.round(p.letszam * U.felhasznaloArany.ertek))
  const rendelesHo = hasznalok * U.rendelesFo.ertek
  const arbevetelEv = p.letszam * U.arbevetelFo[sav(p.letszam)].ertek * 1000 * EUR
  return { hasznalok, rendelesHo, arbevetelEv, arres: U.arres.ertek }
}

function eves(p: Param) {
  const c = ceg(p)
  const hibaArany = p.hibaMod === 'semleges' ? 0 : p.hibaMod === 'agens' ? F.meres.csendesHibaTizFeladat.ertek : F.meres.csendesHibaTizFeladat.ertek - F.meres.emberHiba.ertek
  let legacyOra = 0, agensOra = 0, legacyFt = 0, agensFt = 0, gepMp = 0, futas = 0, hibaFt = 0
  for (const e of SOROK) {
    const t = M.find((x) => x.e === e && x.modell === p.modell)!
    const g = F.uzletagak[p.uzletag].gyakorisag[e]
    const n = g.nap ? g.ertek * F.ceg.munkanap.ertek : g.ertek * c.rendelesHo * 12
    const s = 1 - Math.min(1, (1 - (p.feladatSiker ? t.siker : sikerEgyben(p.modell))) * p.hibaSzorzo)
    const kezi = t[p.alapvonal] * (p.kereses ? KERESES : 1)
    const emberMp = t.emberAgenssel + p.kartyaDeltaMp + (1 - s) * kezi
    const o = oraber(MUNKAKOR[e], p.berSzorzo)
    legacyOra += (n * kezi) / 3600
    agensOra += (n * emberMp) / 3600
    legacyFt += ((n * kezi) / 3600) * o
    agensFt += ((n * emberMp) / 3600) * o
    gepMp += n * t.gepido
    futas += n
    hibaFt += n * hibaArany * (F.meres.csendesHibaPerc.ertek / 60) * o
  }
  return { ...c, legacyOra, agensOra, legacyFt, agensFt, gepMp, futas, hibaFt }
}

const r = (1 + F.projekt.diszkont.ertek) ** (1 / 12) - 1

/** A gépigény a mért gépidőből (csúcsóra, kihasználtság), törtként: megosztott hostingnál ennyi gép jut az ügyfélre. */
function gepIgeny(gepMp: number) {
  const csucsMp = (gepMp / F.ceg.munkanap.ertek) * F.gep.csucsOraArany.ertek
  return csucsMp / (3600 * F.gep.kihasznaltsag.ertek)
}

function vevo(p: Param) {
  const a = eves(p)
  const igeny = gepIgeny(a.gepMp)
  const sajatGep = Math.max(1, Math.ceil(igeny)) + (a.hasznalok >= F.gep.tartalekLetszamtol.ertek ? 1 : 0)
  const szerver = p.valtozat === 'sajat' ? sajatGep * (F.gep.ar.ertek + F.gep.kiegeszitok.ertek) : 0
  const egyszeri = SETUP + szerver
  const aram = p.valtozat === 'sajat' ? (a.gepMp / 3600) * (F.gep.wattFutasKozben.ertek / 1000) * F.gep.aramFtKwh.ertek : 0
  const rendszergazda = p.valtozat === 'sajat' ? p.rendszergazdaFte * berEv('rendszergazda') : 0
  const dijHo = a.hasznalok * DIJ_FO * p.dijSzorzo
  const egyebEv = aram + rendszergazda + a.hibaFt
  const koltsegEv = dijHo * 12 + egyebEv
  const idoEv = (a.legacyFt - a.agensFt) * p.realizacio
  const pluszArbevetelEv = a.arbevetelEv * p.bevetelNoveles
  const arresEv = pluszArbevetelEv * a.arres
  // háttérfigyelő (J6): a késve fizetett számlák a hetente egyszeri helyett azonnali észlelés miatt ennyi nappal korábban folynak be
  const figyeloEv = p.figyelo ? a.arbevetelEv * FIG.kesoFizetesArany.ertek * (FIG.eszlelesNap.ertek / 365) * FIG.kamat.ertek : 0
  const hasznosEv = idoEv + arresEv + figyeloEv
  let npv = -egyszeri, kum = -egyszeri, haszon3 = 0, megterules: number | null = null
  for (let h = 1; h <= 36; h++) {
    const ho = (hasznosEv / 12) * (h <= 12 ? p.felfutas : 1)
    const net = ho - koltsegEv / 12
    haszon3 += ho
    npv += net / (1 + r) ** h
    kum += net
    if (megterules === null && kum >= 0) megterules = h
  }
  const koltseg3 = egyszeri + koltsegEv * 3
  // a díjat időmegtakarítás nélkül, egyedül fedező árbevétel-növekedés (évente), és az egy hónapos megtérüléshez szükséges
  const fedezetiNoveles = koltsegEv / (a.arbevetelEv * a.arres)
  const egyHonapNoveles = (egyszeri * 12 + koltsegEv) / (a.arbevetelEv * a.arres)
  return { a, igeny, sajatGep, szerver, egyszeri, aram, rendszergazda, dijHo, egyebEv, koltsegEv, idoEv, pluszArbevetelEv, arresEv, figyeloEv, hasznosEv, npv, megterules, haszon3, koltseg3, roi: (haszon3 - koltseg3) / koltseg3, fedezetiNoveles, egyHonapNoveles }
}

/** Az eladó egy ügyfélen: díjbevétel, hosting (megosztott vagy dedikált), támogatás, beüzemelés. */
function szallito(p: Param) {
  const v = vevo(p)
  const gepek = p.dedikalt ? Math.max(1, Math.ceil(v.igeny)) : v.igeny
  const onboarding = p.onboardingOra * fejlOra
  const hostHo = p.valtozat === 'hoszt' ? gepek * HOST_HO : 0
  const hostSetup = p.valtozat === 'hoszt' ? gepek * HOST_SETUP : 0
  const setupNet = SETUP - onboarding - hostSetup
  const tamogatas = p.tamogatasOraHasznalo * v.a.hasznalok * fejlOra
  const fedezetHo = v.dijHo - tamogatas - hostHo
  const visszaterul = setupNet >= 0 ? 0 : fedezetHo > 0 ? Math.ceil(-setupNet / fedezetHo) : null
  return { gepek, onboarding, hostHo, hostSetup, setupNet, tamogatas, fedezetHo, visszaterul, harom: setupNet + 36 * fedezetHo, dijHo: v.dijHo, hasznalok: v.a.hasznalok }
}
const fixEv = F.szallito.fixFejlesztoFte.ertek * berEv('fejleszto') + F.szallito.fixEgyebEv.ertek

const ft = (x: number) => `${x < 0 ? '−' : ''}${Math.round(Math.abs(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft`
const mFt = (x: number) => (Math.abs(x) >= 1e9 ? `${x < 0 ? '−' : ''}${(Math.abs(x) / 1e9).toFixed(2).replace('.', ',')} Mrd Ft` : `${x < 0 ? '−' : ''}${(Math.abs(x) / 1e6).toFixed(1).replace('.', ',')} M Ft`)
const ezres = (x: number) => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const szam = (x: number, t = 1) => x.toFixed(t).replace('.', ',')
const szaz = (x: number) => `${x < 0 ? '−' : ''}${Math.round(Math.abs(x) * 100)}%`
const szaz2 = (x: number) => `${(x * 100).toFixed(2).replace('.', ',')}%`
const ho = (x: number | null) => (x === null ? '36 hónapon belül nincs' : `${x}. hónap`)
const csv = (fej: string[], sorok: (string | number)[][]) => [fej.join(';'), ...sorok.map((s) => s.join(';'))].join('\n') + '\n'
const tabla = (fej: string[], sorok: string[][]) => [`| ${fej.join(' | ')} |`, `|${fej.map(() => '---').join('|')}|`, ...sorok.map((s) => `| ${s.join(' | ')} |`)].join('\n')

const ALAPMODELL = [E4B, G12B].map((m) => ({ m, h: vevo(alap('realis', { modell: m })).hasznosEv })).sort((a, b) => a.h - b.h)[0].m
const modellNev = (m: string) => (m === E4B ? 'e4b' : '12b')
const P = (k: FK, p: Partial<Param> = {}) => alap(k, { modell: ALAPMODELL, ...p })
const fr = F.forgatokonyvek
const ker = (k: FK) => fr[k].cim
const UN = (u: UK) => F.uzletagak[u].cim

// adatfájlok
mkdirSync(`${MAPPA}/adatok`, { recursive: true })
for (const f of ['letszam.csv', 'forgalom.csv', 'forgatokonyvek.csv']) rmSync(`${MAPPA}/adatok/${f}`, { force: true })
writeFileSync(`${MAPPA}/adatok/cegmeret.csv`, csv(['uzletag', 'valtozat', 'forgatokonyv', 'letszam', 'hasznalok', 'rendeles_ho', 'arbevetel_ev', 'dij_ev', 'egyszeri', 'ido_ertek_ev', 'plusz_arbevetel_ev', 'arres_ev', 'npv_3ev', 'megterules_ho', 'fedezeti_noveles'], UKK.flatMap((u) => (['hoszt', 'sajat'] as Valtozat[]).flatMap((v) => FKK.flatMap((k) => MERETEK.map((n) => {
  const x = vevo(P(k, { uzletag: u, letszam: n, valtozat: v }))
  return [u, v, k, n, x.a.hasznalok, Math.round(x.a.rendelesHo), Math.round(x.a.arbevetelEv), Math.round(x.dijHo * 12), Math.round(x.egyszeri), Math.round(x.idoEv), Math.round(x.pluszArbevetelEv), Math.round(x.arresEv), Math.round(x.npv), x.megterules ?? '', x.fedezetiNoveles.toFixed(5)]
}))))))

// érzékenység: B2B, referencia, hosztolt, reális
const npvR = (p: Partial<Param>) => vevo(P('realis', p))
const ERZ = [
  { nev: 'Árbevétel-növekedés', also: '0%', felso: '2%', a: npvR({ bevetelNoveles: 0 }), f: npvR({ bevetelNoveles: 0.02 }) },
  { nev: 'Az időmegtakarítás pénzben megjelenő része', also: '28%', felso: '100%', a: npvR({ realizacio: 0.28 }), f: npvR({}) },
  { nev: 'Felfutás az első évben', also: 'a haszon fele', felso: 'azonnal teljes', a: npvR({ felfutas: 0.5 }), f: npvR({}) },
  { nev: 'Keresgélés a kézi munkában (MGI: 19%)', also: 'nincs', felso: 'van', a: npvR({ kereses: false }), f: npvR({}) },
  { nev: 'Háttérfigyelő (lejárt tartozás)', also: 'nincs', felso: 'van', a: npvR({ figyelo: false }), f: npvR({}) },
  { nev: 'Emberi alapvonal', also: 'KLM (alsó korlát)', felso: 'nem begyakorolt', a: npvR({ alapvonal: 'klm' }), f: npvR({ alapvonal: 'kezdo' }) },
  { nev: 'Csendes hibák javítása (30 perc/hiba)', also: 'csak az ágens hibái (11,7%)', felso: 'mindkét fél: ágens 11,7%, ember 9,1%', a: npvR({ hibaMod: 'agens' }), f: npvR({ hibaMod: 'ketoldali' }) },
  { nev: 'Feladatszintű siker (n=3)', also: 'e4b', felso: '12b', a: npvR({ modell: E4B, feladatSiker: true }), f: npvR({ modell: G12B, feladatSiker: true }) },
  { nev: 'Havidíj', also: '+30%', felso: '−30%', a: npvR({ dijSzorzo: 1.3 }), f: npvR({ dijSzorzo: 0.7 }) },
  { nev: 'Bérszint', also: '−20%', felso: '+20%', a: npvR({ berSzorzo: 0.8 }), f: npvR({ berSzorzo: 1.2 }) },
].sort((x, y) => Math.abs(y.f.npv - y.a.npv) - Math.abs(x.f.npv - x.a.npv))
writeFileSync(`${MAPPA}/adatok/erzekenyseg.csv`, csv(['tenyezo', 'kedvezotlen', 'kedvezo', 'npv_kedvezotlen', 'npv_kedvezo', 'megterules_kedvezotlen', 'megterules_kedvezo'], ERZ.map((s) => [s.nev, s.also, s.felso, Math.round(s.a.npv), Math.round(s.f.npv), s.a.megterules ?? '', s.f.megterules ?? ''])))
writeFileSync(`${MAPPA}/adatok/szallito.csv`, csv(['uzletag', 'forgatokonyv', 'letszam', 'hasznalok', 'hosting_gep', 'havi_fedezet', 'visszaterules_ho', 'fedezet_3ev'], UKK.flatMap((u) => FKK.flatMap((k) => MERETEK.map((n) => { const x = szallito(P(k, { uzletag: u, letszam: n })); return [u, k, n, x.hasznalok, x.gepek.toFixed(3), Math.round(x.fedezetHo), x.visszaterul ?? '', Math.round(x.harom)] })))))

// a vevő részletes bontása egy üzletágra
function reszletes(u: UK) {
  const p = P('realis', { uzletag: u })
  const x = vevo(p)
  const fh = SOROK.map((e) => {
    const t = M.find((y) => y.e === e && y.modell === ALAPMODELL)!
    const g = F.uzletagak[u].gyakorisag[e]
    const n = g.nap ? g.ertek * F.ceg.munkanap.ertek : g.ertek * x.a.rendelesHo * 12
    const kezi = t.tipikus * (p.kereses ? KERESES : 1)
    const em = t.emberAgenssel + (1 - sikerEgyben(ALAPMODELL)) * kezi
    return { e, cim: t.cim + (t.kor === 'kiegeszito' ? ' *' : ''), n: n / 12, kezi, em, ora: (n * (kezi - em)) / 3600 / 12, ft: ((n * (kezi - em)) / 3600 / 12) * oraber(MUNKAKOR[e]) }
  }).filter((y) => y.n > 0)
  const U = F.uzletagak[u]
  const s = vevo(P('realis', { uzletag: u, valtozat: 'sajat' }))
  const sorBev = (nev: string, hoE: number, mag: string) => [nev, ft(hoE), mFt(hoE * 12), mag]
  return `### ${UN(u)} (${U.nace}), ${REF} fős cég

*${U.leiras[0].toUpperCase()}${U.leiras.slice(1)}.*

**A cég adatai.** ${REF} fő, ebből a szoftvert **${x.a.hasznalok} fő használja** (a létszám ${szaz(U.felhasznaloArany.ertek)}-a), havi **${ezres(x.a.rendelesHo)} rendelés** (${szam(U.rendelesFo.ertek)} rendelés/használó/hó). Éves nettó árbevétel: **${mFt(x.a.arbevetelEv)}** (${REF} fő × ${szam(U.arbevetelFo[sav(REF)].ertek)} ezer €/fő, Eurostat), bruttó árrés ${szaz(U.arres.ertek)}.

**a) A felszabaduló munkaidő**, havonta:

${tabla(['Feladat', 'Db/hó', 'Kézzel → ágenssel', 'Óra/hó', 'Bérérték/hó'], fh.map((y) => [`${y.e} ${y.cim}`, ezres(y.n), `${Math.round(y.kezi)} s → ${Math.round(y.em)} s`, szam(y.ora), ft(y.ft)]))}
| **Összesen** | | | **${szam(fh.reduce((s2, y) => s2 + y.ora, 0))} óra** | **${ft(x.idoEv / 12)}** |

A *-gal jelölt sorok a tíz alapfeladaton kívüli, szintén mért feladatok. A kézi idő a keresgéléssel együtt értendő (a tipikus idő 1/(1 − ${szam(F.kereses.arany.ertek, 2)})-szerese).

**A vevő mérlege (reális forgatókönyv: ${szaz(fr.realis.bevetelNoveles)} pluszforgalom, nálunk hosztolva):**

${tabla(['', 'Havonta', 'Évente', 'Honnan'], [
  sorBev('a) Felszabaduló munkaidő bérértéke', x.idoEv / 12, 'a fenti tábla'),
  [`Pluszforgalom (${szaz(p.bevetelNoveles)})`, ft(x.pluszArbevetelEv / 12), mFt(x.pluszArbevetelEv), `${mFt(x.a.arbevetelEv)} × ${szaz(p.bevetelNoveles)}`],
  sorBev(`b) A pluszforgalom árrése (${szaz(U.arres.ertek)})`, x.arresEv / 12, 'csak az árrés számít, az áru beszerzési ára nem nyereség'),
  sorBev('c) Háttérfigyelő: a lejárt tartozás korábbi észlelése', x.figyeloEv / 12, `árbevétel × ${szaz(FIG.kesoFizetesArany.ertek)} késve fizetett × ${szam(FIG.eszlelesNap.ertek)} nap / 365 × ${szam(FIG.kamat.ertek * 100)}% kamat`),
  [`**Haszon összesen**`, `**${ft(x.hasznosEv / 12)}**`, `**${mFt(x.hasznosEv)}**`, ''],
  sorBev(`Havidíj (${x.a.hasznalok} használó × ${ft(DIJ_FO)})`, -x.dijHo, ''),
  [`**Nettó haszon**`, `**${ft((x.hasznosEv - x.koltsegEv) / 12)}**`, `**${mFt(x.hasznosEv - x.koltsegEv)}**`, ''],
  ['Egyszeri beüzemelés', ft(-SETUP), '', '800 €'],
])}

**Megtérülés: ${ho(x.megterules)}.** Háromévi NPV: ${mFt(x.npv)}. Saját szerverrel (${s.sajatGep} gép, ${mFt(s.szerver)}, rendszergazda évi ${mFt(s.rendszergazda)}): megtérülés ${ho(s.megterules)}, NPV ${mFt(s.npv)}.

**Mekkora pluszforgalom kell?** Időmegtakarítás nélkül, csak a pluszforgalom árréséből az éves díjat **${szaz2(x.fedezetiNoveles)}** árbevétel-növekedés fedezi, az egy hónap alatti megtérüléshez (a beüzemeléssel együtt) **${szaz2(x.egyHonapNoveles)}** kell.
`
}

const meretTabla = (u: UK, v: Valtozat) =>
  tabla(['Létszám', 'Használó', 'Rendelés/hó', 'Árbevétel/év', 'Díj/év', 'Egyszeri', 'Munkaidő-érték/év', 'Árrés a pluszforgalmon/év (reális)', ...FKK.map((k) => `Megtérülés: ${ker(k).toLowerCase()}`), 'Fedezeti növekedés'], MERETEK.map((n) => {
    const x = FKK.map((k) => vevo(P(k, { uzletag: u, letszam: n, valtozat: v })))
    const m = x[1]
    return [`${n} fő`, String(m.a.hasznalok), ezres(m.a.rendelesHo), mFt(m.a.arbevetelEv), mFt(m.dijHo * 12), mFt(m.egyszeri), mFt(m.idoEv), mFt(m.arresEv), ...x.map((y) => ho(y.megterules)), szaz2(m.fedezetiNoveles)]
  }))

const R = vevo(P('realis'))
const SZ = Object.fromEntries(FKK.map((k) => [k, szallito(P(k))])) as Record<FK, ReturnType<typeof szallito>>
const SZD = szallito(P('realis', { dedikalt: true }))
const fedUgyfel = (x: ReturnType<typeof szallito>) => (x.harom > 0 ? Math.ceil((fixEv * 3) / x.harom) : null)
const kap = (u: UK) => {
  const p = P('realis', { uzletag: u })
  const x = vevo(p)
  const ora = (x.a.legacyOra - x.a.agensOra) * F.projekt.kapacitasVisszaforgatas.ertek
  const arbOra = x.a.arbevetelEv / (p.letszam * F.ber.hasznosOraEv.ertek)
  return { ora, arbOra, plusz: ora * arbOra, arres: ora * arbOra * x.a.arres, arany: (ora * arbOra) / x.a.arbevetelEv }
}

const fv = `# Pénzügyi terv: munkaidő-megtakarítás és pluszforgalom, 25 €/használó/hó

*Generálta: \`scripts/riportok/penzugy.ts\` · a feltevések és forrásaik: [feltevesek.md](feltevesek.md) · adatok: [adatok/](adatok/)*

> A fájlt a szkript generálja a [feltevesek.json](feltevesek.json) alapján. Minden ár nettó, adóhatások nélkül. Árfolyam: ${szam(EUR, 0)} Ft/€.

## 1. A rövid válasz

A szoftvert használó munkatársak fejenként **havi ${F.arazas.havidijEurFo.ertek} €-t** (${ft(DIJ_FO)}), a cég egyszer **${F.arazas.setupEur.ertek} € beüzemelést** (${ft(SETUP)}) fizet. A szoftver a mi bérelt szerverünkön fut.

A vevő haszna három forrásból jön:
- **a) munkaidő:** a mérésben szereplő 18 feladat gyorsabb elvégzése (a tíz alapfeladat és nyolc kiegészítő), a tipikus ügyintéző bérével, a keresgéléssel együtt;
- **b) pluszforgalom:** a gyorsabb ajánlat- és rendeléskezelés miatt kevesebb elveszett érdeklődés, több üzlet; ebből csak a **bruttó árrés** számít haszonnak;
- **c) háttérfigyelő:** a lejárt tartozást a heti egyszeri kézi átnézés helyett azonnal jelzi, így a pénz korábban folyik be.

**Egy ${REF} fős cégnél, a reális forgatókönyvben (${szaz(fr.realis.bevetelNoveles)} pluszforgalom), nálunk hosztolva:**

${tabla(['Üzletág', 'Használó', 'Árbevétel/év', 'Díj/év', 'a) Munkaidő/év', 'b) Árrés a pluszforgalmon/év', 'c) Figyelő/év', 'Megtérülés', 'Fedezeti növekedés'], UKK.map((u) => {
  const x = vevo(P('realis', { uzletag: u }))
  return [UN(u), String(x.a.hasznalok), mFt(x.a.arbevetelEv), mFt(x.dijHo * 12), mFt(x.idoEv), mFt(x.arresEv), mFt(x.figyeloEv), ho(x.megterules), szaz2(x.fedezetiNoveles)]
}))}

A *fedezeti növekedés* az az árbevétel-növekedés, amelynek árrése időmegtakarítás nélkül, egymagában kifizeti az éves díjat. A díj a cég árbevételéhez képest kicsi, ezért ehhez már néhány tized százalék pluszforgalom elég.

**Ami továbbra sincs benne:** a mérésben nem szereplő munka, a figyelő többi jelzése (késés, elakadt rendelés, készlethiány; ez utóbbi illusztrációja a 8. fejezetben), és az ügyfélelégedettség.

## 2. Az üzleti konstrukció

| Tétel | Ár |
|---|---|
| Havidíj | ${F.arazas.havidijEurFo.ertek} €/használó/hó (${ft(DIJ_FO)}); csak a szoftvert ténylegesen használók után |
| Egyszeri beüzemelés | ${F.arazas.setupEur.ertek} € (${ft(SETUP)}) cégenként |
| Minimális szerződés | ${F.arazas.szerzodesMinimumHo.ertek} hónap |

**Nálunk hosztolva (alapeset).** A szoftver az eladó bérelt GPU-szerverein fut (Hetzner GEX44, havi ${F.hosting.gepEurHo.ertek} €, ${ft(HOST_HO)}), több ügyfél között a mért terhelés szerint megosztva. A hosting az eladó költsége, a havidíj tartalmazza. **Az ügyféladat ebben a változatban elhagyja a céget:** adatfeldolgozói szerződés kell, és az [adatkimenet-riport](../05-osszehasonlitasok/10-adatkimenet.md) „minden adat helyben marad” megállapítása erre a változatra nem érvényes.

**Saját szerver.** A vevő megveszi a gépet (Mac Studio M4 Max 48 GB, ${ft(F.gep.ar.ertek)} + ${ft(F.gep.kiegeszitok.ertek)} kiegészítő gépenként; ${F.gep.tartalekLetszamtol.ertek} használótól tartalékgéppel), és a rendszergazdája üzemelteti. A díj ugyanaz, az adat a cégen belül marad.

## 3. A módszer

**a) Munkaidő.** A mérés 18 feladatára: a tíz alapfeladatra (E1–E10) és nyolc kiegészítőre (E11–E18: új vevő felvétele, vezetői jóváhagyás, készlethiány a jóváhagyáskor, kiszállítás indítása, bevételezés, lemondás, sztornó, reklamáció). Mindegyiket mértük az ágenssel, a kézi idejüket ugyanazzal a KLM-módszerrel számoltuk. A gyakoriságuk a munkaerő-becslés arányaiból jön (például a lemondás és a sztornó a rendelések 2%-a). Feladatonként a régi munkamód ideje (a **tipikus**, gyakorlott, de nem szakértő ügyintézőé, [03-emberi-tenyezo](../03-emberi-tenyezo/emberi-ido-pontositas.md)) mínusz az ember ideje az ágens mellett (kérés, olvasás, jóváhagyás, a sikertelen futás kézi megismétlése), évi darabszámmal és a munkakör KSH-bérével (járulékkal) szorozva. **Keresgélés:** a McKinsey Global Institute (2012) szerint a tudásmunkások a munkahét kb. ${szaz(F.kereses.arany.ertek)}-át információkeresésre fordítják; a reális és az optimista forgatókönyvben a kézi időt ennyivel növeljük (1/(1 − ${szam(F.kereses.arany.ertek, 2)}) ≈ ${szam(KERESES, 2)}-szeres), mert a keresést az ágens végzi. A munkahét-szintű arány feladatra vetítése közelítés, ezért az óvatos forgatókönyvben nincs benne. Az alapeset a felszabadult munkaidő teljes bérértékét számolja; azt, hogy ennek csak egy része jelenik meg pénzben (Gartner G3, G5, G6), az érzékenységi tábla mutatja.

**b) Pluszforgalom.** A cég éves árbevétele a létszám és az Eurostat szerinti egy főre jutó nettó árbevétel szorzata, a cégméret szerinti kategóriában. A forgatókönyvek a jelenlegi árbevétel ${FKK.map((k) => szaz2(fr[k].bevetelNoveles)).join(', ')}-os növekedésével számolnak. **A pluszforgalomból csak a bruttó árrés számít haszonnak**, mert az eladott áru beszerzési ára nem nyereség. A növekedés mértékére nincs mért vagy publikált adat; az irányt a Harvard Business Review 2011-es vizsgálata mutatja (Oldroyd, McElheran és Elkington; 2241 amerikai cég): aki egy órán belül válaszol egy érdeklődésre, kb. hétszer nagyobb eséllyel jut érdemi beszélgetéshez. Ezért a riport a forgatókönyvek mellett a **fedezeti növekedést** is megadja: azt a legkisebb növekedést, amely a díjat egymagában kifizeti. A *kevesebb elveszett érdeklődés* pontosan ez a tétel; külön nem adjuk hozzá, mert kétszer számolnánk.

**c) Háttérfigyelő.** A legacy forgatókönyvben a lejárt tartozásokat hétfőnként nézik át, az észlelés átlagos késése így ${szam(FIG.eszlelesNap.ertek)} nap; a figyelő percek alatt jelez ([03-figyelo-haszna](../05-osszehasonlitasok/03-figyelo-haszna.md): medián 290 s). A haszon: árbevétel × a késve fizetett számlák aránya (${szaz(FIG.kesoFizetesArany.ertek)}, EOS, European Payment Practices 2025, Magyarország) × ${szam(FIG.eszlelesNap.ertek)} / 365 × ${szam(FIG.kamat.ertek * 100)}% (MNB alapkamat), vagyis a korábban befolyó pénz finanszírozási értéke. Feltételezi, hogy a korábbi felszólítás a fizetést ugyanennyivel hozza előre. Kis összeg, de forrásolt.

**Az üzletágak adatai:**

${tabla(['Üzletág', 'NACE', 'Árbevétel/fő/év (5–49 fő)', 'Árbevétel/fő/év (50+ fő)', 'Bruttó árrés', 'Használók aránya', 'Rendelés/használó/hó'], UKK.map((u) => { const U = F.uzletagak[u]; return [U.cim, U.nace, `${szam(U.arbevetelFo['10-49'].ertek)} e€`, `${szam(U.arbevetelFo['50-249'].ertek)} e€`, szaz(U.arres.ertek), szaz(U.felhasznaloArany.ertek), szam(U.rendelesFo.ertek)] }))}

Az árbevétel és az árrés forrása: Eurostat, Structural business statistics, Magyarország, 2022 (\`sbs_sc_ovw\` méretkategória szerint, \`sbs_ovw_act\` az árréshez). A 2–9 fős cégek adata Magyarországon titkos, ezért az 5 fős céghez is a 10–49 fős érték tartozik. A webes kiskereskedelemnél méretkategória szerinti bontás nincs. A használók aránya a B2B-nél a forgatókönyv cégéből jön (40 főből kb. 14 adminisztratív munkatárs), a másik két üzletágban saját feltevés.

**Hibák.** A sikertelen futás kézi újracsinálása az ember idejében szerepel; a csendes hibák javítását az alapeset semlegesen kezeli, a hatása az érzékenységi táblában.

**Modell.** Az alapesetben a kisebb hasznot adó modell szerepel (most **${modellNev(ALAPMODELL)}**), a 99 futásos sikerességgel (e4b ${szaz(F.meres.sikerE4b.ertek)}, 12b ${szaz(F.meres.siker12b.ertek)}).

## 4. Üzletágonként: bevétel, költség, megtérülés

${UKK.map(reszletes).join('\n')}

## 5. Cégméret szerint: 5, 10, 15, 50 és 100 fő

A *megtérülés* az a hónap, amelyben a halmozott haszon először fedezi a beüzemelést és az addigi díjakat. A *fedezeti növekedés* az időmegtakarítás nélkül, egymagában a díjat fedező árbevétel-növekedés.

${UKK.map((u) => `### ${UN(u)}

**Nálunk hosztolva:**

${meretTabla(u, 'hoszt')}

**Saját szerverrel:**

${meretTabla(u, 'sajat')}`).join('\n\n')}

## 6. Érzékenység (B2B, ${REF} fő, hosztolt, reális)

Az alapeset megtérülése ${ho(R.megterules)}, háromévi NPV-je ${mFt(R.npv)}. Egyszerre egy feltevést változtatunk.

${tabla(['Tényező', 'Kedvezőtlen', 'NPV', 'Megtérülés', 'Kedvező', 'NPV', 'Megtérülés'], ERZ.map((s) => [s.nev, s.also, mFt(s.a.npv), ho(s.a.megterules), s.felso, mFt(s.f.npv), ho(s.f.megterules)]))}

## 7. A felszabaduló kapacitás: mennyi pluszforgalom férne bele?

Illusztráció, nem forgatókönyv. Ha a felszabadult munkaidőnek csak ${szaz(F.projekt.kapacitasVisszaforgatas.ertek)}-a megy értékesítésre (a Gartner G6 szerint a szervezetek 72%-a nem forgatja vissza az időt), és ez az óra annyi forgalmat hoz, mint egy átlagos munkaóra a cégben (árbevétel / létszám / ${ezres(F.ber.hasznosOraEv.ertek)} óra):

${tabla(['Üzletág, ' + REF + ' fő', 'Értékesítésre fordított óra/év', 'Árbevétel / munkaóra', 'Pluszforgalom/év', 'Az árbevétel %-ában', 'Árrés/év'], UKK.map((u) => { const k = kap(u); return [UN(u), ezres(k.ora), ft(k.arbOra), mFt(k.plusz), szaz2(k.arany), mFt(k.arres)] }))}

Az átlagos munkaóra árbevétele felülbecsüli a pluszóra hatását, mert az átlagban a meglévő vevőkör és a teljes cég munkája is benne van. ${(() => {
  const jo = UKK.filter((u) => kap(u).arany >= fr.realis.bevetelNoveles).map(UN)
  const nem = UKK.filter((u) => kap(u).arany < fr.realis.bevetelNoveles).map(UN)
  const ok = 'a pluszforgalomnak ott a gyorsabb válaszból (több megnyert érdeklődés) kell jönnie, nem a több értékesítési órából, ezért ott a fedezeti növekedés a megbízhatóbb mérőszám'
  if (!jo.length) return `A reális forgatókönyv ${szaz(fr.realis.bevetelNoveles)}-os növekedése egyik üzletágban sem jön ki pusztán a felszabaduló kapacitásból: ${ok}.`
  return `A reális forgatókönyv ${szaz(fr.realis.bevetelNoveles)}-os növekedése a(z) ${jo.join(', ')} üzletágban kijön a felszabaduló kapacitásból${nem.length ? `, a(z) ${nem.join(', ')} üzletágban nem: ${ok}` : ''}.`
})()}

## 8. A háttérfigyelő: a minimum alatti készlet (illusztráció)

A figyelő a minimumszint alá eső készletet azonnal jelzi; a forgatókönyvben ezt a raktárvezető hetente egyszer nézi át, és legutóbb négy cikk volt a minimum alatt, kettő teljesen elfogyott. A készlethiány miatti forgalomkiesés a kiskereskedelmi kutatásban legfeljebb kb. ${szaz(FIG.keszlethianyVeszteseg.ertek)} (Gruen, Corsten és Bharadwaj, 2002, napi fogyasztási cikkek). Arra nincs forrás, hogy ennek mekkora részét előzi meg a korábbi jelzés, ezért ez a tábla nem forgatókönyv, és a megtérülésben nem szerepel:

${tabla(['Üzletág, ' + REF + ' fő', 'Árbevétel/év', `Kiesés felső becslése (${szaz(FIG.keszlethianyVeszteseg.ertek)})`, ...FIG.megelozott.ertek.map((m) => `Ha ${szaz(m)}-át megelőzi: árrés/év`)], UKK.map((u) => {
  const x = vevo(P('realis', { uzletag: u }))
  const kieses = x.a.arbevetelEv * FIG.keszlethianyVeszteseg.ertek
  return [UN(u), mFt(x.a.arbevetelEv), mFt(kieses), ...FIG.megelozott.ertek.map((m) => mFt(kieses * m * x.a.arres))]
}))}

A figyelő további jelzései (késő csomag, elakadt rendelés, régóta nyitott hibajegy) az ügyfélelégedettséget javítják, forintértéket nem rendelünk hozzájuk.

## 9. Az eladó oldala

Az óradíj a KSH fejlesztői bérköltsége (${ft(fejlOra)}/óra), vállalkozói díj és árrés nélkül.

**Egy ${REF} fős B2B-ügyfél** (${SZ.realis.hasznalok} használó, díj ${ft(SZ.realis.dijHo)}/hó; a hosting megosztott, a terhelés szerint ${szam(SZ.realis.gepek, 2)} gép jut rá):

${tabla(['', ...FKK.map(ker)], [
  ['Beüzemelés, óra', ...FKK.map((k) => String(fr[k].onboardingOra))],
  ['Beüzemelési díj mínusz költség', ...FKK.map((k) => ft(SZ[k].setupNet))],
  ['Hosting', ...FKK.map((k) => `${ft(SZ[k].hostHo)} / hó`)],
  ['Támogatás', ...FKK.map((k) => `${ft(SZ[k].tamogatas)} / hó (${szam(fr[k].tamogatasOraHasznalo * SZ[k].hasznalok)} óra)`)],
  ['Havi fedezet', ...FKK.map((k) => `${ft(SZ[k].fedezetHo)} / hó`)],
  ['Fedezet 3 évre', ...FKK.map((k) => mFt(SZ[k].harom))],
  ['Fedezeti ügyfélszám (a fix költségre)', ...FKK.map((k) => String(fedUgyfel(SZ[k]) ?? 'nincs'))],
])}

**Dedikált szerverrel** (ügyfelenként egy saját bérelt gép) ugyanez az ügyfél havi ${ft(SZD.fedezetHo)} fedezetet ad: egy gép ${ft(HOST_HO)}/hó, ami ${Math.ceil(HOST_HO / DIJ_FO)} használó díja. Kis ügyfeleknek ezért csak a megosztott hosting fenntartható.

**Ügyfélméret szerint** (B2B-ügyfelek, reális): a fix költség évi ${mFt(fixEv)} (${szam(F.szallito.fixFejlesztoFte.ertek)} FTE termékfejlesztés, ebben a csatolók fejlesztése, és egyéb tételek).

${tabla(['Ügyfél mérete', 'Használó', 'Havi fedezet / ügyfél', 'Fedezeti ügyfélszám'], MERETEK.map((n) => { const x = szallito(P('realis', { letszam: n })); return [`${n} fő`, String(x.hasznalok), ft(x.fedezetHo), String(fedUgyfel(x) ?? 'nincs')] }))}

## 10. Ami kimaradt

**Pozitív irányban:** a mérésben nem szereplő munka; a figyelő készlethiány-jelzése (illusztráció a 8. fejezetben) és többi jelzése; a szabályok felidézése és utánanézése a kézi munkában (a keresgélésen túl); a pluszforgalom valódi mértéke, amelyet csak egy bevezetés előtti és utáni összevetés mérhetne.

**Negatív irányban:** a szervezeti ellenállás, az ügyfél-lemorzsolódás, az értékesítés költsége, az interfészváltozások javítása ([09-valtozastures.md](../05-osszehasonlitasok/09-valtozastures.md)), egyedi legacy rendszernél a csatolók fejlesztése (a beüzemelés ekkor nem néhány óra).

## 11. Korlátok

- **A pluszforgalom mértéke feltevés.** Mért vagy publikált százalék nincs; ezért közöljük a fedezeti növekedést, amely a forgatókönyvektől független.
- **Az árbevétel és az árrés ágazati átlag,** egy konkrét cégnél ettől jelentősen eltérhet. A 2–9 fős cégekre nincs magyar adat.
- **Az emberi idő számított, nem mért.** A tipikus felhasználó a KLM-re épül, forrásolt korrekciókkal; a keresgélés munkahét-szintű aránya feladatra vetítve közelítés.
- **A figyelő haszna feltételezi,** hogy a korábbi felszólítás a fizetést ugyanannyival hozza előre, amennyivel az észlelés korábbi.
- **A használók aránya és a rendelés/használó érték** a webáruháznál és a gépforgalmazónál saját feltevés.
- **A GPU-s bérelt szerver kapacitását nem mértük,** a megosztás a Macen mért gépidőből indul.
- **Az ár üzleti döntés,** fizető ügyféllel nem teszteltük.
`

const tipusNev: Record<string, string> = { mert: 'mért', forras: 'forrás', sajat: 'saját' }
const sorokBol = (o: object) => Object.entries(o as Record<string, Tetel>).filter(([k, v]) => !k.startsWith('_') && typeof v === 'object' && v !== null && 'ertek' in v).map(([k, v]) => [k, Array.isArray(v.ertek) ? (v.ertek as number[]).join(', ') : String(v.ertek), tipusNev[v.tipus] ?? v.tipus, v.forras, v.indok])
const blokk = (cim: string, o: object) => `## ${cim}\n\n${tabla(['Név', 'Érték', 'Típus', 'Forrás', 'Indoklás'], sorokBol(o))}\n`
const fmd = `# Pénzügyi feltevések

*A [feltevesek.json](feltevesek.json) fájlból generálva. Típus: **mért** (saját mérésből), **forrás** (külső adat), **saját** (feltevés vagy üzleti döntés, külső alátámasztás nélkül).*

${blokk('Árazás', F.arazas)}
${blokk('Hosting (nálunk)', F.hosting)}
${blokk('Saját szerver és áram', F.gep)}
${blokk('Cégméretek', F.ceg)}
${UKK.map((u) => { const U = F.uzletagak[u]; return `## Üzletág: ${U.cim} (${U.nace})\n\n${U.leiras[0].toUpperCase()}${U.leiras.slice(1)}.\n\n${tabla(['Név', 'Érték', 'Típus', 'Forrás', 'Indoklás'], [...sorokBol({ felhasznaloArany: U.felhasznaloArany, rendelesFo: U.rendelesFo, arres: U.arres }), ...sorokBol(U.arbevetelFo).map((s) => [`arbevetelFo (${s[0]} fő)`, ...s.slice(1)]), ...sorokBol(U.gyakorisag).map((s) => [`${s[0]}${U.gyakorisag[s[0]].nap ? ' (naponta)' : ' (rendelésenként)'}`, ...s.slice(1)])])}\n` }).join('\n')}
${blokk('Keresgélés', F.kereses)}
${blokk('Háttérfigyelő', F.figyelo)}
${blokk('Bérek', F.ber)}
${blokk('Mérésből', F.meres)}
${blokk('Felhő és árfolyam', F.felho)}
${blokk('Projekt', F.projekt)}
${blokk('Az eladó oldala', F.szallito)}
## Forgatókönyvek

${tabla(['', ...FKK.map(ker)], [
  ['Árbevétel-növekedés', ...FKK.map((k) => szaz2(fr[k].bevetelNoveles))],
  ['Az időmegtakarítás pénzben', ...FKK.map((k) => szaz(fr[k].realizacio))],
  ['Keresgélés a kézi időben', ...FKK.map((k) => (fr[k].kereses ? 'igen' : 'nem'))],
  ['Beüzemelés (óra)', ...FKK.map((k) => String(fr[k].onboardingOra))],
  ['Támogatás (óra/használó/hó)', ...FKK.map((k) => szam(fr[k].tamogatasOraHasznalo))],
  ['Rendszergazda (FTE, csak saját szerver)', ...FKK.map((k) => String(fr[k].rendszergazdaFte))],
])}

${Object.entries(fr._forras).map(([k, v]) => `- **${k}:** ${v}`).join('\n')}

## Források

- Eurostat, Structural business statistics: \`sbs_sc_ovw\` (Enterprise statistics by size class and NACE Rev. 2 activity) és \`sbs_ovw_act\` (Enterprises by detailed NACE Rev. 2 activity), Magyarország, 2022; lekérdezve az Eurostat adatbázis API-ján, 2026-11-16.
- McKinsey Global Institute (2012): The social economy: Unlocking value and productivity through social technologies.
- EOS (2025): European Payment Practices 2025.
- Gruen, T. W., Corsten, D. S., Bharadwaj, S. (2002): Retail Out-of-Stocks: A Worldwide Examination of Extent, Causes and Consumer Responses. Grocery Manufacturers of America.
- MNB, kamatdöntés, 2026. október 20.
- Oldroyd, J. B., McElheran, K., Elkington, D. (2011): The Short Life of Online Sales Leads. *Harvard Business Review* 89(3), 28.
- KSH STADAT 20.1.1.52., foglalkozás szerinti keresetek, 2025.
- Gartner G3, G5, G6: [gartner-forrasok.md](../02-szakirodalom/gartner-forrasok.md).
- [Hetzner, árkorrekció (GEX44)](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), a bérelt GPU-szerver ára.
- [Alza.hu, Mac Studio M4 Max](https://m.alza.hu/mac-studio-m4-max-d13290554.htm), a saját szerver ára.
- [Apple, Mac mini fogyasztás](https://support.apple.com/103253).
- [Szocho 2026](https://adozona.hu/tb_jarulekok_nyugdij/A_szocialis_hozzajarulasi_ado_2026_januar_1_7IZAR5), [2018. évi LII. törvény](https://njt.jog.gov.hu/jogszabaly/2018-52-00-00).
- [Privátbankár, KKV-áram](https://privatbankar.hu/cikkek/makro/minden-amit-a-kkv-s-rezsicsokkentesrol-tudni-kell.html).
- [MNB egyéb árfolyamok, 2026-07-01](https://www.mnb.hu/letoltes/az-mnb-hivatalos-devizalapjan-nem-szereplo-egyeb-arfolyamok-2026-07-01.pdf).
`
writeFileSync(`${MAPPA}/penzugyi-elemzes.md`, fv)
writeFileSync(`${MAPPA}/feltevesek.md`, fmd)
for (const u of UKK) console.log(u, FKK.map((k) => { const x = vevo(P(k, { uzletag: u })); return `${k}: megtérülés ${ho(x.megterules)}, NPV ${mFt(x.npv)}` }).join(' | '), `fedezeti növekedés ${szaz2(vevo(P('realis', { uzletag: u })).fedezetiNoveles)}`)
console.log('alapmodell', modellNev(ALAPMODELL), 'eladó havi fedezet (B2B, megosztott)', ft(SZ.realis.fedezetHo), 'dedikált', ft(SZD.fedezetHo))
