**Téma leírása**

A vállalati szoftverarchitektúrák napjainkban paradigmaváltáson mennek keresztül: a merev, determinisztikus SaaS és ERP integrációk helyét a dinamikus, ágens-alapú (Agentic) orkesztrációs munkafolyamatok veszik át. A modern LLM-ek és ágensek már nem csupán asszisztensi funkciókat látnak el, hanem teljes üzleti folyamatokat képesek önállóan koordinálni.

A vállalatok legnagyobb kihívása azonban a meglévő, heterogén legacy rendszereik (adatbázisok, REST/SOAP API-k, hagyományos BPEL/BPMN folyamatmotorok) biztonságos és hatékony bevonása ebbe az új ökoszisztémába. A modernizáció kulcsa a Model Context Protocol (MCP), amely standard interfészként („USB-portként”) elrejti az alrendszerek komplexitását az ágensek elől, valamint a digitális tranzakciókat és kereskedelmi folyamatokat szabványosító Google Universal Commerce Protocol (UCP).

**A hallgató feladatai lépésről lépésre:**
- A mock legacy vállalati infrastruktúra gyors prototipizálása („vibe coding”):
- Egy működő, realisztikus vállalati mikrokörnyezet felépítése generatív AI eszközökkel (pl. Cursor, Claude Code, GitHub Copilot).

Alrendszerek létrehozása:
  - Adatbázisok és alapvető entitások (termékkatalógus, raktárkészlet, rendelések, partnerek).
  - API végpontok és hagyományos üzleti logikát / folyamatokat leíró engine (pl. BPEL/BPMN munkafolyamat motor).
  - Modulok lefedése: raktárkezelés/logisztika, számlázás és könyvelési modulok, valamint külső fizetési integráció szimulációja (pl. Stripe API).

Ágens-alapú refaktorálás és MCP Server réteg kialakítása:
  - Standardizált MCP (Model Context Protocol) szerverek megtervezése és implementálása a legacy komponensek fölé, amelyek elrejtik a nyers API-kat és közvetlen DB hozzáféréseket.
  - Specializált képességekkel (Skills) felruházott ágensek konfigurálása, amelyek természetes nyelven (pl. chatbottal történő rendelésleadás, státuszlekérdezés, hibakezelés) vezérlik a vállalati folyamatokat.
  - AI Tokenomics mérés és optimalizáció: token-költség és válaszidő monitorozása a végrehajtási ciklusok során.

Google Universal Commerce Protocol (UCP) integráció:
  - A rendszer felkészítése és összekötése az UCP szabvánnyal, megvalósítva az autonóm, platformfüggetlen kereskedelmi és tranzakciós folyamatokat.

Transzformációs metodológia kidolgozása és dokumentálása:
Egy reprodukálható módszertani útmutató összeállítása arról, hogy hagyományos monolit / mikroszerviz alapú vállalati rendszereket milyen lépések mentén érdemes autonóm, MCP-alapú ágens architektúrára átállítani.
---


# Változtatási napló

Ez a rész azt rögzíti, milyen változtatások történtek a projekten, és mi volt az oka. A teljes specifikáció: [docs/LEGACY_CRM_BUILD_SPEC.md](docs/LEGACY_CRM_BUILD_SPEC.md).

## Projekt-előkészítés

- **Tailwind CSS v3 → v4.** A shadcn/ui „radix-nova” stílusa Tailwind v4-es szintaxist generál (`--spacing(3)`, `@theme inline`, `@custom-variant`), amit a v3 nem tud feldolgozni, ezért a dev szerver CSS-hibával leállt. A `tailwind.config.ts` és a `tailwindcss-animate` megszűnt, a PostCSS az `@tailwindcss/postcss` plugint használja, a `globals.css` egyetlen (oklch) színkészletet tartalmaz.
- **`lib/utils.ts`: a `hasEnvVars` export visszaállítva.** A shadcn telepítése felülírta a fájlt, és a starter oldalai erre hivatkoztak, ezért a build elhasalt.
- **`supabase/` mappa (`supabase init` + `link`).** Ez a Supabase CLI projektmappája (migrációk, seed, `config.toml`); nem azonos a `lib/supabase/` kliens kóddal.
- **Mappaszerkezet: maradt a gyökérben lévő `app/` és `lib/`.** A spec `src/` mappát ír, de a projekt a Supabase starterből indult; az átköltöztetés nem hozott volna előnyt.
- **Új nyitó- és admin kezdőoldal a starter checklist helyett.** A modulokat, interfészeiket és a fejlesztési fázisokat mutatja be (`lib/site-content.ts`). Szándékosan nem adatokat összesítő dashboard – a spec szerint a modulok között nem lehet egységes nézet.

## 1. fázis – Alapok

