# Pénzügyi terv: munkaidő-megtakarítás és pluszforgalom, 25 €/használó/hó

*Generálta: `scripts/riportok/penzugy.ts` · a feltevések és forrásaik: [feltevesek.md](feltevesek.md) · adatok: [adatok/](adatok/)*

> A fájlt a szkript generálja a [feltevesek.json](feltevesek.json) alapján. Minden ár nettó, adóhatások nélkül. Árfolyam: 378 Ft/€.

## 1. A rövid válasz

A szoftvert használó munkatársak fejenként **havi 25 €-t** (9 450 Ft), a cég egyszer **800 € beüzemelést** (302 400 Ft) fizet. A szoftver a mi bérelt szerverünkön fut.

A vevő haszna három forrásból jön:
- **a) munkaidő:** a mérésben szereplő 18 feladat gyorsabb elvégzése (a tíz alapfeladat és nyolc kiegészítő), a tipikus ügyintéző bérével, a keresgéléssel együtt;
- **b) pluszforgalom:** a gyorsabb ajánlat- és rendeléskezelés miatt kevesebb elveszett érdeklődés, több üzlet; ebből csak a **bruttó árrés** számít haszonnak;
- **c) háttérfigyelő:** a lejárt tartozást a heti egyszeri kézi átnézés helyett azonnal jelzi, így a pénz korábban folyik be.

**Egy 15 fős cégnél, a reális forgatókönyvben (1% pluszforgalom), nálunk hosztolva:**

| Üzletág | Használó | Árbevétel/év | Díj/év | a) Munkaidő/év | b) Árrés a pluszforgalmon/év | c) Figyelő/év | Megtérülés | Fedezeti növekedés |
|---|---|---|---|---|---|---|---|---|
| B2B nagykereskedelem | 5 | 2,09 Mrd Ft | 0,6 M Ft | 5,8 M Ft | 4,3 M Ft | 0,2 M Ft | 1. hónap | 0,13% |
| Webáruház (B2C) | 5 | 496,7 M Ft | 0,6 M Ft | 1,2 M Ft | 1,4 M Ft | 0,1 M Ft | 2. hónap | 0,42% |
| Ipari gépforgalmazás szervizzel | 6 | 1,73 Mrd Ft | 0,7 M Ft | 1,8 M Ft | 3,7 M Ft | 0,2 M Ft | 1. hónap | 0,18% |

A *fedezeti növekedés* az az árbevétel-növekedés, amelynek árrése időmegtakarítás nélkül, egymagában kifizeti az éves díjat. A díj a cég árbevételéhez képest kicsi, ezért ehhez már néhány tized százalék pluszforgalom elég.

**Ami továbbra sincs benne:** a mérésben nem szereplő munka, a figyelő többi jelzése (késés, elakadt rendelés, készlethiány; ez utóbbi illusztrációja a 8. fejezetben), és az ügyfélelégedettség.

## 2. Az üzleti konstrukció

| Tétel | Ár |
|---|---|
| Havidíj | 25 €/használó/hó (9 450 Ft); csak a szoftvert ténylegesen használók után |
| Egyszeri beüzemelés | 800 € (302 400 Ft) cégenként |
| Minimális szerződés | 12 hónap |

**Nálunk hosztolva (alapeset).** A szoftver az eladó bérelt GPU-szerverein fut (Hetzner GEX44, havi 232.3 €, 87 809 Ft), több ügyfél között a mért terhelés szerint megosztva. A hosting az eladó költsége, a havidíj tartalmazza. **Az ügyféladat ebben a változatban elhagyja a céget:** adatfeldolgozói szerződés kell, és az [adatkimenet-riport](../05-osszehasonlitasok/10-adatkimenet.md) „minden adat helyben marad” megállapítása erre a változatra nem érvényes.

**Saját szerver.** A vevő megveszi a gépet (Mac Studio M4 Max 48 GB, 1 092 390 Ft + 150 000 Ft kiegészítő gépenként; 25 használótól tartalékgéppel), és a rendszergazdája üzemelteti. A díj ugyanaz, az adat a cégen belül marad.

## 3. A módszer

**a) Munkaidő.** A mérés 18 feladatára: a tíz alapfeladatra (E1–E10) és nyolc kiegészítőre (E11–E18: új vevő felvétele, vezetői jóváhagyás, készlethiány a jóváhagyáskor, kiszállítás indítása, bevételezés, lemondás, sztornó, reklamáció). Mindegyiket mértük az ágenssel, a kézi idejüket ugyanazzal a KLM-módszerrel számoltuk. A gyakoriságuk a munkaerő-becslés arányaiból jön (például a lemondás és a sztornó a rendelések 2%-a). Feladatonként a régi munkamód ideje (a **tipikus**, gyakorlott, de nem szakértő ügyintézőé, [03-emberi-tenyezo](../03-emberi-tenyezo/emberi-ido-pontositas.md)) mínusz az ember ideje az ágens mellett (kérés, olvasás, jóváhagyás, a sikertelen futás kézi megismétlése), évi darabszámmal és a munkakör KSH-bérével (járulékkal) szorozva. **Keresgélés:** a McKinsey Global Institute (2012) szerint a tudásmunkások a munkahét kb. 19%-át információkeresésre fordítják; a reális és az optimista forgatókönyvben a kézi időt ennyivel növeljük (1/(1 − 0,19) ≈ 1,23-szeres), mert a keresést az ágens végzi. A munkahét-szintű arány feladatra vetítése közelítés, ezért az óvatos forgatókönyvben nincs benne. Az alapeset a felszabadult munkaidő teljes bérértékét számolja; azt, hogy ennek csak egy része jelenik meg pénzben (Gartner G3, G5, G6), az érzékenységi tábla mutatja.

