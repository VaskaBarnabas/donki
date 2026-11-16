# Az emberi végrehajtási idő: tipikus felhasználó és KLM szerinti alsó korlát

*2026-11-10 · számítás: `scripts/riportok/emberi-klm.ts`, `scripts/riportok/emberi-megtakaritas.ts` · adatok: [adatok/klm.json](adatok/klm.json), [adatok/megtakaritas.json](adatok/megtakaritas.json) · az ágens adatai: a `2026-11-07-javitott` mérés MCP-futásai ([01-meres](../01-meres/ertekeles-2026-11-07-javitott.md))*

## 1. A kérdés és a rövid válasz

Az ágens idejét megmértük, az emberét nem: valódi felhasználókkal, stopperrel a prototípus keretében nem lehetett mérni. Az emberi időt ezért számítottuk, két szinten:

- **KLM, alsó korlát:** a **Keystroke-Level Model** (Card, Moran és Newell, 1980) a begyakorlott, hibátlanul dolgozó felhasználó idejét adja.
- **Tipikus felhasználó, alapeset:** egy cégben kevés kolléga szakértője minden rendszernek. A tipikus felhasználó gyakorlott, de nem szakértő ügyintéző; idejét a KLM-ből forrásolt korrekciókkal számítjuk (3.2. szakasz). Ezekre a feladatokra publikált mediánidő nincs, ezért ez a legjobb forrásolt közelítés.

**Az eredmény:**

1. A tíz feladat kézzel: **KLM szerint 15,4 perc, tipikus felhasználóval 21,8 perc**, nem begyakorolt felhasználóval 29,0 perc.
2. Az ágens melletti emberi munkát is beszámítva (a kérés begépelése, a válasz elolvasása, a jóváhagyás, a sikertelen futások kézi újracsinálása) a tipikus felhasználó munkaideje a tíz feladaton **e4b-vel 41%-kal, 12b-vel 35%-kal** csökken. A KLM alsó korláthoz mérve ugyanez 29% és 25%.
3. A megtakarítás aránya annál nagyobb, minél lassabb a kézi munka (4.3. szakasz). A KLM-mel számolt érték ezért a legkedvezőtlenebb eset.

A tanulság: az ágens a tipikus, sőt a leggyorsabb, hibátlanul dolgozó emberhez mérve is csökkenti a munkaidőt. Az előny a több rendszert érintő feladatoknál nagy, az egyszerű, egyrendszeres kérdéseknél kicsi vagy nulla.

## 2. A források és megbízhatóságuk

A forrásokat a bizonyító erejük szerint válogattuk. A *hozzáférés* oszlop azt mutatja, hogy a számot a teljes szövegből vagy másodlagos összefoglalóból vettük-e át.