**Adatbázis-szerkezet**
- **Modulonként külön séma és külön migrációs fájl** (`crm`, `catalog`, `quote`, `orders`, `inventory`, `billing`, `payment`, `support`). Így minden modul csak a saját sémáját látja, és a heterogenitás (azonosító-, dátum- és pénzformátum) sémánként megmarad.
- **Saját szekvencia és formázó függvény modulonként** (pl. `quote.next_quote_id()`, `billing.kovetkezo_szamlaszam()`, eltérő nyelvű és stílusú nevekkel). A spec kifejezetten tiltja a közös ID-generátort.
- **Nincs idegen kulcs a modulok között**, csak modulon belül. A modulok a spec szerint csak egymás interfészén keresztül kapcsolódnak.
- **A spec minimum-tábláin felüli mezők**, mert a későbbi fázisok műveletei igénylik: `quote.quotes` – `approval_reason`, `approved_on`, `order_ref`; `quote.quote_lines.line_net`; `billing.szamlak` – `netto`, `afa`, `eredeti_szam`, `sztornozva`; `orders.shipments` – `carrier`, `tracking_no`; `payment.payments.checkout_url`. Az RMA állapotait a spec nem adta meg: `NYITOTT|BEERKEZETT|LEZART`.
- **`flowable` séma üresen, jogosultságok nélkül.** A táblákat a Flowable maga hozza létre.

**Jogosultságok és API-elérés**
- **Minden modulséma exposed a PostgREST-en, de jogot csak a `service_role` kap.** *Eltérés a spectől*, amely szerint csak a `crm` és a `catalog` lenne exposed. Ok: a Next.js szerver a supabase-js kliens `.schema('quote')` hívásával éri el a modulsémákat, ami csak exposed sémán működik. Az `anon` és `authenticated` szerepnek nincs `usage` joga, így kívülről továbbra sem érhetők el.
- **`crm` és `catalog`: egyszerű RLS policy az `authenticated` szerepnek**, a többi sémában RLS bekapcsolva policy nélkül (csak a service role éri el).
- **Dashboard-beállítások (kézzel):** a nyolc modulséma felvéve az Exposed schemas közé; „Expose Queues via PostgREST” bekapcsolva, hogy a későbbi MCP szerver a `pgmq_public` sémán keresztül olvashassa és írhassa a sorokat.
- **Service role kliens: `createServiceClient()` a `lib/supabase/server.ts`-ben**, a starter cookie-alapú kliense mellett, mert azt az auth oldalak használják. Az env változó neve a starter szerinti `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` maradt.

**Üzenetsorok és időzítés**
- **`pgmq` és `pg_cron`, öt sor** (`inventory_commands`, `inventory_replies`, `inventory_alerts`, `order_events`, `payment_events`).
- **Két cron job most:** `billing-lejart` (naponta, lejárt számlák megjelölése) és `orders-szallitas-szimulacio` (percenként, ~15% eséllyel `KESIK`). **Az `inventory-worker` a 3. fázisba került**, mert az általa hívott függvény ott készül el; egy üres stub félrevezető lett volna.

**Seed adatok**
- A spec összes szándékos anomáliája benne van (hiányzó raktári kódok, eltérő megnevezések, minimum alatti és nulla készlet, hiányzó és eltérő nevű számlázó vevők, lejárt számlák).
- **37 raktári cikk a 40 helyett**, mert 3 terméknek a spec szerint nincs raktári kódja.
- **A seedelt rendeléseknek nincs Flowable folyamatpéldányuk** (`process_instance_id` NULL). Történeti adatnak szolgálnak (lista, előzmények, garancia); élő rendelés a homlokzaton keresztül jön létre.
- **Tesztesetek a későbbi fázisokhoz:** inaktív termék (`TK-00033`, `PRODUCT_INACTIVE`); mind a négy `CheckWarranty` indokkódhoz hibajegy (`HJ-000317`–`000320`); a `100045`-ös rendelés partnere nincs a számlázó vevők között, és a papírkészlet nem elég a jóváhagyásához.
- **A seed újrafuttatható:** először kiüríti a modultáblákat és a sorokat, a végén a szekvenciákat a seedelt azonosítók fölé állítja.

## 2. fázis – CRM + katalógus

- **`catalog.price_for(product_code, customer_group)`** – listaár mínusz ügyfélcsoport-kedvezmény. Csak ezt a kedvezményt számolja; a tétel- és mennyiségi kedvezmény a spec szerint az ajánlatmotor TypeScript kódjába kerül.
- **Saját összetett típust ad vissza (`catalog.price_info`)**, így a PostgREST egyetlen objektumot ad tömb helyett, és a paraméternevek (`product_code`, `customer_group`) nem ütköznek a kimeneti mezőkkel.
- **Hibák HTTP-státusszal:** ismeretlen termékkód → 404, ismeretlen ügyfélcsoport → 400 (PostgREST `PTxxx` hibakódok). Inaktív termékre is ad árat, az `active` mező jelzi – így az ajánlatmotor maga dönthet a `PRODUCT_INACTIVE` hibáról.
- **Az `anon` szerep nem futtathatja**, csak az `authenticated` és a `service_role`.
- **A füstteszt csak service role kulccsal fut**; a bejelentkezett felhasználós ág kimaradt, hogy ne jöjjön létre tesztfelhasználó az Auth-ban.

## 3. fázis – Raktár