**b) Pluszforgalom.** A cég éves árbevétele a létszám és az Eurostat szerinti egy főre jutó nettó árbevétel szorzata, a cégméret szerinti kategóriában. A forgatókönyvek a jelenlegi árbevétel 0,50%, 1,00%, 2,00%-os növekedésével számolnak. **A pluszforgalomból csak a bruttó árrés számít haszonnak**, mert az eladott áru beszerzési ára nem nyereség. A növekedés mértékére nincs mért vagy publikált adat; az irányt a Harvard Business Review 2011-es vizsgálata mutatja (Oldroyd, McElheran és Elkington; 2241 amerikai cég): aki egy órán belül válaszol egy érdeklődésre, kb. hétszer nagyobb eséllyel jut érdemi beszélgetéshez. Ezért a riport a forgatókönyvek mellett a **fedezeti növekedést** is megadja: azt a legkisebb növekedést, amely a díjat egymagában kifizeti. A *kevesebb elveszett érdeklődés* pontosan ez a tétel; külön nem adjuk hozzá, mert kétszer számolnánk.

**c) Háttérfigyelő.** A legacy forgatókönyvben a lejárt tartozásokat hétfőnként nézik át, az észlelés átlagos késése így 3,5 nap; a figyelő percek alatt jelez ([03-figyelo-haszna](../05-osszehasonlitasok/03-figyelo-haszna.md): medián 290 s). A haszon: árbevétel × a késve fizetett számlák aránya (20%, EOS, European Payment Practices 2025, Magyarország) × 3,5 / 365 × 5,5% (MNB alapkamat), vagyis a korábban befolyó pénz finanszírozási értéke. Feltételezi, hogy a korábbi felszólítás a fizetést ugyanennyivel hozza előre. Kis összeg, de forrásolt.

**Az üzletágak adatai:**

| Üzletág | NACE | Árbevétel/fő/év (5–49 fő) | Árbevétel/fő/év (50+ fő) | Bruttó árrés | Használók aránya | Rendelés/használó/hó |
|---|---|---|---|---|---|---|
| B2B nagykereskedelem | G46 nagykereskedelem | 368,7 e€ | 456,0 e€ | 21% | 35% | 62,9 |
| Webáruház (B2C) | G4791 csomagküldő és internetes kiskereskedelem | 87,6 e€ | 87,6 e€ | 27% | 30% | 150,0 |
| Ipari gépforgalmazás szervizzel | G466 egyéb gép, berendezés nagykereskedelme | 304,5 e€ | 486,7 e€ | 22% | 40% | 8,0 |

Az árbevétel és az árrés forrása: Eurostat, Structural business statistics, Magyarország, 2022 (`sbs_sc_ovw` méretkategória szerint, `sbs_ovw_act` az árréshez). A 2–9 fős cégek adata Magyarországon titkos, ezért az 5 fős céghez is a 10–49 fős érték tartozik. A webes kiskereskedelemnél méretkategória szerinti bontás nincs. A használók aránya a B2B-nél a forgatókönyv cégéből jön (40 főből kb. 14 adminisztratív munkatárs), a másik két üzletágban saját feltevés.

**Hibák.** A sikertelen futás kézi újracsinálása az ember idejében szerepel; a csendes hibák javítását az alapeset semlegesen kezeli, a hatása az érzékenységi táblában.

**Modell.** Az alapesetben a kisebb hasznot adó modell szerepel (most **e4b**), a 99 futásos sikerességgel (e4b 92%, 12b 94%).

## 4. Üzletágonként: bevétel, költség, megtérülés

### B2B nagykereskedelem (G46 nagykereskedelem), 15 fős cég

*A forgatókönyv cége: irodai és ipari termékek viszonteladóknak és cégeknek, árajánlatra épülő értékesítés, díjbekérő és átutalás.*

**A cég adatai.** 15 fő, ebből a szoftvert **5 fő használja** (a létszám 35%-a), havi **315 rendelés** (62,9 rendelés/használó/hó). Éves nettó árbevétel: **2,09 Mrd Ft** (15 fő × 368,7 ezer €/fő, Eurostat), bruttó árrés 21%.

**a) A felszabaduló munkaidő**, havonta:

