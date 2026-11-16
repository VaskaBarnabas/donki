# 19. fázis – Értékelés és tokenomics (terv)

*Állapot: kész (2026-11-03) – a mérés lefutott (322 futás), riport: [ertekeles-2026-11-03.md](../riportok/01-meres/ertekeles-2026-11-03.md); az emberi alapvonal egyelőre becslés · 2. változat: felhő nélkül, két helyi modellel, B0 nélkül, 3 ismétlés · előzmény: [FAZIS18_TERV.md](FAZIS18_TERV.md) (eseményvezérelt kivételkezelő, kész) · keret: [MCP_AGENS_TERV.md](MCP_AGENS_TERV.md) §5 · a feladatok forrása: [LEGACY_FORGATOKONYV.md](LEGACY_FORGATOKONYV.md) · frissül vele: [MUNKAERO_BECSLES.md](MUNKAERO_BECSLES.md)*

## 1. Cél

A dolgozat kutatási kérdésére mért választ adunk (keretterv, 1. pont):

> Mennyit segít az ágensnek, ha a legacy rendszert **standardizált MCP rétegen** éri el, ahhoz képest, mintha **közvetlenül a nyers legacy interfészeket** kapná (a `legacy-docs/` leírásokkal)? És mindkettő hogyan viszonyul a **régi munkamódhoz** (ember a rendszerek felületein)?

Mellékkérdés: **mennyit számít a modell?** Ugyanazt a mérést két helyi modellel futtatjuk, a `gemma4:e4b`-vel és a `gemma4:12b`-vel. Felhős modell nincs a mérésben: minden helyben fut, és nem megy ki adat.

A hatékonyságot négy dimenzióban mérjük:
- **pontosság:** sikerült-e, és helyes-e az ár, az állapot, a kód;
- **ráfordítás:** idő, lépésszám, token, gépidő;
- **emberi beavatkozás:** jóváhagyás, visszakérdezés, javítás;
- **robusztusság:** hibás vagy szokatlan bemenet, kiesett rendszer.

**Elfogadási feltétel:** a riport elkészül, és az eredmények reprodukálhatók, azaz egy parancs újrafuttatja a mérést, egy másik a riportot.

A mért időkkel a munkaerő-becslés is frissül. Eddig az ágensoldali idők feltevések voltak.

## 2. Felmérés: mire építünk

| Ami megvan | Következmény |
|---|---|
| A forgatókönyv 12 története (3.1–3.12) szerepkörökkel és tipikus hibákkal | Ezekből lesznek a mérési feladatok, így ember és ágens ugyanazt a munkát végzi. |
| Ágens: front-desk → 6 szakágens, 11 skill, 35 MCP eszköz, jóváhagyási kapu, napló (`agens.futas`, `agens.lepes`, `mcp.tool_calls.agent_run_id`) | Az **MCP-s változat** kész. A tokenek, az idő és az eszközhívások már naplózva vannak. |
| `scripts/agens-meres.ts` (17. fázis): több modell, ismétlés, csak olvasó kérések | Ebből nő ki a mérőfuttató, az írási feladatokhoz és az ellenőrzőkhöz bővítve. |
| `17-agens-elo`, `18-figyelo-elo`: a feladatok a saját adatukat maguk hozzák létre az MCP-n | Ugyanez a minta: minden feladat előkészíti és utána rendbe teszi a saját helyzetét, seedre nem épít. |
| `legacy-docs/` (7 interfész: PostgREST, JSON-RPC, HTTP homlokzat, pgmq, szöveges protokoll, REST, SOAP) | A **nyers** ágens dokumentációja. |
| Két helyi modell az Ollamában: `donki-gemma-e4b`, `donki-gemma` (12b) | A modell-összehasonlítás egy kapcsoló a futtatóban. |
| Háttérfigyelő (J1–J9) | Külön mérhető: az észlelés ideje és az elemzések minősége. |

## 3. A mérési feladatok (24 feladat)