- **`inventory.process_commands()` worker 5 másodpercenként (pg_cron).** A raktár kívülről csak üzenetsoron érhető el: parancs az `inventory_commands`, válasz az `inventory_replies` sorra, magyar mezőnevekkel és epoch idővel. Parancsonként külön PL/pgSQL függvény (`cmd_foglal`, `cmd_felold`, `cmd_mozgas`, `cmd_lekerdez`, `cmd_visszaru_be`), hogy a logika parancsonként olvasható maradjon.
- **Kétféle hiba, kétféle kezelés.** Az üzleti hibák (`R-01`–`R-04`, és a hiányzó mező / ismeretlen parancs `R-02`-ként) azonnal választ kapnak, és az üzenet törlődik. A váratlan kivétel (pl. `"cikk":"abc"`) nem kap választ és nem törlődik, hanem a 30 mp-es láthatósági idő után újra próbálkozik – így működik a spec szerinti „3 próbálkozás után archívum”.
- **Üzenetenként külön kivételkezelő blokk**, hogy egy hibás üzenet ne görgesse vissza a kötegben vele együtt olvasott többi üzenet feldolgozását.
- **Dead letter: `pgmq.archive`, ha `read_ct > 3`, és ekkor egy `R-99 BELSO HIBA` válasz is kimegy.** Az R-99 válasz saját döntés (a spec nem írja elő): enélkül a hívó soha nem tudná meg, mi lett a parancsával.
- **Minimumkészlet-figyelmeztetés csak az átlépéskor**, amikor a fizikai készlet a minimum alá csökken – nem minden mozgásnál, amíg alatta van, hogy ne árassza el az `inventory_alerts` sort. A foglalás nem csökkenti a fizikai készletet, ezért nem vált ki figyelmeztetést.
- **`MOZGAS KI` csak a szabad készletből és a saját (ref szerinti) foglalásból adhat ki**, a ref-hez tartozó aktív foglalás `KIADVA` lesz. Így egy kiszállítás nem viheti el más rendelés lefoglalt készletét.
- **Az inventory függvények `execute` joga a `public`-tól visszavonva**, csak a `service_role` (és a cron-t futtató `postgres`) hívhatja őket.
- **Poll segéd a rendelésmodulban (`legacy/orders/raktar-hivas.ts`).** Parancsot küld, majd max. ~10 mp-ig fél másodpercenként végigolvassa a válaszsort, és csak a saját `corr`-jához tartozó választ törli. A sort 0 mp-es láthatósági idővel olvassa, hogy a más hívókhoz tartozó válaszokat ne rejtse el előlük. Szándékosan lassú és ügyetlen, ahogy a spec kéri. A supabase klienst paraméterként kapja, így Next.js nélkül (a füsttesztből) is hívható. A support modul a 9. fázisban saját példányt kap – közös modul nincs.
- **`legacy/` a projekt gyökerében**, a `src/` nélküli mappaszerkezethez igazodva.

## 4. fázis – Ajánlatmotor (JSON-RPC 2.0)

- **Egyetlen végpont: `POST /api/legacy/quote-rpc`**, nyolc metódussal (`quote.create`, `addLine`, `calculate`, `requestApproval`, `approve`, `accept`, `get`, `list`). A kulcs a spec szerint legacy módon a `params.apiKey` mezőben érkezik. Hiba esetén is HTTP 200, a hiba a JSON-RPC törzsben van; batch (tömb) kérésre `-32600`, `id` nélküli kérésre (értesítés) HTTP 204, válasz nélkül.
- **Az árazás TypeScriptben, egész számokkal (BigInt, bázispont).** A sorrend: listaár → ügyfélcsoport-kedvezmény → tételkedvezmény → mennyiségi kedvezmény (10 db felett +3%, 50 felett +5%), egymás után szorzatként, a tétel nettó egész forintra kerekítve. Lebegőpontos számítás helyett egész aritmetika, hogy a kerekítés determinisztikus legyen – ellenőrzésként a seedelt `AJ-2026-0041` újraszámolása fillérre ugyanazt adja (2 507 503 Ft, 17,86%).
- **Más modulok csak a saját interfészükön.** A partner ügyfélcsoportja a CRM PostgREST-jéről, a listaár és a csoportkedvezmény a katalógus `price_for` függvényéből jön; a rendelés a rendelésmodul HTTP homlokzatán jön létre (`POST /api/legacy/orders/create`, `X-Legacy-Key`). A homlokzattól elvárt válasz: `{"success":true,"data":{"orderNo":…}}` – ezt a 7. fázisban így kell megvalósítani.
- **A `calculate` 15% felett is sikeres** (`approvalRequired: true`), az `accept` viszont `-32010`-et ad `{discountPct, limit}` adattal, amíg az ajánlat nincs `JOVAHAGYOTT` állapotban. Az `accept` mindig újraszámol friss katalógusárakkal, hogy ne régi összegre jöjjön létre a rendelés.
- **Lusta lejárat:** nincs külön cron; ha egy nyitott ajánlat érvényessége lejárt, az első módosító hívás vagy `accept` `LEJART`-ra állítja és `-32011`-et ad. Ez legacy-szerű viselkedés: a lista addig „nyitottnak” mutathat egy lejárt ajánlatot, amíg valaki hozzá nem nyúl.
- **Ismeretlen ajánlat, partner, sablon vagy termék: `-32602`** (a `data.reason` mezőben `QUOTE_NOT_FOUND`, `PARTNER_NOT_FOUND` stb.), mert a spec nem ad rájuk külön üzleti kódot.
- **`accept` a 7. fázisig `-32603` hibát ad** (`data.reason: ORDER_CREATE_FAILED`), mert a rendelésmodul homlokzata még nem létezik; a kedvezményellenőrzésen már átjut, az ajánlat `JOVAHAGYOTT` marad. A teljes út a 7. fázisban tesztelhető végig.
- **A middleware (`proxy.ts`) nem fut az `/api/legacy/*` útvonalakon.** A Supabase starter middleware-je minden bejelentkezés nélküli kérést a login oldalra irányított volna; a legacy végpontoknak saját, modulonkénti kulcsos hozzáférésük van.
- **`cacheComponents` kikapcsolva a `next.config.ts`-ben.** A starter alapbeállítása nem engedi a route szintű `export const runtime = 'nodejs'`-t, amit a spec minden legacy végpontra előír.
- **`zod` közvetlen függőség lett** (a modul belső paraméter-validációjához); a validációs hibák `-32602`-ként, mezőnkénti üzenettel mennek vissza.