| Feladat | Db/hó | Kézzel → ágenssel | Óra/hó | Bérérték/hó |
|---|---|---|---|---|
| E1 Árajánlat e-mailes érdeklődésre | 826 | 174 s → 62 s | 25,6 | 187 379 Ft |
| E2 Kifutott termék – helyettesítő | 60 | 83 s → 45 s | 0,6 | 4 672 Ft |
| E3 20%-os kedvezmény – jóváhagyás kérése | 31 | 149 s → 86 s | 0,5 | 3 996 Ft |
| E4 Megrendelés: az ajánlat elfogadása | 315 | 103 s → 60 s | 3,8 | 27 615 Ft |
| E5 „Hol a csomag?” | 94 | 50 s → 30 s | 0,5 | 3 114 Ft |
| E6 „Mit kell utánrendelni?” | 21 | 210 s → 54 s | 0,9 | 5 315 Ft |
| E7 Díjbekérő kiállítása | 315 | 113 s → 64 s | 4,3 | 31 130 Ft |
| E8 „Kifizették már?” | 315 | 106 s → 24 s | 7,1 | 51 382 Ft |
| E9 Garancia – érvényes | 3 | 95 s → 42 s | 0,0 | 279 Ft |
| E10 „Hogy állunk?” | 21 | 536 s → 70 s | 2,7 | 47 159 Ft |
| E11 Új érdeklődő felvétele és ajánlat * | 354 | 248 s → 99 s | 14,7 | 107 519 Ft |
| E12 Vezetői jóváhagyás (kedvezmény) * | 31 | 83 s → 47 s | 0,3 | 5 455 Ft |
| E13 Rendelés jóváhagyása készlethiánnyal * | 16 | 134 s → 52 s | 0,4 | 6 172 Ft |
| E14 Kiszállítás indítása * | 315 | 54 s → 48 s | 0,6 | 3 237 Ft |
| E15 Bevételezés * | 13 | 99 s → 56 s | 0,2 | 890 Ft |
| E16 Rendelés lemondása * | 3 | 69 s → 46 s | 0,0 | 145 Ft |
| E17 Számla sztornója * | 3 | 68 s → 53 s | 0,0 | 95 Ft |
| E18 Reklamáció felvétele * | 3 | 114 s → 78 s | 0,0 | 191 Ft |
| **Összesen** | | | **62,3 óra** | **485 745 Ft** |

A *-gal jelölt sorok a tíz alapfeladaton kívüli, szintén mért feladatok. A kézi idő a keresgéléssel együtt értendő (a tipikus idő 1/(1 − 0,19)-szerese).

**A vevő mérlege (reális forgatókönyv: 1% pluszforgalom, nálunk hosztolva):**

|  | Havonta | Évente | Honnan |
|---|---|---|---|
| a) Felszabaduló munkaidő bérértéke | 485 745 Ft | 5,8 M Ft | a fenti tábla |
| Pluszforgalom (1%) | 1 742 108 Ft | 20,9 M Ft | 2,09 Mrd Ft × 1% |
| b) A pluszforgalom árrése (21%) | 357 132 Ft | 4,3 M Ft | csak az árrés számít, az áru beszerzési ára nem nyereség |
| c) Háttérfigyelő: a lejárt tartozás korábbi észlelése | 18 376 Ft | 0,2 M Ft | árbevétel × 20% késve fizetett × 3,5 nap / 365 × 5,5% kamat |
| **Haszon összesen** | **861 252 Ft** | **10,3 M Ft** |  |
| Havidíj (5 használó × 9 450 Ft) | −47 250 Ft | −0,6 M Ft |  |
| **Nettó haszon** | **814 002 Ft** | **9,8 M Ft** |  |
| Egyszeri beüzemelés | −302 400 Ft |  | 800 € |

**Megtérülés: 1. hónap.** Háromévi NPV: 25,1 M Ft. Saját szerverrel (1 gép, 1,2 M Ft, rendszergazda évi 0,6 M Ft): megtérülés 3. hónap, NPV 22,2 M Ft.

**Mekkora pluszforgalom kell?** Időmegtakarítás nélkül, csak a pluszforgalom árréséből az éves díjat **0,13%** árbevétel-növekedés fedezi, az egy hónap alatti megtérüléshez (a beüzemeléssel együtt) **0,98%** kell.

### Webáruház (B2C) (G4791 csomagküldő és internetes kiskereskedelem), 15 fős cég

*Online kiskereskedelem: a rendelés a webshopban születik, a fizetés jellemzően kártyás, az ügyintézés a kiszállítás, a fizetési kivételek és a reklamáció körül forog.*

**A cég adatai.** 15 fő, ebből a szoftvert **5 fő használja** (a létszám 30%-a), havi **750 rendelés** (150,0 rendelés/használó/hó). Éves nettó árbevétel: **496,7 M Ft** (15 fő × 87,6 ezer €/fő, Eurostat), bruttó árrés 27%.

**a) A felszabaduló munkaidő**, havonta:

