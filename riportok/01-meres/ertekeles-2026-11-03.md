# Értékelés: nyers legacy interfész vs. MCP, két helyi modellel

*Mérés: 2026-11-03 · 322 futás · 27 feladat × 2 változat × 2 modell × 3 ismétlés · a módszer: [FAZIS19_TERV.md](../../docs/FAZIS19_TERV.md), [FAZIS20_TERV.md](../../docs/FAZIS20_TERV.md) · a nyers adat: [riportok/01-meres/adatok/2026-11-03.csv](../../riportok/01-meres/adatok/2026-11-03.csv) · újragenerálás: `npx tsx scripts/ertekeles/riport.ts --meres 2026-11-03`*

## 0. A mérés célja és felépítése

**A kutatási kérdés.** Képes-e egy helyben futó, kis nyelvi modellre épülő ágens a meglévő, egymástól független legacy rendszereken elvégezni a napi ügyintézést úgy, hogy a legacy rendszereket nem kell átírni? És mekkora ebben az MCP-réteg szerepe?

**A két változat: mit hasonlítunk össze.** A kísérlet egyetlen dolgot változtat, azt, hogy az ágens milyen felületen éri el a rendszereket:

- A **nyers** ágens közvetlenül a hét legacy interfészt kapja (PostgREST, JSON-RPC, HTTP homlokzat, üzenetsor, szöveges protokoll, REST, SOAP), a `legacy-docs/` leírásaival. A hálózati kapcsolatot és a hitelesítést az eszköz intézi. A formátum, a mezők, a kódok és a hibaüzenetek értelmezése viszont a modellre marad. Ez azt a helyzetet modellezi, amikor egy ágenst integrációs réteg nélkül kötnek a meglévő rendszerekre.
- Az **MCP**-s ágens a rendszereket öt MCP-szerveren át éri el (35 eszköz, egységes adatmodell, magyar nyelvű hibaüzenetek). A kéréseket egy front-desk ágens irányítja a megfelelő szakágenshez, és a szakágensek feladatleírásokat (skilleket) is kapnak.

Minden más azonos: ugyanaz a gráf, ugyanazok az általános szabályok, ugyanaz a jóváhagyási kapu és ugyanaz a modell. A két változat különbsége így az integrációs rétegnek tulajdonítható.

**A két modell: miért kettő.** A `gemma4:e4b` kicsi és gyors modell (kb. 4 milliárd effektív paraméter), a `gemma4:12b` háromszor akkora és lassabb. A kérdés az, hogy kell-e nagyobb modell, vagy a jól megtervezett eszközréteg a kisebb modellt is elegendővé teszi. Ha az MCP-vel a két modell közel azonos eredményt ad, a nyers változatban viszont nagy köztük a különbség, akkor a feladat nehezét az integrációs réteg veszi át a modelltől. Ez azért fontos, mert a kisebb modell olcsóbb gépen fut, és gyorsabban válaszol.

**Az ismétlés: miért háromszor.** A nyelvi modell ugyanarra a kérésre nem mindig ugyanúgy válaszol. Az átlagos sikeresség elfedheti, hogy egy feladat hol sikerül, hol nem. Ezért minden feladat modellenként és változatonként háromszor fut, és a *megbízható feladat* (pass^k) mutató azt méri, hogy hány feladat sikerült mindhárom alkalommal. Üzleti használatban ez a fontosabb szám.

**Az eredmény eldöntése.** A sikert nem a modell és nem ember ítéli meg, hanem egy program. Két dolgot néz: a rendszer **végállapotát** (például létrejött-e az ajánlat a jó tétellel, változatlan maradt-e a rendelés) és a válaszban szereplő **kulcsadatot** (összeg, bizonylatszám, állapot). Mindkettőt a rendszerből lekért aktuális adattal veti össze.

**A feladatok.** A feladatok a legacy forgatókönyv történeteit követik: ajánlat, kedvezmény, megrendelés, logisztika, számlázás, fizetés, garancia, vezetői összefoglaló, valamint robusztussági esetek. A feladatonkénti leírás, a kérés mintája, az érintett legacy rendszerek és a siker feltétele: [feladatok.md](feladatok.md).

