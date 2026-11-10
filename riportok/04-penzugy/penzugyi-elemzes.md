# Pénzügyi terv: szerver, setup díj és felhasználószám szerinti előfizetés

*20. fázis · generálta: `scripts/riportok/penzugy.ts` · a feltevések és forrásaik: [feltevesek.md](feltevesek.md) · adatok: [adatok/](adatok/)*

> Ezt a fájlt a szkript generálja. Ne kézzel szerkeszd: módosítsd a [feltevesek.json](feltevesek.json) fájlt, és futtasd újra. Minden ár nettó, adóhatások nélkül.

## 1. A terv és a rövid válasz

A megoldás nem egyedi projektként, hanem előfizetésként értékesül. A vevő három dolgot fizet: **egy helyben futó szervert**, **egy egyszeri setup díjat** és **a felhasználók száma szerinti havidíjat**. A karbantartást, a támogatást és a modellfrissítést a havidíj tartalmazza.

A vevő oldalán a reális forgatókönyv 25 felhasználónál három év alatt **nagyjából nullszaldós**: az NPV 1,1 M Ft. Az eladó oldalán egy 25 fős ügyfél bekötése 16 hónap alatt térül vissza, és a vállalkozás fix költségeit reálisan 8 ügyfél fedezi.

- **Pozitív NPV-t adó vevői forgatókönyvek:** Reális, Optimista.
- **Fedezeti létszám a vevőnél (három év, NPV = 0):** óvatos nincs 2000 főig, reális 19 fő, optimista 2 fő.
- **G2-kockázattal korrigált várható NPV (reális):** −3,5 M Ft.
- **A legnagyobb hatású tényező:** hibák javítása (30 perc/hiba) (−85,2 M Ft és 38,6 M Ft között), majd emberi alapvonal.

**A modell szándékosan szűk.** Csak a tíz mért feladat idejét számolja hasznosnak. A háttérfigyelő, a gyorsabb reakció és a volumennövekedés valódi érték lehet, de nincs rá megbízható forintértékünk.

## 2. Az üzleti konstrukció

**Árlista (javaslat, üzleti döntés, nincs mögötte piaci adat).**

| Tétel | Ár |
|---|---|
| Setup díj, alap | 1 500 000 Ft |
| Setup díj, bekötött rendszerenként | 300 000 Ft |
| Havidíj, minimum | 150 000 Ft / hó |
| 1–10. felhasználó | 15 000 Ft / fő / hó |
| 11–25. felhasználó | 12 000 Ft / fő / hó |
| 26–50. felhasználó | 10 000 Ft / fő / hó |
| 51+. felhasználó | 8 000 Ft / fő / hó |
| Minimális szerződés | 12 hónap |

A sávos díj sávonként számít, ezért a sávhatár átlépésekor a díj nem ugrik. Hét bekötött rendszernél a setup díj 3 600 000 Ft.

**Szerver.** A vevő saját tulajdonába kerül, így az ügyféladat a cégen belül marad. Az ár egy Mac Studio M4 Max 48 GB (1 092 390 Ft) és 150 000 Ft kiegészítő szerverenként. A méretezés a mért gépidőből indul: a napi futások 30%-a esik a csúcsórára, 70%-os kihasználtsággal. 25 felhasználótól tartalékszerver is van. A szerverek száma létszámonként az 5. szakaszban szerepel. A párhuzamos terhelést nem mértük, és a mérés nem ezen a gépen futott, ezért a méretezés éles bevezetés előtt ellenőrizendő.

**Felhasználószám és haszon.** A díj a létszámtól, a haszon a rendelésszámtól függ. A kettőt a forgatókönyv aránya köti össze: 35,2 rendelés / felhasználó / hó. Ha egy cégnél ez az arány más, a megtérülés is más lesz (lásd 6. szakasz). Mivel a megoldás épp a kézi munkát csökkenti, hosszabb távon a felhasználók száma is csökkenhet, ami a díjbevételt rontja.

## 3. A módszer

