# Pénzügyi feltevések

*A [feltevesek.json](feltevesek.json) fájlból generálva. Típus: **mért** (saját mérésből), **forrás** (külső adat), **saját** (feltevés vagy üzleti döntés, külső alátámasztás nélkül).*

## Cég és létszám

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| munkanap | 251 | saját | naptári munkanapok kerekítve | a napi feladatokhoz és a gépkapacitáshoz |
| ertekesitok | 5 | saját | a forgatókönyv csak „több fő”-t mond | csak a Gartner 4,8 óra/hét összevetéshez |
| referenciaLetszam | 25 | saját | a forgatókönyv 40 fős cégének irodai dolgozói | a riport alapesete |
| letszamok | 5, 10, 25, 50, 100 | saját | saját választás | a díj és a haszon létszám szerinti vizsgálata |
| rendelesFelhasznalonkent | 35.2 | saját | MUNKAERO_BECSLES §4: napi 40 rendelés × 22 nap / 25 felhasználó | a haszon a rendelésszámtól, a díj a létszámtól függ, ez köti össze a kettőt |

## Árazás

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| setupAlap | 1500000 | saját | javasolt ár | telepítés, konfiguráció, betanítás megszervezése |
| setupRendszerenkent | 300000 | saját | javasolt ár | bekötött legacy rendszerenként |
| rendszerek | 7 | saját | LEGACY_FORGATOKONYV: a prototípus hét rendszere | kisebb cégnél kevesebb is lehet |
| havidijMinimum | 150000 | saját | javasolt ár | a támogatás fix költségét fedezi |
| szerzodesMinimumHo | 12 | saját | javasolt feltétel | korai felmondás ellen |

Havidíj-sávok (Ft/fő/hó): 10 főig 15000, 25 főig 12000, 50 főig 10000, afölött 8000.

## Gyakoriság (rendelésenként)

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| E1 | 3.75 | saját | MUNKAERO_BECSLES §4: 150 érdeklődés / 40 rendelés | érdeklődésre adott ajánlat vagy ár |
| E2 | 0.19 | saját | saját: az érdeklődések 5%-a kifutott termék | nincs külön adat |
| E3 | 0.1 | saját | MUNKAERO_BECSLES §2.1: a rendelések 10%-a | kedvezmény-jóváhagyás |
| E4 | 1 | saját | rendelésenként egy |  |
| E5 | 0.3 | saját | MUNKAERO_BECSLES §2.1: a rendelések 30%-a | „Hol a csomag?” |
| E6 | 1 | saját | MUNKAERO_BECSLES: napi egy utánrendelési lista |  |
| E7 | 1 | saját | rendelésenként egy díjbekérő |  |
| E8 | 1 | saját | rendelésenként egy fizetés-ellenőrzés |  |
| E9 | 0.01 | saját | MUNKAERO_BECSLES §2.1: a rendelések 1%-a | garancia, reklamáció |
| E10 | 1 | saját | MUNKAERO_BECSLES: napi egy vezetői helyzetkép |  |

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

## Szerver és áram

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
| felfutasElsoEv | 0.5 | saját | a Gartner G5 iránya (lassú létszámhatás), a mérték saját | az első évben a haszon fele realizálódik |
| betanitasOra | 8 | saját | saját feltevés | felhasználónként |
| g2Siker | 0.6 | forrás | Gartner G2 (előrejelzés): az ágenses projektek több mint 40%-a leáll | kockázati korrekció |

## Az eladó oldala

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| fixFejlesztoFte | 0.5 | saját | saját feltevés | termékkarbantartás, interfészváltozások, modellfrissítés |
| fixEgyebEv | 1500000 | saját | saját feltevés | könyvelés, biztosítás, eszközök |
| onboardingOrak | 150, 300, 500, 900 | saját | saját feltevés | a bevezetési munka érzékenysége |
| ugyfelszamok | 1, 3, 5, 10, 20 | saját | saját választás |  |

## CRM-csere

| Név | Érték | Típus | Forrás | Indoklás |
|---|---|---|---|---|
| bevezetes | 60000000 | saját | saját, illusztratív; nincs forrásunk | teljes CRM/ERP-csere 40 fős cégnél |
| licencEurFoHo | 100 | saját | saját, illusztratív | felhasználónként |
| bukasArany | 0.4 | saját | a Gartner G16 nem ad számot, a G2 40%-át vettük át azonos feltevésként | a kockázat azonos kezelése |

## Forgatókönyvek

|  | Óvatos | Reális | Optimista |
|---|---|---|---|
| Alapvonal | also | kozep | felso |
| Realizáció | 28% | 50% | 80% |
| Bekötés (óra) | 900 | 500 | 300 |
| Támogatás (óra/hó) | 12 | 8 | 5 |
| Rendszergazda (FTE) | 0.1 | 0.05 | 0.03 |

- **realizacio:** A felszabadult idő pénzben megjelenő része. A 28% a Gartner G6-ból analógia (a szervezetek 72%-a nem forgatja vissza az időt), az 50% és a 80% saját feltevés.
- **onboardingOra:** Saját feltevés: az eladó munkája egy ügyfélnél 7 rendszerrel. A 900 óra közelít az egyedi fejlesztéshez, a 300 óra jól újrahasznosítható csatlakozókat feltételez.
- **tamogatasOraHo:** Saját feltevés: támogatás ügyfélenként havonta, az adapterek karbantartásával.
- **rendszergazdaFte:** Saját feltevés: a vevő saját üzemeltetési munkája.

## Források

- KSH STADAT 20.1.1.52., foglalkozás szerinti keresetek, 2025.
- Gartner G2, G3, G5, G6, G8, G10, G16: [gartner-forrasok.md](../02-szakirodalom/gartner-forrasok.md).
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing), 2026-11-10.
- [Alza.hu, Mac Studio M4 Max](https://m.alza.hu/mac-studio-m4-max-d13290554.htm), a szerver ára.
- [Apple, Mac mini fogyasztás](https://support.apple.com/103253).
- [Szocho 2026](https://adozona.hu/tb_jarulekok_nyugdij/A_szocialis_hozzajarulasi_ado_2026_januar_1_7IZAR5), [2018. évi LII. törvény](https://njt.jog.gov.hu/jogszabaly/2018-52-00-00).
- [Privátbankár, KKV-áram](https://privatbankar.hu/cikkek/makro/minden-amit-a-kkv-s-rezsicsokkentesrol-tudni-kell.html).
- [MNB egyéb árfolyamok, 2026-07-01](https://www.mnb.hu/letoltes/az-mnb-hivatalos-devizalapjan-nem-szereplo-egyeb-arfolyamok-2026-07-01.pdf), [ING HU FX, 2026-02-09](https://assets.ing.com/m/fc0d1ab4299fbb09/original/HU_FX_20260209.pdf).
