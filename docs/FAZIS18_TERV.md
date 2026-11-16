# 18. fázis – Eseményvezérelt kivételkezelő (terv)

*Állapot: kész (2026-11-03) – `18-figyelo` 36/36, `18-figyelo-elo` 10/10 (e4b) · előzmény: [FAZIS17_TERV.md](FAZIS17_TERV.md) (ágens réteg és asszisztens oldal, kész) · keret: [MCP_AGENS_TERV.md](MCP_AGENS_TERV.md) §6 · lefedettség: [ORCHESTRATOR_LEFEDETTSEG.md](ORCHESTRATOR_LEFEDETTSEG.md) „E” csatorna · utána: 19. fázis – értékelés*

## 1. Cél

Eddig az asszisztens csak akkor dolgozott, ha valaki kérdezett tőle. A régi munkamódban sok baj éppen abból lett, hogy senki nem vette észre időben:

- a rendelés elakadt a jóváhagyáskor, mert nem volt készlet;
- a csomag késett;
- egy termék a minimum alá fogyott;
- a fizetési link lejárt;
- egy ajánlat napok óta jóváhagyásra várt.

Lásd: [LEGACY_FORGATOKONYV.md](LEGACY_FORGATOKONYV.md) 3.4, 3.5 és 3.9.

Most egy **háttérfigyelő** veszi észre ezeket magától. Mindegyikről **jelzést** készít, az ágens elemzésével és javaslatával („mi a baj, mi az oka, mit érdemes tenni”). A jelzés annak a szerepkörnek jelenik meg a portálon, akinek a dolga.

A figyelő **soha nem módosít semmit**. A javaslatot ember indítja el, egy kattintással az asszisztensben, és ott minden módosítás a megszokott jóváhagyási kártyán megy át.

**Elfogadási feltétel** (az ütemtervből):
- Ha egy rendelés jóváhagyásakor nincs elég készlet, legfeljebb egy percen belül megjelenik egy jelzés javaslattal a portálon.
- A javaslatból indított asszisztens-beszélgetésben a megoldás jóváhagyással végigvihető.

## 2. Felmérés: milyen események vannak már ma

| Forrás | Esemény | Hol keletkezik | Ki olvassa ma |
|---|---|---|---|
| `order_events` (rendeléskezelő, pgmq) | `ORDER_ACTION_FAILED` (pl. készlethiány a jóváhagyáskor), `SHIPMENT_DELAYED`, `ORDER_STATE_CHANGED`, `ORDER_MODIFIED` | `legacy/orders/motor.ts`, `homlokzat.ts` | senki (csak a sorpanel nézi bele, fogyasztás nélkül) |
| `inventory_alerts` (raktár, pgmq) | `MIN_KESZLET_ALATT` (a minimum átlépésekor egyszer) | `inventory.ellenoriz_minimum` | senki |
| `payment_events` (fizetés, pgmq) | `payment.succeeded`, `payment.failed`, `payment.expired` | `legacy/payments/webhook.ts`, `egyeztetes.ts` | senki |
| *(nincs esemény, csak állapot)* | lejárt tartozás, régóta jóváhagyásra váró ajánlat, régóta álló rendelés, régi nyitott hibajegy | – | csak a kérdésre induló kivételkezelő ágens (`list_overdue_documents`, `list_quotes`, `list_orders`, `list_tickets`) |

**Következmények:**
- A három sorban az események már keletkeznek, csak nincs, aki feldolgozza őket. A figyelő lesz az első tényleges fogyasztójuk, ütközés nincs.
- Amire nincs esemény, azt a figyelő **időzített lekérdezéssel** veszi észre, a meglévő MCP olvasó eszközökkel.
- Az `ORDER_STATE_CHANGED` és a `payment.succeeded` nem kivétel. A figyelő ezeket csak arra használja, hogy egy korábbi jelzést magától lezárjon (pl. a rendelés továbblépett, kifizették).

## 3. Felépítés