## 1. Összesítő

**Mit mutat a táblázat?** Oszloponként egy változat és egy modell, soronként a mérőszámok. A *sikeres* arány a futások százaléka. A *megbízható feladat* a feladatok százaléka, amelyek mindhárom ismétlésben sikeresek voltak. Az idő az ágens gépideje a kéréstől a válaszig, emberi idő nélkül. Az eszközhívás a legacy rendszer vagy az MCP-szerver felé indított hívás. A token a modell be- és kimenetének mérete, ez határozza meg a futás költségét és idejét. A jóváhagyás az emberi kattintások száma. A *nem várt írási kísérlet* azt számolja, hányszor próbált az ágens olyan író műveletet, amely nem tartozott a feladathoz; ezeket a futtató elutasította.

| | nyers · gemma4:12b | nyers · gemma4:e4b | MCP · gemma4:12b | MCP · gemma4:e4b |
|---|---:|---:|---:|---:|
| Sikeres | **41%** | **9%** | **78%** | **75%** |
| Megbízható feladat (minden ismétlés sikeres, pass^k) | 37% (10/27) | 7% (2/27) | 74% (20/27) | 70% (19/27) |
| Részben sikeres | 13% | 2% | 8% | 16% |
| Sikertelen / hiba | 46% | 89% | 15% | 9% |
| Átlagos idő / feladat (s) | 305,8 | 4,6 | 22 | 7,8 |
| Eszközhívás / feladat | 4,6 | 1,5 | 1,5 | 1,4 |
| ebből hibás | 0,8 | 1 | 0,2 | 0,2 |
| Modellhívás / feladat | 5,3 | 2,6 | 3,7 | 3,6 |
| Token be / feladat | 19 954 | 5661 | 8244 | 7568 |
| Token ki / feladat | 318 | 127 | 216 | 156 |
| Jóváhagyás / feladat (emberi kattintás) | 0,8 | 0,2 | 0,6 | 0,6 |
| Nem várt írási kísérlet (összesen) | 0 | 3 | 3 | 2 |
| Visszakérdezett | 0 | 0 | 0 | 0 |
| Gépidő összesen (perc) | 407,7 | 6,2 | 29,3 | 10,5 |

**Mit jelent?**

- **Az MCP-réteg a döntő tényező.** A gemma4:12b sikeressége 41%-ról 78%-ra, a gemma4:e4b sikeressége 9%-ról 75%-ra nő, ugyanazzal a modellel és ugyanazokkal a szabályokkal. A legacy interfészek értelmezése (protokoll, mezőnevek, kódok, hibaüzenetek) a kis modelleknek túl nehéz; ha ezt a fordítást az MCP-réteg végzi, a feladatok nagy többsége sikerül.
- **A gemma4:12b nyers változata lassú.** Egy feladat átlagosan 305,8 s, mert a modell hosszan próbálkozik: többször hívja rossz paraméterrel a rendszert, és hosszú leírásokat olvas. Az MCP-vel ugyanez 22 s.
- **A rövid idő a gemma4:e4b nyers változatában nem gyorsaság.** A modell átlagosan 1,5 eszközhívás után feladja, és visszakérdez vagy hibát jelez. Ezért gyorsabb, mint az MCP-s változat, de szinte semmit nem végez el.
- **A biztonsági szabályok mindkét változatban érvényesek.** Minden írás jóváhagyási kártyán megy át, és a feladaton kívüli írást a futtató elutasítja. A nem várt írási kísérletek sora mutatja, mennyiszer kellett ennek a védelemnek működésbe lépnie.

## 2. Mennyit segít az MCP? (modellenként)

**Mit mutat?** Ugyanazt a modellt veti össze a két változatban. A százalékos változás az MCP-s változatnak a nyershez viszonyított eltérése.

