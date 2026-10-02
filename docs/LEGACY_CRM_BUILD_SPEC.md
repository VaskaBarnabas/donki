# Legacy CRM – build specifikáció Claude Code számára

## 0. Kontextus és a legfontosabb szabály

Ez egy **szakdolgozati prototípus**: egy elképzelt magyar KKV (kb. 40 fős, irodatechnikai és ipari eszközöket forgalmazó B2B kereskedő) **szándékosan heterogén, legacy jellegű** vállalatirányítási rendszere. Később egy külön MCP szerver és AI ágensek fogják vezérelni – azokat NEM ebben a feladatban kell elkészíteni.

**A legfontosabb szabály: a heterogenitás a feladat része, nem hiba.** Ne egységesítsd az interfészeket, azonosítókat, dátum- és pénzformátumokat vagy hibaüzeneteket a modulok között. Ne hozz létre közös API réteget, közös típusokat a modulok szerződéseihez, közös hibakezelő wrappert vagy közös ID-generátort. Ha egy refaktor „szebbé” tenné a modulok közötti kapcsolatot, ne csináld meg. Modulon *belül* a kód lehet tiszta és jól szervezett.

## 1. Stack

- Next.js (App Router, TypeScript), a projekt már létezik
- Supabase (Postgres + PostgREST + Supabase Queues/pgmq + pg_cron), migrációk a `supabase/migrations` mappában
- shadcn/ui az admin felülethez
- `stripe` npm csomag (teszt mód), `fast-xml-parser` (SOAP és Számlázz.hu XML), `zod` a modulok belső validációjához
- Flowable (nyílt forráskódú, hivatalos `flowable/flowable-rest` Docker image) a rendelések BPMN folyamatmotorjaként, **a Supabase Postgres-t használva adatbázisként** (saját `flowable` séma)
- Minden legacy végpont Next.js Route Handler, `export const runtime = 'nodejs'`
- Szerver oldalon `SUPABASE_SERVICE_ROLE_KEY`-vel dolgozunk; a service role kulcs soha nem kerülhet kliens komponensbe

Az egyetlen Docker konténer a Flowable. Nincs külön üzenetközvetítő és nincs második adatbázis.

### 1.1 Flowable beállítása

- Migrációban: `create schema if not exists flowable;` – a sémában lévő táblákat (`ACT_*`, `FLW_*`) a Flowable hozza létre és kezeli. Migráció, seed vagy `db diff` ne nyúljon hozzájuk, és ne legyen exposed PostgREST-en.
- Kapcsolat: a Supabase **session pooler** connection stringje (pooler host, 5432-es port). A transaction pooler (6543) nem használható (prepared statementek, hosszú tranzakciók), a direkt kapcsolat pedig alapból IPv6-only.
- `docker-compose.yml` a projekt gyökerében, egyetlen `flowable` szolgáltatással. Pinelj konkrét verziót (nézd meg a Docker Hubon az aktuális 7.x taget, ne `latest`):

```yaml
services:
  flowable:
    image: flowable/flowable-rest:<7.x verzió>
    ports: ["8080:8080"]
    extra_hosts: ["host.docker.internal:host-gateway"]
    environment:
      SPRING_DATASOURCE_DRIVERCLASSNAME: org.postgresql.Driver
      SPRING_DATASOURCE_URL: jdbc:postgresql://${SUPABASE_POOLER_HOST}:5432/postgres?currentSchema=flowable&sslmode=require
      SPRING_DATASOURCE_USERNAME: ${SUPABASE_DB_USER}
      SPRING_DATASOURCE_PASSWORD: ${SUPABASE_DB_PASSWORD}
      FLOWABLE_DATABASESCHEMAUPDATE: "true"
```

- Indulás után ellenőrizd, hogy a táblák a `flowable` sémában jöttek-e létre. Ha a `public`-ba kerültek, állítsd be a Flowable `database-schema` property-jét is (a pontos property nevet a Flowable dokumentációjában ellenőrizd).
- A Flowable REST alapértelmezett admin felhasználóját és jelszavát írd felül env változóval (a pontos változónevet a Flowable REST app dokumentációjából ellenőrizd), és a Next.js ezzel a felhasználóval, Basic auth-tal hívja.
- A konténerből a helyi Next.js `http://host.docker.internal:3000` címen érhető el. A BPMN HTTP taskok URL-je ne legyen hardkódolva: folyamatváltozóként (`appBaseUrl`) adja át a Next.js a folyamat indításakor.
- A Flowable 7 nyílt forráskódú változatában nincs grafikus Modeler; a BPMN XML-t kézzel írd, szabványos BPMN 2.0 + Flowable extension attribútumokkal, hogy bpmn.io-ban is megjeleníthető legyen.

