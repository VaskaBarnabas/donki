# Értékelés: nyers legacy interfész vs. MCP, két helyi modellel

*MCP: 2026-11-07-javitott, nyers: 2026-11-03 · 359 futás · 27 feladat + 6 kontrollfeladat (csak MCP) × 2 változat × 2 modell × 3 ismétlés · a módszer: [FAZIS19_TERV.md](../../docs/FAZIS19_TERV.md), [FAZIS20_TERV.md](../../docs/FAZIS20_TERV.md) · a nyers adat: [riportok/01-meres/adatok/2026-11-07-javitott.csv](../../riportok/01-meres/adatok/2026-11-07-javitott.csv) · újragenerálás: `npx tsx scripts/ertekeles/riport.ts --meres 2026-11-07-javitott --nyers 2026-11-03 --elozo 2026-11-03`*

A **nyers** ágens a hét legacy interfészt kapja (PostgREST, JSON-RPC, HTTP homlokzat, üzenetsor, szöveges protokoll, REST, SOAP) a `legacy-docs/` leírásaival; a szállítást és a kulcsot az eszköz intézi, a formátum, a mezők, a kódok és a hibák értelmezése a modellé. Az **MCP**-s ágens a mai: front-desk → szakágens, a 35 MCP eszköz, skillek. Mindkettő ugyanazt a gráfot, ugyanazokat az általános szabályokat és ugyanazt a modellt használja. A sikert a rendszer **végállapota** és a válasz kulcsadata dönti el, a rendszerből lekért igazsággal összevetve.

## 1. Összesítő

A 27 alapfeladaton (a nyers és az MCP-s változat ugyanazokon fut). A kontrollfeladatok külön: lásd lent.

| | nyers · gemma4:12b | nyers · gemma4:e4b | MCP · gemma4:12b | MCP · gemma4:e4b |
|---|---:|---:|---:|---:|
| Sikeres | **41%** | **9%** | **94%** | **90%** |
| Megbízható feladat (minden ismétlés sikeres, pass^k) | 37% (10/27) | 7% (2/27) | 89% (24/27) | 78% (21/27) |
| Részben sikeres | 13% | 2% | 5% | 9% |
| Sikertelen / hiba | 46% | 89% | 1% | 1% |
| Átlagos idő / feladat (s) | 305,8 | 4,6 | 14,4 | 8,9 |
| Eszközhívás / feladat | 4,6 | 1,5 | 1,6 | 1,5 |
| ebből hibás | 0,8 | 1 | 0,2 | 0,1 |
| Modellhívás / feladat | 5,3 | 2,6 | 3,8 | 3,7 |
| Token be / feladat | 19 954 | 5661 | 9209 | 8171 |
| Token ki / feladat | 318 | 127 | 163 | 182 |
| Jóváhagyás / feladat (emberi kattintás) | 0,8 | 0,2 | 0,6 | 0,6 |
| Nem várt írási kísérlet (összesen) | 0 | 3 | 0 | 0 |
| Visszakérdezett | 0 | 0 | 0 | 0 |
| Gépidő összesen (perc) | 407,7 | 6,2 | 19,4 | 12,1 |

## 2. Mennyit segít az MCP? (modellenként)

| Modell | Siker: nyers → MCP | Idő: nyers → MCP | Eszközhívás: nyers → MCP | Token be: nyers → MCP |
|---|---|---|---|---|
| gemma4:12b | 41% → **94%** | 305,8 s → 14,4 s (−95%) | 4,6 → 1,6 | 19 954 → 9209 (−54%) |
| gemma4:e4b | 9% → **90%** | 4,6 s → 8,9 s (+96%) | 1,5 → 1,5 | 5661 → 8171 (+44%) |

## 2/a. A javítás hatása (MCP: 2026-11-03 → 2026-11-07-javitott)

Ugyanazok az alapfeladatok és ellenőrzők; közben csak az MCP-réteg (eszközkimenetek, keresés), az ágensek irányítása és a skillek változtak (lásd a javítási jegyzéket).

| Modell | Siker előtte → utána | Részben előtte → utána | Megbízható feladat (pass^k) előtte → utána | Idő / feladat előtte → utána |
|---|---|---|---|---|
| gemma4:12b | 78% → **94%** | 8% → 5% | 74% → **89%** | 22 s → 14,4 s |
| gemma4:e4b | 75% → **90%** | 16% → 9% | 70% → **78%** | 7,8 s → 8,9 s |

Feladatonként, ahol változott (sikeres / összes futás):

