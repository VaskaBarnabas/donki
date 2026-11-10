# Az emberi idő pontosítása stopper nélkül

*20. fázis · 2026-11-10 · számítás: `scripts/riportok/emberi-klm.ts`, `scripts/riportok/emberi-megtakaritas.ts` · adatok: [adatok/klm.json](adatok/klm.json), [adatok/megtakaritas.json](adatok/megtakaritas.json)*

## 1. A kérdés és a rövid válasz

Az ágens idejét megmértük, az emberét nem: valódi felhasználókkal, stopperrel nincs lehetőségünk mérni. Eddig tíz feladatra egy-egy saját becslésünk volt (összesen 104 perc), és a megtakarítást ehhez mértük. Azt kerestük, hogyan lehet ezt megbízható forrásokra támaszkodva pontosítani.

**A válasz három pontban:**

1. Létezik elfogadott, lektorált módszer az emberi végrehajtási idő kiszámítására, mérés nélkül: a **Keystroke-Level Model** (KLM). Ezzel a tíz feladat begyakorlott, hibátlan végrehajtása **15,4 perc**. Ez alsó korlát.
2. A korábbi becslésünk ennek a **6,8-szorosa**. Ebben benne van a keresgélés, a megértés, a megszakítások ideje, de **lehet, hogy túl sok**. A valóság a két szám között van; a dolgozatban sávként érdemes kezelni.
3. Ha az ágens mellett maradó emberi munkát is beszámítjuk (kérés megírása, válasz elolvasása, jóváhagyás, a sikertelen futások kézi újracsinálása), a feladatszintű megtakarítás e4b-vel **29–67%**, 12b-vel **25–49%**, a középértéken **56%**, illetve **45%**. Ez kisebb a korábban közölt 60–73%-nál.

A tanulság: **a korábbi megtakarítás a sáv felső szélén volt**. Az ágens előnye megmarad, de óvatosabban kell megfogalmazni.

## 2. A források és megbízhatóságuk

A forrásokat a bizonyító erejük szerint válogattuk. A gyűjtéskor nem minden teljes szöveg volt elérhető: az *ellenőrzés* oszlop mutatja, honnan jön a szám. **A „másodlagos” jelzésű számokat idézés előtt az eredeti cikkben ellenőrizd.**