| Feladat | Db/hó | Kézzel → ágenssel | Óra/hó | Bérérték/hó |
|---|---|---|---|---|
| E1 Árajánlat e-mailes érdeklődésre | 11 | 174 s → 62 s | 0,3 | 2 383 Ft |
| E2 Kifutott termék – helyettesítő | 15 | 83 s → 45 s | 0,2 | 1 173 Ft |
| E3 20%-os kedvezmény – jóváhagyás kérése | 2 | 149 s → 86 s | 0,0 | 191 Ft |
| E5 „Hol a csomag?” | 113 | 50 s → 30 s | 0,6 | 3 713 Ft |
| E6 „Mit kell utánrendelni?” | 21 | 210 s → 54 s | 0,9 | 5 315 Ft |
| E7 Díjbekérő kiállítása | 75 | 113 s → 64 s | 1,0 | 7 424 Ft |
| E8 „Kifizették már?” | 75 | 106 s → 24 s | 1,7 | 12 253 Ft |
| E9 Garancia – érvényes | 23 | 95 s → 42 s | 0,3 | 1 994 Ft |
| E10 „Hogy állunk?” | 21 | 536 s → 70 s | 2,7 | 47 159 Ft |
| E11 Új érdeklődő felvétele és ajánlat * | 5 | 248 s → 99 s | 0,2 | 1 367 Ft |
| E12 Vezetői jóváhagyás (kedvezmény) * | 2 | 83 s → 47 s | 0,0 | 260 Ft |
| E13 Rendelés jóváhagyása készlethiánnyal * | 15 | 134 s → 52 s | 0,3 | 5 888 Ft |
| E14 Kiszállítás indítása * | 750 | 54 s → 48 s | 1,3 | 7 718 Ft |
| E15 Bevételezés * | 15 | 99 s → 56 s | 0,2 | 1 062 Ft |
| E16 Rendelés lemondása * | 23 | 69 s → 46 s | 0,1 | 1 036 Ft |
| E17 Számla sztornója * | 8 | 68 s → 53 s | 0,0 | 227 Ft |
| E18 Reklamáció felvétele * | 23 | 114 s → 78 s | 0,2 | 1 364 Ft |
| **Összesen** | | | **10,2 óra** | **100 526 Ft** |

A *-gal jelölt sorok a tíz alapfeladaton kívüli, szintén mért feladatok. A kézi idő a keresgéléssel együtt értendő (a tipikus idő 1/(1 − 0,19)-szerese).

**A vevő mérlege (reális forgatókönyv: 1% pluszforgalom, nálunk hosztolva):**

|  | Havonta | Évente | Honnan |
|---|---|---|---|
| a) Felszabaduló munkaidő bérértéke | 100 526 Ft | 1,2 M Ft | a fenti tábla |
| Pluszforgalom (1%) | 413 910 Ft | 5,0 M Ft | 496,7 M Ft × 1% |
| b) A pluszforgalom árrése (27%) | 112 997 Ft | 1,4 M Ft | csak az árrés számít, az áru beszerzési ára nem nyereség |
| c) Háttérfigyelő: a lejárt tartozás korábbi észlelése | 4 366 Ft | 0,1 M Ft | árbevétel × 20% késve fizetett × 3,5 nap / 365 × 5,5% kamat |
| **Haszon összesen** | **217 889 Ft** | **2,6 M Ft** |  |
| Havidíj (5 használó × 9 450 Ft) | −47 250 Ft | −0,6 M Ft |  |
| **Nettó haszon** | **170 639 Ft** | **2,0 M Ft** |  |
| Egyszeri beüzemelés | −302 400 Ft |  | 800 € |

**Megtérülés: 2. hónap.** Háromévi NPV: 5,0 M Ft. Saját szerverrel (1 gép, 1,2 M Ft, rendszergazda évi 0,6 M Ft): megtérülés 14. hónap, NPV 2,1 M Ft.

**Mekkora pluszforgalom kell?** Időmegtakarítás nélkül, csak a pluszforgalom árréséből az éves díjat **0,42%** árbevétel-növekedés fedezi, az egy hónap alatti megtérüléshez (a beüzemeléssel együtt) **3,09%** kell.

### Ipari gépforgalmazás szervizzel (G466 egyéb gép, berendezés nagykereskedelme), 15 fős cég

*Nagy értékű gépek projektjellegű értékesítése: sok ajánlat és kedvezménykérés egy rendelésre, sok garanciális és szervizügy.*

**A cég adatai.** 15 fő, ebből a szoftvert **6 fő használja** (a létszám 40%-a), havi **48 rendelés** (8,0 rendelés/használó/hó). Éves nettó árbevétel: **1,73 Mrd Ft** (15 fő × 304,5 ezer €/fő, Eurostat), bruttó árrés 22%.

**a) A felszabaduló munkaidő**, havonta:

| Feladat | Db/hó | Kézzel → ágenssel | Óra/hó | Bérérték/hó |
|---|---|---|---|---|
| E1 Árajánlat e-mailes érdeklődésre | 202 | 174 s → 62 s | 6,3 | 45 758 Ft |
| E2 Kifutott termék – helyettesítő | 14 | 83 s → 45 s | 0,2 | 1 126 Ft |
| E3 20%-os kedvezmény – jóváhagyás kérése | 19 | 149 s → 86 s | 0,3 | 2 440 Ft |
| E4 Megrendelés: az ajánlat elfogadása | 48 | 103 s → 60 s | 0,6 | 4 215 Ft |
| E5 „Hol a csomag?” | 24 | 50 s → 30 s | 0,1 | 792 Ft |
| E6 „Mit kell utánrendelni?” | 21 | 210 s → 54 s | 0,9 | 5 315 Ft |
| E7 Díjbekérő kiállítása | 48 | 113 s → 64 s | 0,7 | 4 751 Ft |
| E8 „Kifizették már?” | 48 | 106 s → 24 s | 1,1 | 7 842 Ft |
| E9 Garancia – érvényes | 7 | 95 s → 42 s | 0,1 | 638 Ft |
| E10 „Hogy állunk?” | 21 | 536 s → 70 s | 2,7 | 47 159 Ft |
| E11 Új érdeklődő felvétele és ajánlat * | 86 | 248 s → 99 s | 3,6 | 26 256 Ft |
| E12 Vezetői jóváhagyás (kedvezmény) * | 19 | 83 s → 47 s | 0,2 | 3 330 Ft |
| E13 Rendelés jóváhagyása készlethiánnyal * | 5 | 134 s → 52 s | 0,1 | 1 884 Ft |
| E14 Kiszállítás indítása * | 48 | 54 s → 48 s | 0,1 | 494 Ft |
| E15 Bevételezés * | 5 | 99 s → 56 s | 0,1 | 340 Ft |
| E16 Rendelés lemondása * | 1 | 69 s → 46 s | 0,0 | 44 Ft |
| E17 Számla sztornója * | 1 | 68 s → 53 s | 0,0 | 29 Ft |
| E18 Reklamáció felvétele * | 7 | 114 s → 78 s | 0,1 | 437 Ft |
| **Összesen** | | | **17,0 óra** | **152 848 Ft** |

A *-gal jelölt sorok a tíz alapfeladaton kívüli, szintén mért feladatok. A kézi idő a keresgéléssel együtt értendő (a tipikus idő 1/(1 − 0,19)-szerese).

**A vevő mérlege (reális forgatókönyv: 1% pluszforgalom, nálunk hosztolva):**

|  | Havonta | Évente | Honnan |
|---|---|---|---|
| a) Felszabaduló munkaidő bérértéke | 152 848 Ft | 1,8 M Ft | a fenti tábla |
| Pluszforgalom (1%) | 1 438 763 Ft | 17,3 M Ft | 1,73 Mrd Ft × 1% |
| b) A pluszforgalom árrése (22%) | 312 211 Ft | 3,7 M Ft | csak az árrés számít, az áru beszerzési ára nem nyereség |
| c) Háttérfigyelő: a lejárt tartozás korábbi észlelése | 15 176 Ft | 0,2 M Ft | árbevétel × 20% késve fizetett × 3,5 nap / 365 × 5,5% kamat |
| **Haszon összesen** | **480 236 Ft** | **5,8 M Ft** |  |
| Havidíj (6 használó × 9 450 Ft) | −56 700 Ft | −0,7 M Ft |  |
| **Nettó haszon** | **423 536 Ft** | **5,1 M Ft** |  |
| Egyszeri beüzemelés | −302 400 Ft |  | 800 € |

**Megtérülés: 1. hónap.** Háromévi NPV: 12,9 M Ft. Saját szerverrel (1 gép, 1,2 M Ft, rendszergazda évi 0,6 M Ft): megtérülés 5. hónap, NPV 10,0 M Ft.

**Mekkora pluszforgalom kell?** Időmegtakarítás nélkül, csak a pluszforgalom árréséből az éves díjat **0,18%** árbevétel-növekedés fedezi, az egy hónap alatti megtérüléshez (a beüzemeléssel együtt) **1,15%** kell.


## 5. Cégméret szerint: 5, 10, 15, 50 és 100 fő

A *megtérülés* az a hónap, amelyben a halmozott haszon először fedezi a beüzemelést és az addigi díjakat. A *fedezeti növekedés* az időmegtakarítás nélkül, egymagában a díjat fedező árbevétel-növekedés.

### B2B nagykereskedelem

**Nálunk hosztolva:**

| Létszám | Használó | Rendelés/hó | Árbevétel/év | Díj/év | Egyszeri | Munkaidő-érték/év | Árrés a pluszforgalmon/év (reális) | Megtérülés: óvatos | Megtérülés: reális | Megtérülés: optimista | Fedezeti növekedés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 fő | 2 | 126 | 696,8 M Ft | 0,2 M Ft | 0,3 M Ft | 2,7 M Ft | 1,4 M Ft | 2. hónap | 1. hónap | 1. hónap | 0,16% |
| 10 fő | 4 | 252 | 1,39 Mrd Ft | 0,5 M Ft | 0,3 M Ft | 4,8 M Ft | 2,9 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,16% |
| 15 fő | 5 | 315 | 2,09 Mrd Ft | 0,6 M Ft | 0,3 M Ft | 5,8 M Ft | 4,3 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,13% |
| 50 fő | 18 | 1 132 | 8,62 Mrd Ft | 2,0 M Ft | 0,3 M Ft | 19,3 M Ft | 17,7 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,12% |
| 100 fő | 35 | 2 202 | 17,24 Mrd Ft | 4,0 M Ft | 0,3 M Ft | 37,0 M Ft | 35,3 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,11% |

