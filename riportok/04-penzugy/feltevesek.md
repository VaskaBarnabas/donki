# Pénzügyi feltevések

*A [feltevesek.json](feltevesek.json) fájlból generálva. Típus: **mért** (saját mérésből), **forrás** (külső adat), **saját** (feltevés vagy üzleti döntés, külső alátámasztás nélkül).*

## Árazás

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| havidijEurFo | 25 | saját | üzleti döntés | felhasználónként, havonta, minden benne: szoftver, hosting, támogatás, frissítés |
| setupEur | 800 | saját | üzleti döntés | egyszeri beüzemelés: konfiguráció, a meglévő csatolók bekötése |
| szerzodesMinimumHo | 12 | saját | üzleti döntés | a kockázati számításhoz |

## Hosting (nálunk)

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| gepEurHo | 232.3 | forrás | Hetzner GEX44 (NVIDIA RTX 4000 SFF Ada, 20 GB), havidíj áfa nélkül, docs.hetzner.com árkorrekciós oldal | ügyfelenként dedikált GPU-szerver |
| gepSetupEur | 114 | forrás | Hetzner GEX44 egyszeri díj, áfa nélkül, ugyanott | szerverenként egyszer |

## Saját szerver és áram

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| ar | 1092390 | forrás | Alza.hu, Mac Studio M4 Max 16/40 mag, 48 GB, 512 GB (keresőtalálat, dátum nélkül) | szerver a vevőnél; a mérés M5 24 GB-on futott, ezen a gépen nem mértünk |
| kihasznaltsag | 0.7 | saját | MUNKAERO_BECSLES | 8 órás munkanap, csúcsidők miatt |
| wattFutasKozben | 60 | saját | nem mért; hasonló gépekre másodlagos források 35–45 W-ot adnak, az Apple maximuma 140 W | az eredményre elhanyagolható hatású |
| aramFtKwh | 155 | forrás | Privátbankár, KKV A1 árszabás kb. 155 Ft/kWh (a hatály nem egyértelmű) | az eredményre elhanyagolható hatású |
| kiegeszitok | 150000 | saját | saját feltevés: szünetmentes táp, hálózat | szerverenként |
| csucsOraArany | 0.3 | saját | saját feltevés: a napi futások 30%-a esik a csúcsórára | szervermérethez; a párhuzamos terhelést nem mértük (Ö4) |
| tartalekLetszamtol | 25 | saját | saját feltevés | ettől a létszámtól tartalékszerver is van |
| maradvanyErtek | 0.5 | saját | saját feltevés | a szerver újrahasznosítható része projektbukásnál |

## Cégméretek

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| munkanap | 251 | saját | naptári munkanapok kerekítve | a napi feladatokhoz és a gépkapacitáshoz |
| cegmeretek | 5, 10, 15, 50, 100 | saját | a megbízó kérése | kis-, közép- és nagyobb cégek |
| referenciaLetszam | 15 | saját | saját választás | a részletes bontás cégmérete mindhárom üzletágban |
| ertekesitok | 5 | saját | a forgatókönyv csak „több fő”-t mond | csak a Gartner 4,8 óra/hét összevetéshez |

## Üzletág: B2B nagykereskedelem (G46 nagykereskedelem)