## 2. Mappaszerkezet

```
src/
  app/
    (admin)/                 # shadcn admin UI, modulonként külön oldal
      crm/  catalog/  quotes/  orders/  inventory/  billing/  payments/  support/
    api/legacy/
      quote-rpc/route.ts               # JSON-RPC 2.0
      orders/[...path]/route.ts        # régi stílusú HTTP homlokzat a Flowable előtt
      orders/_engine/[action]/route.ts # belső végpontok, ezeket a BPMN HTTP taskjai hívják
      billing/route.ts                 # egyedi szöveges protokoll (text/plain)
      payments/route.ts                # REST
      payments/webhook/route.ts        # Stripe webhook
      support/soap/route.ts            # SOAP 1.1 (+ ?wsdl)
  legacy/                    # modulonként külön mappa, NINCS közös modul-szerződés
    quote/  orders/  billing/  payments/  support/
  lib/supabase/server.ts     # service role kliens (megosztott infra)
  lib/flowable/client.ts     # Flowable REST kliens (csak a rendelésmodul és a fizetés webhook használja)
flowable/
  processes/rendeles_folyamat.bpmn20.xml
  deploy.ts                  # telepíti a BPMN-t a Flowable REST API-n keresztül (npm run flowable:deploy)
docker-compose.yml           # csak a flowable szolgáltatás
supabase/
  migrations/
  seed.sql
legacy-docs/                 # modulonkénti „régi” interfészdokumentáció (lásd 11. fázis)
scripts/smoke/               # modulonkénti füstteszt scriptek
```

## 3. Adatbázis – sémák és azonosítók

Minden modul saját sémát kap. A modulok kódja **csak a saját sémáját** olvassa és írja közvetlenül; más modult csak annak interfészén (protokollján, üzenetsorán) érhet el. Kivétel: a folyamatmotor és az időzített feladatok SQL-függvényei, de ezek is csak üzenetsoron keresztül szólnak át más modulba.

| Séma | Azonosító formátum | Dátum | Pénz | Elérés kívülről |
|---|---|---|---|---|
| `crm` | UUID | `timestamptz`, ISO 8601 | `numeric(14,2)` | PostgREST |
| `catalog` | `TK-00042` (text, PK) | ISO | `numeric(12,2)` | PostgREST |
| `quote` | `AJ-2026-0042` | `date`, `YYYY-MM-DD` | egész forint (`bigint`) | JSON-RPC |
| `orders` | `bigint` 100001-től; hivatkozásban `RND-100045`; Flowable business key = rendelésszám | ISO | `numeric` | régi HTTP homlokzat + Flowable REST + `order_events` sor |
| `flowable` | Flowable belső ID-k | – | – | csak a Flowable kezeli |
| `inventory` | `integer` cikk (pl. 4711) | Unix epoch (`bigint`) | – | csak pgmq |
| `billing` | partner `VEVO-1023`, számla `SZ-2026-000187`, díjbekérő `DB-2026-000031` | tárolás `date`, a protokollban `YYYY.MM.DD` | protokollban `38100,00` | szöveges protokoll |
| `payment` | belső UUID + Stripe ID-k | ISO | `bigint` fillér (Stripe minor unit) | REST + webhook |
| `support` | `HJ-000321`, `RMA-2026-0012` | `xsd:dateTime` | – | SOAP |

PostgREST-en csak a `crm` és a `catalog` séma legyen exposed (Supabase Dashboard → API settings → Exposed schemas; írd le a README-be is). A többi séma ne legyen elérhető PostgREST-en. A sémákra adj `usage` és tábla-jogosultságot a `service_role`-nak; RLS legyen bekapcsolva, a `crm` és `catalog` táblákon egyszerű policy az `authenticated` szerepnek elég a prototípushoz.

### 3.1 Táblák (minimum, bővíthető)