**Saját szerverrel:**

| Létszám | Használó | Rendelés/hó | Árbevétel/év | Díj/év | Egyszeri | Munkaidő-érték/év | Árrés a pluszforgalmon/év (reális) | Megtérülés: óvatos | Megtérülés: reális | Megtérülés: optimista | Fedezeti növekedés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 fő | 2 | 126 | 696,8 M Ft | 0,2 M Ft | 1,5 M Ft | 2,7 M Ft | 1,4 M Ft | 15. hónap | 6. hónap | 4. hónap | 0,60% |
| 10 fő | 4 | 252 | 1,39 Mrd Ft | 0,5 M Ft | 1,5 M Ft | 4,8 M Ft | 2,9 M Ft | 6. hónap | 3. hónap | 2. hónap | 0,38% |
| 15 fő | 5 | 315 | 2,09 Mrd Ft | 0,6 M Ft | 1,5 M Ft | 5,8 M Ft | 4,3 M Ft | 4. hónap | 3. hónap | 2. hónap | 0,28% |
| 50 fő | 18 | 1 132 | 8,62 Mrd Ft | 2,0 M Ft | 1,5 M Ft | 19,3 M Ft | 17,7 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,15% |
| 100 fő | 35 | 2 202 | 17,24 Mrd Ft | 4,0 M Ft | 2,8 M Ft | 37,0 M Ft | 35,3 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,13% |

### Webáruház (B2C)

**Nálunk hosztolva:**

| Létszám | Használó | Rendelés/hó | Árbevétel/év | Díj/év | Egyszeri | Munkaidő-érték/év | Árrés a pluszforgalmon/év (reális) | Megtérülés: óvatos | Megtérülés: reális | Megtérülés: optimista | Fedezeti növekedés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 fő | 2 | 300 | 165,6 M Ft | 0,2 M Ft | 0,3 M Ft | 0,9 M Ft | 0,5 M Ft | 6. hónap | 4. hónap | 3. hónap | 0,50% |
| 10 fő | 3 | 450 | 331,1 M Ft | 0,3 M Ft | 0,3 M Ft | 1,0 M Ft | 0,9 M Ft | 5. hónap | 3. hónap | 2. hónap | 0,38% |
| 15 fő | 5 | 750 | 496,7 M Ft | 0,6 M Ft | 0,3 M Ft | 1,2 M Ft | 1,4 M Ft | 4. hónap | 2. hónap | 2. hónap | 0,42% |
| 50 fő | 15 | 2 250 | 1,66 Mrd Ft | 1,7 M Ft | 0,3 M Ft | 2,4 M Ft | 4,5 M Ft | 2. hónap | 1. hónap | 1. hónap | 0,38% |
| 100 fő | 30 | 4 500 | 3,31 Mrd Ft | 3,4 M Ft | 0,3 M Ft | 4,1 M Ft | 9,0 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,38% |

**Saját szerverrel:**

| Létszám | Használó | Rendelés/hó | Árbevétel/év | Díj/év | Egyszeri | Munkaidő-érték/év | Árrés a pluszforgalmon/év (reális) | Megtérülés: óvatos | Megtérülés: reális | Megtérülés: optimista | Fedezeti növekedés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 fő | 2 | 300 | 165,6 M Ft | 0,2 M Ft | 1,5 M Ft | 0,9 M Ft | 0,5 M Ft | 36 hónapon belül nincs | 36 hónapon belül nincs | 16. hónap | 1,91% |
| 10 fő | 3 | 450 | 331,1 M Ft | 0,3 M Ft | 1,5 M Ft | 1,0 M Ft | 0,9 M Ft | 36 hónapon belül nincs | 20. hónap | 9. hónap | 1,08% |
| 15 fő | 5 | 750 | 496,7 M Ft | 0,6 M Ft | 1,5 M Ft | 1,2 M Ft | 1,4 M Ft | 36 hónapon belül nincs | 14. hónap | 7. hónap | 0,89% |
| 50 fő | 15 | 2 250 | 1,66 Mrd Ft | 1,7 M Ft | 1,5 M Ft | 2,4 M Ft | 4,5 M Ft | 24. hónap | 4. hónap | 2. hónap | 0,52% |
| 100 fő | 30 | 4 500 | 3,31 Mrd Ft | 3,4 M Ft | 2,8 M Ft | 4,1 M Ft | 9,0 M Ft | 15. hónap | 4. hónap | 2. hónap | 0,45% |

### Ipari gépforgalmazás szervizzel

**Nálunk hosztolva:**