## 5. fázis – Számlázás (szöveges protokoll, PDF bizonylat)

- **Egyedi szöveges protokoll: `POST /api/legacy/billing`, `text/plain`.** Két sor: `AUTH|<kulcs>`, majd egy parancs. `|` mező-, `;` almező-elválasztó, ékezet nélküli nagybetűs szöveg, `YYYY.MM.DD` dátum, vesszős tizedes (`38100,00`). Mindig HTTP 200, a válasz `OK|…` vagy `ERR|Exxx|SZOVEG`. A bejövő ékezetes/kisbetűs szöveget a modul maga alakítja át; escape-elés nincs (egy `|` vagy `;` a mezőben elrontja a parancsot) – legacy-szerűen.
- **A Számlázz.hu integráció helyett a modul maga generál PDF bizonylatot** (*eltérés a spectől*, kérésre). Nincs külső szolgáltatás, API-kulcs és élő/mock mód; a `SZAMLAZZ_MODE` és `SZAMLAZZ_AGENT_KEY` kikerült. A spec 12. fázisának „Számlázz.hu live mód” pontja ezzel megszűnik. A `billing.szamlak.szamlazz_id` oszlop helyére `pdf_utvonal` került.
- **A PDF a kiállításkor készül, és nem íródik felül.** A Supabase Storage privát `szamlak` bucketjébe kerül (`<év>/<sorszám>.pdf`); a bucketet migráció hozza létre. A seedelt számláknak az első lekéréskor készül PDF. Ha kiállításkor a PDF nem sikerül, a számla attól még érvényes (a sorszám már kiosztva, a hívó ne próbálja újra), a PDF-et a következő `SZAMLA|PDF` pótolja – ott jön az `E200`, ha akkor sem megy.
- **Új parancs: `SZAMLA|PDF|<szam>` → `OK|<letöltési link>`**, 1 óráig érvényes signed URL-lel, mert a PDF maga nem fér el a szöveges protokollban.
- **„Mátrixnyomtatós” PDF: ékezet nélküli nagybetűs szöveg, beépített Courier font (`pdf-lib`).** Illeszkedik a modul tárolt adataihoz, és nem kell fontfájlt a repóba tenni (a beépített PDF fontokból hiányzik az ő/ű). A `pdf-lib` a fontjait a csomagban hordozza, így a Next.js bundlerrel sincs gond (a `pdfkit` futásidőben fájlból olvasná őket).
- **Kitalált eladó: „DONKI IRODATECHNIKA KFT”** (egy konstans a `legacy/billing/pdf.ts`-ben), formailag érvényes, de nem létező adószámmal és csupa nulla bankszámlaszámmal; a PDF lábléce jelzi, hogy szimulált bizonylat.
- **Kiállítás és sztornó egy tranzakcióban, PL/pgSQL függvényben** (`billing.szamla_keszit`, `billing.szamla_storno`). A fejléc, a tételek, a sorszám és a NAV-napló sora együtt jön létre; a supabase-js több hívása nem lenne atomi, egy félbeszakadt kérés tétel nélküli számlát vagy kihagyott sorszámot hagyhatna. A függvények saját SQLSTATE-et dobnak (`BL107`, `BL108`), amit a TypeScript `E107`/`E108`-ra fordít.
- **Idempotens parancsok** (a spec nem rendelkezett róluk): `PARTNER|UJ` létező adószámra a meglévő vevőkódot adja; `SZAMLA|FIZETVE` már fizetett számlára `OK`, változtatás nélkül (egy duplán érkező fizetési webhook se okozzon hibát); `SZAMLA|STORNO` már sztornózott számlára a meglévő sztornó számát adja. Díjbekérő nem sztornózható (`E108`).
- **Fizetéskor a `lejart` jelző törlődik**, mert a jelző a „lejárt és nem fizetett” állapotot jelenti; a `SZAMLA|LEJART` a napi cron által beállított jelzőből dolgozik.
- **A szimulált NAV-napló (`nav_log`) megmaradt**, mert az a NAV online számla adatszolgáltatást utánozza, nem a Számlázz.hu-t.

## 6. fázis – Flowable alapok