A forgatókönyv cége: irodai és ipari termékek viszonteladóknak és cégeknek, árajánlatra épülő értékesítés, díjbekérő és átutalás.

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| felhasznaloArany | 0.35 | saját | MUNKAERO_BECSLES §5: a 40 fős cégnél kb. 14 fős értékesítési, pénzügyi és raktári adminisztráció | a szoftvert használó munkatársak aránya a létszámban |
| rendelesFo | 62.9 | saját | LEGACY_FORGATOKONYV: napi 40 rendelés × 22 nap / 14 használó | rendelés / használó / hó |
| arres | 0.205 | forrás | Eurostat, Structural business statistics, Magyarország, 2022 (sbs_ovw_act), G46: bruttó árrés a viszonteladásra vett árun (14 848 M€) / nettó árbevétel (72 541 M€) | a pluszforgalomból ennyi marad a cégnél |
| arbevetelFo (10-49 fő) | 368.7 | forrás | Eurostat, Structural business statistics, Magyarország, 2022 (sbs_sc_ovw), G46, 10–19 és 20–49 fős cégek egy főre jutó nettó árbevételének átlaga (360,7 és 376,7 e€); a 2–9 fős adat titkos | ezer €/fő/év, 5–49 fős cégre |
| arbevetelFo (50-249 fő) | 456 | forrás | Eurostat, Structural business statistics, Magyarország, 2022 (sbs_sc_ovw), G46, 50–249 fős cégek | ezer €/fő/év |
| E1 (rendelésenként) | 2.625 | saját | MUNKAERO_BECSLES §2.1: 150 érdeklődés / 40 rendelés, ebből 70% meglévő vevő | meglévő vevő ajánlatkérése |
| E2 (rendelésenként) | 0.19 | saját | saját: az érdeklődések 5%-a kifutott termék | nincs külön adat |
| E3 (rendelésenként) | 0.1 | saját | MUNKAERO_BECSLES §2.1: a rendelések 10%-a | kedvezmény-jóváhagyás |
| E4 (rendelésenként) | 1 | saját | rendelésenként egy |  |
| E5 (rendelésenként) | 0.3 | saját | MUNKAERO_BECSLES §2.1: a rendelések 30%-a | „Hol a csomag?” |
| E6 (naponta) | 1 | saját | MUNKAERO_BECSLES: napi egy utánrendelési lista |  |
| E7 (rendelésenként) | 1 | saját | rendelésenként egy díjbekérő |  |
| E8 (rendelésenként) | 1 | saját | rendelésenként egy fizetés-ellenőrzés |  |
| E9 (rendelésenként) | 0.01 | saját | MUNKAERO_BECSLES §2.1: a rendelések 1%-a | garancia, reklamáció |
| E10 (naponta) | 1 | saját | MUNKAERO_BECSLES: napi egy vezetői helyzetkép |  |
| E11 (rendelésenként) | 1.125 | saját | MUNKAERO_BECSLES §2.1: az érdeklődések 30%-a új érdeklődő | új vevő felvétele és ajánlat |
| E12 (rendelésenként) | 0.1 | saját | mint az E3: minden kedvezménykérést a vezető bírál el | vezetői kedvezmény-jóváhagyás |
| E13 (rendelésenként) | 0.05 | saját | MUNKAERO_BECSLES §2.1: a rendelések 5%-a készlethiányos a jóváhagyáskor |  |
| E14 (rendelésenként) | 1 | saját | rendelésenként egy kiszállítás |  |
| E15 (rendelésenként) | 0.04 | saját | MUNKAERO_BECSLES §2.1: 20 szállítmány / 500 rendelés |  |
| E16 (rendelésenként) | 0.01 | saját | MUNKAERO_BECSLES §2.1: lemondás és sztornó 2%, ennek fele lemondás |  |
| E17 (rendelésenként) | 0.01 | saját | MUNKAERO_BECSLES §2.1: lemondás és sztornó 2%, ennek fele sztornó |  |
| E18 (rendelésenként) | 0.01 | saját | MUNKAERO_BECSLES §2.1: reklamáció 1% |  |

## Üzletág: Webáruház (B2C) (G4791 csomagküldő és internetes kiskereskedelem)