```
 rendszerek (konténer)                   portál folyamata (npm run dev)                     portál UI
 ─────────────────────                   ──────────────────────────────                     ─────────
 order_events  ─┐                        ┌────────── FIGYELŐ (kód, nem modell) ──────────┐
 inventory_alerts ├─ sor-kulcs (csak sor) ─▶ 1. esemény → szabály → jelzés-kulcs          │
 payment_events ─┘                        │ 2. duplikáció-szűrés, magától lezárás         │
                                          │ 3. időzített MCP-lekérdezések (monitor szerep)│
 MCP szerverek ◀── monitor token, ────────┤ 4. elemzés: kivételkezelő ágens, csak olvas   │──▶ Jelzések oldal
 (csak olvasó eszközök)                   └───────────────┬───────────────────────────────┘    irányítópult-kártya
                                                          ▼                                    menü-jelvény
                                                  agens-db: agens.jelzes                 „Megoldás az asszisztensben”
                                                                                          → megszokott jóváhagyás
```

Négy elv:

1. **A riasztásról kód dönt, nem a modell.** Hogy mi számít kivételnek, mikor jár jelzés és mikor zárul le, azt determinisztikus szabályok döntik el (§4). A modell csak a **magyarázatot és a javaslatot** írja meg. Ha a modell nem elérhető, a jelzés akkor is létrejön, egy sablonszöveggel (§6).
2. **A figyelő csak olvas, és ezt nem a prompt, hanem a jog biztosítja.** Az MCP-n egy új, `monitor` szerepkörrel dolgozik. Ez a szerepkör minden olvasó (`risk: read`) eszközt elér, de semmilyen írót nem. Ezt egyetlen szabály biztosítja a `jogosult()` függvényben, így egy rosszul működő modell sem tudna módosítani.
3. **Az eseménysor infrastruktúra, nem rendszeradat.** A sorokat a figyelő kódja olvassa, sorra korlátozott kulccsal (`sor_kliens` szerepkör). Ez ugyanaz a minta, mint a raktár mai kulcsa. A kulcsot a modell nem látja. A rendelésről, készletről és számláról minden adatot továbbra is MCP-n kér.
4. **Ember a hurokban.** A jelzés csak tájékoztat és javasol. A „Megoldás az asszisztensben” gomb egy új beszélgetést nyit, előre kitöltött kéréssel. Onnantól minden a 17. fázis szerint megy: szakágens, jóváhagyási kártya, napló.

## 4. A szabályok (az első készlet)

| # | Kiváltó | Jelzés-kulcs (duplikáció) | Súlyosság | Kinek | Magától lezárul, ha… |
|---|---|---|---|---|---|
| J1 | `ORDER_ACTION_FAILED`, ok: készlethiány | `rendeles:<no>:keszlethiany` | magas | logistics, sales_manager | a rendelés továbblép (`ORDER_STATE_CHANGED`) |
| J2 | `ORDER_ACTION_FAILED`, egyéb ok | `rendeles:<no>:<action>` | közepes | sales_manager | a rendelés továbblép |
| J3 | `SHIPMENT_DELAYED` | `szallitas:<no>` | közepes | logistics, sales | a csomag kézbesítve |
| J4 | `MIN_KESZLET_ALATT` | `keszlet:<cikk>` | közepes | logistics | a készlet újra a minimum fölött (időzített ellenőrzés) |
| J5 | `payment.failed` / `payment.expired` | `fizetes:<bizonylat>` | közepes | finance, sales | `payment.succeeded` ugyanarra a bizonylatra |
| J6 | időzített: lejárt tartozás (`list_overdue_documents`) | `tartozas:<bizonylat>` | a késés napjai szerint | finance | kifizették / sztornózták |
| J7 | időzített: jóváhagyásra váró ajánlat > 4 munkaóra (`list_quotes`) | `ajanlat:<id>` | alacsony | sales_manager | jóváhagyták / elutasították |
| J8 | időzített: rendelés > 2 munkanapja ugyanabban az állapotban (`list_orders`) | `elakadt:<no>` | közepes | sales_manager | állapotváltás |

- Az időzített ellenőrzések 10 percenként futnak (beállítható).
- A küszöbök (4 óra, 2 nap) egy helyen, az `agens/figyelo/szabalyok.ts` fájlban vannak.
- **Duplikáció:** ugyanarra a kulcsra egyszerre legfeljebb egy nyitott jelzés lehet. Az ismételt esemény csak az „utoljára észlelve” időt és a darabszámot frissíti, új elemzést nem indít.
- A szabálykészlet szándékosan kicsi. Egy új szabály egy új sor a táblázatban és a kódban; ez a 19. fázisban bővíthető.