Minden feladathoz négy dolog tartozik:
- **előkészítés:** a saját vevője, rendelése vagy bizonylata, az MCP-n vagy a rendszer saját felületén;
- **kérés:** magyarul, ahogy egy kolléga írná;
- **elvárt jóváhagyások:** melyik író lépés várható;
- **automatikus ellenőrző:** a rendszer **végállapota**, és a válaszban szereplő kulcsadat, a rendszerből lekért igazsággal összevetve.

| # | Történet | Kérés (rövidítve) | Siker, ha… | Típus |
|---|---|---|---|---|
| F01 | 3.1 | „A Bakony Gépgyártó 12 db TK-00010 monitort kér, mennyi?” | van ajánlat a helyes tételekkel, és a válasz nettó összege = az ajánlaté | írás + szabály |
| F02 | 3.1 | Új érdeklődő (cégnév + adószám) ajánlatot kér | a vevő létrejött (az adószám ellenőrzött), és van ajánlata | többlépéses |
| F03 | 3.2 | „Van X termékük?” (kifutott termékre) | a válasz: nem kapható, és egy **aktív** termék ugyanabból a kategóriából | olvasás + szabály |
| F04 | 3.2 | Készlet-kérdés | a szabad mennyiség = a raktáré | olvasás |
| F05 | 3.3 | 20% kedvezményes ajánlat | az ajánlat jóváhagyásra vár (15% fölött) | írás + szabály |
| F06 | 3.3 | Vezető: „hagyd jóvá az AJ-… ajánlatot” | jóváhagyva | írás |
| F07 | 3.4 | „Mehet a rendelés” (elfogadás) | rendelés jött létre az ajánlatból | írás |
| F08 | 3.4 | Jóváhagyás készlethiánnyal | **nem** hagyta jóvá; a válasz megnevezi a hiányzó terméket és mennyiséget | hibakezelés |
| F09 | 3.5 | „Hol a csomag?” | a helyes állapot és a futár | olvasás |
| F10 | 3.5 | Kiszállítás indítása | a rendelés teljesítés alatt van | írás |
| F11 | 3.6 | Bevételezés: „megjött 20 db TK-…” | a készlet +20 (utána visszaállítva) | írás |
| F12 | 3.6 | „Mit kell utánrendelni?” | a felsorolt cikkek = a minimum alattiak | olvasás + összesítés |
| F13 | 3.7 | Díjbekérő kiszállított rendelésre | díjbekérő a **bruttó** összeggel | pénzügyi |
| F14 | 3.7 | Fizetési link a díjbekérőhöz | élő Stripe-teszt link | pénzügyi |
| F15 | 3.9 | „Kifizették már a DB-…?” (fizetett és fizetetlen) | a helyes fizetési állapot | olvasás |
| F16 | 3.8 | Rendelés lemondása | lemondva, a foglalás felszabadult | visszavonhatatlan |
| F17 | 3.8 | Kiállított számla sztornója | van sztornó számla | visszavonhatatlan |
| F18a–d | 3.10 | „Elromlott, van még garancia?” – négy eset | a helyes indok: érvényes / lejárt / nincs a rendelésben / nincs kiszállítva | olvasás + szabály |
| F19 | 3.10 | Reklamáció felvétele | hibajegy a rendeléssel és a termékkel | írás |
| F20 | 3.11 | „Hogy állunk?” | mind a négy szám egyezik (nyitott rendelés, lejárt tartozás, minimum alatti készlet, nyitott hibajegy) | összesítés |
| F21 | 3.12 | „X legyen pénzügyes” (admin) | a szerepkör beállítva (csak az MCP-s változatban: a nyers ágensnek nincs Supabase-interfésze) | írás (helyi eszköz) |
| F22 | – | Eltérő vevőnév („DUNA-IRODAHAZ KFT.”) | a helyes vevőt találja meg | robusztusság |
| F23 | – | Raktári kód nélküli termék rendelése | érthető magyarázat, nincs félrement írás | robusztusság |
| F24 | – | Kérdés, miközben a számlázó le van állítva | érthető hibaüzenet, nincs kitalált adat | robusztusság |

