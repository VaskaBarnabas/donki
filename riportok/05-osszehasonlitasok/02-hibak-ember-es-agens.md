# Hibák: az ember és az ágens összevetése

*20. fázis · 2026-11-10 · ágens: a `2026-11-07-javitott` mérés 198 MCP-futása ([adatok](../01-meres/adatok/2026-11-07-javitott.csv)) · ember: szakirodalmi hibaarányok és a [KLM-lépéslista](../03-emberi-tenyezo/emberi-ido-pontositas.md)*

## 1. Mit vizsgáltunk, és mit nem

A vevő első kérdése egy 90%-os eredménynél ez lesz: *és az ember hány százalékot ér el?* Ezt felhasználók nélkül nem lehet megmérni, ezért a teszt két különböző természetű számot állít egymás mellé:

- **Az ágens hibái mértek.** Mind a 198 futás végállapotát programmal ellenőriztük, és a 14 nem sikeres futás válaszát egyenként elolvastuk.
- **Az ember hibái számítottak.** Szakirodalmi hibaarányokat szoroztunk azzal, hogy a régi munkamódban egy feladat hány kézi adatátvitelt és értékleolvasást igényel.

**Ez nem mérés a mérés ellen.** A cél annak a kiderítése, hogy azonos nagyságrendben vannak-e a számok, és hogy *milyen jellegű* hibákat követ el az egyik és a másik.

**A legfontosabb eredmény: nem tudjuk azt állítani, hogy az ágens kevesebbet hibázik, mint az ember.** Azonos nagyságrend. Amiben egyértelműen más, az a hibák jellege.

## 2. Az ágens hibái, típusonként

198 futásból 184 sikeres volt. A maradék 14 futást elolvasva négy osztályba soroltuk őket. Az osztályozás a mi ítéletünk, az alábbi példákkal ellenőrizhető.

| Típus | Futás | Arány | Mit jelent | Esetek |
|---|---:|---:|---|---|
| **Sikeres** | 184 | 92,9% | a rendszer végállapota és a válasz kulcsadata is helyes | |
| **Csendes rossz adat** | 8 | 4,0% | magabiztosan állít valami hibásat, az ember ezt nem látja a válaszból | F01 e4b ×2, F20 12b ×3, F20 e4b ×1, F09 12b ×1, F18c e4b ×1 |
| **Megáll vagy visszakérdez** | 4 | 2,0% | nem végzi el a feladatot, de ez látszik | F05 e4b ×2, F06 12b, F25 12b |
| **Hiányos vagy határeset** | 2 | 1,0% | a lényeg helyes, valami kimaradt | F13 e4b, F09 e4b |
| **Rossz írás a rendszerben** | 0 | 0% | rossz tétel, rossz mennyiség, rossz vevő a végállapotban | |
| **Nem várt írási kísérlet** | 0 | 0% | olyan író eszközt próbált hívni, ami nem tartozott a feladathoz | |

A csendes rossz adat aránya statisztikailag: 4,0%, 95%-os konfidenciatartománnyal durván **2–8%**. A futások nem függetlenek (ugyanaz a feladat háromszor, ugyanaz a modell), ezért a valódi bizonytalanság ennél nagyobb.

**A nyolc csendes hiba közelebbről:**

- **F01, e4b (2×).** Az ajánlat helyesen, 600 694 Ft-tal jött létre, de a modell a válaszban 798 540 és 759 832 Ft-ot mondott. A rendszerben minden rendben, csak a vevőnek szánt szám rossz. Ez a legveszélyesebb típus: a jóváhagyási kártya a helyes írást mutatta, a hiba utána, a szövegben keletkezett.
- **F20, 12b (3×).** A vezetői összefoglalóban „0 nyitott hibajegy” szerepel, pedig volt. A modell érvénytelen szűrővel hívta az eszközt, az hibát adott, majd rossz paraméterrel próbálkozott tovább.
- **F20, e4b (1×).** Kevesebb nyitott hibajegyet mond a valósnál.
- **F09, 12b (1×).** „Felvételre vár” a valódi „A futár felvette” helyett. Nem zárható ki, hogy a szimulált futár a válasz és az ellenőrzés között lépett tovább.
- **F18c, e4b (1×).** Azt mondja, a garancia „nem érvényes”, de az igazi ok az, hogy a termék nincs a rendelésben. Félrevezető, bár nem teljesen hamis.