- **Egyetlen Docker szolgáltatás: `flowable/flowable-rest:7.2.0`.** A spec 7.x verziót kér; ebből ez a legfrissebb (a Docker Hubon már van 8.0.0, de az kívül esik a spec keretén). A verzió rögzítve van, nem `latest`.
- **Adatbázis: a Supabase Postgres `flowable` sémája a session poolerrel (5432).** A felhasználónév `postgres.<projekt-ref>` alakú, mert a Supabase pooler így azonosítja a projektet. A transaction pooler (6543) a Flowable prepared statementjei és hosszú tranzakciói miatt nem használható, a direkt kapcsolat pedig alapból csak IPv6.
- **Háromszoros védelem, hogy a táblák a `flowable` sémába kerüljenek:** `currentSchema=flowable` a JDBC URL-ben, `flowable.database-schema=flowable`, és kapcsolatonként `SET search_path TO flowable` (Hikari `connectionInitSql`). A spec szerint a `database-schema` csak akkor kellene, ha a táblák a `public`-ba kerülnének – de a pooler nem garantáltan adja tovább a `currentSchema` paramétert, és ~60 tábla utólagos kitakarítása a `public`-ból kockázatosabb, mint eleve beállítani. Eredmény: 62 tábla a `flowable` sémában, egy sem máshol.
- **A Flowable kapcsolat-poolja max. 5 kapcsolatra korlátozva** (alapból min. 10, max. 50 lenne), mert az alapérték kimerítené a Supabase pooler kapcsolatkeretét (az adatbázis összesen 60 kapcsolatot enged).
- **A beépített `rest-admin`/`test` felhasználó felülírva** (`flowable.rest.app.admin.user-id` / `password`) a `.env.local`-ból; a Next.js ezzel, Basic auth-tal hívja a motort. A régi páros 401-et kap.
- **A compose a `.env.local`-ból olvassa a változókat** (`--env-file`), hogy ne kelljen egy második `.env` fájlt karbantartani; az indítás npm scriptekbe került.
- **A Flowable REST végpontjait a futó konténer saját OpenAPI leírásából ellenőriztük**, nem a webes dokumentációból, így biztosan a használt 7.2.0 verzióhoz illenek (telepítés, folyamatindítás, feladat-lekérdezés és -lezárás, üzenetküldés).
- **`lib/flowable/client.ts`:** a rendelésmodul és a fizetési webhook közös infrastruktúrája (a spec szerint). Az üzenetküldés `false`-t ad, ha a folyamat éppen nem vár az adott üzenetre – a rendelési homlokzat erre építheti a „Muvelet nem engedelyezett ebben az allapotban” választ.
- **`flowable/deploy.ts`:** a `flowable/processes/*.bpmn20.xml` fájlokat telepíti (vagy a megadottakat). Minden telepítés új definíció-verzió; a futó példányok a saját verziójukon maradnak. A próba BPMN (`flowable/test/`) BPMN DI-t is tartalmaz, hogy bpmn.io-ban megnyitható legyen – ugyanez kell majd a rendelési folyamathoz.

## 7. fázis – Rendelések (BPMN, motor-végpontok, homlokzat, szállítás)