| # | Forrás | Típus | Amit ad | Hozzáférés |
|---|---|---|---|---|
| H1 | Card, S. K., Moran, T. P., Newell, A. (1980): The keystroke-level model for user performance time with interactive systems. *Communications of the ACM* 23(7), 396–410. [doi:10.1145/358886.358895](https://doi.org/10.1145/358886.358895) | lektorált, alapmű | végrehajtási idő számítása elemi műveletekből; a becslés hibája kb. 21% (RMS) | absztrakt és operátor-összefoglaló |
| H2 | Brysbaert, M. (2019): How many words do we read per minute? A review and meta-analysis of reading rate. *Journal of Memory and Language* 109, 104047. [doi:10.1016/j.jml.2019.104047](https://doi.org/10.1016/j.jml.2019.104047) | meta-analízis, 190 tanulmány, 18 573 fő | néma olvasás: 238 szó/perc nem szépirodalmi szövegre | bibliográfiai adatok, absztrakt |
| H3 | Brynjolfsson, E., Li, D., Raymond, L. (2025): [Generative AI at Work](https://econpapers.repec.org/RePEc:oup:qjecon:v:140:y:2025:i:2:p:889-942.). *Quarterly Journal of Economics* 140(2), 889–942. | terepkísérlet, 5172 ügyfélszolgálatos | +15% megoldott ügy óránként; a kezdők nyernek a legtöbbet | absztrakt |
| H4 | Noy, S., Zhang, W. (2023): Experimental evidence on the productivity effects of generative artificial intelligence. *Science* 381(6654), 187–192. | randomizált kísérlet, 453 fő | írásfeladatokon kb. 40%-kal kevesebb idő, kb. 18%-kal jobb minőség | másodlagos |
| H5 | Humlum, A., Vestergaard, E. (2025): [Large Language Models, Small Labor Market Effects](https://econpapers.repec.org/RePEc:nbr:nberwo:33777). NBER Working Paper 33777. | 25 000 dolgozó, 7000 munkahely, Dánia | átlagosan kb. 3% megtakarított munkaidő; a felszabadult idő több mint 80%-a más munkára megy | másodlagos |
| H6 | Bick, A., Blandin, A., Deming, D.: [Does generative AI save time at work?](https://fredblog.stlouisfed.org/2026/08/does-generative-ai-save-time-at-work/) Federal Reserve Bank of St. Louis, FRED Blog, 2026. augusztus | országos reprezentatív felmérés, USA | a használóknál 5,4% (2024), az összes dolgozóra 2,2% (2026 II. negyedév) | a blog összefoglalója |
| H7 | McKinsey Global Institute (2023): [The economic potential of generative AI](https://www.mckinsey.com/mgi/our-research/the-economic-potential-of-generative-ai-the-next-productivity-frontier/) | elemzés | a technológia a munkaidő 60–70%-át kitevő tevékenységeket *elvileg* automatizálhatja | összefoglaló |
| H8 | Gartner (2026. május 19.): AI saves sellers nearly 5 hours per week (sajtóközlemény; a teljes hivatkozás: [G6](../02-szakirodalom/gartner-forrasok.md)) | felmérés, 210 értékesítési vezető | 4,8 óra/hét/értékesítő, 72% nem forgatja vissza | másodlagos |
| H9 | Mark, G., Gudith, D., Klocke, U. (2008): The cost of interrupted work: more speed and stress. *Proceedings of CHI 2008*, 107–110. [doi:10.1145/1357054.1357072](https://doi.org/10.1145/1357054.1357072) | laborkísérlet | megszakításnál a dolgozók gyorsítanak, de nő a stressz és az erőfeszítés | másodlagos |
| H11 | Sauro, J. (2009): Estimating Productivity: Composite Operators for Keystroke Level Modeling. *Human-Computer Interaction International 2009*, LNCS 5610. [doi:10.1007/978-3-642-02574-7_40](https://doi.org/10.1007/978-3-642-02574-7_40) | empirikus próba, 26 felhasználó, két vállalati webalkalmazás | a KLM a gyakorlott felhasználók idejét 10–30%-on belül becsli | összefoglaló |
| H12 | Murty, R. N., Dadlani, S., Das, R. B. (2022): How Much Time and Energy Do We Waste Toggling Between Applications? *Harvard Business Review*, 2022. augusztus | megfigyelés, 137 felhasználó, három Fortune 500 cég, legfeljebb öt hét | naponta kb. 1200 alkalmazásváltás; egy váltás után kicsivel több mint 2 s a visszazökkenés; ez a munkaidő kb. 9%-a | összefoglaló |
| H13 | Barchard, K. A., Pace, L. A. (2011): Preventing human error: The impact of data entry methods on data accuracy and statistical results. *Computers in Human Behavior* 27(5), 1834–1839 | kísérlet | egyszeri kézi adatbevitelnél kb. 1% hiba | másodlagos |
| H10 | APQC-benchmark, közli: [CFO.com, Metric of the Month: The Cost of an Invoice](https://www.cfo.com/news/metric-of-the-month-the-cost-of-an-invoice/661701/) | iparági benchmark | számlánkénti medián feldolgozási költség kb. 5,83 $, a legjobbak 2,07 $ | másodlagos |

A KLM-számítás a H1-re és a H2-re épül, a tipikus felhasználó ezen felül a H11–H13-ra. A H3–H8 a kapott százalék értelmezéséhez kell (6. szakasz), a H9 és a H10 csak kontextus. Az ügyfélszolgálati és értékesítési adatok nagyrészt külföldi, nagyvállalati környezetből valók.

## 3. A módszer

### 3.1. KLM a tíz feladatra

A KLM a munkát elemi műveletekre bontja, és mindegyikhez kutatással megállapított időt rendel:

| Művelet | Idő | Jelentés |
|---|---:|---|
| K | 0,28 s | billentyűleütés, átlagos irodai gépelő (40 szó/perc); bonyolult kódnál 0,75 s |
| P | 1,1 s | egérrel rámutatás |
| B | 0,1 s | egérgomb lenyomása vagy felengedése |
| H | 0,4 s | kéz áthelyezése egér és billentyűzet között |
| M | 1,35 s | mentális előkészület, döntés |
| R | változó | várakozás a rendszerre (itt: oldalbetöltés 1 s, raktári válasz 3 s, saját feltevés) |

A tíz feladat lépéseit a [legacy forgatókönyv](../../docs/LEGACY_FORGATOKONYV.md) írja le: melyik rendszert nyitja meg az ügyintéző, mit keres, mit másol át, mit olvas le. Ezeket a lépéseket kódoltuk (`emberi-klm.ts`), az olvasásokhoz a 238 szó/perc sebességet használva (H2). A tíz feladat a mérés egy-egy feladatának felel meg (E1 = F01, …, E10 = F20; a párosítás a táblázatban).

**Amit a KLM nem tartalmaz:** a tanulást, a hibát és javítását, a megszakításokat, azt, hogy az ember kitalálja, hova kell mennie, és a más munkától való elszakadást. Ezért **alsó korlát**: egy begyakorlott ember ideje, aki pontosan tudja a lépéseket, és nem hibázik. A módszer átlagos hibája az eredeti cikkben kb. 21% (a begyakorolt, hibátlan esetre).

**A saját kódolás korlátja:** a lépéslistát mi állítottuk össze, nem egy független szakértő. A gépelési sebesség változtatása (0,2–0,5 s) a teljes időt csak −2% és +5% között mozgatja; az eredmény tehát nem ezen múlik, hanem a lépéslistán.

### 3.2. A tipikus felhasználó

A tipikus felhasználó ugyanazokat a lépéseket végzi, de nem szakértő módon. Három forrásolt korrekciót teszünk a KLM-re:

| Korrekció | Érték | Forrás |
|---|---|---|
| Lassabb végrehajtás, mint a KLM-ben | × 1,2 | a KLM hibája kb. 21% (H1); gyakorlott felhasználóknál a valós idő 10–30%-kal tér el (H11) |
| Visszazökkenés minden rendszerváltás után | + 2 s váltásonként | H12 |
| A kézi hibák miatti újracsinálás | × (1 + a feladat hibaesélye) | 1% hibaesély kézi műveletenként (H13), a lépéslista hibalehetőségeivel; feladatonként 4–28% |

**A nem begyakorolt felhasználó** (érzékenységi eset): mint a tipikus, de a billentyű- és a mentális idő a kétszerese. Az arány egy tanulási vizsgálatból származik (első napon 0,95 s/billentyű a begyakorolt 0,47 s helyett), amelyet csak másodlagos forrásból láttunk.

**Amit a tipikus felhasználó sem tartalmaz:** a keresgélést (hol van az adat, melyik rendszerben), a szabályok felidézését vagy utánanézését és a más munkából eredő megszakításokat. Ezekre nincs feladatszintű forrásunk, ezért kimaradtak; emiatt a tipikus felhasználó ideje is inkább alacsony, mint magas becslés.

## 4. Az eredmény

### 4.1. Az emberi idő ágens nélkül

| | Feladat (mérési párja) | KLM alsó korlát | Tipikus | Nem begyakorolt | Rendszerváltás | Hibalehetőség |
|---|---|---:|---:|---:|---:|---:|
| E1 | Árajánlat e-mailes érdeklődésre (F01) | 102 s | 141 s | 187 s | 3 | 10 |
| E2 | Kifutott termék – helyettesítő (F03) | 52 s | 67 s | 81 s | 1 | 5 |
| E3 | 20%-os kedvezmény – jóváhagyás kérése (F05) | 89 s | 121 s | 175 s | 2 | 9 |
| E4 | Megrendelés: az ajánlat elfogadása (F07) | 62 s | 83 s | 108 s | 2 | 6 |
| E5 | „Hol a csomag?” (F09) | 31 s | 40 s | 53 s | 1 | 4 |
| E6 | „Mit kell utánrendelni?” (F12) | 123 s | 170 s | 212 s | 2 | 13 |
| E7 | Díjbekérő kiállítása (F13) | 69 s | 92 s | 138 s | 2 | 5 |
| E8 | „Kifizették már?” (F15a) | 65 s | 86 s | 131 s | 2 | 5 |
| E9 | Garancia – érvényes (F18a) | 56 s | 77 s | 104 s | 2 | 9 |
| E10 | „Hogy állunk?” (F20) | 274 s | 434 s | 555 s | 6 | 32 |
| | **Összesen** | **15,4 perc** | **21,8 perc** | 29,0 perc | | |

A *rendszerváltás* azt mutatja, hány különböző legacy felületet kell megnyitni a feladathoz. A *hibalehetőség* a kézi adatátvitelek és értékleolvasások száma; ezt a [hibariport](../05-osszehasonlitasok/02-hibak-ember-es-agens.md) használja.

### 4.2. Mennyi emberi munka marad az ágens mellett?

Az ágens gépideje nem az ember ideje. Az ember ideje ágens mellett feladatonként:

- a kérés begépelése (a mért kérés hossza × 0,28 s, plusz egy M);
- a válasz elolvasása (a mért válasz hossza, 238 szó/perc, plusz egy M);
- a jóváhagyás, kártyánként **20 s** (feltevés);
- a sikertelen vagy részleges futás **teljes kézi újracsinálása**, a sikertelenség arányában. Ez szándékosan óvatos: a részleges futásból is teljes újramunkát számol.

A gép futásidejét nem számoljuk emberi időnek: közben a kolléga mással foglalkozhat.

A táblázat a tipikus felhasználóval számol.

| Feladat | KLM | Tipikus | Nem begyakorolt | e4b: siker | e4b: ember ágenssel | e4b: megtakarítás | 12b: siker | 12b: ember ágenssel | 12b: megtakarítás |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| E1 | 102 s | 141 s | 187 s | 33% | 141 s | −1% | 100% | 46 s | 67% |
| E2 | 52 s | 67 s | 81 s | 100% | 38 s | 44% | 100% | 31 s | 54% |
| E3 | 89 s | 121 s | 175 s | 33% | 155 s | −28% | 100% | 89 s | 26% |
| E4 | 62 s | 83 s | 108 s | 100% | 51 s | 38% | 100% | 53 s | 37% |
| E5 | 31 s | 40 s | 53 s | 67% | 40 s | 2% | 67% | 34 s | 17% |
| E6 | 123 s | 170 s | 212 s | 100% | 37 s | 78% | 100% | 38 s | 78% |
| E7 | 69 s | 92 s | 138 s | 67% | 85 s | 7% | 100% | 50 s | 45% |
| E8 | 65 s | 86 s | 131 s | 100% | 16 s | 82% | 100% | 16 s | 81% |
| E9 | 56 s | 77 s | 104 s | 100% | 34 s | 55% | 100% | 31 s | 59% |
| E10 | 274 s | 434 s | 555 s | 67% | 171 s | 61% | 0% | 466 s | −7% |
| **Összesen** | **15,4 perc** | **21,8 perc** | **29,0 perc** | | **12,8 perc** | **41%** | | **14,2 perc** | **35%** |

**A három alapvonal összesítve:**

| 10 feladat | KLM (alsó korlát) | Tipikus (alapeset) | Nem begyakorolt |
|---|---:|---:|---:|
| Ember ágens nélkül | 15,4 perc | 21,8 perc | 29,0 perc |
| Ember ágenssel, e4b | 11,0 perc (−29%) | 12,8 perc (−41%) | 14,9 perc (−49%) |
| Ember ágenssel, 12b | 11,5 perc (−25%) | 14,2 perc (−35%) | 16,3 perc (−44%) |

A sikerességi arány feladatonként három futásból jön, ezért feladatszinten zajos. Az összesített érték megbízhatóbb.

### 4.3. Miért nő a megtakarítás a kézi idővel?

**A levezetés.** Egy feladatnál a megtakarítás aránya `1 − (I + (1 − s) · T) / T = s − I / T`, ahol *T* az ember ideje ágens nélkül, *I* az ágens melletti interakció ideje, *s* a sikeresség. Az *I* nem függ *T*-től, ezért ha a valós *T* nagyobb a KLM-nél, a megtakarítás aránya is nagyobb. A KLM-mel számolt százalék tehát a legkedvezőtlenebb eset, a tipikus felhasználóé a reális középső.

**Mit mutat a feladatonkénti bontás?**

- **A keresős, több rendszert érintő lekérdezések a nyerők.** A „mit kell utánrendelni” (E6) és a „kifizették már” (E8) mindkét modellel 78–82% megtakarítást ad. Itt az ember több rendszert jár be, az ágens egy mondatra válaszol.
- **A rövid, egyrendszeres feladatoknál kicsi az előny.** A „hol a csomag” (E5) egy tipikus kollégának 40 másodperc; az ágensnek feltenni a kérdést és elolvasni a választ majdnem ugyanennyi.
- **A jóváhagyás költsége látható.** Az E3-nál (kedvezmény) két kártya 40 s emberi időt visz el, a 12b-nél így a megtakarítás csak 26%.
- **Ahol a modell megbízhatatlan, ott elvész az előny.** Az E10 a 12b-vel mindhárom futásban „részben” lett, az E1 és az E3 az e4b-vel 33%-os. A teljes újracsinálással számolva ezeken a feladatokon a megtakarítás negatív. A sikeresség javítása ezért közvetlenül munkaidőt jelent.

### 4.4. Kiegészítő feladatok

A mérésben az ágens a tíz alapfeladaton túl további nyolc feladatot is elvégzett ([feladatok.md](../01-meres/feladatok.md)). Ezek kézi idejét ugyanazzal a módszerrel számoltuk (KLM-lépések a legacy forgatókönyvből, tipikus felhasználó). A pénzügyi riport ezekkel együtt számol; a fenti összesítések a tíz alapfeladatra vonatkoznak.

| | Feladat | KLM | Tipikus | Rendszerváltás | e4b: siker | e4b: ember ágenssel | e4b: megtakarítás | 12b: siker | 12b: ember ágenssel | 12b: megtakarítás |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| E11 (F02) | Új érdeklődő felvétele és ajánlat | 143 s | 201 s | 3 | 100% | 78 s | 61% | 100% | 75 s | 62% |
| E12 (F06) | Vezetői jóváhagyás (kedvezmény) | 51 s | 67 s | 1 | 100% | 41 s | 40% | 67% | 56 s | 17% |
| E13 (F08) | Rendelés jóváhagyása készlethiánnyal | 78 s | 108 s | 3 | 100% | 42 s | 61% | 100% | 41 s | 62% |
| E14 (F10) | Kiszállítás indítása | 34 s | 44 s | 1 | 100% | 43 s | 1% | 100% | 43 s | 2% |
| E15 (F11) | Bevételezés | 60 s | 81 s | 2 | 100% | 48 s | 40% | 100% | 48 s | 41% |
| E16 (F16) | Rendelés lemondása | 43 s | 56 s | 1 | 100% | 40 s | 27% | 100% | 41 s | 26% |
| E17 (F17) | Számla sztornója | 43 s | 55 s | 1 | 100% | 47 s | 14% | 100% | 46 s | 17% |
| E18 (F19) | Reklamáció felvétele | 72 s | 92 s | 1 | 100% | 69 s | 26% | 100% | 61 s | 33% |

A legnagyobb nyereség az új vevő felvételénél (E11) és a készlethiányos jóváhagyásnál (E13) van, ahol az ember három rendszert jár be. A kiszállítás indítása (E14) egyetlen gombnyomás a régi felületen, ott az ágens alig gyorsabb.

## 5. Mire elég és mire nem a számítás

**Amire elég:** a KLM egy ellenőrizhető, a szakirodalomban elfogadott alsó korlát; a tipikus felhasználó forrásolt korrekciókkal ad reális középső becslést. Kimondható, hogy az ágens a legkedvezőtlenebb esetben is csökkenti az emberi munkaidőt a vizsgált feladatokon.

**Amire nem elég:** a valós emberi idő pontos meghatározására. A tanulás, a keresgélés, a hibák javítása és a megszakítások a valóságban jelentős időt visznek el, de ezek nagyságára mérés nélkül nincs megbízható számunk. A valós megtakarítás meghatározásához stopperes mérés kellene valódi ügyintézőkkel; ez a dolgozat keretein kívül esik.

## 6. Feladatszint és munkakörszint: miért nem lehet a százalékot a teljes munkaidőre vetíteni

A szakirodalom számai munkaidőre vetítve kisebbek: 3% (H5), 5,4% a használóknál és 2,2% minden dolgozóra (H6), 15% több megoldott ügy (H3), heti 4,8 óra, vagyis egy 40 órás hét 12%-a (H8). Írásfeladatnál, célzottan 40% (H4). A technikailag automatizálható rész 60–70% (H7).

A különbségnek három oka van:

1. **Más a mérési egység.** A mi 35–41%-unk (KLM-mel 25–29%) *az adott, jól körülhatárolt feladatok* idejére vonatkozik. A H5 és a H6 *a teljes munkaidőre*, amelyben sok olyan tevékenység van, amihez az MI nem nyúl.
2. **Más az eszköz.** Ezek a tanulmányok főként általános chatbotokat vizsgálnak. A mi ágensünk bekötött rendszereken ténylegesen végrehajtja a feladatot. Ez jobban hasonlít a H3 terepi rendszerére, mint egy szövegírást segítő chatre, de nem azonos azzal.
3. **A felszabadult idő nem automatikusan megtakarítás.** A H5 szerint a felszabadult idő több mint 80%-a más munkára megy, és a H8 szerint a szervezetek 72%-a nem forgatja vissza értékes tevékenységre.

**Következmény:** a munkakörszintű megtakarítás = feladatszintű megtakarítás × az érintett feladatok aránya a munkaidőből. Ha például egy értékesítő munkaidejének harmada ilyen rendszermunka, a tipikus felhasználóval ez 12–14% munkaidő (KLM-mel 8–10%). Ez nagyságrendben egyezik a H8 12%-ával és a H3 15%-ával. Az érintett feladatok arányát külső forrásból nem tudtuk meghatározni a mi cégméretünkre.

## 7. Összefoglalás

A régi munkamód idejét nem mértük felhasználókkal. A végrehajtási idő alsó korlátját a Keystroke-Level Modellel számítottuk (Card, Moran és Newell, 1980), az olvasási időt Brysbaert (2019) alapján. A tipikus, gyakorlott, de nem szakértő felhasználó idejét a KLM-ből forrásolt korrekciókkal számoltuk (Sauro, 2009; Murty és mtsai, 2022; Barchard és Pace, 2011). Ehhez mérve az MCP-s ágens a vizsgált tíz feladat emberi munkaidejét 35–41%-kal csökkenti, a jóváhagyás és a sikertelen futások kézi megismétlése után is; a KLM alsó korláthoz mérve 25–29%-kal. Az érték feladatszintű, a teljes munkaidőre nem vetíthető.

## 8. Korlátok

- A lépéslista saját kódolás, és a régi munkamód leírása egy elképzelt cégről szól.
- A KLM begyakorolt, hibátlan felhasználóra érvényes. A tipikus felhasználó korrekciói forrásoltak, de a keresgélés és a szabályok felidézése nincs bennük.
- A nem begyakorolt felhasználó kétszeres szorzója másodlagos forrásból származik.
- A 20 másodperces kártyaidő feltevés, és nem tartalmazza azt az esetet, amikor a jóváhagyó tényleg utánanéz valaminek.
- A sikertelen futás teljes újracsinálása szándékosan óvatos.
- A feladatonkénti sikeresség három futásból jön.
- A külső tanulmányok más országban, más munkakörökben készültek.
