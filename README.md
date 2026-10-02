Téma leírása
A vállalati szoftverarchitektúrák napjainkban paradigmaváltáson mennek keresztül: a merev, determinisztikus SaaS és ERP integrációk helyét a dinamikus, ágens-alapú (Agentic) orkesztrációs munkafolyamatok veszik át. A modern LLM-ek és ágensek már nem csupán asszisztensi funkciókat látnak el, hanem teljes üzleti folyamatokat képesek önállóan koordinálni.
A vállalatok legnagyobb kihívása azonban a meglévő, heterogén legacy rendszereik (adatbázisok, REST/SOAP API-k, hagyományos BPEL/BPMN folyamatmotorok) biztonságos és hatékony bevonása ebbe az új ökoszisztémába. A modernizáció kulcsa a Model Context Protocol (MCP), amely standard interfészként („USB-portként”) elrejti az alrendszerek komplexitását az ágensek elől, valamint a digitális tranzakciókat és kereskedelmi folyamatokat szabványosító Google Universal Commerce Protocol (UCP).
A hallgató feladatai lépésről lépésre:
A mock legacy vállalati infrastruktúra gyors prototipizálása („vibe coding”):
Egy működő, realisztikus vállalati mikrokörnyezet felépítése generatív AI eszközökkel (pl. Cursor, Claude Code, GitHub Copilot).
Alrendszerek létrehozása:
Adatbázisok és alapvető entitások (termékkatalógus, raktárkészlet, rendelések, partnerek).
API végpontok és hagyományos üzleti logikát / folyamatokat leíró engine (pl. BPEL/BPMN munkafolyamat motor).
Modulok lefedése: raktárkezelés/logisztika, számlázás és könyvelési modulok, valamint külső fizetési integráció szimulációja (pl. Stripe API).
Ágens-alapú refaktorálás és MCP Server réteg kialakítása:
Standardizált MCP (Model Context Protocol) szerverek megtervezése és implementálása a legacy komponensek fölé, amelyek elrejtik a nyers API-kat és közvetlen DB hozzáféréseket.
Specializált képességekkel (Skills) felruházott ágensek konfigurálása, amelyek természetes nyelven (pl. chatbottal történő rendelésleadás, státuszlekérdezés, hibakezelés) vezérlik a vállalati folyamatokat.
AI Tokenomics mérés és optimalizáció: token-költség és válaszidő monitorozása a végrehajtási ciklusok során.
Google Universal Commerce Protocol (UCP) integráció:
A rendszer felkészítése és összekötése az UCP szabvánnyal, megvalósítva az autonóm, platformfüggetlen kereskedelmi és tranzakciós folyamatokat.
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