**Haszon.** Feladatonként a régi munkamód emberi ideje mínusz az ember ideje az ágens mellett, évi darabszámmal és a munkakör KSH-bérével szorozva.

**Realizálás.** A felszabadult idő nem automatikusan pénz (Gartner G3, G5, G6). A modell csak a megadott arányt számolja haszonként, az első évben ennek is a 50%-át.

**Hibák.** A sikertelen futás kézi újracsinálása az ember idejében szerepel. A csendes hibák külön javítási költségét az alapeset sem az ágensnél, sem az embernél nem számolja, mert a [2-es teszt](../05-osszehasonlitasok/02-hibak-ember-es-agens.md) szerint azonos nagyságrendűek. A hatását az érzékenységi tábla mutatja.

**Modell.** Az alapesetben a kisebb hasznot adó modell szerepel (most **e4b**), a 99 futásos sikerességgel (e4b 92%, 12b 94%), mert feladatonként három ismétlés a súlyozáshoz túl zajos.

## 4. A vevő oldala, 25 felhasználó

|  | Óvatos | Reális | Optimista |
|---|---|---|---|
| Emberi alapvonal | KLM (alsó) | geometriai közép | korábbi becslés |
| Realizált idő | 28% | 50% | 80% |
| Kézi munka régen, óra/év | 1809 | 3857 | 8317 |
| Emberi munka ágenssel, óra/év | 1099 | 1265 | 1626 |
| Felszabaduló érték / év (100%) | 5,3 M Ft | 19,4 M Ft | 50,2 M Ft |
| Realizált haszon / év | 1,5 M Ft | 9,7 M Ft | 40,2 M Ft |
| Szerverek száma | 2 | 2 | 2 |
| Szerver | 2,5 M Ft | 2,5 M Ft | 2,5 M Ft |
| Setup díj | 3,6 M Ft | 3,6 M Ft | 3,6 M Ft |
| Betanítás | 1,5 M Ft | 1,5 M Ft | 1,5 M Ft |
| **Egyszeri összesen** | **7,5 M Ft** | **7,5 M Ft** | **7,5 M Ft** |
| Havidíj | 330 000 Ft / hó | 330 000 Ft / hó | 330 000 Ft / hó |
| Rendszergazda / év | 1,3 M Ft | 0,6 M Ft | 0,4 M Ft |
| Áram / év | 1 900 Ft | 1 900 Ft | 1 900 Ft |
| **Üzem összesen / év** | **5,2 M Ft** | **4,6 M Ft** | **4,3 M Ft** |
| **TCO 3 évre** | **23,2 M Ft** | **21,3 M Ft** | **20,6 M Ft** |
| Realizált haszon 3 évre | 3,7 M Ft | 24,2 M Ft | 100,4 M Ft |
| **NPV (10%)** | **−18,0 M Ft** | **1,1 M Ft** | **66,5 M Ft** |
| ROI | −84% | 13% | 388% |
| Megtérülés | 36 hónapon belül nincs | 30 hónap | 6 hónap |
| G2-kockázattal korrigált várható NPV | −14,9 M Ft | −3,5 M Ft | 35,8 M Ft |

A kockázati sor a Gartner G2 előrejelzéséből 60% sikeresélyt vesz. Bukásnál a vevő elveszíti a setup díjat, a betanítást, 12 havi díjat és a szerver értékének felét. Ez előrejelzés, nem mért valószínűség.

## 5. Létszám szerint

| Felhasználó | Rendelés/hó | Havidíj | Szerver | Egyszeri | Óvatos: NPV | Reális: NPV | Optimista: NPV | Reális: megtérülés |
|---|---|---|---|---|---|---|---|---|
| 5 | 176 | 150 000 Ft | 1 | 5,1 M Ft | −12,3 M Ft | −6,5 M Ft | 10,8 M Ft | 36 hónapon belül nincs |
| 10 | 352 | 150 000 Ft | 1 | 5,4 M Ft | −12,0 M Ft | −2,9 M Ft | 26,4 M Ft | 36 hónapon belül nincs |
| 25 | 880 | 330 000 Ft | 2 | 7,5 M Ft | −18,0 M Ft | 1,1 M Ft | 66,5 M Ft | 30 hónap |
| 50 | 1760 | 580 000 Ft | 2 | 9,0 M Ft | −24,3 M Ft | 11,2 M Ft | 136,9 M Ft | 20 hónap |
| 100 | 3520 | 980 000 Ft | 3 | 13,2 M Ft | −34,9 M Ft | 33,5 M Ft | 279,7 M Ft | 16 hónap |