| Modell | Siker: nyers → MCP | Idő: nyers → MCP | Eszközhívás: nyers → MCP | Token be: nyers → MCP |
|---|---|---|---|---|
| gemma4:12b | 41% → **78%** | 305,8 s → 22 s (−93%) | 4,6 → 1,5 | 19 954 → 8244 (−59%) |
| gemma4:e4b | 9% → **75%** | 4,6 s → 7,8 s (+71%) | 1,5 → 1,4 | 5661 → 7568 (+34%) |

**A két modell összevetése: mit bizonyít?** A nyers változatban a nagyobb és a kisebb modell között 32 százalékpont a különbség (gemma4:12b: 41%, gemma4:e4b: 9%). Az MCP-vel ez 3 százalékpontra szűkül (78% és 75%). Integrációs réteg nélkül tehát a modell mérete dönt; az MCP-réteggel a kisebb modell is közel ugyanazt teljesíti. A feladat nehéz részét, a heterogén interfészek értelmezését, az MCP-réteg veszi át. Ez a gyakorlatban azt jelenti, hogy elég a kisebb, olcsóbb gépen futó, gyorsabban válaszoló modell. A tokenszám a nagyobb modellnél a nyers változatban azért magas, mert a hosszú interfészleírásokat és a sikertelen próbálkozások eredményét is újra és újra beolvassa.

## 3. Feladattípusonként (sikeres arány)