**crm**: `partners` (id, name, tax_number unique, address, customer_group text: `NORMAL|TORZS|VISZONTELADO|KIEMELT`, owner_name, created_at), `contacts` (id, partner_id, name, email, phone, role), `deals` (id, partner_id, title, stage: `erdeklodo|ajanlat|megrendeles|lezart`, value, expected_close, quote_ref text null, order_ref text null), `activities` (id, partner_id, deal_id null, type: `hivas|email|megbeszeles|statusz_valtas|megjegyzes`, note, created_at).

**catalog**: `categories`, `products` (code `TK-xxxxx`, name, category_id, list_price, unit, warranty_months, raktari_kod integer NULL, active), `customer_group_discounts` (customer_group, category_id, discount_pct).

**quote**: `quotes` (id `AJ-…`, partner_id uuid, valid_until date, status: `PISZKOZAT|JOVAHAGYASRA_VAR|JOVAHAGYOTT|ELFOGADVA|LEJART|ELUTASITVA`, total_net bigint, total_discount_pct numeric, approved_by text null), `quote_lines` (quote_id, product_code, qty, unit_price bigint, line_discount_pct), `templates` (név, fejléc/lábléc szöveg, alap érvényesség napokban).

**orders**: `orders` (order_no bigint, quote_ref, partner_id uuid, state, process_instance_id text, invoice_ref text null, created_at), `order_lines`, `reservations_ref` (order_no, cikk, db, corr), `process_history` (order_no, from_state, to_state, action, ok bool, reason, ts), `shipments` (order_no, carrier_status: `FELVETELRE_VAR|FELVEVE|UTON|KEZBESITVE|KESIK`, eta, updated_at).

**inventory**: `items` (cikk integer PK, megnevezes, keszlet int, foglalt int, min_keszlet int, updated_epoch bigint), `reservations` (id, cikk, db, ref text, statusz `AKTIV|FELOLDVA|KIADVA`, created_epoch), `movements` (cikk, db, tipus `BE|KI|VISSZARU|KORREKCIO`, ref, epoch).

**billing**: `vevok` (kod `VEVO-…`, nev NAGYBETUS, adoszam, cim), `szamlak` (szam, tipus `SZAMLA|DIJBEKERO|STORNO`, vevo_kod, rendeles_ref, kelt date, hatarido date, brutto numeric, fizetve bool, lejart bool, szamlazz_id text null), `szamla_tetelek`, `nav_log` (szimulált NAV-adatszolgáltatás naplója).

**payment**: `payments` (id uuid, invoice_ref, stripe_session_id, stripe_payment_intent, amount_minor, currency, status `CREATED|SUCCEEDED|FAILED|EXPIRED`, created_at, updated_at).

**support**: `tickets` (id `HJ-…`, partner_tax_number, order_no, product_code, leiras, statusz `UJ|FOLYAMATBAN|VARAKOZIK|LEZART`, created_at), `rma` (id `RMA-…`, ticket_id, tipus `CSERE|JAVITAS`, statusz, csere_cikk int null).

Az ID-generálás modulonként saját módon történjen (szekvencia + formázó függvény sémánként), ne legyen közös generátor.

## 4. Üzenetsorok (Supabase Queues / pgmq)

Kapcsold be a `pgmq` és `pg_cron` bővítményt migrációban. Sorok: `inventory_commands`, `inventory_replies`, `inventory_alerts`, `order_events`, `payment_events` (`select pgmq.create('…')`).

Engedélyezd a „Expose Queues via PostgREST” opciót (a `pgmq_public` séma), hogy a későbbi MCP szerver is tudjon olvasni/írni; ezt írd le a README-be.

### 4.1 Raktári parancsok

Üzenet formátum (magyar mezőnevek, epoch idő):

```json
{"cmd":"FOGLAL","corr":"c-8f21","cikk":4711,"db":5,"ref":"RND-100045"}
```

Parancsok: `FOGLAL`, `FELOLD` (`ref` alapján), `MOZGAS` (`tipus`, `db`), `LEKERDEZ` (`cikk` vagy `cikkek` tömb), `VISSZARU_BE`.

Válasz a `inventory_replies` sorra:

```json
{"corr":"c-8f21","status":"NOK","hibakod":"R-03","uzenet":"NINCS ELEG KESZLET","szabad":2,"ts":1790845200}
```

Hibakódok: `R-01` ismeretlen cikk, `R-02` hibás parancs, `R-03` nincs elég készlet, `R-04` foglalás nem található, `R-99` belső hiba.