Online kiskereskedelem: a rendelés a webshopban születik, a fizetés jellemzően kártyás, az ügyintézés a kiszállítás, a fizetési kivételek és a reklamáció körül forog.

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| felhasznaloArany | 0.3 | saját | saját feltevés: a létszám nagyobb része raktári és csomagolási munkát végez | a szoftvert használó munkatársak aránya |
| rendelesFo | 150 | saját | saját feltevés: a rendelés nagy része automatikus, egy ügyintéző sokat kezel | rendelés / használó / hó |
| arres | 0.273 | forrás | Eurostat, Structural business statistics, Magyarország, 2022 (sbs_ovw_act), G4791: bruttó árrés (475 M€) / nettó árbevétel (1 737 M€) |  |
| arbevetelFo (10-49 fő) | 87.6 | forrás | Eurostat, Structural business statistics, Magyarország, 2022 (sbs_ovw_act), G4791: nettó árbevétel (1 737 M€) / foglalkoztatott (19 841 fő); méretkategória szerinti bontás nincs | ezer €/fő/év |
| arbevetelFo (50-249 fő) | 87.6 | forrás | ugyanaz | ezer €/fő/év |
| E1 (rendelésenként) | 0.014 | saját | saját feltevés: az ajánlatkérés 70%-a meglévő vevőtől | céges ajánlatkérés ritka |
| E2 (rendelésenként) | 0.02 | saját | saját feltevés, B2C webáruház | kifutott termékre kérdeznek |
| E3 (rendelésenként) | 0.002 | saját | saját feltevés, B2C webáruház | egyedi kedvezmény ritka |
| E4 (rendelésenként) | 0 | saját | saját feltevés, B2C webáruház | a rendelést a webshop rögzíti |
| E5 (rendelésenként) | 0.15 | saját | saját feltevés, B2C webáruház | „hol a csomag?” megkeresés |
| E6 (naponta) | 1 | saját | saját feltevés, B2C webáruház | napi utánrendelési lista |
| E7 (rendelésenként) | 0.1 | saját | saját feltevés, B2C webáruház | átutalásos fizetés díjbekérővel |
| E8 (rendelésenként) | 0.1 | saját | saját feltevés, B2C webáruház | átutalás ellenőrzése |
| E9 (rendelésenként) | 0.03 | saját | saját feltevés, B2C webáruház | garanciális igény |
| E10 (naponta) | 1 | saját | saját feltevés, B2C webáruház | napi vezetői helyzetkép |
| E11 (rendelésenként) | 0.006 | saját | saját feltevés: 30% új |  |
| E12 (rendelésenként) | 0.002 | saját | mint az E3 |  |
| E13 (rendelésenként) | 0.02 | saját | saját feltevés |  |
| E14 (rendelésenként) | 1 | saját | rendelésenként egy kiszállítás |  |
| E15 (rendelésenként) | 0.02 | saját | saját feltevés |  |
| E16 (rendelésenként) | 0.03 | saját | saját feltevés: a B2C lemondás gyakoribb |  |
| E17 (rendelésenként) | 0.01 | saját | saját feltevés |  |
| E18 (rendelésenként) | 0.03 | saját | saját feltevés |  |

## Üzletág: Ipari gépforgalmazás szervizzel (G466 egyéb gép, berendezés nagykereskedelme)