| Feladat | gemma4:12b: előtte → utána | gemma4:e4b: előtte → utána |
|---|---|---|
| F01 Árajánlat e-mailes érdeklődésre | 3/3 → **3/3** | 3/3 → 1/3 |
| F03 Kifutott termék – helyettesítő ajánlása | 0/3 → **3/3** | 0/3 → **3/3** |
| F05 20%-os kedvezmény – jóváhagyás kérése | 3/3 → **3/3** | 0/3 → 1/3 |
| F06 Vezetői jóváhagyás | 3/3 → 2/3 | 3/3 → **3/3** |
| F07 Megrendelés: az ajánlat elfogadása | 0/3 → **3/3** | 3/3 → **3/3** |
| F09 „Hol a csomag?” | 3/3 → 2/3 | 1/3 → 2/3 |
| F13 Díjbekérő kiállítása | 0/3 → **3/3** | 0/3 → 2/3 |
| F14 Fizetési link a díjbekérőhöz | 2/3 → **3/3** | 0/3 → **3/3** |
| F15a „Kifizették már?” (fizetett) | 0/3 → **3/3** | 2/3 → **3/3** |
| F18c Garancia – nincs a rendelésben | 3/3 → **3/3** | 3/3 → 2/3 |
| F20 „Hogy állunk?” | 1/3 → 0/3 | 1/3 → 2/3 |
| F22 Eltérő vevőnév-írás | 0/3 → **3/3** | 0/3 → **3/3** |

## 2/b. Kontrollfeladatok (általánosít-e a javítás?)

A javítások után, de modellfutás előtt írt új feladatok – a javított esetek rokonai, más adattal és megfogalmazással. Ha itt is jó az arány, a javítás nem a mért feladatokra „tanult rá”. Csak MCP-vel futnak (a nyers összevetéshez nem tartoznak).

| | MCP · gemma4:12b | MCP · gemma4:e4b |
|---|---:|---:|
| Sikeres | **94%** | **100%** |
| Megbízható feladat (pass^k) | 83% | 100% |
| F25 Ékezet nélkül írt vevőnév (másik vevő) | 2/0/3 | 3/0/3 |
| F26 Többtételes ajánlat terméknévvel | 3/0/3 | 3/0/3 |
| F27 Meglévő díjbekérő fizetendő összege | 3/0/3 | 3/0/3 |
| F28 Ajánlat állapota és összege | 3/0/3 | 3/0/3 |
| F29 Garancia termékkód nélkül | 3/0/3 | 3/0/3 |
| F30 A legrégebbi lejárt tartozás | 3/0/3 | 3/0/3 |

Cellánként: sikeres / részben / összes futás.

## 3. Feladattípusonként (sikeres arány)

| Típus (feladatok) | nyers · gemma4:12b | nyers · gemma4:e4b | MCP · gemma4:12b | MCP · gemma4:e4b |
|---|---:|---:|---:|---:|
| írás (F01, F06, F07, F10, F11, F16, F19) | 76% | 14% | 95% | 90% |
| többlépéses (F02, F05) | 50% | 0% | 100% | 67% |
| olvasás (F03, F04, F09, F15a, F15b, F18a, F18b, F18c, F18d) | 19% | 4% | 96% | 93% |
| hibakezelés (F08) | 0% | 0% | 100% | 100% |
| összesítés (F12, F20) | 0% | 0% | 50% | 83% |
| pénzügyi (F13, F14, F17) | 38% | 0% | 100% | 89% |
| robusztusság (F22, F23, F24) | 67% | 33% | 100% | 100% |

## 4. Feladatonként

Cellánként: sikeres / részben / összes futás, és az átlagos idő.