**Mekkora havidíjat bír el a vevő?** Az a díj, amelynél a háromévi NPV éppen nulla, adott setup díj és szerver mellett. Ha a tényleges díj ennél alacsonyabb, a különbség a vevő nyeresége.

| Felhasználó | Javasolt díj | Óvatos: maximum | Reális: maximum | Optimista: maximum | Reális: maximum / fő |
|---|---|---|---|---|---|
| 5 | 150 000 Ft | nincs | nincs | 494 834 Ft | nincs |
| 10 | 150 000 Ft | nincs | 57 710 Ft | 996 555 Ft | 5 771 Ft |
| 25 | 330 000 Ft | nincs | 363 814 Ft | 2 461 881 Ft | 14 553 Ft |
| 50 | 580 000 Ft | nincs | 940 383 Ft | 4 970 486 Ft | 18 808 Ft |
| 100 | 980 000 Ft | nincs | 2 053 682 Ft | 9 947 858 Ft | 20 537 Ft |

## 6. Érzékenység (vevő, reális, 25 felhasználó)

Az alapeset NPV-je 1,1 M Ft. Egyszerre egy feltevést változtatunk.

| Tényező | Kedvezőtlen | NPV | Kedvező | NPV | Terjedelem |
|---|---|---|---|---|---|
| Hibák javítása (30 perc/hiba) | csak az ágens, 11,7% | −85,2 M Ft | ágens 4,0%, ember 9,1% | 38,6 M Ft | 123,8 M Ft |
| Emberi alapvonal | KLM | −13,8 M Ft | korábbi becslés | 33,8 M Ft | 47,7 M Ft |
| Rendelés / felhasználó / hó | 20 | −7,3 M Ft | 60 | 14,8 M Ft | 22,1 M Ft |
| Realizált idő aránya | 28% | −8,0 M Ft | 80% | 13,4 M Ft | 21,4 M Ft |
| Feladatszintű siker (n=3) | e4b | −11,1 M Ft | 12b | 2,5 M Ft | 13,5 M Ft |
| Bérszint | −20% | −2,8 M Ft | +20% | 4,9 M Ft | 7,6 M Ft |
| Havidíj | +30% | −2,0 M Ft | −30% | 4,1 M Ft | 6,2 M Ft |
| Hibás futás aránya | ×2 | −1,4 M Ft | ×0,5 | 2,3 M Ft | 3,7 M Ft |
| Setup díj | +50% | −0,7 M Ft | −50% | 2,9 M Ft | 3,6 M Ft |
| Szerverár | ×2 | −1,1 M Ft | ×0,5 | 2,1 M Ft | 3,3 M Ft |
| Kártyaidő (20 s helyett) | 40 s | −0,8 M Ft | 10 s | 2,0 M Ft | 2,8 M Ft |
| Bekötött rendszerek | 7 | 1,1 M Ft | 4 | 2,0 M Ft | 0,9 M Ft |

## 7. Az eladó oldala

Az óradíj a KSH fejlesztői bérköltsége (14 018 Ft/óra), vállalkozói díj és árrés nélkül. A szerver a vevő közvetlen vásárlása, azon nincs bevétel.

**Egy 25 fős ügyfél** (setup 3 600 000 Ft, havidíj 330 000 Ft):