Feldolgozás: `inventory.process_commands()` PL/pgSQL függvény, ami `pgmq.read('inventory_commands', 30, 20)`-szal olvas, feldolgoz, válaszol, majd `pgmq.delete`. Ha egy üzenet `read_ct > 3`, akkor `pgmq.archive` (ez a dead letter). Minimumszint alá csökkenéskor küldjön `{"tipus":"MIN_KESZLET_ALATT","cikk":…,"keszlet":…,"min":…,"ts":…}` üzenetet az `inventory_alerts` sorra. Ütemezés: `cron.schedule('inventory-worker', '5 seconds', 'select inventory.process_commands()')`.

A szinkron hívóknak (rendelésmotor, support) legyen egy segédfüggvény a saját modulukban, ami parancsot küld és a `corr` alapján max. ~10 másodpercig pollozza a válaszsort (a nem hozzá tartozó válaszokat ne törölje). Ez legacy-szerűen lassú és ügyetlen – maradjon is az.

## 5. Modulok

### 5.1 CRM törzs és katalógus – PostgREST

Nincs saját végpont, a Supabase REST API szolgálja ki (`Accept-Profile: crm` / `catalog`). Teendő: táblák, jogosultságok, egy `catalog.price_for(product_code, customer_group)` SQL függvény (ez is elérhető lesz `/rest/v1/rpc/price_for`-ként), valamint seed adat.

### 5.2 Ajánlatmotor – JSON-RPC 2.0 (`POST /api/legacy/quote-rpc`)

Hozzáférés: a kulcs a `params.apiKey` mezőben érkezik (igen, a paraméterek között – legacy).
Metódusok: `quote.create {partnerId, templateId?}`, `quote.addLine {quoteId, productCode, qty, lineDiscountPct?}`, `quote.calculate {quoteId}`, `quote.requestApproval {quoteId, reason}`, `quote.approve {quoteId, approver}`, `quote.accept {quoteId}` (létrehozza a rendelést a rendelésmodul HTTP interfészén keresztül, és visszaadja a rendelésszámot), `quote.get {quoteId}`, `quote.list {partnerId?, status?}`.

Árazás **TypeScript kódban** (`src/legacy/quote/pricing.ts`), nem adatbázisban: listaár → ügyfélcsoport-kedvezmény (a katalógusból olvasva) → tételkedvezmény → mennyiségi kedvezmény (10 db felett +3%, 50 db felett +5%, tételenként). Ha az ajánlat összesített kedvezménye > 15%, a `calculate` sikeres eredménye mellett az `accept` hibát dob, amíg nincs jóváhagyás. Batch hívás (tömb) támogatása nem kell.

Hibakódok: szabványos `-32700/-32600/-32601/-32602/-32603`, üzleti: `-32010 DISCOUNT_APPROVAL_REQUIRED` (data: `{discountPct, limit}`), `-32011 QUOTE_EXPIRED`, `-32012 INVALID_STATE`, `-32013 PRODUCT_INACTIVE`, `-32001 UNAUTHORIZED`.

### 5.3 Rendelések + Flowable – hibrid

A rendelés életciklusát a **Flowable** futtatja a `flowable/processes/rendeles_folyamat.bpmn20.xml` folyamat alapján (process key: `rendeles_folyamat`, business key: a rendelésszám). Az `orders` séma a rendelés törzsadatait és a denormalizált aktuális `state`-et tartja; az igazság forrása a folyamat futási állapota.

#### A BPMN folyamat

Üzleti állapotok: `ROGZITETT → JOVAHAGYOTT → TELJESITES_ALATT → SZALLITVA → SZAMLAZVA → LEZART`, illetve `LEMONDOTT`.

1. Start → HTTP task `allapot` (`ROGZITETT`).
2. **User task** `rendeles_jovahagyasa` (candidate group: `ertekesitesi_vezeto`).
3. HTTP task `keszlet_foglalas` → exclusive gateway a válasz alapján. Sikertelen: HTTP task `allapot` (`ok=false`, `reason=INVENTORY_SHORTAGE` vagy `MISSING_STOCK_CODE`), majd vissza a 2. lépésre. Sikeres: `allapot` (`JOVAHAGYOTT`).
4. **User task** `kiszallitas_inditasa` → HTTP task `szallitas_letrehozasa` → `allapot` (`TELJESITES_ALATT`).
5. Szállításkövető ciklus: intermediate timer (`PT1M`) → HTTP task `szallitas_allapot` → gateway: `KEZBESITVE` → tovább; `KESIK` → HTTP task `esemeny` (`SHIPMENT_DELAYED`, csak az első alkalommal), majd vissza a timerre; egyéb → vissza a timerre. Kézbesítés után `allapot` (`SZALLITVA`).
6. **User task** `szamla_kiallitasa` → HTTP task `szamlazas` (a számlaszám folyamatváltozóba kerül: `invoiceRef`) → `allapot` (`SZAMLAZVA`).
7. Intermediate message catch event `FizetesBeerkezett` → `allapot` (`LEZART`) → end.