Nagy értékű gépek projektjellegű értékesítése: sok ajánlat és kedvezménykérés egy rendelésre, sok garanciális és szervizügy.

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| felhasznaloArany | 0.4 | saját | saját feltevés: a szerviztechnikusok nem használják | a szoftvert használó munkatársak aránya |
| rendelesFo | 8 | saját | saját feltevés: kevés, nagy értékű rendelés | rendelés / használó / hó |
| arres | 0.217 | forrás | Eurostat, Structural business statistics, Magyarország, 2022 (sbs_ovw_act), G466: bruttó árrés (1 420 M€) / nettó árbevétel (6 544 M€) |  |
| arbevetelFo (10-49 fő) | 304.5 | forrás | Eurostat, Structural business statistics, Magyarország, 2022 (sbs_sc_ovw), G466, 10–19 és 20–49 fős cégek átlaga (298,2 és 310,7 e€) | ezer €/fő/év |
| arbevetelFo (50-249 fő) | 486.7 | forrás | Eurostat, Structural business statistics, Magyarország, 2022 (sbs_sc_ovw), G466, 50–249 fős cégek | ezer €/fő/év |
| E1 (rendelésenként) | 4.2 | saját | saját feltevés: 70% meglévő vevő | egy rendelésre több ajánlatváltozat |
| E2 (rendelésenként) | 0.3 | saját | saját feltevés, gépforgalmazás szervizzel | kifutott típus helyettesítése |
| E3 (rendelésenként) | 0.4 | saját | saját feltevés, gépforgalmazás szervizzel | kedvezménykérés gyakori |
| E4 (rendelésenként) | 1 | saját | saját feltevés, gépforgalmazás szervizzel | rendelésenként egy |
| E5 (rendelésenként) | 0.5 | saját | saját feltevés, gépforgalmazás szervizzel | szállítási határidő kérdés |
| E6 (naponta) | 1 | saját | saját feltevés, gépforgalmazás szervizzel | napi utánrendelési lista |
| E7 (rendelésenként) | 1 | saját | saját feltevés, gépforgalmazás szervizzel | előleg- vagy díjbekérő |
| E8 (rendelésenként) | 1 | saját | saját feltevés, gépforgalmazás szervizzel | fizetés-ellenőrzés |
| E9 (rendelésenként) | 0.15 | saját | saját feltevés, gépforgalmazás szervizzel | garanciális és szervizügy |
| E10 (naponta) | 1 | saját | saját feltevés, gépforgalmazás szervizzel | napi vezetői helyzetkép |
| E11 (rendelésenként) | 1.8 | saját | saját feltevés: 30% új |  |
| E12 (rendelésenként) | 0.4 | saját | mint az E3 |  |
| E13 (rendelésenként) | 0.1 | saját | saját feltevés: nagy értékű gépeknél gyakoribb a hiány |  |
| E14 (rendelésenként) | 1 | saját | rendelésenként egy kiszállítás |  |
| E15 (rendelésenként) | 0.1 | saját | saját feltevés |  |
| E16 (rendelésenként) | 0.02 | saját | saját feltevés |  |
| E17 (rendelésenként) | 0.02 | saját | saját feltevés |  |
| E18 (rendelésenként) | 0.15 | saját | saját feltevés: mint a garanciaügy |  |

## Keresgélés

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| arany | 0.19 | forrás | McKinsey Global Institute (2012): The social economy. A tudásmunkások a munkahét kb. 19%-át információkeresésre és -gyűjtésre fordítják | a kézi idő 1/(1−0,19)-szerese; munkahét-szintű arány, a feladatra vetítése közelítés |

## Háttérfigyelő

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| kesoFizetesArany | 0.2 | forrás | EOS: European Payment Practices 2025, Magyarország: a fizetések 20%-a késik | az árbevétel ekkora része folyik be késve |
| eszlelesNap | 3.5 | saját | LEGACY_FORGATOKONYV 3.9: a lejárt tartozásokat hétfőnként nézik, az észlelés átlagos késése fél hét | a figyelő ugyanezt perceken belül jelzi |
| kamat | 0.055 | forrás | MNB jegybanki alapkamat, 2026. októberi döntés: 5,50% | a korábban befolyó pénz finanszírozási értéke; óvatos, a vállalati hitelkamat ennél magasabb |
| keszlethianyVeszteseg | 0.04 | forrás | Gruen, Corsten, Bharadwaj (2002): Retail Out-of-Stocks: A Worldwide Examination of Extent, Causes and Consumer Responses. Grocery Manufacturers of America; a készlethiány miatti forgalomkiesés legfeljebb kb. 4% | csak illusztráció: kiskereskedelmi, napi fogyasztási cikkekre vonatkozik |
| megelozott | 0.1, 0.25 | saját | saját választás | a készlethiány miatti kiesés mekkora részét előzi meg a korábbi jelzés; csak illusztráció |