**A jóváhagyásokról a mérés alatt:**
- Az elvárt író lépéseket a futtató **automatikusan jóváhagyja**, és megszámolja a kártyákat. Ez az emberi beavatkozás mértéke.
- A nem várt író lépést **elutasítja**, és hibának számolja. Ilyen pl. az F08-ban egy jóváhagyási kísérlet, vagy egy olvasó kérdésnél egy írás.

**Pontozás:** sikeres, részben sikeres (a végállapot jó, de a válasz hibás vagy hiányos), vagy sikertelen. Egy feladat egy futása legfeljebb 15 eszközhívás és 5 perc.

**Takarítás:** amit a feladat létrehozott, azt utána visszaállítja: lemondja a rendelést, visszatölti a készletet, visszaállítja a szerepkört.

## 4. A változatok

| Változat | Eszközök | Vezérlés | Mit mutat meg |
|---|---|---|---|
| **Nyers ágens** | interfészenként egy „nyers” eszköz (lásd alább) + `legacy_doc(nev)`, amely betölti a `legacy-docs/` leírását | egy általános ágens | Az „eredeti eset”: mire képes a modell, ha neki kell értenie a protokollt, a formátumot és a hibát? |
| **MCP-s ágens** | a 35 MCP eszköz, szakágensenként szűrve, skillekkel | front-desk → szakágens (a mai) | Mennyit segít az MCP-s folyamat a nyers esethez képest? |
| **Ember – régi munkamód** | a Rendszerek felületei | – | alapvonal: mennyi ideig tart ugyanez kézzel |

Mindkét gépi változat **mindkét modellel** fut: `donki-gemma-e4b` és `donki-gemma` (12b). Így négy gépi oszlop van: nyers/e4b, nyers/12b, MCP/e4b, MCP/12b. Ebből egyszerre látszik az MCP hatása, a modell hatása, és az is, hogy a kettő hogyan hat egymásra (pl. a kisebb modellnek többet segít-e az MCP).

**A nyers eszközök** (`agens/nyers/`):
- `crm_rest`, `ajanlat_rpc`, `rendeles_http`, `raktar_sor`, `szamlazo_parancs`, `fizetes_rest`, `helpdesk_soap`.
- A szállítást az eszköz intézi: HTTP-hívás, SOAP POST, szöveges protokoll, és a raktársornál a küldés és a válasz megvárása a korrelációs azonosítóval.
- A kérés formáját, a mezőket, a kódokat és a hibák jelentését **a modellnek kell tudnia** a dokumentációból. Ez a méltányos határ: a „vezeték” nem a mérés tárgya, a protokoll ismerete igen.
- A kulcsokat a végrehajtó teszi a kérésbe, a modell nem látja őket.
- A nyers ágens csak a mérőfuttatóból indul, a portálból soha.
- **Jóváhagyás:** a nyers hívásnak nincs kockázati jelölése. Ezért egy egyszerű szabály minősít: GET, `LISTA`, `LEKER` és társai olvasásnak számítanak, minden más írásnak. A mérésben ezeket is a futtató hagyja jóvá; a riport külön mutatja, hányszor kellett volna embert kérdezni.

**Ismétlés:** a modell válasza futásonként szóródik, ezért minden (feladat × változat × modell) **3×** fut. A riport arányt mutat (pl. 2/3 sikeres), nem egyetlen OK/HIBA-t.

## 5. Mérőszámok

| Mérőszám | Honnan |
|---|---|
| sikeresség (siker / részben / sikertelen) | az ellenőrző, a rendszer végállapota alapján |
| válaszidő (a kéréstől a válaszig) | `agens.futas.ido_ms`; embernél a mérőlap |
| lépésszám: modellhívás, eszközhívás, hibás eszközhívás | `agens.lepes`, `mcp.tool_calls`; nyersnél a nyers eszközök naplója |
| tokenek (be / ki) | `agens.lepes.token_be/ki` (az Ollama adata) |
| gépidő | a futások ideje összesen, modellenként |
| emberi beavatkozás: jóváhagyási kártya, visszakérdezés, nem várt írás | `agens.lepes` (jóváhagyás), `agens.futas.eredmeny` (visszakérdezett) |
| embernél: rendszerváltások és hibák | a mérőlapon |
| **figyelő:** az észlelés ideje (esemény → jelzés) és az elemzés minősége | időbélyegek; a minőség egy 1–5-ös pontozás egy mintán (§7) |