## 5. A jelzés életciklusa és tárolása

Az `agens-db`-ben egy új tábla lesz, `agens.jelzes` (új init-szkript: `systems/agens/db/12_jelzes.sql`).

**Mezők:**
- `id`, `kulcs`, `szabaly`, `sulyossag`, `szerepek[]`;
- `allapot`;
- `forras` (a nyers esemény vagy lekérdezés, jsonb);
- `elemzes` és `javaslat` (az ágens szövege), `ajanlott_keres` (a gombhoz előre kitöltött kérés);
- `futas_id` (az elemző futás az `agens.futas`-ban, a lépések idővonalához);
- `thread_id` (ha valaki megnyitotta az asszisztensben);
- időbélyegek: létrejött, utoljára észlelve, lezárva; `lezarta` (felhasználó vagy „magától”).

**Állapotok:** `UJ` → `ELEMZES` → `NYITOTT` → (`FOLYAMATBAN`) → `MEGOLDVA` | `ELVETVE`.

- A `MEGOLDVA` állapotba a jelzés magától kerül, a §4 utolsó oszlopa szerint.
- Az `ELVETVE` kézi lezárás indoklással, például „tudunk róla, a vevővel megbeszéltük”.
- Egyedi index a `kulcs`-ra, a nyitott állapotokra szűrve. Ez a duplikáció-szűrés alapja, és több folyamat esetén is működik.

## 6. Az elemzés: a kivételkezelő ágens, háttérben

- Új jelzésnél a figyelő elindítja a **meglévő kivételkezelő ágenst**. Nem a front-desken át indul, mert a szakágens ismert, és `monitor` szerepkörrel fut.
  - A kérés egy géppel összeállított leírás, például: „Esemény: a RND-123 rendelés jóváhagyása készlethiány miatt meghiúsult (MON-27: kért 12, szabad 4). Vizsgáld meg és javasolj.”
  - Az ágens az MCP olvasó eszközeivel utánanéz: rendelés, készlet, beérkező szállítás, a vevő többi rendelése.
  - A végén strukturált választ ad: `{ elemzes, javaslat, ajanlottKeres, celSzerep }`.
- **Skill:** az új `kivetel-jelzes` skill a jelzés formáját írja le (rövid, tényszerű, egy konkrét javaslat). A meglévő `keszlethiany-kezeles` és `szamlazas-fizetes` skillek adják a szakmai tartalmat.
- **Jóváhagyás a háttérben:** egy háttérfutásnak nincs kitől kérdeznie. Ha az elemzés mégis író eszközt hívna, azt az MCP elutasítja (a `monitor` szerepkörnek nincs rá joga), a gráf pedig ilyenkor elutasítással folytatja. A figyelő futása ezért sosem áll meg jóváhagyásra várva.
- **Terhelés:** az elemzések egy sorban, egyenként futnak, percenként legfeljebb N darab (alapból 6). Ez a helyi modell miatt kell: egyszerre egy kérést szolgál ki jól. A chat elsőbbséget kap: amíg egy felhasználói kérés fut, a figyelő vár.
- **Ha a modell nem elérhető vagy hibázik,** a jelzés sablonszöveggel jön létre (pl. „Készlethiány a RND-123 rendelésnél: MON-27, kért 12, szabad 4.”), és a figyelő később újrapróbálja az elemzést.

## 7. Hol fut: a portál folyamatában

- **Javaslatom:** a figyelő a Next.js `instrumentation.ts` `register()` függvényéből indul (a dokumentáció szerint ez a szerver indulásakor egyszer fut). Így továbbra is egyetlen `npm run dev` indít mindent, és nincs újabb folyamat vagy konténer. Az ágens ma is a portál folyamatában fut, natívan, a helyi Ollamával.
- **Egyetlen futó példány:** fejlesztői módban a Next.js újratölthet modulokat. Ezért a figyelő
  - globális egyke (singleton);
  - Postgres advisory lockot fog az `agens-db`-ben, így ha két portál futna, akkor is csak egy figyelő dolgozik.
- **Ki- és bekapcsolás:**
  - `AGENS_FIGYELO=ki` környezeti változóval, például tesztekhez;
  - a Rendszerek oldalon is: az „Ágens” sor kap egy „Figyelő” kapcsolót és az utolsó futás idejét, ugyanúgy, mint a rendszerek ütemezett feladatai.