- **Az életciklust a Flowable futtatja (`flowable/processes/rendeles_folyamat.bpmn20.xml`, process key `rendeles_folyamat`, business key a rendelésszám).** Saját állapotgép nincs: a homlokzat csak a megfelelő user taskot zárja le, vagy üzenetet küld, és a BPMN dönt az átmenetről. Az `orders.orders.state` csak denormalizált másolat, amit a folyamat az `allapot` HTTP taskkal frissít.
- **Minden integráció a Flowable beépített HTTP taskjával** (nincs Java delegate/listener). A taskok a Next.js belső motor-végpontjait hívják (`/api/legacy/orders/_engine/<akcio>`, `X-Engine-Key`), a választ JSON-ként folyamatváltozóba mentik, és a gateway-ek abból döntenek (`keszletValasz.get('ok').asBoolean()`). Az `invoiceRef` változót egy kifejezés-alapú service task (`flowable:expression`) menti a számlázás válaszából – ez nem Java kód.
- **A HTTP task mezőneveit a futó konténer `flowable-http-common-7.2.0.jar`-jából olvastuk ki**, és egy próbafolyamattal ellenőriztük a JSON-válasz mentését és a kifejezéseket, mielőtt a teljes folyamat elkészült.
- **Indításkor átadott folyamatváltozók: `orderNo`, `appBaseUrl`, `engineKey`.** Az URL nincs a BPMN-ben (spec), és a motor-kulcs sem; a kulcs így a Flowable REST-en keresztül olvasható, de az is admin-jelszóval védett.
- **A belső végpontok mappája `%5Fengine`**, mert a Next.js az aláhúzással kezdődő mappát privátnak tekinti és kihagyja a routingból; a `%5F` előtag adja a spec szerinti `_engine` URL-t.
- **Váratlan hiba a motor-végpontban → HTTP 500 → a HTTP task elbukik (`failStatusCodes: 4XX, 5XX`) → a Flowable visszagörgeti a tranzakciót.** Így pl. egy sikertelen számlázásnál a folyamat a `szamla_kiallitasa` feladaton marad, és a homlokzat hibát ad; nem keletkezik félkész állapot. Az üzleti kimenet (pl. készlethiány) viszont 200 + `{"ok":false}`, mert arról a BPMN dönt.
- **Készlethiány részletei a folyamattörténetben:** új `detail` oszlop a `process_history`-ban, mert a homlokzat spec szerinti üzenete („Keszlet foglalas sikertelen: 4711 (hiany: 3 db)”) a cikkszámot és a hiányt is tartalmazza. Részleges siker esetén a már sikeres foglalásokat a motor feloldja.
- **A kiszállítás indításakor a lefoglalt készlet kiadásra kerül** (`MOZGAS KI` a foglalás hivatkozásával → `KIADVA`), ugyanúgy, ahogy a seed adatai is mutatják; így a lemondás ezután már nem tud foglalást feloldani, csak sztornózni.
- **A számlázás a számlázó modul szöveges protokollján megy:** `PARTNER|KERES` az adószámmal, és ha a vevő nincs meg (pl. Sopron-Tex), `PARTNER|UJ` a CRM adataival, majd `SZAMLA|KESZIT`. A protokoll nem ismer escape-elést, ezért a mezőkből a `|` és `;` karakter kikerül.
- **Rögzítés és tételcsere tranzakcióban** (`orders.rendeles_rogzit`, `orders.tetelek_csere`). Ha a folyamat indítása nem sikerül, a rendelés törlődik, hogy ne maradjon folyamat nélküli rendelés.
- **Módosítás csak a jóváhagyáson vagy a kiszállítás indításán állva.** `JOVAHAGYOTT` rendelésnél a régi foglalás feloldása, a tételek cseréje és az újrafoglalás; ha az új tételekre nincs készlet, a régi tételek és a régi foglalás visszaáll.
- **Események az `order_events` sorra angol eseménynevekkel:** `ORDER_STATE_CHANGED` minden állapotváltásról, `ORDER_ACTION_FAILED`, `ORDER_MODIFIED`, és `SHIPMENT_DELAYED` – ez utóbbi rendelésenként csak egyszer (a BPMN egy folyamatváltozóval jegyzi meg).
- **A homlokzat válaszmezői a rendelési séma soraival egyeznek (snake_case)**, a `create` viszont `{orderNo, ref}`-et ad, mert az ajánlatmotor ezt a szerződést várja – a modulon belüli következetlenség legacy-szerű.
- **A BPMN-t egy generátor írta a diagram-koordinátákkal együtt**, és a bpmn.io saját parserével (`bpmn-moddle`, dev függőség) ellenőriztük: nincs figyelmeztetés, és mind az 59 elemnek van diagram-alakzata.
- **Ismert tesztmaradvány:** a 100046-os rendelés a folyamat egy korábbi, hibás verzióján fut (rossz fejlécbehúzás a lemondási ágban), ezért nem mondható le; a futó példányok a saját verziójukon maradnak. A seed újratöltése eltünteti.

## 8. fázis – Fizetés (REST + Stripe webhook)

- **„Modern” REST a többi legacy modultól eltérően:** `Authorization: Bearer`, valódi HTTP státuszkódok és `{"error":{"type","message"}}` hibák (401 `authentication_error`, 400 `invalid_request_error`, 404 `not_found`, 409 `invoice_already_paid`, 422 `invalid_amount`, 502 `billing_unavailable`/`stripe_error`). A JSON camelCase, az idő ISO, az összeg fillér (`amountMinor`) – ez is a szándékos heterogenitás része.
- **Stripe Checkout Session, teszt mód, HUF.** A Stripe dokumentációja szerint a HUF terhelésnél kéttizedes pénznem (fillér, `bruttó × 100`), a „100-zal osztható” szabály csak a kifizetésekre (payout) vonatkozik – így a számla bruttója kerekítés nélkül terhelhető. A Stripe minimuma 175 HUF; ez alatt 422. Az API-hívásokat a telepített `stripe` 23.0.0 csomag típusaiból ellenőriztük.
- **Az összeg a számlázó protokollból jön (`SZAMLA|LEKER`), nem a billing táblából** (spec). A „vesszős tizedes” összeget szövegműveletekkel alakítjuk fillérré, lebegőpontos számolás nélkül. Fizetett számlára 409, sztornó (negatív) számlára 422.
- **A fizetés azonosítója metadata-ként a Sessionre és a PaymentIntentre is rákerül** (`paymentId`, `invoiceRef`). A `payment_intent.payment_failed` esemény csak a PaymentIntentet hozza (a Checkout Sessiont nem), ezért a sikertelen fizetést így lehet a saját rekordunkhoz kötni.
- **Webhook: aláírás-ellenőrzés a nyers törzzsel** (`req.text()` + `webhooks.constructEvent`); hamis aláírás → 400. Ismeretlen eseménytípus → 200, figyelmen kívül hagyva.
- **Idempotens, újrapróbálható feldolgozás.** Sikeres fizetésnél előbb a mellékhatások futnak (`SZAMLA|FIZETVE`, a rendelés értesítése), és a státusz csak a végén lesz `SUCCEEDED`. Ha közben hiba van, a webhook 500-at ad, a Stripe újraküldi az eseményt, és minden lépés biztonságosan ismételhető (a `SZAMLA|FIZETVE` fizetett számlára is `OK`). Sikertelen kártya után a státusz `FAILED`, de egy későbbi sikeres próbálkozás ugyanabban a Checkoutban még `SUCCEEDED`-re állíthatja.
- **A rendelést az `orders.orders.invoice_ref` alapján keresi meg, közvetlenül a rendelési sémából** – ezt a spec kifejezetten így írja elő (kivétel a „csak a saját séma” szabály alól). Utána a `lib/flowable/client.ts`-en keresztül `FizetesBeerkezett` üzenetet küld a folyamatnak, ami `LEZART`-ig fut.
- **Események a `payment_events` sorra:** `payment.succeeded` (a rendelésszámmal és azzal, hogy a folyamat fogadta-e az üzenetet), `payment.failed` (a Stripe hibaüzenetével), `payment.expired`.
- **A sikeres és sikertelen fizetést a Stripe CLI szimulálja a saját Checkout Sessionünkön** (tesztkártya: `tok_visa`, illetve `tok_chargeDeclined`, ugyanazzal a megerősítési hívással, amit a CLI `trigger` fixture-jei használnak). A `stripe trigger checkout.session.completed` saját, USD-s sessiont hozna létre, ami nem a mi fizetésünk lenne. Az események a `stripe listen`-en keresztül, valódi aláírással érkeznek.
- **A visszairányítás a nyitóoldalra mutat** (`/?fizetes=sikeres|megszakitva`), mert külön fizetési oldal nincs; a middleware a nyitóoldalt bejelentkezés nélkül is engedi.