## 6. A futtató és a riport

- **`scripts/ertekeles/`:**
  - `feladatok.ts`: a 24 feladat (előkészítés, kérés, elvárt jóváhagyások, ellenőrző, takarítás);
  - `valtozatok.ts`: nyers és MCP-s;
  - `futtat.ts`: változat × modell × ismétlés, sorban, mert a helyi modell egyszerre egyet szolgál ki;
  - `riport.ts`.
- **Parancsok:**
  - `npx tsx scripts/ertekeles/futtat.ts --valtozatok nyers,mcp --modellek donki-gemma-e4b,donki-gemma --ismetles 3 [--feladatok F01,F08]`
  - utána `npx tsx scripts/ertekeles/riport.ts`
- **Tárolás:** az agens-db új `ertekeles` sémája. Futásonként egy sor (feladat, változat, modell, ismétlés, eredmény, mérőszámok, `agens.futas` azonosító), így a riport bármikor újragenerálható, és egy megszakadt mérés folytatható.
- **A riport:**
  - `riportok/01-meres/ertekeles-2026-11-03.md`: táblázatok változatonként, modellenként és feladattípusonként, a tipikus hibák szöveges példákkal;
  - `riportok/01-meres/adatok/2026-11-03.csv`: a nyers adat, a dolgozat ábráihoz.
- **Gépidő** (becslés): 24 feladat × 2 változat × 2 modell × 3 ismétlés ≈ 290 futás. Futásonként 10–30 s (a 12b lassabb), ez **kb. 1,5–2,5 óra**. Szakaszosan is futtatható, pl. előbb az e4b, aztán a 12b.

## 7. Emberi alapvonal: amit neked kell elvégezned

Az ágens mellé kell egy viszonyítási pont: **mennyi ideig tart ugyanez embernek a régi munkamódban**, a „Rendszerek felületei” menü oldalain. Ez az, amit a legacy forgatókönyv leír, és amit a munkaerő-becslés eddig csak feltételezett.

**A 10 feladat.** Mindegyiket egyszer kell elvégezned, a régi munkamódban. A mérőlap minden feladatnál megmutatja a pontos adatokat, mert a feladatokhoz tartozó vevőt, rendelést és bizonylatot a mérés előtt egy szkript hozza létre.

| # | Feladat | Mit csinálsz a régi felületeken | Mit írsz be a végén |
|---|---|---|---|
| E1 (F01) | „A Bakony Gépgyártó 12 db TK-00010 monitort kér, mennyi lenne?” | CRM: megkeresed a vevőt (csoportja) → Ajánlatok: új ajánlat a vevőnek, tétel felvétele, kiszámolás | az ajánlat nettó összegét |
| E2 (F03) | „Van még [kifutott termék]?” | Katalógus: rákeresel, látod, hogy inaktív, és keresel egy aktív terméket ugyanabból a kategóriából | a javasolt termék kódját |
| E3 (F05) | 20%-os kedvezményes ajánlat | Ajánlatok: ajánlat kedvezménnyel, majd jóváhagyás kérése (15% fölött kötelező) | az ajánlat azonosítóját és állapotát |
| E4 (F07) | „Mehet a rendelés” | Ajánlatok: az ajánlat elfogadása → Rendelések: ellenőrzöd, hogy létrejött | a rendelésszámot |
| E5 (F09) | „Hol a csomag?” (megadott rendelés) | Rendelések: a rendelés adatlapja, a szállítás állapota és a futár | az állapotot és a futárt |
| E6 (F12) | „Mit kell utánrendelni?” | Raktár: a minimum alatti cikkek listája, a cikkszámokhoz a termék neve a Katalógusból | a cikkek listáját |
| E7 (F13) | Díjbekérő kiállítása (megadott, kiszállított rendelés) | Rendelések: a rendelés → „Díjbekérő kiállítása” → Számlázás: a bizonylat bruttó összege | a díjbekérő számát és bruttó összegét |
| E8 (F15) | „Kifizették már a DB-…?” | Számlázás: a bizonylat állapota → Fizetés: van-e sikeres fizetés hozzá | igen / nem |
| E9 (F18a) | „Elromlott a nyomtató, van még garancia?” (megadott rendelés) | Rendelések: mikor kézbesítették → Katalógus: a termék garanciaideje (hónap) → kiszámolod | érvényes / lejárt |
| E10 (F20) | „Hogy állunk?” | négy oldalról összeszeded: nyitott rendelések száma, lejárt tartozás összege, minimum alatti cikkek száma, nyitott hibajegyek száma | a négy számot |