**A hiányos kategória két futása ellenőrzői határeset.** Az F13-nál az összeg helyes, csak a bizonylatszám maradt ki. Az F09-nél a válasz „a csomagot a DPD futár vette át”, ami helyes, de az ellenőrző csak a „felvett/felvéve” alakot ismeri. **Ezt az ellenőrzőt nem javítottuk**, és a korábbi riportok számait sem módosítottuk: egy további, az eredményt javító újraértékelésnek már nem volna hitele. Ha mégis javítanánk, az e4b eredménye 1 futással nőne.

**A feladatkészlet nehézsége számít.** A riport többi részében szereplő tíz feladatra (E1–E10) szűkítve a kép rosszabb: 60 futásból 11 nem teljes siker (18%), ebből **7 csendes rossz adat (11,7%)**. Ezek a feladatok számokat mondanak vissza, ezért itt van mit eltéveszteni.

## 3. Az ember hibái: mit mond a szakirodalom

| Forrás | Mit mér | Érték | Ellenőrzés |
|---|---|---|---|
| Panko, emberi hibakutatás összefoglaló ([arXiv](https://arxiv.org/pdf/1602.02601)) | egyszerű, ismétlődő tevékenység alap hibaaránya | kb. 0,5% tevékenységenként | másodlagos hivatkozás |
| Panko, ugyanott | összetett gondolkodási feladat | kb. 2–5% | másodlagos |
| Panko, [14 laborkísérlet, 967 fő](https://arxiv.org/pdf/1602.02601) | táblázatkezelő cellahiba | 3,9% (terepi auditokon 5,2%) | másodlagos |
| Barchard, Pace (2011), *Computers in Human Behavior* 27(5) | egyszeri kézi adatbevitel | kb. 1% ([a szerzők összefoglalója](https://img.faculty.unlv.edu/lab/newsletter/issue3/data-checking/)) | másodlagos |
| Goddard, Roudsari, Wyatt (2012), [JAMIA](https://pmc.ncbi.nlm.nih.gov/articles/PMC3240751) | automatizálási torzítás: az ember hibás javaslatot fogad el | a rossz döntés kockázata 26%-kal nő (RR 1,26; CI 1,11–1,44); a helyes döntést rosszra váltók aránya 6–11% | a teljes cikkből |

A Panko- és a Barchard-számokat idézés előtt az eredeti műben ellenőrizd.

**A számítás.** Egy feladat hibalehetőségeinek számát a [KLM-lépéslistából](../03-emberi-tenyezo/emberi-ido-pontositas.md) vettük: minden gépelés, beillesztés, keresés és értékleolvasás egy-egy lehetőség. Annak esélye, hogy egy feladatban legalább egy hiba történik: `1 − (1 − p)^n`.

| Feladat | Hibalehetőség (n) | p = 0,5% | p = 1% | p = 2% |
|---|---:|---:|---:|---:|
| E1 Árajánlat | 10 | 4,9% | 9,6% | 18,3% |
| E2 Kifutott termék | 5 | 2,5% | 4,9% | 9,6% |
| E3 Kedvezmény, jóváhagyás kérése | 9 | 4,4% | 8,6% | 16,6% |
| E4 Ajánlat elfogadása | 6 | 3,0% | 5,9% | 11,4% |
| E5 Hol a csomag? | 4 | 2,0% | 3,9% | 7,8% |
| E6 Mit kell utánrendelni? | 13 | 6,3% | 12,2% | 23,1% |
| E7 Díjbekérő | 5 | 2,5% | 4,9% | 9,6% |
| E8 Kifizették már? | 5 | 2,5% | 4,9% | 9,6% |
| E9 Garancia | 9 | 4,4% | 8,6% | 16,6% |
| E10 Hogy állunk? | 32 | 14,8% | 27,5% | 47,6% |
| **Átlag** | | **4,7%** | **9,1%** | **17,0%** |

**Hogyan olvasd:** ez annak a becslése, hogy *elkövet-e hibát*, nem annak, hogy *a hiba megmarad-e*. Az ember sok elírást észrevesz, a rendszer pedig egy részét elutasítja (érvénytelen cikkszám, hibás mezőszám). A végső, észrevétlen hibaarány tehát alacsonyabb. Az is igaz viszont, hogy a p értékek nyugodt laborkörülményekre vonatkoznak; munka közben, megszakításokkal az arány nagyobb lehet. Hogy a kettő melyik irányba billenti az egyenleget, azt forrás hiányában nem tudjuk megmondani.

## 4. Az összevetés

| A tíz feladaton (E1–E10) | Érték | Honnan |
|---|---:|---|
| Ember: legalább egy elkövetett hiba feladatonként | 5–17% | számított |
| Ágens: nem teljesen sikeres futás | 18% | mért |
| Ágens: csendes rossz adat | 11,7% | mért |

| A teljes 33 feladaton | Érték | |
|---|---:|---|
| Ágens: csendes rossz adat | 4,0% (2–8%) | mért |
| Ágens: rossz írás a rendszerben | 0 / 110 jóváhagyott írás | mért |

**Amit ebből ki lehet mondani:** az ágens hibaaránya ugyanabban a tartományban van, mint amit egy gondos ember hibaarányából számolni lehet. Nem jobb egyértelműen, és nem is rosszabb egyértelműen.

**Amit nem lehet kimondani:** hogy az ágens pontosabb az embernél. Ha ezt a dolgozat állítaná, könnyen megtámadható volna.

## 5. Ahol tényleg más a kettő: a hibák jellege

1. **A rendszerbe írt adat.** 110 jóváhagyott írásból egyik sem lett rossz. 0/110 mellett a valódi arány felső becslése kb. 2,7% (három-szabály). A kézi rögzítésnél a forgatókönyv tipikus hibái pont ezek: elírt cikkszám, rossz partner, kétszer felvett vevő. Az ágensnél ezeket az MCP-réteg szerkezete fogja meg: az eszköz azonosítót kér, nem szabad szöveget.
2. **A rossz adat a szövegben keletkezik.** Az ágens tipikus hibája nem a rendszerben, hanem a válaszmondatban van. A jóváhagyási kártya ezt nem fogja meg, mert a kártya az írásról szól, a szöveg utána készül.
3. **A hiba ismétlődik, és ezért javítható.** Az F20-as hiba a 12b-nél háromból háromszor ugyanúgy jelentkezett. Egy eszköz vagy szabály javításával az összes jövőbeni előfordulás megszűnik; ezt mutatta a [javítási ciklus](../01-meres/javitasok.md) is (78% → 94%). Az emberi hiba véletlenszerű, és egyenként kell megfogni.
4. **A szabály alkalmazása.** A forgatókönyv tipikus emberi hibája a kihagyott mennyiségi kedvezmény: az új kolléga nem tudja a szabályt. Az ágensnél ez kizárt, mert az árat a rendszer számolja, nem a modell. Ezt a különbséget a fenti hibaarányok nem mutatják, mert ez nem elírás, hanem tudáshiány.
5. **A nyomon követhetőség.** Az ágens minden lépése naplózott. Egy kézi hibánál utólag csak az eredmény látszik.

## 6. Mit jelent a jóváhagyás?

Az emberi jóváhagyás nem nyújt teljes védelmet. A Goddard-féle összefoglaló szerint hibás javaslatnál 26%-kal nő a rossz döntés kockázata, és az orvosi vizsgálatokban a résztvevők 6–11%-a helyes döntését rosszra változtatta. Ez orvosi döntéstámogatásról szól, nem ügyviteli rendszerről, ezért csak az irányt jelzi: minél megbízhatóbbnak tűnik a rendszer, annál kevésbé néz utána az ember.

A mi rendszerünkben a kártya strukturált adatot mutat (eszköz, paraméterek), így a jóváhagyó azt látja, ami ténylegesen megtörténik. Azt, hogy az ember mennyire veszi észre a hibás kártyát, **nem mértük**.

## 7. Javaslatok, amelyek a hibaelemzésből következnek

- **A válaszban szereplő számok ellenőrzése géppel.** A válasz összegeit vessük össze az eszközök kimenetével. Ez pont a legveszélyesebb, csendes típust (F01) fogná meg, és modell nélkül megoldható. Ez a legnagyobb hozadékú javítás.
- **Az érvénytelen eszközparaméter ne vezessen számhoz.** Ha a `list_tickets` hibát adott, a modell ne mondhasson 0-t (F20).
- **Vezetői összefoglalóhoz determinisztikus eszköz.** A négy szám legyen egy eszköz kimenete, ne a modell összeszámolása.

## 8. Korlátok

- Az emberi hibaarányokat laboratóriumi és táblázatkezelős kutatásokból vettük; ügyviteli rendszerre vonatkozó adatot nem találtunk.
- A hibalehetőségek száma a saját lépéslistánkból jön.
- Az ellenőrzők csak a kulcsadatot nézik. A „sikeres” válaszban lehet olyan kiegészítő mondat, ami téved, és ezt nem számoltuk.
- A 14 hibás futás osztályozása a mi ítéletünk.
- A két változó (ember, ágens) mérési módja különböző, ezért a különbségeket nem teszteltük statisztikailag.