| Létszám | Használó | Rendelés/hó | Árbevétel/év | Díj/év | Egyszeri | Munkaidő-érték/év | Árrés a pluszforgalmon/év (reális) | Megtérülés: óvatos | Megtérülés: reális | Megtérülés: optimista | Fedezeti növekedés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 fő | 2 | 16 | 575,5 M Ft | 0,2 M Ft | 0,3 M Ft | 1,0 M Ft | 1,2 M Ft | 3. hónap | 2. hónap | 2. hónap | 0,18% |
| 10 fő | 4 | 32 | 1,15 Mrd Ft | 0,5 M Ft | 0,3 M Ft | 1,4 M Ft | 2,5 M Ft | 2. hónap | 2. hónap | 1. hónap | 0,18% |
| 15 fő | 6 | 48 | 1,73 Mrd Ft | 0,7 M Ft | 0,3 M Ft | 1,8 M Ft | 3,7 M Ft | 2. hónap | 1. hónap | 1. hónap | 0,18% |
| 50 fő | 20 | 160 | 9,20 Mrd Ft | 2,3 M Ft | 0,3 M Ft | 4,6 M Ft | 20,0 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,11% |
| 100 fő | 40 | 320 | 18,40 Mrd Ft | 4,5 M Ft | 0,3 M Ft | 8,7 M Ft | 39,9 M Ft | 1. hónap | 1. hónap | 1. hónap | 0,11% |

**Saját szerverrel:**

| Létszám | Használó | Rendelés/hó | Árbevétel/év | Díj/év | Egyszeri | Munkaidő-érték/év | Árrés a pluszforgalmon/év (reális) | Megtérülés: óvatos | Megtérülés: reális | Megtérülés: optimista | Fedezeti növekedés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 fő | 2 | 16 | 575,5 M Ft | 0,2 M Ft | 1,5 M Ft | 1,0 M Ft | 1,2 M Ft | 36 hónapon belül nincs | 13. hónap | 7. hónap | 0,69% |
| 10 fő | 4 | 32 | 1,15 Mrd Ft | 0,5 M Ft | 1,5 M Ft | 1,4 M Ft | 2,5 M Ft | 27. hónap | 7. hónap | 4. hónap | 0,44% |
| 15 fő | 6 | 48 | 1,73 Mrd Ft | 0,7 M Ft | 1,5 M Ft | 1,8 M Ft | 3,7 M Ft | 13. hónap | 5. hónap | 3. hónap | 0,35% |
| 50 fő | 20 | 160 | 9,20 Mrd Ft | 2,3 M Ft | 1,5 M Ft | 4,6 M Ft | 20,0 M Ft | 2. hónap | 1. hónap | 1. hónap | 0,15% |
| 100 fő | 40 | 320 | 18,40 Mrd Ft | 4,5 M Ft | 2,8 M Ft | 8,7 M Ft | 39,9 M Ft | 2. hónap | 1. hónap | 1. hónap | 0,13% |

## 6. Érzékenység (B2B, 15 fő, hosztolt, reális)

Az alapeset megtérülése 1. hónap, háromévi NPV-je 25,1 M Ft. Egyszerre egy feltevést változtatunk.

| Tényező | Kedvezőtlen | NPV | Megtérülés | Kedvező | NPV | Megtérülés |
|---|---|---|---|---|---|---|
| Csendes hibák javítása (30 perc/hiba) | csak az ágens hibái (11,7%) | −11,4 M Ft | 36 hónapon belül nincs | mindkét fél: ágens 11,7%, ember 9,1% | 17,0 M Ft | 1. hónap |
| Árbevétel-növekedés | 0% | 13,9 M Ft | 1. hónap | 2% | 36,2 M Ft | 1. hónap |
| Emberi alapvonal | KLM (alsó korlát) | 18,7 M Ft | 1. hónap | nem begyakorolt | 34,0 M Ft | 1. hónap |
| Az időmegtakarítás pénzben megjelenő része | 28% | 14,2 M Ft | 1. hónap | 100% | 25,1 M Ft | 1. hónap |
| Bérszint | −20% | 22,1 M Ft | 1. hónap | +20% | 28,1 M Ft | 1. hónap |
| Feladatszintű siker (n=3) | e4b | 19,5 M Ft | 1. hónap | 12b | 25,5 M Ft | 1. hónap |
| Felfutás az első évben | a haszon fele | 20,2 M Ft | 1. hónap | azonnal teljes | 25,1 M Ft | 1. hónap |
| Keresgélés a kézi munkában (MGI: 19%) | nincs | 20,6 M Ft | 1. hónap | van | 25,1 M Ft | 1. hónap |
| Havidíj | +30% | 24,6 M Ft | 1. hónap | −30% | 25,5 M Ft | 1. hónap |
| Háttérfigyelő (lejárt tartozás) | nincs | 24,5 M Ft | 1. hónap | van | 25,1 M Ft | 1. hónap |

## 7. A felszabaduló kapacitás: mennyi pluszforgalom férne bele?

Illusztráció, nem forgatókönyv. Ha a felszabadult munkaidőnek csak 28%-a megy értékesítésre (a Gartner G6 szerint a szervezetek 72%-a nem forgatja vissza az időt), és ez az óra annyi forgalmat hoz, mint egy átlagos munkaóra a cégben (árbevétel / létszám / 1 320 óra):