**Hogyan méred:** a portálba egy egyszerű **mérőlap** kerül (`/meres`, csak admin).
1. Megmutatja a következő feladatot a pontos adatokkal.
2. A **„Kezdés”** gombot megnyomod, és egy másik fülön elvégzed a feladatot a régi felületeken.
3. Visszatérsz, és a **„Kész”** után beírod az eredményt (a fenti utolsó oszlop), meg hogy hány oldalt vagy rendszert nyitottál meg. Megjegyzés is írható, pl. „elszámoltam, újrakezdtem”.

A mérőlap rögzíti az időt, és a te eredményedet ugyanúgy ellenőrzi, mint az ágensét: helyes-e az összeg, az állapot, a kód. Így a riportban a három munkamód egy táblázatban látszik.

**Ráfordítás:** feladatonként kb. 3–10 perc, összesen **kb. 1 óra**. Nem kell egyszerre: a mérőlap megjegyzi, hol tartasz.

**Két rövid kiegészítés** (opcionális, összesen kb. 15 perc). Ezek a munkaerő-becslés emberi-ellenőrzési perceit adják:
- **jóváhagyás ideje:** az asszisztensben 5 előkészített jóváhagyási kártyát nézel át és döntesz el; a mérőlap méri, mennyi idő egy kártya;
- **jelzések pontozása:** 10 jelzés elemzését modellenként (e4b és 12b, tehát 20-at) pontozol 1–5-ig: helyes-e, hasznos-e a javaslat, érthető-e a magyar szöveg. Nem látod, melyik modell írta.

## 8. Lépések és tesztelés

1. **Feladatok és ellenőrzők** (`scripts/ertekeles/feladatok.ts`). Próba: mindegyik feladat egy „ideális” forgatókönyv-modellel (`ForgatokonyvModell`) sikeres, egy rosszal pedig sikertelen. Ez az ellenőrzők ellenőrzése, modell nélkül.
2. **A nyers ágens** (`agens/nyers/`): a 7 nyers eszköz, `legacy_doc`, a minősítő szabály, és a gráfban egy `nyers` ágensdefiníció.
   - Próba: a nyers eszközök szállítása (minden interfészen egy olvasó és egy író hívás).
   - A kulcs nem kerül a modellhez sem a kérésben, sem a válaszban.
3. **A futtató és az `ertekeles` séma** (`systems/agens/db/13_ertekeles.sql`): folytatható futtatás, időkorlát, takarítás hiba után is.
4. **A riport** (`riport.ts`): Markdown és CSV, egy kis próbamérésből (3 feladat × 2 változat × 1 modell × 1 ismétlés).
5. **Mérőlap** a portálon (`/meres`): az emberi feladatok előkészítő szkriptje, időmérés, az eredmény ellenőrzése.
6. **Mérés:**
   - gépi: a teljes készlet mindkét modellel, 3×;
   - ember: te, a mérőlappal.
7. **Riport és értelmezés:**
   - `riportok/01-meres/ertekeles-2026-11-03.md`;
   - a `MUNKAERO_BECSLES.md` frissítése a mért értékekkel;
   - a README.

**Tesztek:**
- `19-ertekeles`: modell nélkül, a lépések 1–5 próbáival;
- a meglévő tesztek újrafuttatása (a gráf új ágensdefiníciója miatt a `17-agens` és a `18-figyelo`).

## 9. Biztonság