Lemondás: **interrupting event subprocess**, message start event `RendelesLemondas` → HTTP task `foglalas_feloldasa` → gateway: ha van `invoiceRef`, HTTP task `storno` → `allapot` (`LEMONDOTT`) → end. A `LEZART` állapot után a lemondás nem lehetséges (a homlokzat ezt ellenőrzi, mielőtt üzenetet küld).

Módosítás: nem a BPMN része. A homlokzat csak akkor engedi, ha a folyamat a 2. vagy a 4. user taskon áll (tehát a kiszállítás még nem indult el); ilyenkor feloldja a régi foglalásokat, frissíti a tételeket, és ha a rendelés már `JOVAHAGYOTT` volt, újra foglal.

A HTTP taskok a Flowable beépített HTTP taskját használják (`flowable:type="http"`), a választ JSON-ként mentik folyamatváltozóba, és a gatewayek ezt olvassák. **A HTTP task mezőit (requestUrl, requestHeaders, requestBody, resultVariablePrefix, saveResponseParameters, JSON mentés) ellenőrizd a használt Flowable verzió dokumentációjában.** A HTTP taskok ne legyenek `async`-ok a 3. lépésben, hogy a jóváhagyó hívás szinkron megkapja a foglalás eredményét.

#### Belső motor-végpontok (`/api/legacy/orders/_engine/<action>`)

Csak a Flowable hívja őket, `X-Engine-Key` fejléccel. Ezek „modern”, gépi fogyasztásra szánt JSON-t adnak (`{"ok":true,…}` / `{"ok":false,"reason":"…"}`), mert a gateway-eknek egyértelmű kell. Akciók: `allapot` (frissíti az `orders.state`-et, `process_history` sort ír, `order_events` üzenetet küld), `keszlet_foglalas` (TK → raktári kód a `catalog.products.raktari_kod` alapján, `FOGLAL` parancsok a raktári sorra, poll segéd; részleges siker esetén feloldja a már sikeres foglalásokat), `foglalas_feloldasa`, `szallitas_letrehozasa`, `szallitas_allapot`, `szamlazas` (a számlázó protokollt hívja HTTP-n: `PARTNER|KERES` az adószámmal, majd `SZAMLA|KESZIT`), `storno`, `esemeny`.

#### Régi stílusú homlokzat (`/api/legacy/orders/...`)

Hozzáférés: `X-Legacy-Key` fejléc. Igék az URL-ben, **mindig HTTP 200**, a siker a törzsben. A homlokzat a Flowable REST API-t hívja:

```
GET  /api/legacy/orders/list?state=JOVAHAGYOTT        # orders sémából
GET  /api/legacy/orders/100045                        # törzsadat + aktuális user task neve
GET  /api/legacy/orders/100045/history
GET  /api/legacy/orders/100045/shipping
POST /api/legacy/orders/create   {quoteRef, partnerId, lines:[{productCode, qty, unitPrice}]}
                                 # rendelés rekord + POST runtime/process-instances (businessKey, változók)
POST /api/legacy/orders/100045/approve   # rendeles_jovahagyasa user task complete
POST /api/legacy/orders/100045/fulfil    # kiszallitas_inditasa complete
POST /api/legacy/orders/100045/invoice   # szamla_kiallitasa complete
POST /api/legacy/orders/100045/cancel    # RendelesLemondas üzenet
POST /api/legacy/orders/100045/modify   {lines}
```

Válasz: `{"success":true,"data":{…}}` vagy `{"success":false,"msg":"Keszlet foglalas sikertelen: 4711 (hiany: 3 db)"}` – ékezet nélküli, magyar, nem strukturált szöveg. Ha a kért művelethez tartozó user task nem aktív: `{"success":false,"msg":"Muvelet nem engedelyezett ebben az allapotban"}`.