| # | Forrás | Típus | Amit ad | Ellenőrzés |
|---|---|---|---|---|
| H1 | Card, Moran, Newell (1980): [The keystroke-level model for user performance time with interactive systems](https://doi.org/10.1145/358886.358895), *Communications of the ACM* 23(7) | lektorált, alapmű | végrehajtási idő számítása műveletekből; a becslés hibája kb. 21% (RMS) | az absztrakt és [operátor-összefoglaló](https://en.wikipedia.org/wiki/Keystroke-level_model) |
| H2 | Brysbaert (2019): How many words do we read per minute?, *Journal of Memory and Language* 109 | meta-analízis, 190 tanulmány, 18 573 fő | néma olvasás: 238 szó/perc nem szépirodalomra | kereső, bibliográfiai adatok |
| H3 | Brynjolfsson, Li, Raymond (2025): [Generative AI at Work](https://econpapers.repec.org/RePEc:oup:qjecon:v:140:y:2025:i:2:p:889-942.), *Quarterly Journal of Economics* 140(2) | terepkísérlet, 5172 ügyfélszolgálatos | +15% megoldott ügy óránként; a kezdők nyernek a legtöbbet (munkaanyag: +34%) | absztrakt |
| H4 | Noy, Zhang (2023): Experimental evidence on the productivity effects of generative AI, *Science* | randomizált kísérlet, 453 fő | írásfeladatokon kb. 40%-kal kevesebb idő, kb. 18%-kal jobb minőség | másodlagos |
| H5 | Humlum, Vestergaard (2025): [Large Language Models, Small Labor Market Effects](https://econpapers.repec.org/RePEc:nbr:nberwo:33777), NBER | 25 000 dolgozó, 7000 munkahely, Dánia | átlagosan kb. 3% megtakarított munkaidő; a felszabadult idő több mint 80%-a más munkára megy | másodlagos |
| H6 | Bick, Blandin, Deming: [generatív MI idő-megtakarítás](https://fredblog.stlouisfed.org/2026/08/does-generative-ai-save-time-at-work/), St. Louis Fed | országos reprezentatív felmérés, USA | a használóknál 5,4% (2024), az összes dolgozóra 2,2% (2026 II. n.év) | a FRED blog összefoglalója |
| H7 | McKinsey (2023): [The economic potential of generative AI](https://www.mckinsey.com/mgi/our-research/the-economic-potential-of-generative-ai-the-next-productivity-frontier/) | elemzés | a technológia a munkaidő 60–70%-át kitevő tevékenységeket *elvileg* automatizálhatja | kereső |
| H8 | Gartner (2026): [AI saves sellers nearly 5 hours per week](https://www.gartner.com/en/newsroom/press-releases/2026-05-19-gartner-survey-finds-ai-saves-sellers-nearly-five-hours-per-week-yet-seventy-two-percent-of-sales-organizations-fail-to-reinvest-time-in-high-value-activities) | felmérés, 210 vezető | 4,8 óra/hét/értékesítő, 72% nem forgatja vissza | kereső (G6) |
| H9 | Mark, Gudith, Klocke (2008): The cost of interrupted work, CHI | laborkísérlet | megszakításnál a dolgozók gyorsítanak, de nő a stressz és az erőfeszítés | másodlagos |
| H10 | APQC-benchmarkok ([CFO.com](https://www.cfo.com/news/metric-of-the-month-the-cost-of-an-invoice/661701/)) | iparági benchmark | számlánkénti medián költség kb. 5,83 $, a legjobbak 2,07 $ | másodlagos |

A H9 és a H10 csak kontextus, számítás nem épül rájuk. Az ügyfélszolgálati és értékesítési adatok nagyrészt külföldi, nagyvállalati környezetből valók.

## 3. A módszer: KLM a tíz feladatra

A KLM a munkát elemi műveletekre bontja, és mindegyikhez kutatással megállapított időt rendel:

| Művelet | Idő | Jelentés |
|---|---:|---|
| K | 0,28 s | billentyűleütés, átlagos irodai gépelő (40 szó/perc); bonyolult kódnál 0,75 s |
| P | 1,1 s | egérrel rámutatás |
| B | 0,1 s | egérgomb lenyomása vagy felengedése |
| H | 0,4 s | kéz áthelyezése egér és billentyűzet között |
| M | 1,35 s | mentális előkészület, döntés |
| R | változó | várakozás a rendszerre (itt: oldalbetöltés 1 s, raktári válasz 3 s, saját feltevések) |

A tíz feladat lépéseit a [legacy forgatókönyv](../../docs/LEGACY_FORGATOKONYV.md) írja le: melyik rendszert nyitja meg, mit keres, mit másol át, mit olvas le. Ezeket a lépéseket kódoltuk (`emberi-klm.ts`), az olvasásokhoz a 238 szó/perc sebességet használva.

**Amit a KLM nem tartalmaz:** a tanulást, a hibát és javítását, a megszakításokat, azt, hogy az ember kitalálja, hova kell mennie, és a más munkától való elszakadást. Ezért **alsó korlát**: egy begyakorlott ember ideje, aki pontosan tudja a lépéseket, és nem hibázik. A módszer átlagos hibája az eredeti cikkben kb. 21% (a begyakorolt, hibátlan esetre).

**A saját kódolás korlátja:** a lépéslistát mi állítottuk össze, nem egy független szakértő. A gépelési sebesség változtatása (0,2–0,5 s) a teljes időt csak −2% és +5% között mozgatja, az eredmény tehát nem ezen múlik, hanem a lépéslistán.

## 4. Az eredmény

| | Feladat | KLM alsó korlát | Korábbi becslés | Becslés / KLM | Rendszerváltás | Hibalehetőség |
|---|---|---:|---:|---:|---:|---:|
| E1 | Árajánlat e-mailes érdeklődésre | 102 s | 8 perc | 4,7× | 3 | 10 |
| E2 | Kifutott termék – helyettesítő | 52 s | 5 perc | 5,8× | 1 | 5 |
| E3 | 20%-os kedvezmény – jóváhagyás kérése | 89 s | 6 perc | 4,0× | 2 | 9 |
| E4 | Megrendelés: az ajánlat elfogadása | 62 s | 4 perc | 3,9× | 2 | 6 |
| E5 | „Hol a csomag?” | 31 s | 4 perc | 7,8× | 1 | 4 |
| E6 | „Mit kell utánrendelni?” | 123 s | 15 perc | 7,3× | 2 | 13 |
| E7 | Díjbekérő kiállítása | 69 s | 6 perc | 5,2× | 2 | 5 |
| E8 | „Kifizették már?” | 65 s | 3 perc | 2,8× | 2 | 5 |
| E9 | Garancia – érvényes | 56 s | 8 perc | 8,6× | 2 | 9 |
| E10 | „Hogy állunk?” | 274 s | 45 perc | 9,9× | 6 | 32 |
| | **Összesen** | **15,4 perc** | **104 perc** | **6,8×** | | |

**Hogyan értelmezzük a 6,8-szoros különbséget?** Nem azt jelenti, hogy a becslés hibás. Egy 8 perces árajánlatba belefér, hogy a kolléga megkeresi a levelet, felidézi a kedvezményszabályt, kétszer ellenőriz, és közben megszólítják. A KLM mindezt nem látja. A különbség viszont azt jelenti, hogy **a becslés nem támasztható alá önmagában**, és a nagy arányú feladatoknál (E9, E10, E5, E6) a legbizonytalanabb.

**Javaslat a dolgozatba: háromértékű alapvonal.**

- **Alsó:** KLM, begyakorlott, hibátlan végrehajtás. Mérhető módszerrel kiszámítva.
- **Felső:** a korábbi forgatókönyv-becslés, a megszakításokkal és a keresgéléssel együtt.
- **Közép:** a kettő geometriai közepe, összesen **39 perc** a tíz feladatra. **Ez a mi feltevésünk, nem kutatási eredmény**, csak azt fejezi ki, hogy a szorzó-jellegű bizonytalanság közepét keressük. Számításhoz ezt használjuk, a sáv két szélét pedig érzékenységként.

## 5. Mennyi emberi munka marad az ágens mellett?

Az ágens saját gépideje nem az ember ideje. Az ember ideje ágens mellett feladatonként:

- a kérés begépelése (a mért kérés hossza × 0,28 s + egy M);
- a válasz elolvasása (a mért válasz hossza, 238 szó/perc + egy M);
- a jóváhagyás, kártyánként **20 s** (feltevés, a korábbi 15–30 s közepe);
- a sikertelen vagy részleges futás **teljes kézi újracsinálása** a sikertelenség arányában (óvatos feltevés: a részleges futásból is teljes újramunka lesz, ami túloz).

A gép futásidejét nem számoljuk emberi időnek: közben a kolléga mással foglalkozhat.

| 10 feladat összesen | Ember ágens nélkül (alsó / közép / felső) | Ember ágenssel | Megtakarítás |
|---|---|---|---|
| **e4b** | 15,4 / 39,2 / 104 perc | 11,0 / 17,3 / 34,4 perc | **29% / 56% / 67%** |
| **12b** | 15,4 / 39,2 / 104 perc | 11,5 / 21,6 / 53,1 perc | **25% / 45% / 49%** |

**Mit mutat a feladatonkénti bontás** ([adatok/megtakaritas.json](adatok/megtakaritas.json)):

- **A keresős, több rendszert érintő lekérdezések a nyerők.** A „mit kell utánrendelni” (E6) 69–96%, a „kifizették már” (E8) 75–91%, a garancia (E9) 38–94% megtakarítást ad bármelyik alapvonalon. Itt az ember sok rendszert jár be, az ágens egy mondatra válaszol.
- **A rövid, egylépéses feladatoknál kicsi vagy negatív az előny az alsó alapvonalon.** A „hol a csomag” (E5) egy gyakorlott kollégának 31 másodperc; az ágensnek feltenni a kérdést és elolvasni a választ majdnem ugyanennyi.
- **A jóváhagyás költsége látható.** Az E3-nál (kedvezmény) két kártya 40 s emberi időt visz el, ez az alsó alapvonalon elviszi az előnyt.
- **Ahol a modell megbízhatatlan, ott elvész az előny.** Az E10 12b-vel mindhárom futásban „részben” lett, ezért a teljes újracsinálással számolva nincs megtakarítás; az E1 és az E3 e4b-vel 33%-os sikerességnél szintén alig ad előnyt. A javítás tehát közvetlenül időt jelent.

## 6. Feladatszint és munkakörszint: miért nem lehet a százalékot a teljes munkaidőre vetíteni

A szakirodalom számai első ránézésre ellentmondanak a mieinknek. Kísérletekben és felmérésekben az MI-ből eredő megtakarítás munkaidőre vetítve **kicsi**: 3% (H5), 5,4% a használóknál és 2,2% minden dolgozóra (H6), 15% több megoldott ügy (H3), heti 4,8 óra, vagyis egy 40 órás hét 12%-a (H8). Írásfeladatnál, célzottan 40% (H4). A technikailag automatizálható rész 60–70% (H7).

A különbségnek három oka van:

1. **Más a mérési egység.** A mi 45–56%-unk *az adott, jól körülhatárolt feladatok* idejére vonatkozik. A H5 és a H6 *a teljes munkaidőre*, amelyben sok olyan tevékenység van, amihez az MI nem nyúl.
2. **Más az eszköz.** Ezek a tanulmányok főként általános chatbotokat vizsgálnak. A mi ágensünk bekötött rendszereken ténylegesen végrehajtja a feladatot. Ez jobban hasonlít a H3 terepi rendszerére, mint egy szövegírást segítő chatre, de nem azonos azzal.
3. **A felszabadult idő nem automatikusan megtakarítás.** A H5 szerint a felszabadult idő több mint 80%-a más munkára megy, és a H8 szerint a szervezetek 72%-a nem forgatja vissza értékes tevékenységre.

**Következmény a pénzügyi riportra:** a munkakörszintű megtakarítás = feladatszintű megtakarítás × az érintett feladatok aránya a munkaidőből. Ha például egy értékesítő munkaidejének harmada ilyen rendszermunka, a középértéken ez 15–19% munkaidő, ami nagyságrendileg egyezik a H8 12%-ával és a H3 15%-ával. **Ezt az arányt külső forrásból nem tudtuk meghatározni a mi cégméretünkre**, ezért a pénzügyi riportban paraméter lesz.

## 7. Ajánlott megfogalmazás a dolgozatba

> A régi munkamód idejét nem mértük felhasználókkal. A végrehajtási idő alsó korlátját a Keystroke-Level Modellel számítottuk (Card, Moran és Newell, 1980), az olvasási időt Brysbaert (2019) alapján. Felső korlátként a folyamatleírásból származó becslést használjuk. A sáv közepén az ágens a vizsgált feladatok emberi idejét 45–56%-kal csökkenti, a sáv szélein 25–67%-kal. Ez feladatszintű érték, a teljes munkaidőre nem vetíthető.

## 8. Korlátok

- A lépéslista saját kódolás, és a régi munkamód leírása egy elképzelt cégről szól.
- A KLM begyakorolt, hibátlan felhasználóra érvényes. Egy kezdő lassabb, ezért az alsó érték a kezdők számára valószínűleg túl alacsony.
- A geometriai közép önkényes választás.
- A 20 másodperces kártyaidő feltevés, és nem tartalmazza azt, ha a jóváhagyó tényleg utánanéz valaminek.
- A sikertelen futás teljes újracsinálása szándékosan óvatos.
- A külső tanulmányok más országban, más munkakörökben készültek.