- **Alternatíva** (ha nem akarod a portálba): egy külön `npm run figyelo` folyamat. Ugyanaz a kód, csak külön indítva.

## 8. Portál felület

- **Jelzések oldal** (`/jelzesek`, a menüben az Asszisztens alatt, nyitott jelzésszám-jelvénnyel).
  - Lista szűrőkkel: állapot, súlyosság, szabály. Mindenki a saját szerepkörének jelzéseit látja, az admin az összeset.
  - **Jelzéskártya:** cím, súlyosság, mikor és hányszor észlelve, az ágens elemzése és javaslata, a nyers esemény lenyitható részletként, és a lépések idővonala, mint a chatben.
  - **Gombok:**
    - „Megoldás az asszisztensben”: új beszélgetést nyit az `ajanlott_keres`-sel. A jelzés `FOLYAMATBAN` lesz, és a beszélgetéshez kötődik.
    - „Elvetem” (indoklással).
    - „Újraelemzés”.
- **Irányítópult:** a „Jóváhagyásra vár” kártya mellé egy „Nyitott jelzések” kártya, súlyosság szerinti bontással.
- **Asszisztens oldal:** ha a beszélgetés egy jelzésből indult, a tetején egy sáv mutatja, melyikből („Jelzés: készlethiány, RND-123”).
- Nincs e-mail- vagy push-értesítés ebben a fázisban; ez opcionális bővítés (§11).

## 9. Lépések és tesztelés

1. **MCP `monitor` szerepkör:** a `jogosult()` szabálya: a `monitor` minden `risk: read` eszközt elér, írót egyiket sem. Új token a `stack-titkok`-ban.
   - Teszt: a `14-mcp-*` tesztek kiegészítése (a monitor olvashat, írásnál `FORBIDDEN`).
2. **Sor-kulcsok:** a rendeléskezelő és a fizetés PostgREST-jén `sor_kliens` szerepkör, csak a saját sorára, az `inventory` mintájára. Init-szkriptek, `stack-titkok`.
3. **`agens.jelzes`** tábla és a figyelő magja (`agens/figyelo/`):
   - `forrasok.ts`: sorolvasás, láthatósági időkorlát, archiválás feldolgozás után;
   - `szabalyok.ts` (J1–J8), `jelzesek.ts` (létrehozás, duplikáció, lezárás), `elemzo.ts`, `figyelo.ts` (ütemező, lock).
4. **Elemzés:** a kivételkezelő ágens háttér-módja, a strukturált kimenet, a `kivetel-jelzes` skill és a sablonszöveges tartalék.
5. **Portál:** `instrumentation.ts`, a Jelzések oldal, az irányítópult-kártya, a menü-jelvény, a „Megoldás az asszisztensben” gomb, a Figyelő kapcsoló a Rendszerek oldalon.
6. **Tesztek:**
   - **`18-figyelo` (modell nélkül, determinisztikus).** A teszt maga hozza létre a helyzeteket, tesztadat nélkül:
     - készlethiányos rendelés jóváhagyása → J1;
     - készlet a minimum alá → J4;
     - lejárt fizetési link → J5;
     - lejárttá tett számla → J6.

     Utána egy figyelőkör fut a tesztmodellel (`ForgatokonyvModell`), és ellenőrzi:
     - a jelzés létrejön, a megfelelő szerepkörnek és súlyossággal;
     - az ismételt esemény nem hoz új jelzést;
     - a magától lezárás működik (pl. a rendelés továbblép);
     - modellhiba esetén sablonszöveges jelzés jön létre;
     - a `monitor` token írásnál `FORBIDDEN`-t kap;
     - két figyelő párhuzamosan sem dolgoz fel egy eseményt kétszer;
     - a jelzést más szerepkör nem látja.
   - **`18-figyelo-elo` (helyi e4b):** a J1, a J4 és a J6 elemzése valós modellel. Ellenőrzés: a javaslat a helyes rendelésre, cikkre vagy számlára hivatkozik, az `ajanlottKeres` értelmes, és nincs író hívás.
   - A 16-portal teszt kiegészítése: a Jelzések oldal elérhető, a jogosultság ellenőrzött, és a kliens kódba nem kerül kulcs.
   - Az összes korábbi teszt újrafuttatása (a figyelő a tesztek alatt `AGENS_FIGYELO=ki`-vel áll, kivéve a 18-ast).