Flowable REST hívások (a pontos útvonalakat és payloadokat ellenőrizd a Flowable REST API dokumentációjában): folyamat indítása `POST runtime/process-instances`, user task keresése `GET runtime/tasks?processInstanceId=…&taskDefinitionKey=…`, lezárása `POST runtime/tasks/{id}` (`action: complete`), üzenet küldése: execution keresése `messageEventSubscriptionName` alapján, majd `PUT runtime/executions/{id}` (`action: messageEventReceived`).

A Flowable REST API (`http://localhost:8080/flowable-rest/service/`) szándékosan **közvetlenül is elérhető marad** második interfészként; ezt dokumentáld a `legacy-docs/orders.md`-ben.

Szállítás szimuláció: `pg_cron` percenként lépteti a `shipments` állapotát; kb. 15% eséllyel `KESIK` állapotba tesz egy szállítmányt egy időre (kivételkezelés teszteléséhez).

### 5.4 Számlázás – egyedi szöveges protokoll (`POST /api/legacy/billing`, `text/plain`)

Hozzáférés: első sor `AUTH|<kulcs>`, utána egy parancssor (két sor a body-ban). Rossz kulcs: `ERR|E001|AUTH HIBA`.
Formátum: `|` mezőelválasztó, `;` almező-elválasztó, ékezet nélküli NAGYBETŰS szöveg, dátum `YYYY.MM.DD`, összeg vesszős tizedes. Válasz: `OK|…` vagy `ERR|Exxx|SZOVEG`.

```
PARTNER|KERES|<adoszam>                    → OK|VEVO-1023|MINTA KFT|<CIM>
PARTNER|UJ|<adoszam>|<NEV>|<CIM>           → OK|VEVO-1031
DIJBEKERO|KESZIT|<vevo>|<rendeles_ref>|<kelt>|<hatarido_nap>|<tetel>;<db>;<egysegar>|…
SZAMLA|KESZIT|<vevo>|<rendeles_ref>|<kelt>|<hatarido_nap>|<tetel>;<db>;<egysegar>|…
                                           → OK|SZ-2026-000187|38100,00|2026.10.09
SZAMLA|LEKER|<szamlaszam>                  → OK|<szam>|<vevo>|<brutto>|<hatarido>|FIZETVE|N|LEJART|N
SZAMLA|LEJART                              → OK|<db>|<szam>;<vevo>;<brutto>;<hatarido>|…
SZAMLA|FIZETVE|<szamlaszam>|<datum>        → OK
SZAMLA|STORNO|<szamlaszam>                 → OK|SZ-2026-000190
```

Hibakódok: `E001` auth, `E100` ismeretlen parancs, `E101` mezőszám hibás, `E107` vevő nem található, `E108` számla nem található, `E120` dátumformátum hibás, `E200` számlázó szolgáltatás hiba, `E999` belső hiba. ÁFA fix 27%.

Számlázz.hu adapter (`src/legacy/billing/szamlazz.ts`): `SZAMLAZZ_MODE=mock|live`. Mock módban csak DB rekord és `nav_log` sor jön létre. Live módban a Számla Agent XML interfészét hívja (díjbekérő és számla). **Implementálás előtt ellenőrizd a hivatalos Számlázz.hu Agent dokumentációban az aktuális végpontot, XML sémát és mezőneveket**, és ne találgass. Alapértelmezés: `mock`.

Időzített feladat: `pg_cron` naponta `lejart = true` minden lejárt, nem fizetett számlára.

Opcionális (csak ha minden más kész): `scripts/billing-tcp.ts`, ami egy TCP porton (9100) ugyanezt a protokollt fogadja és továbbítja a HTTP végpontra.

### 5.5 Fizetés – REST + webhook (hibrid)

Hozzáférés: `Authorization: Bearer <kulcs>`.

```
POST /api/legacy/payments          {"invoiceRef":"SZ-2026-000187"}   → {id, url, status}
GET  /api/legacy/payments?invoiceRef=SZ-2026-000187               → fizetések listája
GET  /api/legacy/payments?id=<uuid>
```