## 9. fázis – Ügyfélszolgálat (SOAP 1.1)

- **SOAP 1.1, document/literal, `urn:helpdesk:v1` namespace; statikus, kézzel írt WSDL** (`legacy/support/helpdesk.wsdl`, `GET …/soap?wsdl`). A WSDL validitását egy független SOAP kliens (`soap` npm csomag, dev függőség) igazolja: a füstteszt minden hívást a WSDL-ből generált kliensen keresztül végez.
- **Hozzáférés a SOAP Headerben (`<hd:ApiKey>`), hibák szűkszavú SOAP Faultként** (`faultstring` csak a kód: `HD-401/404/409/422/500`; `HD-500` → `soap:Server`, a többi `soap:Client`). A SOAP 1.1 szabvány szerint a Fault HTTP 500-zal megy. Hibás XML és ismeretlen művelet → `HD-422`.
- **A bejövő XML-t a `fast-xml-parser` dolgozza fel** (spec), namespace-előtagok nélkül és szövegként hagyott értékekkel; a műveletek maguk validálnak. A válasz XML-t egy kis saját szerializáló állítja elő escape-eléssel.
- **Új, hetedik művelet: `ReceiveRMA(RmaId)`** (*eltérés a spec műveletlistájától*). A spec szerint javításnál a `VISSZARU_BE` „a beérkezéskor” megy, de a hat művelet között nem volt beérkezés-lépés. Így a javításos RMA `NYITOTT` → `BEERKEZETT` lesz, és ekkor rögzül a visszáru a raktárban – ez a valódi folyamatot tükrözi, és egy ágens is ki tudja váltani. Cserénél a `StartRMA` azonnal `FOGLAL`-t küld (1 db, a hivatkozás az RMA azonosító); ha nincs készlet → `HD-409`.
- **A `StartRMA` nem ellenőrzi a garanciát**: a döntés a hívóé (ügyintéző vagy ágens), aki előtte meghívhatja a `CheckWarranty`-t. Egy jegyhez egyszerre egy aktív RMA lehet; RMA indításakor az `UJ` jegy `FOLYAMATBAN` lesz.
- **Garancia: a teljesítés ideje a rendelési homlokzat `/history` végpontjából** (a `SZALLITVA` átmenet időpontja), a garanciaidő a katalógus PostgREST-jéből – a spec szerint, a modulok saját interfészén keresztül. `W-NOORDER`, ha a rendelés nem létezik *vagy a termék nem szerepel benne*; `W-NOTDELIVERED`, ha nincs `SZALLITVA` bejegyzés. A lejárat naptári hónapokkal számolódik.
- **Saját raktári poll segéd a support modulban** (a spec szerint modulonként külön, közös modul nélkül): a rendelésmodulétól eltérő stílusban (másodpercenkénti pollozás, eltérő `corr` formátum) – szándékosan két külön, kissé eltérő implementáció.

## 10. fázis – Admin felület