| Feladat | nyers · gemma4:12b | nyers · gemma4:e4b | MCP · gemma4:12b | MCP · gemma4:e4b |
|---|---|---|---|---|
| F01 Árajánlat e-mailes érdeklődésre | 0/0/3 · 37,9 s | 0/0/3 · 5 s | 3/0/3 · 11,1 s | 1/2/3 · 10,8 s |
| F02 Új érdeklődő felvétele és ajánlat | 0/0/3 · 19 s | 0/0/3 · 4,2 s | 3/0/3 · 12 s | 3/0/3 · 9,8 s |
| F03 Kifutott termék – helyettesítő ajánlása | 0/2/3 · 17 s | 0/0/3 · 2,5 s | 3/0/3 · 11,8 s | 3/0/3 · 10,9 s |
| F04 Készlet-kérdés | 3/0/3 · 16,7 s | 0/0/3 · 3,8 s | 3/0/3 · 7,6 s | 3/0/3 · 6,4 s |
| F05 20%-os kedvezmény – jóváhagyás kérése | 3/0/3 · 36,7 s | 0/0/3 · 9,7 s | 3/0/3 · 17,7 s | 1/2/3 · 11,1 s |
| F06 Vezetői jóváhagyás | 3/0/3 · 18 s | 0/0/3 · 3,4 s | 2/0/3 · 13 s | 3/0/3 · 5,5 s |
| F07 Megrendelés: az ajánlat elfogadása | 3/0/3 · 16,7 s | 3/0/3 · 3 s | 3/0/3 · 12,5 s | 3/0/3 · 5,3 s |
| F08 Jóváhagyás készlethiánnyal | 0/3/3 · 18,1 s | 0/0/3 · 2,3 s | 3/0/3 · 15,5 s | 3/0/3 · 9,9 s |
| F09 „Hol a csomag?” | 1/2/3 · 13,7 s | 0/0/3 · 4,1 s | 2/1/3 · 13,9 s | 2/1/3 · 9,1 s |
| F10 Kiszállítás indítása | 3/0/3 · 14 s | 0/0/3 · 4 s | 3/0/3 · 15 s | 3/0/3 · 9,7 s |
| F11 Bevételezés | 3/0/3 · 19,4 s | 0/0/3 · 6,9 s | 3/0/3 · 22,8 s | 3/0/3 · 11,5 s |
| F12 „Mit kell utánrendelni?” | 0/3/3 · 28 s | 0/0/3 · 2,9 s | 3/0/3 · 16,5 s | 3/0/3 · 10,6 s |
| F13 Díjbekérő kiállítása | 0/0/3 · 147,6 s | 0/0/3 · 3,9 s | 3/0/3 · 19,7 s | 2/1/3 · 12,8 s |
| F14 Fizetési link a díjbekérőhöz | 1/0/3 · 38,2 s | 0/0/3 · 3,7 s | 3/0/3 · 22,6 s | 3/0/3 · 14 s |
| F15a „Kifizették már?” (fizetett) | 0/0/3 · 18 s | 0/0/3 · 2,3 s | 3/0/3 · 6,6 s | 3/0/3 · 4,4 s |
| F15b „Kifizették már?” (fizetetlen) | 1/0/3 · 168,6 s | 0/0/3 · 2,3 s | 3/0/3 · 6,2 s | 3/0/3 · 5 s |
| F16 Rendelés lemondása | 3/0/3 · 751,4 s | 0/0/3 · 2,3 s | 3/0/3 · 16,5 s | 3/0/3 · 11,2 s |
| F17 Számla sztornója | 2/0/2 · 17,4 s | 0/0/3 · 3,7 s | 3/0/3 · 9,9 s | 3/0/3 · 12 s |
| F18a Garancia – érvényes | 0/0/3 · 996,3 s | 1/0/3 · 6,9 s | 3/0/3 · 9 s | 3/0/3 · 5,4 s |
| F18b Garancia – lejárt | 0/0/3 · 719,7 s | 0/0/3 · 6,4 s | 3/0/3 · 9,2 s | 3/0/3 · 4,2 s |
| F18c Garancia – nincs a rendelésben | 0/0/3 · 876,8 s | 0/0/3 · 9,8 s | 3/0/3 · 10,9 s | 2/0/3 · 4,2 s |
| F18d Garancia – még nincs kiszállítva | 0/0/3 · 686,2 s | 0/0/3 · 9,1 s | 3/0/3 · 5,4 s | 3/0/3 · 4,3 s |
| F19 Reklamáció felvétele | 1/0/3 · 2288,1 s | 0/0/3 · 4 s | 3/0/3 · 20,4 s | 3/0/3 · 10,2 s |
| F20 „Hogy állunk?” | 0/0/3 · 13,8 s | 0/0/3 · 1,3 s | 0/3/3 · 45,4 s | 2/1/3 · 20,6 s |
| F22 Eltérő vevőnév-írás | 0/0/3 · 410,2 s | 0/0/3 · 3,7 s | 3/0/3 · 12,9 s | 3/0/3 · 8,5 s |
| F23 Raktári kód nélküli termék rendelése | 3/0/3 · 755,1 s | 0/2/3 · 2,5 s | 3/0/3 · 13,8 s | 3/0/3 · 7,4 s |
| F24 Kérdés, miközben a számlázó áll | 3/0/3 · 17,3 s | 3/0/3 · 9,3 s | 3/0/3 · 10,8 s | 3/0/3 · 6,9 s |
| F25 Ékezet nélkül írt vevőnév (másik vevő) | – | – | 2/0/3 · 12,7 s | 3/0/3 · 7,4 s |
| F26 Többtételes ajánlat terméknévvel | – | – | 3/0/3 · 13,5 s | 3/0/3 · 8,2 s |
| F27 Meglévő díjbekérő fizetendő összege | – | – | 3/0/3 · 11 s | 3/0/3 · 7,6 s |
| F28 Ajánlat állapota és összege | – | – | 3/0/3 · 11,1 s | 3/0/3 · 4,4 s |
| F29 Garancia termékkód nélkül | – | – | 3/0/3 · 13,6 s | 3/0/3 · 6,9 s |
| F30 A legrégebbi lejárt tartozás | – | – | 3/0/3 · 10,7 s | 3/0/3 · 5,6 s |