A link Stripe Checkout Session (teszt mód, HUF). Az összeget a számlázó protokollal (`SZAMLA|LEKER`) kérdezi le, nem a billing táblából. Webhook (`/api/legacy/payments/webhook`): aláírás-ellenőrzés nyers body-val (`await req.text()`), `checkout.session.completed` → `SUCCEEDED`, `SZAMLA|FIZETVE` hívás, `payment_events` üzenet, majd a számlához tartozó rendelés folyamatának `FizetesBeerkezett` Flowable üzenet – a rendelést a `orders.orders.invoice_ref` alapján keresi meg, a `lib/flowable/client.ts`-en keresztül; `checkout.session.expired` és `payment_intent.payment_failed` → `FAILED`/`EXPIRED` + esemény. Fejlesztéshez: `stripe listen --forward-to localhost:3000/api/legacy/payments/webhook` (README-be).

Hibák itt „modern” REST-stílusúak: megfelelő HTTP státuszkód + `{"error":{"type":…,"message":…}}`.

### 5.6 Ügyfélszolgálat – SOAP 1.1 (`POST /api/legacy/support/soap`, `GET …?wsdl`)

Hozzáférés: SOAP Header `<hd:ApiKey>`. Namespace: `urn:helpdesk:v1`. Készíts statikus, valid WSDL-t.
Műveletek: `CreateTicket`, `GetTicket`, `ListTickets`, `UpdateTicketStatus`, `CheckWarranty (OrderNo, ProductCode)`, `StartRMA (TicketId, Type: CSERE|JAVITAS)`.

Garancia: a teljesítés dátuma (a rendelés `SZALLITVA` időpontja, a rendelési homlokzat `/history` végpontján keresztül lekérdezve) + `warranty_months` (a katalógusból). `StartRMA` csere esetén `FOGLAL`, javításnál a beérkezéskor `VISSZARU_BE` parancsot küld a raktárnak.

Hibák SOAP Faultként, szűkszavúan: `<faultcode>soap:Client</faultcode><faultstring>HD-404</faultstring>`. Kódok: `HD-401`, `HD-404`, `HD-409` (rossz állapot), `HD-422` (validáció), `HD-500`. A `CheckWarranty` indoklása csak kód: `W-OK`, `W-EXP`, `W-NOORDER`, `W-NOTDELIVERED`.

## 6. Hozzáférési kulcsok (`.env.local`)

```
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
LEGACY_QUOTE_KEY=
LEGACY_ORDERS_KEY=
LEGACY_BILLING_KEY=
LEGACY_PAYMENTS_KEY=
LEGACY_SUPPORT_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SZAMLAZZ_MODE=mock
SZAMLAZZ_AGENT_KEY=
APP_BASE_URL=http://localhost:3000
ENGINE_CALLBACK_BASE_URL=http://host.docker.internal:3000
LEGACY_ENGINE_KEY=
FLOWABLE_REST_URL=http://localhost:8080/flowable-rest/service
FLOWABLE_REST_USER=
FLOWABLE_REST_PASSWORD=
SUPABASE_POOLER_HOST=
SUPABASE_DB_USER=
SUPABASE_DB_PASSWORD=
```

Készíts `.env.example`-t.

## 7. Seed adat (`supabase/seed.sql`)

Hihető magyar adatok: kb. 30 partner (valószerű, de kitalált cégnevek és formailag érvényes adószámok), 60 kapcsolattartó, 25 deal vegyes szakaszokban, 6 kategória, 40 termék, 4 ügyfélcsoport kedvezményekkel, 40 raktári cikk. Szándékos anomáliák:

- 3 terméknél `raktari_kod` NULL, 2 terméknél a raktári megnevezés eltér a katalógusbelitől
- 4 raktári cikk minimumszint alatt, 2 cikk 0 készlettel
- 2 CRM partner hiányzik a számlázó vevők közül, 1 vevőnél eltérő névírás (pl. „MINTA KFT.” vs „Minta Kft”)
- 8 ajánlat különböző állapotban (köztük 1 jóváhagyásra váró és 1 lejárt), 12 rendelés minden állapotból
- 10 számla, ebből 3 lejárt és nem fizetett
- 5 hibajegy, 1 aktív RMA

## 8. Admin felület (shadcn/ui)

Modulonként külön oldal a bal oldali menüben, mindegyik a saját modul interfészén vagy sémáján keresztül dolgozik. **Ne legyen** egységes ügyfélnézet, globális keresés vagy modulokat összekötő dashboard – ez a „régi” munkamód, ehhez mérjük majd az ágenseket. Oldalanként: lista táblázat szűrővel, részletnézet, a modul fő műveletei gombként (pl. rendelésnél az állapotátmenetek, számlázásnál számla kiállítása). A számlázó oldalon legyen egy „terminál” mező is, ahol nyers protokoll-parancsot lehet beírni és látni a választ. A raktári oldalon látszódjon a sorok tartalma (pgmq metrikák).