- **Modulonként külön oldal a bal oldali menüben (`app/(admin)/…`, URL: `/crm`, `/catalog`, `/quotes`, `/orders`, `/inventory`, `/billing`, `/payments`, `/support`), szándékosan egységes ügyfélnézet, globális keresés és modulokat összekötő dashboard nélkül** – ez a „régi” munkamód, amihez a későbbi ágenseket mérjük. Az áttekintő `/protected` oldal is az admin elrendezésbe került (oldalmenüvel), a modulkártyák az oldalakra linkelnek. Minden oldal csak bejelentkezve érhető el (middleware).
- **Minden oldal a saját modulja interfészén vagy sémáján dolgozik, a modul saját formátumában.** Nincs közös adat-réteg: a partnert az ajánlatnál és a rendelésnél UUID-ként kell kezelni (a CRM oldalon látszik), a raktár epoch időt, a számlázás `YYYY.MM.DD`-t és `38100,00`-t, a fizetés fillért mutat. Ez kényelmetlen – szándékosan.
  - **CRM és katalógus:** a bejelentkezett felhasználó munkamenetével, a valódi PostgREST interfészen és RLS-en keresztül olvas és ír (a csoportárakat a `price_for` adja).
  - **Ajánlatok:** olvasás és írás is a JSON-RPC interfészen (`quote.list/get/create/addLine/calculate/requestApproval/approve/accept`).
  - **Rendelések:** teljesen a régi stílusú homlokzaton; a részletnézet mutatja az **aktív user taskot** (a gomb kiemelve) és a **folyamattörténetet**, valamint a szállítást.
  - **Raktár:** a cikkek a sémából, a `LEKERDEZ`/`MOZGAS` parancsok a valódi sorra mennek. A **sorpanel** mutatja az öt sor hosszát, a legrégebbi üzenet korát és az archív (DLQ) üzeneteket, és bele lehet nézni a sorokba.
  - **Számlázás:** a lista a sémából, az írás (fizetve, sztornó) és a PDF a szöveges protokollon. A **terminál** mezőbe nyers protokoll-parancsot lehet írni; az `AUTH` sort a szerver teszi elé, így a kulcs nem kerül a böngészőbe.
  - **Fizetés:** fizetési link a REST interfészen (Stripe Checkout, teszt kártya), a részletek a REST `GET ?id`-vel.
  - **Ügyfélszolgálat:** olvasás és írás is SOAP-on (`ListTickets`, `GetTicket`, `CreateTicket`, `UpdateTicketStatus`, `CheckWarranty`, `StartRMA`, `ReceiveRMA`); a hibák a SOAP Fault kódjával jelennek meg.
- **Új migráció a sorpanelhez (`inventory.sor_metrikak`, `inventory.sor_tartalom`).** A sorok tartalmát nem lehet a `pgmq.read`-del megnézni, mert az olvasás növeli a `read_ct`-t – az `inventory_commands` sornál egy egyszerű betekintés így dead letterbe juttathatna egy üzenetet. A függvények csak olvassák a sortáblákat, és csak a service role hívhatja őket.
- **A kulcsok csak a szerveren vannak.** Az írások server actionökön keresztül, a modulok legacy végpontjain mennek; az interfész-kliensek a `server-only` csomaggal vannak megjelölve, így nem kerülhetnek kliens oldali kódba.
- **Közös UI-elemek (`components/admin/`)** – oldalfejléc, szűrő, műveleti űrlap toast-visszajelzéssel – csak megjelenítési szinten közösek; a modulok szerződéseihez (formátum, hiba, azonosító) nem nyúlnak. Új shadcn komponensek: `sidebar`, `table`, `tabs`, `textarea`, `separator`, `sonner`.

## 11. fázis – Legacy dokumentáció és order-to-cash füstteszt

- **`legacy-docs/`: modulonként egy interfészleírás, mindegyik a modul saját stílusában és „korában”**, mert ebből fog dolgozni a későbbi MCP szerver fejlesztése – és egy valódi legacy környezetben a dokumentáció is ilyen vegyes. A számlázó protokoll egy régi, ékezet nélküli protokoll-specifikáció; a raktár egy szűkszavú üzenetformátum-leírás; a rendelések egy belső wiki oldal; az ajánlatmotor egy JSON-RPC referencia; a CRM/katalógus egy rövid PostgREST-leírás; a fizetés egy angol nyelvű, „modern” API-dokumentáció; az ügyfélszolgálat egy formális integrációs specifikáció a WSDL-lel együtt.
- **A tartalom pontos: minden állítás a kódból ellenőrizve, a példák a seed valódi adatai** (pl. `PARTNER|KERES|27346178-2-41` → `DUNA-IRODAHAZ KFT.`, `price_for` TK-00008 KIEMELT → 272 506 Ft). A hibaüzenetek szó szerint a kódból kerültek át, a Flowable REST példák élőben ellenőrizve. A stílus kedvéért egyes részek szűkszavúbbak, de valótlant nem tartalmaznak.
- **A rendelési leírás dokumentálja a Flowable REST API közvetlen elérését is** (spec): a folyamat kulcsait, user taskjait, üzeneteit és változóit, valamint figyelmeztet, hogy a közvetlen hívás megkerüli a homlokzat ellenőrzéseit.
- **Teljes order-to-cash füstteszt (`scripts/smoke/11-order-to-cash.ts`):** egyetlen rendelés halad át az összes modulon, mindegyik a saját interfészén – ajánlat 15% feletti kedvezménnyel és jóváhagyással (JSON-RPC) → rendelés, készletfoglalás, szállításkövetés (homlokzat, BPMN, pgmq) → számla és PDF (szöveges protokoll) → Stripe fizetés és webhook (REST) → lezárás → hibajegy és garancia (SOAP), végül a folyamattörténet és az események ellenőrzése. 18 ellenőrzés, kb. 100 mp.