7. **Kézi végigkattintós teszteset** a felületen (a végén megadom): készlethiányos rendelés → jelzés → „Megoldás az asszisztensben” → jóváhagyás → a jelzés magától lezárul.

## 10. Kockázatok

| Kockázat | Kezelés |
|---|---|
| Túl sok jelzés („riasztási fáradtság”) | duplikáció kulcsonként, csak az átlépéskor (pl. minimumkészlet), súlyosság, szerepkör szerinti szűrés; a kis szabálykészlet csak fokozatosan bővül |
| A helyi modell lassú, és elveszi a gépet a chat elől | sorban, percenkénti korláttal, a chat elsőbbséget kap; tartalék sablonszöveg |
| A modell hibás javaslatot ad | a javaslat csak szöveg, végrehajtás csak az asszisztensben, emberi jóváhagyással; a nyers esemény mindig látható mellette |
| Elveszett vagy kétszer feldolgozott esemény | pgmq láthatósági időkorlát + archiválás csak sikeres feldolgozás után; a duplikáció-index miatt a kétszeres feldolgozás sem hoz két jelzést |
| Prompt injection az eseményadatokban (pl. vevőnév, hibajegy szövege) | az esemény adatként kerül a promptba, és a `monitor` szerepkör jogilag nem tud írni |
| Fejlesztői újratöltéskor több figyelő indul | egyke + advisory lock |

## 11. Nyitott kérdések

1. **Hol fusson a figyelő?** A portál folyamatában (`instrumentation.ts`, egy `npm run dev` elég), vagy külön `npm run figyelo` folyamatként? Javaslatom: **a portálban**, kapcsolóval.
2. **`monitor` szerepkör az MCP-n:** új, csak olvasó szerepkör, vagy legyen a meglévő `admin` token, és csak a prompt tiltsa az írást? Javaslatom: **új szerepkör**, mert így a „soha nem módosít” jogosultsági garancia, nem kérés.
3. **Szabálykészlet és küszöbök:** jó-e a J1–J8, a 4 órás ajánlati és a 2 munkanapos rendelési küszöbbel? Kimaradjon vagy bekerüljön valami (pl. régóta nyitott hibajegy)?
4. **Értesítés:** elég-e a portálon belüli jelzés (oldal, kártya, jelvény), vagy legyen e-mail-értesítés is a magas súlyosságúakról? Javaslatom: **most csak a portálon belül**. Az e-mail a D csatornával együtt jöhet.
5. **Kockázatalapú jóváhagyás** (a munkaerő-becslés javaslata): ebben a fázisban maradjon ki? Javaslatom: **igen, maradjon ki**. A 19. fázis mérése után, adatok alapján érdemes eldönteni, mely műveletek mehetnek jóváhagyás nélkül.

**Döntések (2026-11-03):** mind a javaslat szerint – a figyelő a portál folyamatában fut (kapcsolóval), új `monitor` MCP szerepkör, csak portálon belüli értesítés, kockázatalapú jóváhagyás nélkül; a J1–J8 mellé bekerült a **J9: régóta nyitott hibajegy** (3 munkanapja nem változott, új vagy folyamatban lévő).

## 12. Megvalósítás – eredmények és eltérések a tervtől