| Üzletág, 15 fő | Értékesítésre fordított óra/év | Árbevétel / munkaóra | Pluszforgalom/év | Az árbevétel %-ában | Árrés/év |
|---|---|---|---|---|---|
| B2B nagykereskedelem | 209 | 105 582 Ft | 22,1 M Ft | 1,06% | 4,5 M Ft |
| Webáruház (B2C) | 34 | 25 085 Ft | 0,9 M Ft | 0,17% | 0,2 M Ft |
| Ipari gépforgalmazás szervizzel | 57 | 87 198 Ft | 5,0 M Ft | 0,29% | 1,1 M Ft |

Az átlagos munkaóra árbevétele felülbecsüli a pluszóra hatását, mert az átlagban a meglévő vevőkör és a teljes cég munkája is benne van. A reális forgatókönyv 1%-os növekedése a(z) B2B nagykereskedelem üzletágban kijön a felszabaduló kapacitásból, a(z) Webáruház (B2C), Ipari gépforgalmazás szervizzel üzletágban nem: a pluszforgalomnak ott a gyorsabb válaszból (több megnyert érdeklődés) kell jönnie, nem a több értékesítési órából, ezért ott a fedezeti növekedés a megbízhatóbb mérőszám.

## 8. A háttérfigyelő: a minimum alatti készlet (illusztráció)

A figyelő a minimumszint alá eső készletet azonnal jelzi; a forgatókönyvben ezt a raktárvezető hetente egyszer nézi át, és legutóbb négy cikk volt a minimum alatt, kettő teljesen elfogyott. A készlethiány miatti forgalomkiesés a kiskereskedelmi kutatásban legfeljebb kb. 4% (Gruen, Corsten és Bharadwaj, 2002, napi fogyasztási cikkek). Arra nincs forrás, hogy ennek mekkora részét előzi meg a korábbi jelzés, ezért ez a tábla nem forgatókönyv, és a megtérülésben nem szerepel:

| Üzletág, 15 fő | Árbevétel/év | Kiesés felső becslése (4%) | Ha 10%-át megelőzi: árrés/év | Ha 25%-át megelőzi: árrés/év |
|---|---|---|---|---|
| B2B nagykereskedelem | 2,09 Mrd Ft | 83,6 M Ft | 1,7 M Ft | 4,3 M Ft |
| Webáruház (B2C) | 496,7 M Ft | 19,9 M Ft | 0,5 M Ft | 1,4 M Ft |
| Ipari gépforgalmazás szervizzel | 1,73 Mrd Ft | 69,1 M Ft | 1,5 M Ft | 3,7 M Ft |

A figyelő további jelzései (késő csomag, elakadt rendelés, régóta nyitott hibajegy) az ügyfélelégedettséget javítják, forintértéket nem rendelünk hozzájuk.

## 9. Az eladó oldala

Az óradíj a KSH fejlesztői bérköltsége (14 018 Ft/óra), vállalkozói díj és árrés nélkül.

**Egy 15 fős B2B-ügyfél** (5 használó, díj 47 250 Ft/hó; a hosting megosztott, a terhelés szerint 0,15 gép jut rá):

|  | Óvatos | Reális | Optimista |
|---|---|---|---|
| Beüzemelés, óra | 16 | 8 | 4 |
| Beüzemelési díj mínusz költség | 71 828 Ft | 183 973 Ft | 240 046 Ft |
| Hosting | 12 798 Ft / hó | 12 798 Ft / hó | 12 798 Ft / hó |
| Támogatás | 28 036 Ft / hó (2,0 óra) | 14 018 Ft / hó (1,0 óra) | 7 009 Ft / hó (0,5 óra) |
| Havi fedezet | 6 415 Ft / hó | 20 433 Ft / hó | 27 442 Ft / hó |
| Fedezet 3 évre | 0,3 M Ft | 0,9 M Ft | 1,2 M Ft |
| Fedezeti ügyfélszám (a fix költségre) | 107 | 36 | 27 |

**Dedikált szerverrel** (ügyfelenként egy saját bérelt gép) ugyanez az ügyfél havi −54 578 Ft fedezetet ad: egy gép 87 809 Ft/hó, ami 10 használó díja. Kis ügyfeleknek ezért csak a megosztott hosting fenntartható.

**Ügyfélméret szerint** (B2B-ügyfelek, reális): a fix költség évi 10,8 M Ft (0,5 FTE termékfejlesztés, ebben a csatolók fejlesztése, és egyéb tételek).

| Ügyfél mérete | Használó | Havi fedezet / ügyfél | Fedezeti ügyfélszám |
|---|---|---|---|
| 5 fő | 2 | 7 978 Ft | 68 |
| 10 fő | 4 | 16 281 Ft | 42 |
| 15 fő | 5 | 20 433 Ft | 36 |
| 50 fő | 18 | 74 408 Ft | 12 |
| 100 fő | 35 | 144 991 Ft | 7 |

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