## Bérek

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| ertekesito | 711358 | forrás | KSH 2025, FEOR 3622 kereskedelmi ügyintéző | E1–E4 |
| penzugyes | 703512 | forrás | KSH 2025, FEOR 3611 pénzügyi ügyintéző | E7, E8 |
| raktaros | 572010 | forrás | KSH 2025, FEOR 4131 készlet-nyilvántartó | E6 |
| ugyfelszolgalat | 588910 | forrás | KSH 2025, FEOR 4225 ügyfélszolgálat | E5, E9 |
| vezeto | 1696745 | forrás | KSH 2025, FEOR 1415 értékesítési vezető | E10 |
| rendszergazda | 937570 | forrás | KSH 2025, FEOR 2152 rendszergazda | üzemeltetés |
| fejleszto | 1364606 | forrás | KSH 2025, FEOR 2142 szoftverfejlesztő | bevezetés |
| szocho | 0.13 | forrás | 2018. évi LII. törvény; 2026-os szakcikk szerint 13% | munkáltatói teher; hivatalos forrásból ellenőrizendő |
| hasznosOraEv | 1320 | saját | MUNKAERO_BECSLES: 6 hasznos óra/nap × kb. 220 ledolgozott nap | a megtakarított idő hasznos munkaidő |
| kulsoFejlesztoSzorzo | 1.5 | saját | saját feltevés: külső szállító árrése a bérköltségre | a bevezetést szállító végzi |

## Mérésből

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| sikerE4b | 0.919 | mért | ertekeles.futas, e4b, 99 futás |  |
| siker12b | 0.939 | mért | ertekeles.futas, 12b, 99 futás |  |
| tokenBe | 8600 | mért | ertekeles.futas, a két modell átlaga (8279 és 8946) | felhős árazáshoz |
| tokenKi | 168 | mért | ertekeles.futas, a két modell átlaga (178 és 158) | felhős árazáshoz |
| kartyaFutasonkent | 0.56 | mért | ertekeles.futas | a kártyaidő érzékenységéhez |
| csendesHiba | 0.04 | mért | riportok/05-osszehasonlitasok/02-hibak-ember-es-agens.md, 8/198 | az összes futáson; csak az érzékenységben |
| csendesHibaTizFeladat | 0.117 | mért | 02-hibak-ember-es-agens.md, 7/60, az E1–E10 feladatokon | csak az érzékenységben |
| emberHiba | 0.091 | saját | 02-hibak-ember-es-agens.md, irodalmi hibaarányból számolva (p=1%) | csak az érzékenységben |
| csendesHibaPerc | 30 | saját | saját feltevés: észlelés, korrekció, a vevő tájékoztatása | csak az érzékenységben, az alapeset a hibajavítást semlegesen kezeli |

## Felhő és árfolyam

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| usdFt | 312.5 | forrás | MNB 2026-07-01 (USD-hez kötött BSD); novemberi árfolyam nem volt elérhető | csak a felhős összevetéshez |
| eurFt | 378 | forrás | ING, 2026-02-09 középárfolyam; novemberi árfolyam nem volt elérhető | csak a CRM-licenchez |
| sonnetBeUsdM | 2 | forrás | Anthropic hivatalos árlista, Claude Sonnet 5.5 | gyorsítótár nélkül |
| sonnetKiUsdM | 10 | forrás | Anthropic hivatalos árlista, Claude Sonnet 5.5 |  |
| haikuBeUsdM | 0.1 | forrás | Anthropic hivatalos árlista, Claude Haiku 5.5 | gyorsítótár nélkül |
| haikuKiUsdM | 0.5 | forrás | Anthropic hivatalos árlista, Claude Haiku 5.5 |  |
| dragulasSzorzo | 5 | forrás | Gartner G10 (előrejelzés): ágenses munkafolyamat inferenciaköltsége 2028-ig több mint ötszörös | érzékenység |
| g8UsdEmberi | 13.5 | forrás | Gartner G8 (benchmark, kb. 2023, USA): asszisztált kapcsolat medián költsége | viszonyítás |