| Rész | Hol |
|---|---|
| `monitor` szerepkör | `mcp/kozos/kanonikus.ts` (ROLES), `mcp/kozos/eszkoz.ts` (`jogosult(hivo, roles, risk)`: a monitor csak `risk: read`); token: `scripts/stack-titkok.ts` |
| Sor-kulcsok | `systems/orders/db/03_sor_kliens.sql`, `systems/payments/db/03_sor_kliens.sql` (a raktár mintájára); `ORDERS_SOR_KEY`, `PAYMENTS_SOR_KEY` |
| Táblák | `systems/agens/db/12_jelzes.sql`: `agens.jelzes` (részleges egyedi index a nyitott kulcsokra), `agens.figyelo` (kapcsoló, utolsó kör), `agens.megfigyeles` (J7 első észlelés) |
| A figyelő | `agens/figyelo/`: `forrasok.ts` (pgmq read/archive), `szabalyok.ts` (J1–J9, küszöbök, lezárási feltételek), `jelzesek.ts`, `elemzo.ts`, `figyelo.ts` (három kör, advisory lock, indítás) |
| Gráf háttér-módja | `agens/graf.ts` (`elore`, `hatter`: front-desk nélkül, jóváhagyás helyett elutasítás), `agens/futtato.ts` (`hatterben()`); a chat elsőbbsége: `agens/kozos/terheles.ts` |
| Elemzés | a kivételkezelő szakágens (+ `get_quote`, `get_ticket`), `agens/skills/kivetel-jelzes/SKILL.md` (háromsoros forma) |
| Portál | `instrumentation.ts`; `/jelzesek`, `/jelzesek/[id]`; menü-jelvény; irányítópult „Nyitott jelzések” kártya (mindig elöl); asszisztens `?jelzes=<id>` (előre kitöltve, a beszélgetés a jelzéshez kötve, sáv); Rendszerek oldal „Háttérfigyelő” panel kapcsolóval |

**Eltérések és tanulságok:**
- **Az állapotokból kimaradt az `ELEMZES`.** A jelzés `UJ` állapotban jön létre, a sablonszöveggel együtt (a felületen: „elemzés folyamatban”), és az elemzés után lesz `NYITOTT`. Így a modell kiesése sem tart vissza jelzést: sikertelen elemzés után is `NYITOTT` lesz, és 5, 15, 45 perc múlva újrapróbálja.
- **A raktár figyelmeztetése a belső cikkszámot adja**, nem a termékkódot. Ezért a `MIN_KESZLET_ALATT` nem maga hoz létre jelzést, hanem azonnali J4-ellenőrzést indít az MCP-n (`list_low_stock`), és a jelzés a termékkód szerint készül. Ugyanígy a J1 szövegébe a rendeléskezelő részletéből csak a hiány darabszáma kerül.
- **A J7-hez nincs létrehozási idő** az ajánlatlistában. A küszöb ezért a figyelő első észlelésétől számít (`agens.megfigyeles`), és a terv „4 munkaórája” helyett egyszerűen 4 óra.
- **A lezárás kétféleképpen történik:** eseményből (a rendelés továbblépett, a vevő fizetett), és az időzített körben az aktuális állapot szerint (`get_order`, `get_document`, ill. a listából eltűnt tétel). Így akkor is lezárul a jelzés, ha a lezáró esemény a figyelő leállása alatt jött.
- **Kétszeres védelem az írás ellen:** a háttér-módú gráf minden író hívást elutasít, és a `monitor` szerepkör az MCP-n amúgy sem írhat. A teszt mindkettőt külön ellenőrzi (admin szerepkörrel háttér-módban, ill. monitorral közvetlenül).
- **Első induláskor a fejlesztői adatbázis régi állapotából is lettek jelzések:** a régóta lejárt tartozásokról és a régóta nem változott hibajegyekről. Az éles rendszer üresen indul, ott ez nem fordul elő.
- **Az elemzés minősége a helyi e4b modellel:** a forma és az azonosítók megbízhatóak (10/10), egy-egy elemzés 6–14 s. A javaslatok használhatók (pl. „Csökkentsd az RND-100056 rendelésben a TK-00001 mennyiségét 15 db-ra”). A magyar szöveg viszont néhol pontatlan („vencelkedett”, egy vevőnév elírva). Ez a 19. fázis modell-összehasonlításának egyik szempontja.
- **A 14-mcp-finance (sztornó) és a 08-fizetes lefutott,** mert a Stripe és a Számlázz.hu ismét elérhető volt: 26/26, illetve minden ellenőrzés sikeres.

**Tesztek:**
- `18-figyelo` 36/36 (modell nélkül, ~55 s) és `18-figyelo-elo` 10/10 (e4b, ~50 s);
- `16-portal` 59/59 (+5: a jelzések láthatósága szerepkör szerint, a részletoldal tiltása, a megoldás-link, a bejelentkezés);
- `17-agens` 41/41 (11 skill);
- `13-mcp-orders` 45/45, `14-mcp-sales` 38/38, `14-mcp-inventory` 17/17, `14-mcp-support` 27/27, `14-mcp-finance` 26/26, `14-mcp-order-to-cash` 20/20;
- `08-fizetes` sikeres, `15-rendszerek` 22/22.