## 5. A régi munkamód (ember) – becslés

> **Ez becslés, nem mérés.** A legacy forgatókönyv és a munkaerő-becslés azonos folyamatainak percei, a mérési feladat szűkebb tartalmára igazítva; a mérőlappal később lemérhető. Az ágens ideje gépidő; az ember ideje mellette a jóváhagyás (kártyánként kb. 15–30 s becsült ellenőrzés).

| | Feladat | Ember, régi munkamód (becslés) | nyers · gemma4:12b: idő, siker | nyers · gemma4:e4b: idő, siker | MCP · gemma4:12b: idő, siker | MCP · gemma4:e4b: idő, siker | Indoklás |
|---|---|---:|---:|---:|---:|---:|---|
| E1 | Árajánlat e-mailes érdeklődésre | 8 perc | 37,9 s, 0% | 5 s, 0% | 11,1 s, 100% | 10,8 s, 33% | CRM-ben a vevő csoportja, ajánlat a tétellel, kiszámolás (az e-mail megírása nélkül; a teljes érdeklődés 20 perc) |
| E2 | Kifutott termék – helyettesítő ajánlása | 5 perc | 17 s, 0% | 2,5 s, 0% | 11,8 s, 100% | 10,9 s, 100% | katalógus: keresés, inaktív, helyettesítő ugyanabban a kategóriában |
| E3 | 20%-os kedvezmény – jóváhagyás kérése | 6 perc | 36,7 s, 100% | 9,7 s, 0% | 17,7 s, 100% | 11,1 s, 33% | ajánlat kedvezménnyel + jóváhagyás kérése (a teljes kedvezmény-folyamat 15 perc a vezetővel együtt) |
| E4 | Megrendelés: az ajánlat elfogadása | 4 perc | 16,7 s, 100% | 3 s, 100% | 12,5 s, 100% | 5,3 s, 100% | ajánlat elfogadása, a rendelés ellenőrzése (a teljes megrendelés 10 perc) |
| E5 | „Hol a csomag?” | 4 perc | 13,7 s, 33% | 4,1 s, 0% | 13,9 s, 67% | 9,1 s, 67% | rendelés adatlap, szállítás állapota (5 perc a vevőnek írt válasszal) |
| E6 | „Mit kell utánrendelni?” | 15 perc | 28 s, 0% | 2,9 s, 0% | 16,5 s, 100% | 10,6 s, 100% | raktári lista a minimum alatt, cikkszámokhoz a terméknevek a katalógusból (30 perc a beszállítói rendeléssel) |
| E7 | Díjbekérő kiállítása | 6 perc | 147,6 s, 0% | 3,9 s, 0% | 19,7 s, 100% | 12,8 s, 67% | díjbekérő kiállítása, a bruttó leolvasása (7,5 perc a kiküldéssel) |
| E8 | „Kifizették már?” (fizetett) | 3 perc | 18 s, 0% | 2,3 s, 0% | 6,6 s, 100% | 4,4 s, 100% | számlázó + fizetés: van-e fizetés a bizonylathoz |
| E9 | Garancia – érvényes | 8 perc | 996,3 s, 0% | 6,9 s, 33% | 9 s, 100% | 5,4 s, 100% | kézbesítés dátuma a rendelésből, garanciaidő a katalógusból, kiszámolás |
| E10 | „Hogy állunk?” | 45 perc | 13,8 s, 0% | 1,3 s, 0% | 45,4 s, 0% | 20,6 s, 67% | négy rendszerből a négy szám (a teljes vezetői riport 90 perc, magyarázattal) |