## Projekt

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| diszkont | 0.1 | saját | saját feltevés, éves | NPV |
| felfutasElsoEv | 0.5 | saját | a Gartner G5 iránya (lassú létszámhatás), a mérték saját | csak az érzékenységi táblában |
| g2Siker | 0.6 | forrás | Gartner G2 (előrejelzés): az ágenses projektek több mint 40%-a leáll | kockázati korrekció |
| kapacitasVisszaforgatas | 0.28 | forrás | Gartner G6: a szervezetek 72%-a nem forgatja vissza a felszabadult időt értékes értékesítési munkára | csak a kapacitás-illusztrációban |

## Az eladó oldala

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| fixFejlesztoFte | 0.5 | saját | saját feltevés | termékkarbantartás, interfészváltozások, modellfrissítés |
| fixEgyebEv | 1500000 | saját | saját feltevés | könyvelés, biztosítás, eszközök |
| onboardingOrak | 4, 8, 16, 40 | saját | saját feltevés | egy ügyfél beüzemelése, ha a csatolók kész termékként újrahasznosíthatók |
| ugyfelszamok | 1, 3, 5, 10, 20 | saját | saját választás |  |

## Forgatókönyvek

|  | Óvatos | Reális | Optimista |
|---|---|---|---|
| Árbevétel-növekedés | 0,50% | 1,00% | 2,00% |
| Az időmegtakarítás pénzben | 100% | 100% | 100% |
| Keresgélés a kézi időben | nem | igen | igen |
| Beüzemelés (óra) | 16 | 8 | 4 |
| Támogatás (óra/használó/hó) | 0,4 | 0,2 | 0,1 |
| Rendszergazda (FTE, csak saját szerver) | 0.1 | 0.05 | 0.03 |

- **realizacio:** Az alapeset a felszabadult munkaidő teljes bérértékét számolja. A Gartner G3, G5, G6 szerint ennek csak egy része jelenik meg pénzben; az 50%-os és a 28%-os arány az érzékenységi táblában.
- **onboardingOra:** Saját feltevés: az eladó beüzemelési munkája egy ügyfélnél, ha a csatolók kész termékként újrahasznosíthatók. A 800 € kb. 21 óra fejlesztői munkát fedez.
- **rendszergazdaFte:** Saját feltevés: csak a saját szerveres változatban, a vevő üzemeltetési munkája.
- **emberiIdo:** Az emberi idő minden forgatókönyvben a tipikus felhasználóé; a KLM (alsó korlát) és a nem begyakorolt felhasználó az érzékenységi táblában.
- **bevetelNoveles:** Saját forgatókönyv: a jelenlegi árbevétel növekedése a gyorsabb ajánlat- és rendeléskezelés miatt. Mért vagy publikált százalék nincs; az irányt az HBR 2011-es vizsgálata (Oldroyd, McElheran, Elkington; 2241 cég: az egy órán belüli válasz kb. hétszer nagyobb eséllyel vezet érdemi beszélgetéshez) mutatja. A riport a fedezeti növekedést is megadja.
- **tamogatasOraHasznalo:** Saját feltevés: az eladó támogatási munkája használónként havonta (kérdések, hibabejelentés, csatoló-karbantartás). A díjjal arányos, mert a kis ügyfél kevesebb támogatást kér.
- **kereses:** A keresgélés (McKinsey Global Institute, 2012: a munkahét 19%-a) a reális és az optimista forgatókönyvben a kézi időt növeli, az óvatosban nem.

## Források

- Eurostat, Structural business statistics: `sbs_sc_ovw` (Enterprise statistics by size class and NACE Rev. 2 activity) és `sbs_ovw_act` (Enterprises by detailed NACE Rev. 2 activity), Magyarország, 2022; lekérdezve az Eurostat adatbázis API-ján, 2026-11-16.
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