- **Minden helyben fut,** nincs API-költség, és nem megy ki adat.
- **„A NAV-hoz véletlenül se menjen semmi”:** a pénzügyi feladatok (F13, F14, F17) a Számlázz.hu tesztfiókon és Stripe teszt módban futnak, mint eddig.
- **A nyers ágens kulcsai:** a nyers végrehajtó a rendszerek legacy kulcsait használja, mert ezek nélkül a nyers interfész nem hívható. Ezért csak a mérőfuttatóban, parancssorból fut. A portálba nem kerül be, és a kulcsot a modell soha nem látja.

## 10. Kockázatok

| Kockázat | Kezelés |
|---|---|
| A nyers ágens „igazságtalanul” gyenge vagy erős a szállítási segítség miatt | A határt a riport pontosan leírja (§4). A szállítás nem a mérés tárgya, a protokoll ismerete igen. |
| A futások szóródnak | 3 ismétlés, arány a riportban; a szórás 3 futásnál csak tájékoztató, ezt a riport ki is mondja |
| A feladatok egymásra hatnak (közös készlet, közös vevők) | minden feladat saját vevővel vagy rendeléssel, és takarít maga után; a futtató sorban fut |
| A háttérfigyelő mérés közben elemez, és elveszi a modellt | a mérés alatt `AGENS_FIGYELO=ki`; a figyelő mérése külön szakasz |
| Az ellenőrző hibás, és rossz eredményt ad | az ellenőrzők próbája ideális és rossz forgatókönyvvel (8. pont, 1. lépés), mielőtt bármelyik modell futna |
| A 12b lassú, és a gépidő elhúzódik | modellenként külön indítható, folytatható futtatás |
| Az ember tanul a feladatokból, mire az ágens mérése jön | az ember csak a régi munkamódot méri, egyszer; ez a forgatókönyv kezdő helyzete, nem verseny |

## 11. Nyitott kérdések

1. **Mérőlap vagy stopper:** jó-e a portálba épített mérőlap (§7)? Ez ellenőrzi is az eredményedet, és ugyanabba a riportba írja. Vagy elég, ha stopperrel mérsz, és egy táblázatba írod?
2. **A két opcionális kiegészítés** (jóváhagyási idő, jelzések pontozása; kb. 15 perc): kellenek? A jóváhagyási idő a munkaerő-becslés ellenőrzési perceit méri; nélküle azok feltevések maradnak.

**Döntések (2026-11-03):** a mérőlap és a két kiegészítés (jóváhagyási idő, pontozás) jó, de **egyelőre az emberi rész reális becslés marad** (a riport 5. pontja, jelölve); a mérőlap akkor készül, amikor mérni szeretnél. A gépi mérés teljes.

## 12. Megvalósítás – eredmények és eltérések a tervtől

| Rész | Hol |
|---|---|
| Nyers ágens | `agens/nyers/eszkozok.ts` (7 nyers eszköz + `legacy_doc`, hívásonkénti minősítés), `agens/ugynokok.ts` (`nyers` ágens, a front-desk nem kínálja fel), `agens/graf.ts` (`hivasKockazat`: hívásonkénti kockázat), `agens/futtato.ts` (`kerdez({ agens })`) |
| Feladatok | `scripts/ertekeles/feladatok.ts` (27 feladat: előkészítés, ellenőrző, ideális megoldás, takarítás), `scripts/ertekeles/kozos.ts` (admin MCP, rendelés adott állapotban, kiszállított rendelések készlete) |
| Futtató, tárolás | `scripts/ertekeles/futtat.ts` (folytatható), `systems/agens/db/13_ertekeles.sql` (`ertekeles.futas`) |
| Riport | `scripts/ertekeles/riport.ts` → [ertekeles-2026-11-03.md](../riportok/01-meres/ertekeles-2026-11-03.md), `riportok/01-meres/adatok/2026-11-03.csv` |
| Teszt | `scripts/smoke/19-ertekeles.ts` 80/80 (a nyers eszközök minden interfészen, minősítés, kulcs; a nyers ágens a gráfban; az ellenőrzők próbája: mind a 27 feladat ideális megoldása siker, a semmit nem csináló kitalált válasz nem) |

**A fő eredmények** (a részletek a riportban):