|  | Óvatos | Reális | Optimista |
|---|---|---|---|
| Bekötés, óra | 900 | 500 | 300 |
| Bekötés költsége | 12,6 M Ft | 7,0 M Ft | 4,2 M Ft |
| Setup díj mínusz bekötés | −9,0 M Ft | −3,4 M Ft | −0,6 M Ft |
| Támogatás, óra/hó | 12 | 8 | 5 |
| Támogatás költsége | 168 219 Ft / hó | 112 146 Ft / hó | 70 091 Ft / hó |
| Havi fedezet | 161 781 Ft / hó | 217 854 Ft / hó | 259 909 Ft / hó |
| Bekötés visszatérülése | 56 hónap | 16 hónap | 3 hónap |
| Fedezet 3 évre | −3,2 M Ft | 4,4 M Ft | 8,8 M Ft |

**A bekötési munka a legfontosabb szám** (reális támogatással):

| Bekötés, óra | Setup díj mínusz bekötés | Visszatérülés | Fedezet 3 évre | Fedezeti ügyfélszám | Ügyfél / év / fejlesztő |
|---|---|---|---|---|---|
| 150 | 1,5 M Ft | azonnal | 9,3 M Ft | 4 | 8,8 |
| 300 | −0,6 M Ft | 3 hónap | 7,2 M Ft | 5 | 4,4 |
| 500 | −3,4 M Ft | 16 hónap | 4,4 M Ft | 8 | 2,6 |
| 900 | −9,0 M Ft | 42 hónap | −1,2 M Ft | nincs | 1,5 |

**A vállalkozás egésze** (fix költség évi 10,8 M Ft: 0,5 FTE termékfejlesztés és egyéb tételek; 25 fős ügyfelek, reális forgatókönyv):

| Ügyfelek | Havidíj-bevétel / év | Támogatás / év | Fix költség / év | Üzemi eredmény / év | Három év, bekötéssel |
|---|---|---|---|---|---|
| 1 | 4,0 M Ft | 1,3 M Ft | 10,8 M Ft | −8,1 M Ft | −27,8 M Ft |
| 3 | 11,9 M Ft | 4,0 M Ft | 10,8 M Ft | −2,9 M Ft | −19,0 M Ft |
| 5 | 19,8 M Ft | 6,7 M Ft | 10,8 M Ft | 2,3 M Ft | −10,1 M Ft |
| 10 | 39,6 M Ft | 13,5 M Ft | 10,8 M Ft | 15,4 M Ft | 12,1 M Ft |
| 20 | 79,2 M Ft | 26,9 M Ft | 10,8 M Ft | 41,5 M Ft | 56,4 M Ft |

Az üzemi eredményben a bekötés nincs benne, a háromévesben igen, minden ügyfél három teljes évével. Az ügyfél-lemorzsolódást a modell nem kezeli.

## 8. Költség / megoldott ügy és felhőalternatíva

| Megoldás | Ember / ügy | Rendszer / ügy | Összesen |
|---|---|---|---|
| Kézi, régi munkamód | 366 Ft | – | 366 Ft |
| Előfizetés szerverrel (teljes TCO) | 118 Ft | 91 Ft | 209 Ft |
| Csak a tokendíj felhőben (Claude Sonnet 5.5) | 118 Ft | 5,9 Ft | 124 Ft |

Reális forgatókönyv, 25 felhasználó, a teljes munkaidő-értékkel. A Gartner G8 asszisztált ügyfélkapcsolatra 13,5 $-t, körülbelül 4 219 Ft-ot mond, ami amerikai, régebbi benchmark, csak nagyságrendi viszonyítás. A felhős sor nem tartalmazza a szoftver díját, és a felhőmodell sikerességét nem mértük. A szerver fő érve az adatok helyben tartása, nem az olcsóság: a szerverköltség három évre 2,5 M Ft, a Sonnet 5.5 tokendíja ugyanennyi idő alatt 1,4 M Ft lenne.

**Összevetés a Gartner G6-tal.** A reális forgatókönyvben a felszabaduló idő heti 7,5 óra értékesítőnként, 5 értékesítővel számolva. A Gartner felmérése heti 4,8 órát mond.

**Teljes CRM-csere (illusztratív, nincs rá forrásunk):** három évre 94,0 M Ft a vevő 21,3 M Ft-os TCO-jával szemben. A csere hasznát nem becsültük, ez csak költség-összevetés.

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