**Mit mutat?** A feladatokat a vizsgált képesség szerint csoportosítja (a típusok leírása: [feladatok.md](feladatok.md#6-a-feladattípusok)). Megmutatja, hogy melyik feladatfajta nehéz a modellnek, és hol segít a legtöbbet az MCP-réteg.

| Típus (feladatok) | nyers · gemma4:12b | nyers · gemma4:e4b | MCP · gemma4:12b | MCP · gemma4:e4b |
|---|---:|---:|---:|---:|
| írás (F01, F06, F07, F10, F11, F16, F19) | 76% | 14% | 86% | 100% |
| többlépéses (F02, F05) | 50% | 0% | 100% | 50% |
| olvasás (F03, F04, F09, F15a, F15b, F18a, F18b, F18c, F18d) | 19% | 4% | 78% | 78% |
| hibakezelés (F08) | 0% | 0% | 100% | 100% |
| összesítés (F12, F20) | 0% | 0% | 67% | 67% |
| pénzügyi (F13, F14, F17) | 38% | 0% | 50% | 33% |
| robusztusság (F22, F23, F24) | 67% | 33% | 67% | 67% |

**Mit jelent?** A nyers változat a két modellt együtt nézve a(z) hibakezelés, összesítés, olvasás feladatokon a leggyengébb. Ezekben kell a legtöbb legacy formátumot értelmezni (szöveges protokoll, SOAP, kódolt állapotok), és a választ a kiolvasott adatból összerakni. Az írási feladat a nyers változatban viszonylag jobban megy, mert egy-egy írás egyetlen, jól dokumentált hívás. Az MCP-s változatban a leggyengébb típus a(z) pénzügyi (41% a két modellen együtt); a feladatonkénti okokat a 4. és a 6. szakasz mutatja.

## 4. Feladatonként

**Mit mutat?** A teljes részletezés: feladatonként és oszloponként a sikeres, a részben sikeres és az összes futás száma, és az átlagos gépidő. A feladatok leírása és az érintett rendszerek: [feladatok.md](feladatok.md). A „–” azt jelzi, hogy a feladat abban a változatban nem futott (a kontrollfeladatok csak MCP-vel).

Cellánként: sikeres / részben / összes futás, és az átlagos idő.

| Feladat | nyers · gemma4:12b | nyers · gemma4:e4b | MCP · gemma4:12b | MCP · gemma4:e4b |
|---|---|---|---|---|
| F01 Árajánlat e-mailes érdeklődésre | 0/0/3 · 37,9 s | 0/0/3 · 5 s | 3/0/3 · 15,7 s | 3/0/3 · 7,4 s |
| F02 Új érdeklődő felvétele és ajánlat | 0/0/3 · 19 s | 0/0/3 · 4,2 s | 3/0/3 · 19,4 s | 3/0/3 · 8,5 s |
| F03 Kifutott termék – helyettesítő ajánlása | 0/2/3 · 17 s | 0/0/3 · 2,5 s | 0/0/3 · 107,6 s | 0/0/3 · 3,4 s |
| F04 Készlet-kérdés | 3/0/3 · 16,7 s | 0/0/3 · 3,8 s | 3/0/3 · 6,7 s | 3/0/3 · 5,3 s |
| F05 20%-os kedvezmény – jóváhagyás kérése | 3/0/3 · 36,7 s | 0/0/3 · 9,7 s | 3/0/3 · 24,1 s | 0/3/3 · 8,7 s |
| F06 Vezetői jóváhagyás | 3/0/3 · 18 s | 0/0/3 · 3,4 s | 3/0/3 · 14,5 s | 3/0/3 · 6 s |
| F07 Megrendelés: az ajánlat elfogadása | 3/0/3 · 16,7 s | 3/0/3 · 3 s | 0/0/3 · 29,9 s | 3/0/3 · 6,6 s |
| F08 Jóváhagyás készlethiánnyal | 0/3/3 · 18,1 s | 0/0/3 · 2,3 s | 3/0/3 · 25,4 s | 3/0/3 · 7,8 s |
| F09 „Hol a csomag?” | 1/2/3 · 13,7 s | 0/0/3 · 4,1 s | 3/0/3 · 15,9 s | 1/2/3 · 6,3 s |
| F10 Kiszállítás indítása | 3/0/3 · 14 s | 0/0/3 · 4 s | 3/0/3 · 15,6 s | 3/0/3 · 7,8 s |
| F11 Bevételezés | 3/0/3 · 19,4 s | 0/0/3 · 6,9 s | 3/0/3 · 24,2 s | 3/0/3 · 11,3 s |
| F12 „Mit kell utánrendelni?” | 0/3/3 · 28 s | 0/0/3 · 2,9 s | 3/0/3 · 15,9 s | 3/0/3 · 11,1 s |
| F13 Díjbekérő kiállítása | 0/0/3 · 147,6 s | 0/0/3 · 3,9 s | 0/3/3 · 17,1 s | 0/3/3 · 10,8 s |
| F14 Fizetési link a díjbekérőhöz | 1/0/3 · 38,2 s | 0/0/3 · 3,7 s | 2/1/3 · 39,8 s | 0/3/3 · 7,1 s |
| F15a „Kifizették már?” (fizetett) | 0/0/3 · 18 s | 0/0/3 · 2,3 s | 0/0/3 · 9,4 s | 2/0/3 · 5,5 s |
| F15b „Kifizették már?” (fizetetlen) | 1/0/3 · 168,6 s | 0/0/3 · 2,3 s | 3/0/3 · 9,1 s | 3/0/3 · 6,3 s |
| F16 Rendelés lemondása | 3/0/3 · 751,4 s | 0/0/3 · 2,3 s | 3/0/3 · 20,4 s | 3/0/3 · 9,5 s |
| F17 Számla sztornója | 2/0/2 · 17,4 s | 0/0/3 · 3,7 s | 2/0/2 · 13 s | 3/0/3 · 11,7 s |
| F18a Garancia – érvényes | 0/0/3 · 996,3 s | 1/0/3 · 6,9 s | 3/0/3 · 11,3 s | 3/0/3 · 5,1 s |
| F18b Garancia – lejárt | 0/0/3 · 719,7 s | 0/0/3 · 6,4 s | 3/0/3 · 11,3 s | 3/0/3 · 4,2 s |
| F18c Garancia – nincs a rendelésben | 0/0/3 · 876,8 s | 0/0/3 · 9,8 s | 3/0/3 · 15 s | 3/0/3 · 4,5 s |
| F18d Garancia – még nincs kiszállítva | 0/0/3 · 686,2 s | 0/0/3 · 9,1 s | 3/0/3 · 7,4 s | 3/0/3 · 4,3 s |
| F19 Reklamáció felvétele | 1/0/3 · 2288,1 s | 0/0/3 · 4 s | 3/0/3 · 19,8 s | 3/0/3 · 10,4 s |
| F20 „Hogy állunk?” | 0/0/3 · 13,8 s | 0/0/3 · 1,3 s | 1/2/3 · 47,2 s | 1/2/3 · 22,9 s |
| F22 Eltérő vevőnév-írás | 0/0/3 · 410,2 s | 0/0/3 · 3,7 s | 0/0/3 · 20,5 s | 0/0/3 · 7,1 s |
| F23 Raktári kód nélküli termék rendelése | 3/0/3 · 755,1 s | 0/2/3 · 2,5 s | 3/0/3 · 19,1 s | 3/0/3 · 7,2 s |
| F24 Kérdés, miközben a számlázó áll | 3/0/3 · 17,3 s | 3/0/3 · 9,3 s | 3/0/3 · 14,6 s | 3/0/3 · 4,2 s |
| F25 Ékezet nélkül írt vevőnév (másik vevő) | – | – | – | – |
| F26 Többtételes ajánlat terméknévvel | – | – | – | – |
| F27 Meglévő díjbekérő fizetendő összege | – | – | – | – |
| F28 Ajánlat állapota és összege | – | – | – | – |
| F29 Garancia termékkód nélkül | – | – | – | – |
| F30 A legrégebbi lejárt tartozás | – | – | – | – |

## 5. Viszonyítás az emberhez: tipikus felhasználó és KLM szerinti alsó korlát

**Mit mutat?** Tíz gyakori feladatnál összeveti az ágens gépidejét és sikerességét azzal, amennyi idő alatt egy ember a régi munkamódban, a legacy rendszerek saját felületén elvégezné. Az emberi időt nem stopperrel mértük, hanem a **Keystroke-Level Model** (KLM; Card, Moran és Newell, 1980) szerint számoltuk: a munkát elemi műveletekre bontottuk (gépelés, egérmozdulat, mentális előkészület, várakozás a rendszerre, olvasás), és mindegyikhez a szakirodalmi időt rendeltük.

**Hogyan kell érteni?** A KLM a begyakorlott, hibátlanul dolgozó felhasználó idejét adja, keresgélés, tévedés és megszakítás nélkül. Ezért **alsó korlát**: a valós emberi idő ennél csak hosszabb lehet. A **tipikus felhasználó** gyakorlott, de nem szakértő ügyintéző: a KLM-idő 1,2-szerese (a KLM ismert eltérése gyakorlott felhasználóknál), rendszerváltásonként 2 s visszazökkenéssel és a kézi hibák miatti újracsinálással; ez az alapeset. A gépidő nem emberi munkaidő; az ember a futás alatt mással foglalkozhat. Az ágens melletti emberi munka (a kérés megírása, a válasz elolvasása, a jóváhagyás, a sikertelen futás kézi újracsinálása) és az ebből adódó megtakarítás: [emberi-ido-pontositas.md](../03-emberi-tenyezo/emberi-ido-pontositas.md).

| | Feladat | Ember, tipikus | Ember, KLM (alsó korlát) | Rendszerváltás | nyers · gemma4:12b: idő, siker | nyers · gemma4:e4b: idő, siker | MCP · gemma4:12b: idő, siker | MCP · gemma4:e4b: idő, siker |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| E1 (F01) | Árajánlat e-mailes érdeklődésre | 141 s | 102 s | 3 | 37,9 s, 0% | 5 s, 0% | 15,7 s, 100% | 7,4 s, 100% |
| E2 (F03) | Kifutott termék – helyettesítő ajánlása | 67 s | 52 s | 1 | 17 s, 0% | 2,5 s, 0% | 107,6 s, 0% | 3,4 s, 0% |
| E3 (F05) | 20%-os kedvezmény – jóváhagyás kérése | 121 s | 89 s | 2 | 36,7 s, 100% | 9,7 s, 0% | 24,1 s, 100% | 8,7 s, 0% |
| E4 (F07) | Megrendelés: az ajánlat elfogadása | 83 s | 62 s | 2 | 16,7 s, 100% | 3 s, 100% | 29,9 s, 0% | 6,6 s, 100% |
| E5 (F09) | „Hol a csomag?” | 40 s | 31 s | 1 | 13,7 s, 33% | 4,1 s, 0% | 15,9 s, 100% | 6,3 s, 33% |
| E6 (F12) | „Mit kell utánrendelni?” | 170 s | 123 s | 2 | 28 s, 0% | 2,9 s, 0% | 15,9 s, 100% | 11,1 s, 100% |
| E7 (F13) | Díjbekérő kiállítása | 92 s | 69 s | 2 | 147,6 s, 0% | 3,9 s, 0% | 17,1 s, 0% | 10,8 s, 0% |
| E8 (F15a) | „Kifizették már?” (fizetett) | 86 s | 65 s | 2 | 18 s, 0% | 2,3 s, 0% | 9,4 s, 0% | 5,5 s, 67% |
| E9 (F18a) | Garancia – érvényes | 77 s | 56 s | 2 | 996,3 s, 0% | 6,9 s, 33% | 11,3 s, 100% | 5,1 s, 100% |
| E10 (F20) | „Hogy állunk?” | 434 s | 274 s | 6 | 13,8 s, 0% | 1,3 s, 0% | 47,2 s, 33% | 22,9 s, 33% |
| | **Összesen** | **21,8 perc** | 15,4 perc | | 22,1 perc | 0,7 perc | 4,9 perc | 1,5 perc |

**Mit jelent?** Az MCP-s ágens gépideje a legtöbb feladatnál a tipikus, sőt a leggyorsabb ember idejének is töredéke, és a különbség ott a legnagyobb, ahol az embernek több rendszer között kell váltania (rendszerváltás oszlop). A rövid, egyetlen rendszert érintő kérdéseknél a két idő közel van egymáshoz. A sikerességi oszlop ugyanilyen fontos: ahol a siker 100% alatt van, ott a sikertelen futást az embernek kézzel kell megismételnie, és ez az előnyt csökkenti.

## 6. Tipikus hibák (példák)

**Mit mutat?** Oszloponként legfeljebb nyolc nem sikeres futás az ellenőrző megjegyzésével és a válasz elejével. A példák a hibák jellegét mutatják: a nyers változatban jellemzően az, hogy a modell nem találja meg az adatot a legacy felületen, vagy rosszul értelmezi; az MCP-s változatban inkább az, hogy a válaszban egy szám vagy állapot pontatlan. A modell válaszai szó szerint szerepelnek, a nyelvi hibáikkal együtt.

### nyers · gemma4:12b

- **F01** #1 (sikertelen): nem jött létre ajánlat – „Eddig az alábbi lépéseket végeztem el a kérés súlt teljesítéséhez: 1. **Partner keresése:** A `crm_rest` rendszerben megtaláltam a "Bakony Gépgyártó Kft" adatai…”
- **F01** #2 (sikertelen): nem jött létre ajánlat – „A Bakony Gépgyártó Kft (KIEMELT csoport) számára a Monitor 24" IPS Full HD (MN-24F) darabára 51 906 Ft, tehát 12 darabra összesen 622 872 Ft kerülne.”
- **F01** #3 (sikertelen): nem jött létre ajánlat – „A Bakony Gépgyártó Kft (KIEMELT csoport) számára a TK-00010 monitor ára 51 406 Ft darabban. A számítás alapja: - Listaár: 54 900 Ft - KIEMELT csoportos kedvezmé…”
- **F02** #1 (sikertelen): a vevő nem jött létre – „A megadott adószám alapján nem találtam meg a "Mérés 979785 Kft" céget a rendszerünkben, de a keresett TK-00010 monitor listázási ára 54 900 Ft. 3 darab ilyen m…”
- **F02** #2 (sikertelen): a vevő nem jött létre – „A megadott adószámhoz nem találtam meccsi partnert a rendszerben, de a keresett termék (TK-00010) listázási ára 54 900 Ft. 3 darab monitor ára összesen 164 700 …”
- **F02** #3 (sikertelen): a vevő nem jött létre – „A megadott adószám alapján nem találtam meg a "Mérés 775818 Kft" céget a rendszerben, de a keresett termék (TK-00010) listázott ára 54 900 Ft. 3 darab ilyen mon…”
- **F03** #1 (reszben): jelezte, hogy nem rendelhető; nincs aktív helyettesítő – „Sajnálatosan, az OF-16-os oszlopos fúrógép jelenleg nem rendelhető, mivel a rendszerben inaktív állapotban van (active: false).”
- **F03** #2 (reszben): jelezte, hogy nem rendelhető; nincs aktív helyettesítő – „Sajnálatosan, az OF-16-os oszlopos fúrógép jelenleg nem rendelhető, mivel a rendszerben inaktívként (active: false) szerepel.”

### nyers · gemma4:e4b

- **F01** #1 (sikertelen): nem jött létre ajánlat – „A monitor árához először a termékadatok lekérdezése szükséges. Kérem, adja meg a termékazonosítót vagy más információt a "TK-00010" monitorról, hogy ellenőrizhe…”
- **F01** #2 (sikertelen): nem jött létre ajánlat – „Sajnálom, de nem sikerült megtalálni a "TK-00010" monitort vagy általánosságban monitorokat az elérhető rendszerekben. Kérlek, ellenőrizze még egyszer a terméka…”
- **F01** #3 (sikertelen): nem jött létre ajánlat – „A monitor árakának lekérdezése során nem sikerült azonosítani a terméket vagy az árat. Kérlek, pontosítsa, kérjük más módon, vagy adja meg egy konkrét termékazo…”
- **F02** #1 (sikertelen): a vevő nem jött létre – „Sajnálom, de a termékazonosítóval vagy névvel való keresés nem ad eredményt az adatbázisban. Kérlek, pontosítsa, milyen termékről van szó, vagy küldje meg más i…”
- **F02** #2 (sikertelen): a vevő nem jött létre – „A termékazonosító (SKU) vagy neve nem található a katalógusban. Kérlek, pontosítsd meg a monitor típusát vagy küldj el azonosítóját.”
- **F02** #3 (sikertelen): a vevő nem jött létre – „A monitor árához először a termékazonosítóval kell keresni. Kérlek, adja meg pontosan a terméknévjét vagy azonosítóját, hogy ellenőrizhessem az árat.”
- **F03** #1 (sikertelen): nem mondta, hogy kifutott; nincs aktív helyettesítő – „A cikk azonosítója nem található a katalógusban. Kérlek, pontosítsa meg a terméknévre vagy más adatlapra vonatkozó keresését.”
- **F03** #2 (sikertelen): nem mondta, hogy kifutott; nincs aktív helyettesítő – „A cikk azonosítója nem található a katalógusban. Kérlek, pontosítsa meg a keresést vagy adja meg más információt a termékhez.”

### MCP · gemma4:12b

- **F03** #1 (sikertelen): nem mondta, hogy kifutott; nincs aktív helyettesítő – „Sajnálom, de nem találtam meg az OF-16 vagy "oszlopos fúrógép" kifejezésű terméket a rendszerünkben. Kérlek, tüccsön meg egy más nevet vagy kódot, és újra megpr…”
- **F03** #2 (sikertelen): nem mondta, hogy kifutott; nincs aktív helyettesítő – „Sajnálatosan, a rendszerben nem találok meg az OF-16 oszlopos fúrógépöt. Kérlek, add meg egy más nevet vagy termékkódot, és újra megkeresem neked.”
- **F03** #3 (sikertelen): nem mondta, hogy kifutott; nincs aktív helyettesítő – „Sajnálatosan, nem találtam meg az OF-16 vagy "oszlopos fúrógép" kifejezésű terméket a rendszerünkben. Kérlek, ellenőrizd a gyártónévt vagy egy más típusazonosít…”
- **F07** #1 (sikertelen): Piszkozat – „Sajnálatosan, nem tudtam megtalálni az AJ-2026-0231 ajánlatot a rendszerben. Kérlek, ellenőrizd az ajánlatszámot, vagy írj meg egy más, kapcsolódó számot (példá…”
- **F07** #2 (sikertelen): Piszkozat – „Sajnálatosan, nem tudtam megtalálni az AJ-2026-0249 ajánlatot a rendszerben. A Bakony Gépgyártó Kft nevére keresett rendelések listájában csak olyan ajánlatszám…”
- **F07** #3 (sikertelen): Piszkozat – „Sajnálatosan, nem találtam meg az AJ-2026-0267 ajánlatot a rendszerben. Kérlek, ellenőrizd az ajánlatszámot, vagy írj meg egy másik kulcsszót (például a termék …”
- **F13** #1 (reszben): DB-2026-000065, bruttó 102 756 Ft – a bruttó nincs a válaszban – „A RND-100174 rendeléshez kiállítottam a díjbekérőt (DB-2026-000065). A fizetendő összeg 80 910 Ft.”
- **F13** #2 (reszben): DB-2026-000068, bruttó 102 756 Ft – a bruttó nincs a válaszban – „A díjbekérőt kiállítottam a RND-100177 rendeléshez (azonosító: DB-2026-000068). A fizetendő összeg: 80 910 Ft.”

### MCP · gemma4:e4b

- **F03** #1 (sikertelen): nem mondta, hogy kifutott; nincs aktív helyettesítő – „Sajnálom, a termékkeresés nem talált semmit az "OF-16" kulcsszóval. Kérlek, pontosítsa, milyen kategóriában vagy más információval szeretne keresni?”
- **F03** #2 (sikertelen): nem mondta, hogy kifutott; nincs aktív helyettesítő – „Sajnálom, a rendszer nem talált semmit "OF-16" kulcsszóval. Kérlek, pontosítsa, milyen termékre gondolt, vagy adja meg más információt róla?”
- **F03** #3 (sikertelen): nem mondta, hogy kifutott; nincs aktív helyettesítő – „Sajnálom, a rendszer nem találta azonosítóval (OF-16) rendelhető terméket. Kérlek, pontosítsa, milyen kategóriában keresett vagy van más információja a termékke…”
- **F05** #1 (reszben): AJ-2026-0152: Piszkozat, 24.8% kedvezmény – „Az ajánlat ID-je **AJ-2026-0152**. A totalNet összege **206 424 Ft**, és az összesített kedvezmény (24.8%) meghaladja a 15%-os limitet, ezért jóváhagyást kell k…”
- **F05** #2 (reszben): AJ-2026-0169: Piszkozat, 24.8% kedvezmény – „Az ajánlat ID-je **AJ-2026-0169**. A totalNet összege 206 424 Ft. Mivel az összesített kedvezmény (24.8%) meghaladja a 15%-os limitet, jóváhagyást kell kérnem. …”
- **F05** #3 (reszben): AJ-2026-0186: Piszkozat, 24.8% kedvezmény – „Az ajánlat ID-je **AJ-2026-0186**, és a teljes nettó értéke **206 424 Ft**. Mivel az összesített kedvezmény (24.8%) meghaladja a 15%-os limitet, jóváhagyást kel…”
- **F09** #1 (reszben): GLS · Felvételre vár – „A RND-100137 rendelés csomagja jelenleg **teljesítés alatt** (szállítás folyamatban). Az utolsó információ szerint a GLS kurírral van küldve, és az nyomon követ…”
- **F09** #3 (reszben): GLS · Felvételre vár – „A RND-100161 rendelés csomagja jelenleg **Teljesítés alatt (szállítás folyamatban)**, és a GLS kurírnál van. A nyomon követési szám: **GLS03705957**. Az várható…”