## 9. Legacy interfészdokumentáció (`legacy-docs/`)

Modulonként egy markdown fájl, a modul saját stílusában és „korában” megírva (a SOAP-hoz a WSDL is ide kerül). Ezekből fog dolgozni később az MCP szerver fejlesztése, ezért legyenek pontosak: végpontok, üzenetformátumok, hibakódok, példák. Lehetnek kissé hiányosak a stílus kedvéért, de valótlant ne tartalmazzanak.

## 10. Fázisok és elfogadási feltételek

Haladj fázisonként, minden fázis végén futtasd a hozzá tartozó füsttesztet (`scripts/smoke/*.ts`, `tsx`-szel futtatható), és állj meg összefoglalóval, mielőtt a következőbe kezdesz.

1. **Alapok**: migrációk (sémák, táblák, bővítmények, sorok, cron jobok), seed, `lib/supabase/server.ts`, README. ✔ `supabase db reset` hiba nélkül lefut, a seed adatok megvannak.
2. **CRM + katalógus**: jogosultságok, exposed sémák, `price_for`. ✔ curl-lel lekérdezhető egy partner kapcsolattartókkal és egy termék csoportára vonatkozó ára.
3. **Raktár**: worker függvény, DLQ, figyelmeztetések, poll segéd. ✔ `FOGLAL` sikeres és `NOK` ágon is választ ad; hibás üzenet 3 próbálkozás után archívba kerül.
4. **Ajánlatmotor**. ✔ 15% feletti kedvezménynél `accept` → `-32010`; jóváhagyás után `accept` sikeres (a rendelés létrehozása a 7. fázis után tesztelhető végig).
5. **Számlázás (mock)**. ✔ minden protokoll-parancs működik, hibás bemenetre a megfelelő `ERR` kód jön.
6. **Flowable alapok**: `docker-compose.yml`, csatlakozás a Supabase-hez session poolerrel, `lib/flowable/client.ts`, `flowable/deploy.ts`. ✔ a konténer elindul, a táblák a `flowable` sémában vannak, egy próba BPMN telepíthető és elindítható REST-en.
7. **Rendelések: BPMN + motor-végpontok + homlokzat + szállítás szimuláció**. ✔ egy rendelés végigvihető a három user taskon át `SZAMLAZVA`-ig (a számlázó modul mock módban); készlethiánynál a folyamat visszatér jóváhagyásra; lemondás bármely ponton feloldja a foglalást (és számlázott rendelésnél sztornóz); minden állapotváltásról van esemény; a BPMN megnyitható bpmn.io-ban.
8. **Fizetés**. ✔ Stripe CLI-vel szimulált sikeres és sikertelen fizetés helyesen frissíti a számlát és eseményt küld; sikeres fizetés után a rendelés folyamata `LEZART`-ig fut.
9. **Support SOAP**. ✔ a WSDL valid; `CheckWarranty` mindegyik indokkódra van seed-eset; `StartRMA` raktári parancsot küld.
10. **Admin UI** (a rendelés oldalon látszódjon az aktív user task és a folyamattörténet).
11. **legacy-docs + teljes order-to-cash füstteszt** ajánlattól lezárásig.
12. (Opcionális) Számlázz.hu live mód, TCP wrapper.

## 11. Amit NE csinálj

- Ne egységesítsd a modulok interfészét, formátumait, hibáit vagy azonosítóit.
- Ne hívd közvetlenül egy másik modul tábláit a modul TypeScript kódjából.
- Ne építs MCP szervert, ágenst vagy LLM-hívást – az a következő projektfázis.
- A Flowable konténeren kívül ne vezess be más Docker szolgáltatást, külső message brokert vagy második adatbázist.
- Ne írj Java kódot a Flowable-höz (delegate, listener): minden integráció HTTP taskkal és a Flowable REST API-val történjen.
- Ne implementálj saját állapotgépet a rendelésekhez; az állapotátmenetekről a BPMN dönt.
- Ne találgasd a Számlázz.hu, a Stripe vagy a Flowable API részleteit – nézd meg a hivatalos dokumentációt.