## 6. Tipikus hibák (példák)

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

- **F06** #2 (sikertelen): Kedvezmény-jóváhagyásra vár – „Az AJ-2026-0374 számú ajánlat 24,8%-os kedvezménye van, ami meghaladja a 15%-os határt. Mivel te értékesítési vezető vagy, kérlek add meg az indoklást, hogy jóv…”
- **F09** #1 (reszben): DPD · A futár felvette – „A RND-100280 rendelés jelenleg **Teljesítés alatt (szállítás folyamatban)** áll. A csomag állapotát tekintesz, a szállító (DPD) **felvételre vár** jelenleg. A m…”
- **F20** #1 (reszben): 3/4 rész (kintlévőség, készlet, hibajegy, rendelés) – „Íme a jelenlegi helyzetkép: **Rendelések:** - Lemondva: 18 - Kiszállítva: 1 - Nyitott rendelés nincs egyéb állapottban (jóváhagyásra vár, szállítás alatt, fizet…”
- **F20** #2 (reszben): 3/4 rész (kintlévőség, készlet, hibajegy, rendelés) – „Íme a jelenlegi helyzetkép: **Rendelések:** - Lemondva: 20 - Egyéb állapotú rendelés nincs. **Kintlévőség:** - Összesen 9 lejárt bizonylat van, ami összesen 6 9…”
- **F20** #3 (reszben): 3/4 rész (kintlévőség, készlet, hibajegy, rendelés) – „Íme a jelenlegi helyzetkép: **Rendelések:** * Kiszállítva: 1 * Lemondva: 17 * Egyéb állapotok (jóváhagyásra vár, szállítás alatt, fizetésre vár): 0 **Kintlévősé…”
- **F25** #1 (sikertelen): nem jött létre ajánlat – „Sajnáltam, nem találtam meg a "Verte Ácsészkelet" nevű ügyfelet a rendszerünkben. Kérlek, add meg az adóazonosítót (számot), hogy megtanulhatsák és be tudunk 등록…”

### MCP · gemma4:e4b

- **F01** #2 (reszben): AJ-2026-0333 nettó 600 694 Ft – az összeg nincs a válaszban – „Az árajánlat ID-je **AJ-2026-0333**. Az 12 darab TK-00010 monitornak a teljes összeg **798 540 Ft** (az ajánlatban szereplő adatok alapján).”
- **F01** #3 (reszben): AJ-2026-0346 nettó 600 694 Ft – az összeg nincs a válaszban – „Az árajánlat ID-je **AJ-2026-0346**. Az 12 darab TK-00010 monitornak a teljes összeg **759 832 Ft** (az ajánlatban szereplő adatok alapján).”
- **F05** #1 (reszben): AJ-2026-0320: Piszkozat, 24.8% kedvezmény – „Az ajánlat ID-je **AJ-2026-0320**. A totalNet összege **206 424 Ft**, és az ajánlat jóváhagyásra vár, mivel a kedvezmény (24.8%) meghaladja a 15%-os limitet. Ké…”
- **F05** #3 (reszben): AJ-2026-0348: Piszkozat, 24.8% kedvezmény – „Az ajánlat ID-je **AJ-2026-0348**. A nettó ára 206 424 Ft, és az összesített kedvezmény 24.8%, ami meghaladja a 15%-os limitet. Kérem, adja meg az üzleti indokl…”
- **F09** #3 (reszben): DPD · A futár felvette – „A RND-100274 rendelés **Teljesítés alatt (szállítás folyamatban)**. Az utolsó információ szerint a csomagot a DPD futár vette át, és az várható érvényességi idő…”
- **F13** #1 (reszben): DB-2026-000084, bruttó 102 756 Ft – „A díjbekérő kiállítása sikeres volt az RND-100239 rendeléshez. **Mennyit kell fizetni:** A díjbekérő összeg **102 756 Ft**. Ezt követően a következő lépés, hogy…”
- **F18c** #3 (sikertelen): valójában: A rendelés nem létezik, vagy a termék nem szerepel benne – „Sajnos az eszközök szerint a TK-00010 termék garanciája nem érvényes az RND-100243 rendeléshez.”
- **F20** #1 (reszben): 3/4 rész (kintlévőség, készlet, hibajegy, rendelés) – „Összegzés: **Rendelések:** 14 rendelés vár a fizetésre (a legfrissebbek RND-100240, RND-100239). **Kintlévőség:** Van 9 lejárt bizonylat, az összesen elmaradó t…”

