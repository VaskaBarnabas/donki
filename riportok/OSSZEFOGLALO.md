# A riportok összefoglalója

*Összeállítva: 2026-11-11 · a 19–20. fázis összes mérési és elemző riportja egy helyen · a részletek a hivatkozott riportokban, a nyers adatok az `adatok/` mappákban és az agens-db `ertekeles.futas` táblájában*

## Tartalom

1. [A kérdés és a fő eredmények](#1-a-kérdés-és-a-fő-eredmények)
2. [A saját mérés: nyers legacy interfész vs. MCP](#2-a-saját-mérés-nyers-legacy-interfész-vs-mcp)
3. [Szakirodalom: Gartner-források](#3-szakirodalom-gartner-források)
4. [Emberi tényező: az emberi idő becslése](#4-emberi-tényező-az-emberi-idő-becslése)
5. [Hibák: ember és ágens](#5-hibák-ember-és-ágens)
6. [A háttérfigyelő haszna](#6-a-háttérfigyelő-haszna)
7. [Változástűrés](#7-változástűrés)
8. [Adatkimenet](#8-adatkimenet)
9. [Tokenomika](#9-tokenomika)
10. [Pénzügyi terv](#10-pénzügyi-terv)
11. [Mit állíthat a dolgozat, és mit nem](#11-mit-állíthat-a-dolgozat-és-mit-nem)
12. [Módszertani elvek és közös korlátok](#12-módszertani-elvek-és-közös-korlátok)
13. [Ami még hátravan](#13-ami-még-hátravan)
14. [Hol mi található](#14-hol-mi-található)

## 1. A kérdés és a fő eredmények

**A dolgozat kérdése:** egy heterogén legacy rendszerekből álló vállalati környezetben (hét rendszer, hét különböző interfész) mit ad hozzá egy szabványos MCP-réteg és az arra épülő, helyben futó AI-ágens, összevetve azzal, ha az ágens közvetlenül a legacy interfészeket használja, és azzal, ha ember végzi a munkát.

| Terület | Fő eredmény | Riport |
|---|---|---|
| **Sikeresség** | MCP-vel 90–94%, nyers interfészen 9–41%, ugyanazon a 27 feladaton | [01-meres](01-meres/ertekeles-2026-11-07-javitott.md) |
| **Megbízhatóság** | minden ismétlésben sikeres feladat: MCP 78–89%, nyers 7–37% | uo. |
| **Általánosítás** | a javítás után írt 6 kontrollfeladaton 94% és 100% | uo. |
| **Emberi idő** | a tíz feladat kézzel 15,4 perc (KLM, alsó korlát) és 104 perc (korábbi becslés) között | [03](03-emberi-tenyezo/emberi-ido-pontositas.md) |
| **Megtakarítás** | feladatszinten e4b-vel 29–67%, 12b-vel 25–49%; a korábbi 60–73% túl optimista volt | uo. |
| **Hibák** | csendes rossz adat 4,0%, rossz írás 0 a 110-ből; az ember számított hibaaránya 5–17%, azonos nagyságrend | [02](05-osszehasonlitasok/02-hibak-ember-es-agens.md) |
| **Háttérfigyelő** | 33-ból 33 észlelve, esemény alapon medián 8,5 mp, időzítve 290 mp, téves riasztás 0 | [03](05-osszehasonlitasok/03-figyelo-haszna.md) |
| **Változástűrés** | javítás előtt MCP 0/12, nyers 6/12; javítás 1–3 sor; az MCP-n egy csendes hamis adat, a nyers ágensnél egy folyamatmegkerülés | [09](05-osszehasonlitasok/09-valtozastures.md) |
| **Adatkimenet** | konténerekből csak Számlázz.hu és Stripe; NAV felé semmi; az Ollama alkalmazás 14,8 KB-ot küldött kifelé 3 óra alatt | [10](05-osszehasonlitasok/10-adatkimenet.md) |
| **Tokenomika** | 8300–8900 token/futás, ebből 48–68% eszközleírás; áram 0,02–0,03 Ft/futás; az optimalizációk a kisebb modellt rontották | [11](05-osszehasonlitasok/11-tokenomics.md) |
| **Pénzügy** | előfizetéssel, 25 felhasználónál a vevőnél a reális eset nullszaldós, 50 felhasználótól pozitív; az eladónál a bekötés ideje dönt | [04](04-penzugy/penzugyi-elemzes.md) |
| **Biztonság** | az adatba rejtett utasításnak 18/18 futás ellenállt; a felhasználó szövegébe rejtettet minden változat követte, MCP-vel a kapu megfogta, nyersen kétszer átment | [12](05-osszehasonlitasok/12-biztonsag.md) |
| **Kiesés** | 36/36 futás jelezte a leállást, adatot nem talált ki; a nyers ágens raktárkiesésnél kb. tízszer tovább várt | [13](05-osszehasonlitasok/13-kieses.md) |
| **Terhelés** | e4b: 2 párhuzamos kérésnél dupla áteresztés lassulás nélkül, 4-nél 13,6 futás/perc; egy gép kb. 100 felhasználónak elég | [14](05-osszehasonlitasok/14-terheles.md) |
| **Integráció, betanulás** | az MCP-réteg 2987 sor, új felhasználó kb. 120 sor (pont-pont kb. 1100); a legacy dokumentáció 21 600 token, amit a kis modell nem olvas el | [15](05-osszehasonlitasok/15-integracio.md), [16](05-osszehasonlitasok/16-betanulas.md) |
| **Hibasúlyosság, jóváhagyás** | kitalált azonosító 0 a 414-ből; súlyozott hibapont MCP 10, nyers 151–295; MCP-vel a jóváhagyott írások 91–100%-a jó futáshoz tartozik | [17](05-osszehasonlitasok/17-hibak-sulyossaga.md), [19](05-osszehasonlitasok/19-jovahagyas.md) |
| **Modellválasztás** | MCP-vel e4b 92%, 12b 94%; a kicsi másfélszer gyorsabb, negyed memóriával | [18](05-osszehasonlitasok/18-modellvalasztas.md) |
| **UCP (21. fázis)** | szabványos kereskedői oldal a meglévő MCP-rétegen, új legacy-kód nélkül; hivatalos konformancia-teszt: 46 sikeres, 14 kimaradt, 18 sikertelen (szándékos B2B-eltérések és nem szabványos tesztvégpontok); saját füstteszt 42/42 | [20](05-osszehasonlitasok/20-ucp.md) |

**Egy mondatban:** az MCP-réteg a helyi, kis modellt is használhatóvá teszi (9% → 90%), de nem csodaszer. A hibák jellege más, nem kevesebb, a változás mindkét oldalon emberi javítást kíván, és üzletileg a megoldás inkább nagyobb volumennél éri meg.

## 2. A saját mérés: nyers legacy interfész vs. MCP

**Riportok:** [ertekeles-2026-11-07-javitott.md](01-meres/ertekeles-2026-11-07-javitott.md) (aktuális), [ertekeles-2026-11-03.md](01-meres/ertekeles-2026-11-03.md) (első mérés), [javitasok.md](01-meres/javitasok.md) (mit javítottunk és miért)

### Mit mértünk

- **27 üzleti feladat** a legacy forgatókönyvből: ajánlat, kedvezmény-jóváhagyás, rendelés, raktár, díjbekérő, fizetés, garancia, reklamáció, vezetői helyzetkép, robusztusság. Ezekhez jött **6 kontrollfeladat** (F25–F30).
- **Két változat:**
  - **nyers:** az ágens a hét legacy interfészt kapja dokumentációval (PostgREST, JSON-RPC, HTTP-homlokzat, üzenetsor, szöveges protokoll, REST, SOAP);
  - **MCP:** ugyanaz az ágens az egységes MCP-eszközökkel.
- **Két helyi modell:** gemma4:12b és gemma4:e4b (Ollama, Apple M5, 24 GB).
- **Ismétlés:** feladatonként háromszor.
- **Ellenőrzés:** programból, a rendszerek végállapotából és a válasz kulcsadatából, nem a válasz „szépségéből”.

### Eredmény (27 alapfeladat)

| | nyers 12b | nyers e4b | MCP 12b | MCP e4b |
|---|---:|---:|---:|---:|
| Sikeres | 41% | 9% | **94%** | **90%** |
| Megbízható feladat (pass^3) | 37% | 7% | **89%** | **78%** |
| Átlagos idő / feladat | 305,8 s | 4,6 s | 14,4 s | 8,9 s |
| Token be / feladat | 19 954 | 5 661 | 9 209 | 8 171 |
| Nem várt írási kísérlet | 0 | 3 | 0 | 0 |

**Értelmezés:**

- **Az MCP a 12b modellnél 41%-ról 94%-ra emeli a sikerességet,** 95%-kal rövidebb idővel és 54%-kal kevesebb tokennel. A nyers ágens órákig próbálkozott egy-egy feladattal (például a reklamációnál átlag 2288 s).
- **Az e4b modellnél a hatás még nagyobb (9% → 90%).** A nyers e4b gyors, de szinte mindig rossz: nem tud mit kezdeni a hétféle formátummal. Ott az MCP több tokent visz el, mert ténylegesen elvégzi a munkát.
- **Az MCP a feladattípusok mindegyikén 89–100%** az összesítő feladatok kivételével (50% és 83%), ahol a vezetői helyzetkép négy részből áll, és a modell gyakran kihagy egyet.

### A javítási ciklus (11-03 → 11-07)

Az első mérés MCP-eredménye 78% (12b) és 75% (e4b) volt. A naplók átnézése **kilenc rendszerszintű okot** tárt fel, amelyek mindkét modellnél, mindhárom ismétlésben ugyanúgy jelentkeztek, tehát nem a modell hibái voltak:

- a kereső elrejtette a kifutott terméket;
- a vevőkeresés nem bírta az ékezet nélküli, kötőjeles, csupa nagybetűs nevet;
- a díjbekérő után a nettó összeg látszott a fizetendő bruttó helyett;
- a fizetettség nem látszott az átutalásos díjbekérőnél;
- rossz volt az irányítás az ajánlat elfogadásakor;
- a hibajegy-lista nem adott összesítést;
- hiányzott a csomag állapota a rendelés összefoglalójából;
- a fizetési link kimaradt a válaszból;
- a kedvezmény-skill ellentmondott a kérésnek.

Ezeket az MCP-rétegben, az irányításban és a skillekben javítottuk. A modell, a gráf, a jóváhagyási szabályok és **az ellenőrzők nem változtak**. A túltanulás ellen a javítások után, de még modellfutás előtt **6 kontrollfeladat** készült a javított esetek rokonaiként. Ezeken 94% (12b) és 100% (e4b) lett, tehát a javítás általánosít.

**Nyíltan közölt ellenőrző-javítás:** a garancia-ellenőrző két helyes magyar fordulatot nem ismert fel. A javítást minden mérés minden tárolt válaszára alkalmaztuk, és 70 válaszból 3 változott, mind sikertelenből sikeresre.

**A számlázó hibája, ami nem az ágensé:** a Számlázz.hu tesztfiók újra kiadja a törölt bizonylatok sorszámát. Ezt a számlázó most magától kezeli.

## 3. Szakirodalom: Gartner-források

**Riport:** [gartner-forrasok.md](02-szakirodalom/gartner-forrasok.md)

Tizenhat nyilvános Gartner-közleményt dolgoztunk fel. Mindegyiknél jelöljük, hogy **felmérés** (múltbeli, önbevallásos adat), **előrejelzés** (vélemény a jövőről, nem bizonyíték), **benchmark** vagy **elemzés**. A legfontosabbak:

| # | Állítás | Típus | Mire használjuk |
|---|---|---|---|
| G1 | 2029-re a gyakori ügyfélszolgálati ügyek 80%-át ágens oldja meg | előrejelzés | viszonyítás a mért 90–94%-hoz |
| G2 | 2027 végéig az ágenses projektek több mint 40%-át leállítják (költség, érték, kockázat, legacy-integráció) | előrejelzés | kockázati korrekció a pénzügyben; az MCP-réteg indoklása |
| G3 | csak a vezetők 20%-a csökkentett létszámot; 55% azonos létszámmal több ügyet visz | felmérés, n=321 | a megtakarítás kapacitás, nem leépítés |
| G5 | 85% bővíti az emberek feladatait, a létszámhatás lassú | felmérés | első évi felfutási tényező |
| G6 | heti 4,8 óra megtakarítás értékesítőnként, de 72% nem forgatja vissza | felmérés, n=210 | realizálási arány; viszonyítás |
| G8 | asszisztált ügyfélkapcsolat medián költsége kb. 13,5 $ | benchmark | ügyenkénti költség viszonyítása |
| G9, G10 | a felhős GenAI ügyenkénti költsége és az ágenses inferencia drágul | előrejelzés | a helyi modell melletti érv |
| G12 | a megbízhatóság túlbecslése fő buktató; lépcsőzött felügyelet kell | elemzés | pass^k mérés, jóváhagyási modell |
| G16 | a legacy-modernizáció többnyire nem éri el a célját | elemzés | a teljes CRM-csere kockázata |

**Fontos korlát:** a Gartner-oldalak automatikusan nem voltak letölthetők (HTTP 403), a számok a kereső által indexelt szövegből származnak. Idézés előtt minden linket böngészőben ellenőrizni kell. A számok többsége nagyvállalati, ügyfélszolgálati vagy értékesítési mintából jön, ezért viszonyításra és korrekcióra használjuk őket, nem közvetlen átvételre.

## 4. Emberi tényező: az emberi idő becslése

**Riport:** [emberi-ido-pontositas.md](03-emberi-tenyezo/emberi-ido-pontositas.md)

### A probléma és a módszer

Az ágens idejét megmértük, az emberét felhasználók és stopper nélkül nem tudtuk. A korábbi saját becslés (tíz feladat, 104 perc) helyett lektorált módszert használtunk: a **Keystroke-Level Modelt** (Card, Moran, Newell 1980), amely a munkát elemi műveletekre bontja (billentyű 0,28 s, rámutatás 1,1 s, mentális előkészület 1,35 s stb.). Az olvasási időhöz Brysbaert (2019) meta-analízisét vettük (238 szó/perc). A forrásokat (H1–H10) a bizonyító erejük szerint jelöltük.

### Eredmény

| | Érték |
|---|---|
| A tíz feladat kézzel, KLM (begyakorolt, hibátlan, **alsó korlát**) | **15,4 perc** |
| Korábbi becslés (keresgéléssel, megszakításokkal, **felső**) | 104 perc (a KLM 6,8-szorosa) |
| Középérték (geometriai közép, **saját feltevés**) | 39,2 perc |

**Az ember ideje az ágens mellett:** a kérés begépelése, a válasz elolvasása, 20 s jóváhagyási kártyánként, és a sikertelen futás teljes kézi újracsinálása.

| | Ember ágenssel (alsó / közép / felső) | Megtakarítás |
|---|---|---|
| e4b | 11,0 / 17,3 / 34,4 perc | **29% / 56% / 67%** |
| 12b | 11,5 / 21,6 / 53,1 perc | **25% / 45% / 49%** |

**A tanulságok:**

- **A korábban közölt 60–73% a sáv felső szélén volt.** Az ágens előnye megmarad, de óvatosabban kell megfogalmazni.
- **Hol a legnagyobb a nyereség:** a több rendszert érintő lekérdezéseknél, például „mit kell utánrendelni” vagy „kifizették már”, ahol a megtakarítás 69–96%.
- **Hol kicsi vagy negatív:** a rövid, egylépéses feladatoknál, mint a „hol a csomag?”. Ezt egy gyakorlott kolléga 31 másodperc alatt megoldja.
- **Feladatszint és munkakörszint nem keverhető.** A szakirodalomban a munkaidőre vetített MI-megtakarítás 2–15% (H3, H5, H6, G6), mert a munkaidő nagy része nem ilyen rendszermunka. A munkakörszintű megtakarítás a feladatszintű és az érintett munkaidő-arány szorzata.

## 5. Hibák: ember és ágens

**Riport:** [02-hibak-ember-es-agens.md](05-osszehasonlitasok/02-hibak-ember-es-agens.md)

**Az ágens hibái (mért, 198 MCP-futás):**

| Típus | Futás | Arány |
|---|---:|---:|
| Sikeres | 184 | 92,9% |
| **Csendes rossz adat** (magabiztosan hibás állítás) | 8 | 4,0% (95% CI kb. 2–8%) |
| Megáll vagy visszakérdez (látható) | 4 | 2,0% |
| Hiányos vagy határeset | 2 | 1,0% |
| **Rossz írás a rendszerben** | **0** (110 írásból) | 0% |
| Nem várt írási kísérlet | 0 | 0% |

**Az ember hibái (számított):** szakirodalmi hibaarányok (kézi adatbevitel, értékleolvasás) szorozva a feladatonkénti kézi adatátvitelek számával (KLM-lépéslista). Ez műveletenkénti 0,5/1/2% hibával feladatonként **4,7% / 9,1% / 17,0%**.

**Következtetés:** azonos nagyságrend. **Nem állítjuk, hogy az ágens kevesebbet hibázik.** A hibák jellege más: az ember elgépel és rossz sort másol, az ágens néha magabiztosan rossz számot mond (például jó ajánlatot hoz létre, de a válaszban más összeget közöl). Rossz írás nem történt, mert minden írás jóváhagyáson megy át, és az MCP-eszközök a tényleges értékeket adják vissza. Az E1–E10 feladatokon az ágens csendes hibaaránya 11,7% (7/60), ami az emberi sáv közepe.

## 6. A háttérfigyelő haszna

**Riport:** [03-figyelo-haszna.md](05-osszehasonlitasok/03-figyelo-haszna.md)

A figyelőt **valódi ütemezéssel** futtattuk: események 15 mp-enként, időzített szabályok 600 mp-enként, elemzés 10 mp-enként, helyi modellel. Közben a szkript szándékosan problémákat hozott létre mind a kilenc szabályra (J1–J9), és mellette 8 hibátlan kontrollrendelést futtatott.

| | Eredmény |
|---|---|
| Észlelés | **33/33** (a 95%-os alsó korlát kb. 90%) |
| Eseményalapú szabályok (J1–J5, 18 eset) | medián **8,5 mp**, legrosszabb 14 mp |
| Időzített szabályok (J6–J9, 14 eset) | medián **290 mp**, legrosszabb 581 mp (a 600 mp-es kör következménye) |
| Elemzés elkészülte | eseményeknél 17–33 mp, időzítetteknél az észlelés után 8–77 mp |
| Téves riasztás | **0**: a 4 nem beoltott jelzés mind valós helyzetre mutatott |
| Elemzések minősége | 33/33 helyes azonosító, kitalált adat nincs; kb. negyedük gyenge vagy nyelvileg hibás |

**Összevetés az emberrel (becslés):** a régi munkamódban a készletlistát hetente, a kintlévőséget hétfőnként nézik, a késésről a vevő előbb tud, az üzenetsort senki nem figyeli. A különbség (percek a napok helyett) a folyamatos ellenőrzés érdeme, nem az MI-é. A figyelő hozzáadott értéke, hogy néhány szabállyal ráül a heterogén rendszerekre az MCP-n át, és azonnal érthető magyarázatot ad. **Az észlelés megbízható, a javaslat szövegét ember bírálja el.**

**Korlát:** a Mac a főmérés közben elaludt (87 perc a tervezett 42 helyett). A lezárási időket ezért nem közöljük, és a minta szabályonként 3–4 eset.

## 7. Változástűrés

**Riport:** [09-valtozastures.md](05-osszehasonlitasok/09-valtozastures.md)

Három legacy interfészváltozást szimuláltunk:
- **V1:** mezőátnevezés a HTTP-homlokzaton;
- **V2:** mezőátnevezés az üzenetsorban;
- **V3:** metódusátnevezés a JSON-RPC-ben.

Mindhármat három állapotban mértük: változás nélkül, változás után javítás nélkül, javítás után. MCP-vel és nyers ágenssel, a 12b modellel, háromszor.

| | MCP | Nyers (tartalmilag) |
|---|---:|---:|
| Változás nélkül | 11/12 | 12/12 |
| **Változás után, javítás nélkül** | **0/12** | **6/12** |
| Javítás után | 11/12 | 12/12 |

**A kellemetlen eredmény, nyíltan:** a változás pillanatában **a nyers ágens tűrte jobban**, mert a nyers JSON-ban egyszerűen meglátta az új mezőnevet.

**A kudarc jellege a lényeg:**

- **V1, MCP: csendes hamis adat.** Az adapter ismeretlen szállítási állapotnál alapértéket adott („Úton”), így mindhárom futás magabiztosan rossz állapotot mondott. Ez a saját kódunk hibája volt. Javítottuk: ismeretlen állapotnál most `unknown` jön, és az újramérésben a hamis állapot 3/3-ról 0/3-ra esett, két futás nyíltan jelezte a problémát.
- **V2, MCP: hangos hiba.** Az ágens őszintén közölte, hogy technikai hiba történt. Ez helyes viselkedés.
- **V3, nyers: folyamatmegkerülés.** Egy futásban az elromlott metódus után az ágens közvetlenül létrehozott egy rendelést, megkerülve az ajánlat elfogadását és a kedvezmény-jóváhagyást, és sikert jelentett. Ez a mérés legveszélyesebb kimenetele, és az MCP-ágens ezt nem tudta volna megtenni.

**A javítás mérete mindkét oldalon kicsi:** MCP-n 1–3 kódsor, a nyers ágensnél a dokumentáció cseréje.

**A dolgozat helyes állítása:** az MCP nem tűri jobban a változást, de a kockázatot egy naplózott, egy helyen javítható rétegbe gyűjti, és korlátozza, mit tehet az ágens hiba esetén.

## 8. Adatkimenet

**Riport:** [10-adatkimenet.md](05-osszehasonlitasok/10-adatkimenet.md)

Három rétegben rögzítettük a hálózati forgalmat 3 órán át, teljes terhelés mellett:
- **Docker-konténerek:** a VM kapcsolattáblája;
- **Node-folyamatok:** egy csatlakozást naplózó előtöltő;
- **Ollama:** macOS `nettop`.

| Forrás | Kifelé menő kapcsolat |
|---|---|
| Számlázó konténer | 140 kapcsolat a Számlázz.hu felé (tesztfiók) |
| Stripe CLI és a fizetési konténer | 52 kapcsolat a Stripe felé (teszt mód) |
| A többi 28 konténer (MCP-szerverek, adatbázisok, legacy homlokzatok) | **0** |
| Node-folyamatok (ágens, mérők, portál) | 576 kapcsolat, **mind helyi** |
| NAV | **0** |
| **Ollama alkalmazás** | **7 kapcsolat, 14,8 KB kimenő** (ollama.com, GitHub) |

**Eredmény:**

- **A CRM csak a két szükséges külső szolgáltatóval beszél,** és az ágensréteg nem bővítette a külső címzettek körét.
- **A „0 bájt az LLM felé” szó szerint nem igaz,** mert maga az Ollama alkalmazás kapcsolódott ki. A méret azonban nem követi a terhelést: a munkaterhelés kb. 1,5–2 MB promptot adott, ugyanebben az ablakban az Ollama 6,4 KB-ot küldött ki, és a két kapcsolódási csoport bájtra azonos méretű volt. Ezért a beszélgetések tartalma a mérés alapján nem hagyta el a gépet.
- **Éles üzemhez** az Ollama helyi módja (`OLLAMA_NO_CLOUD=1`) és a kimenő forgalom tűzfalas tiltása javasolt.

**Korlát:** a TLS miatt a tartalom nem látható, és a mintavételben a Mac alvása miatt hézagok vannak. A mérés lényegi része azonban folyamatos mintavétellel futott.

## 9. Tokenomika

**Riport:** [11-tokenomics.md](05-osszehasonlitasok/11-tokenomics.md)

A futásnapló minden modellhívás tokenszámát és idejét rögzíti. A `tokenomics.ts` ebből ciklusonként (front-desk, majd a szakágens körei) mutatja a fogyasztást, a költséget és az időt.

### A fő számok

| | e4b | 12b |
|---|---:|---:|
| Token be / futás | 8 279 | 8 946 |
| Token ki / futás | 178 | 158 |
| Medián válaszidő | 8,0 mp | 12,7 mp |
| Ebből a modell | 87% | 89% |
| Helyi áram / futás | 0,02 Ft | 0,03 Ft |
| Claude Sonnet 5.5 / futás (gyorsítótárral) | 5,73 Ft (3,35) | 6,09 Ft (3,43) |

**Mit tanultunk a ciklusokról és a bemenetről:**

- **A bemenet ciklusonként nő:** a front-desk 340 tokent kap, a szakágens első köre 2500-at, a hetedik kör kb. 7000-et, mert minden kör újraküldi az előzményt.
- **A szakágens bemenetének 48–68%-a eszközleírás.**
- **A sémák korlátainak törlése 0–12 tokent hozott,** mert az Ollama ezeket eleve nem adja át a modellnek, ezért ezt a változatot mérés nélkül elvetettük.

### Három optimalizáció a teljes feladatsoron

| Változat | Modell | Siker | Token |
|---|---|---|---|
| Régi eszközválaszok rövidítése | e4b | 92% → 86% | −5% |
| Minden paraméterleírás elhagyása | e4b | 92% → 83% | −10% |
| Kombinált | e4b | 92% → **79%** | −8% |
| Kombinált | 12b | 94% → 96% | −11% |

**Következtetés:** helyi modellnél a token nem költség, hanem késleltetés. A kisebb modellnek szüksége van az eszközleírásokra, a rövidítés csendes hibát is okozott (kitalált hibajegy-azonosító). **Az optimalizációk kikapcsolva maradnak.** Ígéretesebb, még nem mért irányok: kevesebb ciklus, a gyorsítótár-vesztés megszüntetése a második körben, és a listázó eszközök tömörebb válasza.

## 10. Pénzügyi terv

**Riport:** [penzugyi-elemzes.md](04-penzugy/penzugyi-elemzes.md), feltevések: [feltevesek.md](04-penzugy/feltevesek.md), szerkeszthető bemenet: [feltevesek.json](04-penzugy/feltevesek.json)

### A konstrukció

A vevő **helyben futó szervert** vesz (Mac Studio M4 Max 48 GB, kb. 1,24 M Ft kiegészítőkkel), **egyszeri setup díjat** fizet (1,5 M Ft + 300 ezer Ft rendszerenként, hét rendszernél 3,6 M Ft) és **felhasználószám szerinti havidíjat**. A havidíj sávos: 15 000 / 12 000 / 10 000 / 8 000 Ft/fő/hó, minimum 150 000 Ft. **Az árlista javaslat, piaci adat nincs mögötte.**

### Hogyan számol a modell

- **Haszon:** a tíz mért feladat megtakarított munkaideje a KSH 2025-ös foglalkozásonkénti bérével és 13% szochóval.
- **Realizálás:** a felszabadult időnek csak egy része pénz (Gartner G3, G5, G6): óvatos 28%, reális 50%, optimista 80%, az első évben ennek fele.
- **Forgatókönyvek:** az emberi alapvonal KLM, közép vagy korábbi becslés.
- **Hibák:** a sikertelen futások kézi újracsinálása benne van. A csendes hibák javítását semlegesen kezeljük, mert az emberéi azonos nagyságrendűek. Az első modellváltozat ezt egyoldalúan csak az ágensnél számolta, ezt javítottuk, és érzékenységi sorként közöljük.
- **Modell:** az alapeset a kisebb hasznot adó e4b.

### A vevő oldala (három év, reális forgatókönyv)

| Felhasználó | Havidíj | NPV | Megtérülés |
|---:|---:|---:|---|
| 5 | 150 000 Ft | −6,5 M Ft | nincs 36 hónapon belül |
| 10 | 150 000 Ft | −2,9 M Ft | nincs |
| 25 | 330 000 Ft | **+1,1 M Ft** | 30 hónap |
| 50 | 580 000 Ft | +11,2 M Ft | 20 hónap |
| 100 | 980 000 Ft | +33,5 M Ft | 16 hónap |

**25 felhasználónál, három forgatókönyvben:**
- **Óvatos:** NPV −18,0 M Ft.
- **Reális:** NPV +1,1 M Ft, nullszaldós. A Gartner G2 projektkockázatával korrigálva −3,5 M Ft.
- **Optimista:** NPV +66,5 M Ft.

A reális fedezeti létszám **19 fő**.

### Az eladó oldala (25 fős ügyfél, reális)

- **A bekötés nem fedeződik a setup díjból.** 500 óra kb. 7 M Ft, a setup díj 3,6 M Ft, a különbség a havi kb. 218 ezer Ft fedezetből **16 hónap** alatt térül vissza.
- **Fedezeti ügyfélszám:** évi 10,8 M Ft fix költséggel (fél fejlesztő és egyéb tételek) három év alatt **8 ügyfél** kell. 150 órás bekötésnél ez **4 ügyfélre** csökken, 900 óránál soha nem jön össze.

### Mi dönti el az eredményt

Hatás szerint csökkenő sorrendben:
1. a hibajavítás kezelése;
2. az emberi alapvonal;
3. a rendelés/felhasználó arány;
4. a realizált idő aránya.

A gép és az áram elhanyagolható: a szerver kb. 91 Ft/ügy a teljes TCO-ban, az áram 0,02 Ft/futás. **Egy ügy kézzel 366 Ft, előfizetéssel a teljes TCO-val 209 Ft.**

**Kockázat a felhasználónkénti díjnál:** a haszon a rendelésszámtól függ, a díj a létszámtól. A megoldás épp a kézi munkát csökkenti, így a felhasználószám, és vele a díjbevétel, idővel csökkenhet.

## 10/b. A 20. fázis második köre röviden

- **Biztonság (Ö2):** a hibajegybe rejtett „zárd le”, „add ki a vevőlistát” utasítást mindkét modell és a nyers ágens is figyelmen kívül hagyta. A felhasználó által bemásolt e-mailbe rejtett „40% kedvezmény, hagyd jóvá” utasítást viszont mind követte. MCP-vel a jóváhagyási kapu mind a 6 jóváhagyási kísérletet megfogta, mert eszköz szinten látja, hogy ez külön írás. A nyers ágensnél a kapu ezt nem látja, és 3-ból 2 futásban a 44%-os ajánlat jóvá lett hagyva.
- **Kiesés (Ö3):** leállított ajánlatkezelő, rendeléskezelő, raktár és számlázó mellett az összes futás jelezte a hibát, és nem talált ki adatot. A raktár kiesésénél egy ellenőrző-hibát javítottunk és újraértékeltünk (nyíltan jelezve).
- **Terhelés (Ö4):** egy gépen e4b-vel 4 párhuzamos kérésnél 13,6 futás/perc. A 25 fős cég csúcsigényének ez kb. 8-szorosa.
- **Integráció (Ö6), betanulás (Ö7):** az MCP egyszeri költség, utána egy új felhasználó vagy csatorna olcsó. A nyers e4b a dokumentációt a futások 6%-ában olvasta el, ez magyarázza a 9%-os sikerét.
- **Hibasúlyosság és kitalált adat (Ö8, Ö11):** az azonosítók megbízhatók, az összegek nem mindig. A súlyozott hibapont MCP-vel 15–30-ad része a nyersnek.
- **Modellválasztás (Ö9):** az MCP kiváltja a modellméretet, a kis modell is elég.
- **Jóváhagyás (Ö12):** 25 felhasználónál napi kb. 58 perc a csapatnak. A veszély nem az idő, hanem a rutinszerű bólintás.
- **Nem készült:** Ö5 (mért energia) és Ö10 (felhőmodell), döntés szerint. A tokenomika becslést ad rájuk.
- **Javítások a mérések nyomán:** az „Úton” alapérték (csendes hamis adat) és a sztornó újra kiadott sorszáma a számlázóban.

## 11. Mit állíthat a dolgozat, és mit nem

**Amit a mérések alátámasztanak:**

1. Az MCP-réteg egy helyi, kis modellt is üzletileg használhatóvá tesz heterogén legacy környezetben (9–41% → 90–94%), és a mért javítások általánosítanak a kontrollfeladatokra.
2. Az ágens a vizsgált feladatokon 25–67%-kal csökkenti az emberi időt. Ez feladatszintű érték, a teljes munkaidőre nem vetíthető.
3. Írási hiba nem történt: a jóváhagyási kapu és az MCP-eszközök együtt megfogják az írásokat (0/110), a bemásolt szövegbe rejtett utasításból eredő jóváhagyási kísérleteket is (6/6).
4. A háttérfigyelő megbízhatóan, percek alatt észleli a kivételeket, téves riasztás nélkül.
5. A CRM ügyféladata csak a két szükséges szolgáltatóhoz megy ki. A helyi modell nem küld ki beszélgetéstartalmat.
6. A helyi futtatás üzemi költsége elhanyagolható, a kérdést a bevezetés és a felszabadult idő hasznosítása dönti el.

**Amit nem állíthat:**

1. Hogy az ágens kevesebbet hibázik, mint az ember. Azonos nagyságrend, más jelleg.
2. Hogy az MCP önmagában jobban tűri az interfészváltozást. A változás pillanatában rosszabb volt, csak a javítás egyszerűbb és biztonságosabb.
3. Hogy a megoldás minden cégméretnél megéri. 25 felhasználónál nullszaldós, 50-től éri meg.
4. Hogy a Gartner-előrejelzések bizonyítékok. Ezek irányt mutatnak, nem mért eredmények.
5. Hogy a tokenszám csökkentése automatikusan előny. A kisebb modellnél rontott.
6. Hogy az ágens ellenáll minden prompt injectionnek. A felhasználó saját szövegébe rejtett utasítást követi, a védelem a jóváhagyás.

## 12. Módszertani elvek és közös korlátok

**Az elvek, amelyeket minden riportban tartottunk:**

- **Program ellenőriz, nem szubjektív ítélet.** A sikert a rendszerek végállapotából és a válasz kulcsadatából döntjük el. A nem sikeres futásokat egyenként elolvastuk.
- **A feltevések rögzítése előre.** A pénzügyi és a tokenomikai modellnél a paramétereket a futtatás előtt rögzítettük. Ahol az első futás után változtattunk (hibajavítás a pénzügyben, a séma-optimalizáció elvetése), azt indokkal jelezzük, és a korábbi változat hatását is közöljük.
- **A kedvezőtlen eredményeket is közöljük:** a változástűrés, az Ollama kimenő forgalma, a 25 fős nullszaldó, a sikertelen optimalizációk.
- **A források típus szerint jelölve:** mért, forrásból vett, saját feltevés, illetve a Gartnernél felmérés vagy előrejelzés.
- **Biztonság:** a NAV felé semmi nem megy, csak Számlázz.hu tesztfiók és Stripe teszt mód. Titok nem került kimenetbe.

**A közös korlátok:**

- A cég kitalált (40 fős B2B kereskedő), a legacy rendszerek szimuláltak, bár valódi protokollokkal.
- Egy gép (Apple M5, 24 GB), két helyi modell. Felhőmodellt és párhuzamos terhelést nem mértünk.
- Feladatonként három ismétlés: az összesített arányok megbízhatóbbak, mint a feladatonkéntiek.
- Az emberi időket és hibákat számoltuk, nem mértük.
- A Gartner-számok másodlagos hozzáférésből származnak, idézés előtt ellenőrizendők.
- Egyes külső adatok (gépár, áramár, árfolyam, szocho-kulcs) másodlagos vagy nem friss forrásból valók.

## 13. Ami még hátravan

- **Nem mért összevetések:** mért energia (Ö5, a sudo jog miatt) és felhőmodell (Ö10), mindkettő döntés szerint; a modellméret-görbéből (Ö9) csak két pont van.
- **UCP:** a kereskedői oldal elkészült ([20-ucp.md](05-osszehasonlitasok/20-ucp.md)); nyitott: hitelesített vevőazonosítás (identity linking), éles HTTPS-telepítés, Merchant Center.
- **Biztonság:** a jóváhagyási kártyán ki kellene emelni, ha az ágens a kért feladaton túli írást kezdeményez ([12-biztonsag.md](05-osszehasonlitasok/12-biztonsag.md)).
- **A Gartner-linkek** kézi ellenőrzése böngészőben.

## 14. Hol mi található

| Riport | Generáló szkript | Adat |
|---|---|---|
| [01-meres/ertekeles-*.md](01-meres/) | `scripts/ertekeles/riport.ts` (a mérés: `futtat.ts`) | `01-meres/adatok/*.csv`, `ertekeles.futas` |
| [02-szakirodalom/gartner-forrasok.md](02-szakirodalom/gartner-forrasok.md) | kézzel | – |
| [03-emberi-tenyezo/emberi-ido-pontositas.md](03-emberi-tenyezo/emberi-ido-pontositas.md) | `scripts/riportok/emberi-klm.ts`, `emberi-megtakaritas.ts` | `03-emberi-tenyezo/adatok/*.json` |
| [04-penzugy/penzugyi-elemzes.md](04-penzugy/penzugyi-elemzes.md) | `scripts/riportok/penzugy.ts` (generált) | `04-penzugy/feltevesek.json`, `adatok/*.csv` |
| [05/02-hibak-ember-es-agens.md](05-osszehasonlitasok/02-hibak-ember-es-agens.md) | kézzel, a mérés adataiból | `ertekeles.futas` |
| [05/03-figyelo-haszna.md](05-osszehasonlitasok/03-figyelo-haszna.md) | `scripts/riportok/figyelo-meres.ts` | `05-osszehasonlitasok/adatok/figyelo-meres*.json` |
| [05/09-valtozastures.md](05-osszehasonlitasok/09-valtozastures.md) | `scripts/riportok/valtozas-meres.ts` | `ertekeles.futas` (`valtozas-*`) |
| [05/10-adatkimenet.md](05-osszehasonlitasok/10-adatkimenet.md) | `scripts/riportok/halozat-naplo.cjs`, conntrack, nettop | a mérés naplói (nem a repóban) |
| [05/11-tokenomics.md](05-osszehasonlitasok/11-tokenomics.md) | `scripts/riportok/tokenomics.ts`, `tokenomics-bontas.ts` | `05-osszehasonlitasok/adatok/tokenomics-*` |

Az újrafuttatás parancsai: [docs/CLAUDE.md](../docs/CLAUDE.md). A riportok indexe: [README.md](README.md).