| | nyers · e4b | nyers · 12b | MCP · e4b | MCP · 12b |
|---|---:|---:|---:|---:|
| Sikeres | 9% | 41% | **75%** | **78%** |
| Legalább részben sikeres | 11% | 54% | 91% | 86% |
| Átlagos idő / feladat | 4,6 s | 306 s | **7,8 s** | 22 s |
| Token be / feladat | 5 661 | 19 954 | 7 568 | 8 244 |

1. **Az MCP a döntő tényező, nem a modell.** A nyers interfészen a két modell között négy és félszeres a különbség (9% ↔ 41%). MCP-vel szinte eltűnik (75% ↔ 78%). Így a kisebb, kb. háromszor gyorsabb e4b is használható.
2. **A nyers ágens tipikus kudarcai:**
   - a dokumentáció olvasása nélkül hív, rossz profillal vagy útvonallal;
   - a belső kódokat (raktári cikkszám, vevőkód) nem fordítja;
   - az árat maga számolja ki ajánlat helyett. Ez pontosan „a szabályok a fejekben vannak” probléma: a mennyiségi kedvezmény kimaradt.
3. **A nyers 12b nagyon lassú:** átlag 306 s, összesen ~6,8 gépóra. A beolvasott dokumentumok hosszú kontextusa miatt több futás modell-időtúllépésre futott. Az MCP ugyanott 22 s, 59%-kal kevesebb bemeneti tokennel.
4. **Amit a mérés az MCP rétegről feltárt** (következő lépésnek javasolt, a mérést nem érinti):
   - **F03:** a `search_products` alapból elrejti a kivezetett terméket, ezért a modell azt mondja, „nincs ilyen”, és nem azt, hogy „kifutott”. Pontos egyezésnél jelezze a kivezetett terméket is.
   - **F22:** a vevőkeresés nem ékezet- és írásjel-független („Duna Irodahaz” üres).
   - **F13:** mindkét modell a nettót mondja a bruttó helyett, holott a szabály figyelmeztet rá. Az eszköz adja külön, egyértelmű néven a fizetendő összeget.
   - **F05 (e4b):** az ajánlatot elkészíti, de a jóváhagyás kérését kihagyja. Ide egy skill-lépés kell.
   - **F20:** a négy részből általában 3/4 teljesül.
5. **Valódi modellhibák MCP-vel:**
   - F07 (12b): az ajánlatszámmal rendelést keres;
   - F15a (12b): átutalással fizetett díjbekérőnél csak a kártyás fizetést nézi;
   - F14 (e4b): a linket elkészíti, de nem írja a válaszba.

**Eltérések és tanulságok:**
- **Kihagyott feladat: F21** (szerepkör beállítása). A nyers ágensnek nincs Supabase-interfésze, így nem összevethető. A működését a `17-agens` teszt fedi le. Így 24 helyett 27 feladat lett (az F15 és az F18 alesetei miatt), F21 nélkül.
- **Mérési hiba közben, javítva:** az előkészítő rendelések elfogyasztották a TK-00001 készletét. Az előkészítés most a jóváhagyás előtt pótolja. Egy előkészítési hibás futást töröltem és újrafuttattam.
- **2 futás kimaradt (F17, 12b):** a számla kiállítása a Számlázz.hu tesztfiók ismert sorszám-ütközésén (`E999`) bukott. Négy további, átmeneti infrastruktúra-hibás futás (a Számlázz.hu nem volt elérhető, MCP-időtúllépés) újrafuttatva. A modell-időtúllépések (nyers 12b) valódi eredményként maradtak.
- **A háttérfigyelő javítása** (a mérés tárta fel): a mérés több száz rendelési eseményt termelt, a figyelő pedig körönként csak 20-at olvasott. Most egy körben 50-es adagokban olvas, amíg a sor ki nem ürül (legfeljebb 500-ig).
- **Gépidő:** a teljes mérés kb. 7,5 gépóra lett a tervezett 2–3 helyett. Ennek 6,8 órája a nyers 12b; az MCP-s futások együtt 40 percig tartottak.

**Tesztek:** `19-ertekeles` 80/80, `17-agens` 41/41, `18-figyelo` 36/36.
