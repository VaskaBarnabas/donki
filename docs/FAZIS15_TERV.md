# 15. fázis – Független rendszerek: külön konténer, külön adatbázis, a Supabase csak a felhasználóké (terv, 2. változat)

*Állapot: kész – a teljes tesztsor (01–11, 13–15; 428 ellenőrzés) zöld a konténeres rendszeren · előzmény: 13–14. fázis (MCP réteg, kész) · utána: 16. fázis – portál (irányítópult + integrációs varázsló), 17. fázis – ágensek (gemma4:12b)*

## 1. Az elképzelés és a cél

Egy valódi vállalatnál **minden rendszernek saját adatbázisa van**, és más-más gépen fut. Közös csak a **felhasználókezelés** (egy központi bejelentkezés, SSO), az adatokat pedig egy portál vagy integrációs réteg gyűjti össze a rendszerek interfészein. Ezt szimuláljuk:

| Mi | Hol lesz |
|---|---|
| A 6 vállalati rendszer (CRM és katalógus, ajánlat, rendelés, raktár, számlázó, fizetés, helpdesk) | **rendszerenként saját konténercsoport, saját adatbázissal** |
| Felhasználók és bejelentkezés | **Supabase** (Auth + egy `profiles` tábla a szerepkörrel) |
| Összefogó felület | a **portál**: irányítópult, rendszerek ki- és bekapcsolása, integrációk (a felület maga a 16. fázis) |
| MCP réteg | saját konténerek és saját kis adatbázis (napló, idempotencia) |
| Ágens-modell | natív Ollama a gépen (17. fázis) |

**A fázis két részre bomlik**, hogy egyszerre egy dolog változzon:
- **15. fázis (ez a terv):** az infrastruktúra.
  - Minden rendszer külön konténerben, külön adatbázissal fut, és egyenként ki- és bekapcsolható.
  - A Supabase-ben csak a felhasználók maradnak.
  - A meglévő admin oldalak és mind a 14 füstteszt ugyanúgy működik.
  - Elkészül a vezérlő API (állapot, ki/be, napló), amire a portál épül.
- **16. fázis (külön terv, a 15. után):** a portál felülete.
  - Irányítópult, amely a rendszerekből lekért adatokat összefogja.
  - Rendszerek oldal ki/be kapcsolóval.
  - **Integrációs varázsló:** első belépéskor a felhasználó „beköti” a rendszereket (cím, hozzáférés, kapcsolat tesztelése). Amíg egy rendszer nincs bekötve, vagy le van kapcsolva, a portál ezt jelzi, és nem omlik össze.

## 2. Rendszerek és konténerek

Egy „rendszer” egy **konténercsoport**: az adatbázisa és a szolgáltatása(i). A ki- és bekapcsolás rendszerenként történik, vagyis a csoport összes konténerére.

| Rendszer | Konténerek | Kifelé látható interfész (változatlan) | Port |
|---|---|---|---|
| **CRM és katalógus** | `crm-db` (Postgres), `crm-api` (PostgREST) | PostgREST (`crm`, `catalog` séma, `price_for`) | 4100 |
| **Ajánlatkezelő** | `quote-db`, `quote-rest` (belső), `quote` (Node) | JSON-RPC | 4101 |
| **Rendeléskezelő** | `orders-db` (+ a Flowable adatbázisa), `orders-rest` (belső), `orders` (Node: homlokzat, motor-végpontok, fuvarozó-szimuláció), `flowable` | régi HTTP homlokzat | 4102 |
| **Raktár** | `inventory-db` (Postgres **+ pgmq**), `inventory-api` (PostgREST: csak az üzenetsor), `inventory-worker` (Node) | **csak üzenetsor**, ahogy a leírása mondja | 4106 |
| **Számlázó** | `billing-db`, `billing-rest` (belső), `billing` (Node, saját PDF-tárhely kötettel) | szöveges protokoll | 4103 |
| **Fizetés** | `payments-db` (+ pgmq a `payment_events`-hez), `payments-rest` (belső), `payments` (Node) | REST + Stripe webhook | 4104 |
| **Helpdesk** | `support-db`, `support-rest` (belső), `support` (Node) | SOAP | 4105 |
| **Portál** | `portal` (Next.js), `docker-proxy` | – | 3000 |
| **MCP réteg** | `mcp-db`, `mcp-rest` (belső), `mcp-sales` … `mcp-support` | MCP (Streamable HTTP) | 3201–3205 |
| *(opcionális)* | `stripe-cli` (webhook-továbbító) | – | – |

**Miért van rendszerenként egy belső PostgREST is:** a modulok kódja ma a Supabase klienssel (PostgREST-en) éri el az adatait. Ha minden rendszer mellé saját PostgREST kerül, ez a kód szinte változatlan maradhat (`createServiceClient()` → a rendszer saját adatkliense). Ezek a belső PostgREST-ek **kifelé nem látszanak**. Kivétel a CRM és a raktár: náluk a PostgREST maga a hivatalos interfész, ahogy eddig is.

**Az üzenetsorok tulajdonosa:** a sor annak a rendszernek a része, amelyé az esemény.
- Az `inventory_commands` / `replies` / `alerts` a raktáré: aki a raktárral beszél, az a raktár sorára ír.
- Az `order_events` a rendeléskezelőé.
- A `payment_events` a fizetésé.

Nincs közös központi adatbázis.

**Heterogenitás (opcionális, olcsó):** a rendszerek eltérő Postgres-verziókon futhatnak, pl. a számlázó régebbin, a helpdesk újabbon, a valóságot utánozva. A pgmq-t igénylő rendszerek azon a verzión futnak, amelyhez van pgmq-képünk. A pontos képet a megvalósításkor ellenőrzöm.

Konténerszám: kb. 25, becsült memória **~2,5–3 GB**. A Postgres-ek kis beállításokkal futnak (`shared_buffers` 32–64 MB). Ehhez jön a 17. fázisban a natív `gemma4:12b` (~8–10 GB). 24 GB RAM mellett elfér; a Docker virtuális gépnek 6–8 GB keretet javaslok.

## 3. Ami a modulok kódjában változik

| Változás | Miért |
|---|---|
| A legacy végpontok kiköltöznek a Next.js-ből egy `services/<rendszer>/` mappába. Egy közös, kis HTTP-hosztoló a meglévő route handlereket (web `Request` → `Response`) a Node `http` szerverén futtatja. | A handlerek kódja így alig változik. A portál csak felület lesz. |
| `createServiceClient()` helyett **rendszerenként saját adatkliens**, amely a rendszer saját belső PostgREST-jére mutat (`@supabase/postgrest-js`, a Supabase kliens része). Minden rendszer a saját JWT-titkával dolgozik. | Saját adatbázis, saját kulcs |
| Más rendszer elérése **csak a hivatalos interfészen**: CRM/katalógus a `crm-api` PostgREST-jén, raktár az `inventory-api` során, a többi a saját protokollján, rendszerenkénti címmel (`ORDERS_URL`, `BILLING_URL` …) a közös `APP_BASE_URL` helyett | Független rendszerek |
| **Két meglévő függetlenségsértés megszűnik:** a fizetés ma (1) közvetlenül olvassa a rendelési adatbázist, és (2) közvetlenül a rendelési Flowable-nek üzen. Helyettük egy új homlokzati ige jön: `POST /api/legacy/orders/payment-received {invoiceRef}`. | Egyik rendszer sem nyúl bele a másik adatbázisába vagy belső motorjába |
| **A pg_cron jobok a rendszerek saját konténerébe költöznek:** a raktári worker → `inventory-worker` (5 mp); a fuvarozó-szimuláció → `orders`; az éjszakai lejárat-jelölés → `billing`. Mindegyik ugyanazt a meglévő SQL-függvényt hívja. | Ha egy rendszer ki van kapcsolva, a háttérmunkája is áll, ahogy a valóságban |
| **PDF-tárolás:** a Supabase Storage helyett a számlázó saját kötete. Az 1 órás aláírt linket a számlázó maga adja ki (HMAC-token, `GET /api/legacy/billing/pdf/<szám>?token=…`). | A Supabase csak a felhasználóké |
| A Supabase-specifikus `pgmq_public` burkoló függvények (send, read, delete) a raktár és a fizetés adatbázisában újra létrejönnek, ugyanazzal a névvel | A sorokat használó kód (rendelés, helpdesk, MCP) változatlan marad, csak a címe változik |
| A CRM- és katalógusoldalak ma a bejelentkezett felhasználó Supabase-munkamenetével olvasnak (RLS). Ezentúl **a portál szervere** kérdezi a CRM-et a saját hozzáférésével, miután ellenőrizte a felhasználót (backend-for-frontend). | A CRM nem a Supabase-ben van többé |
| **`GET /health` minden rendszeren:** `{status, system, version, uptimeS, checks: {db, …}}` | Az irányítópult és a tesztek ebből látják az állapotot |
| A Flowable a rendeléskezelő adatbázisában (külön `flowable` adatbázis), a visszahívás `http://orders:4102` | A folyamatmotor a rendeléskezelő része |
| Az MCP szerverek: a napló és az idempotencia az `mcp-db`-be kerül; a törzsadat (`torzsadat.ts`) a CRM PostgREST-jét és a raktár sorát hívja | Az MCP réteg is független rendszer |

**A modulok viselkedése, protokolljai és hibaformái nem változnak.** A heterogenitás megmarad.

## 4. Adatbázisok és adatok

- **Minden rendszer a saját adatbázisát** a saját migrációiból és a seed saját szakaszából építi fel, induláskor. A Postgres `docker-entrypoint-initdb.d` mechanizmusával, egy `systems/<rendszer>/db/` mappából.
  - A meglévő migrációk és a seed **már most modulonként tagoltak**, ezeket osztom szét.
  - A sémanevek maradnak (`billing.szamlak` stb.), így a kód és a dokumentáció nem változik.
- **Friss seed, nem adatmásolás.** A rendszerek a seed állapotából indulnak. A Supabase-ben lévő teszt-előzmények (rendelések, számlák a tesztfutásokból) nem költöznek át. Így a rendszer reprodukálható, és a bemutató tiszta állapotból indul.
- **Az adatok kötetekben vannak**, így megmaradnak a konténer leállítása vagy újraindítása után. `npm run stack:reset` mindent visszaállít a seedre.
- **Supabase:**
  - marad: Auth, plus új `public.profiles` (felhasználó → a hat szerepkör egyike, megjelenített név) és egy jövőbeli `public.integrations` tábla a 16. fázis integrációs varázslójához (az ott megadott hozzáférési adatok titkosítva);
  - a modulsémák **törlése a Supabase-ből csak a legvégén történik, a te kifejezett jóváhagyásoddal**, miután minden teszt zöld a konténeres rendszeren. Addig érintetlenek maradnak, visszaút gyanánt.

## 5. Vezérlés: ki- és bekapcsolás (amire a 16. fázis portálja épül)

- **A portál szerveroldalán egy vezérlő API:** rendszerlista, állapot (konténerenként: fut, leállt, egészség, üzemidő, memória/CPU), indítás, leállítás, újraindítás és az utolsó naplósorok, rendszerenként.
- **A rendszerek címkékkel vannak jelölve a compose fájlban** (`donki.system=billing`, `donki.system.name="Számlázó"`, `donki.system.kind=legacy`). A „számlázó leállítása” így a csoport összes konténerét jelenti.
- **A Docker API-t a portál nem közvetlenül éri el, hanem egy `docker-socket-proxy`-n át**, mert a socket a gépen root-jogot jelent. Csak a konténerlista, -állapot, -statisztika, -napló és a start/stop/restart engedélyezett. A portál ezen felül csak a `donki.system` címkés konténereken enged műveletet, és a saját magát (portál, proxy) nem engedi leállítani.
- **A vezérlő API csak bejelentkezve, `admin` szerepkörrel hívható.** A szerepkört a Supabase `profiles` adja.
- **Ebben a fázisban a vezérlés API-ként és egy egyszerű, ideiglenes állapotoldalként készül el.** A teljes felület a 16. fázisban jön.

## 6. Működtetés

| Parancs | Mit csinál |
|---|---|
| `npm run stack:up` | `docker compose up -d --build` – minden rendszer |
| `npm run stack:down` / `stack:logs` / `stack:reset` | leállítás / napló / visszaállítás a seedre (kötetek törlése) |
| `docker compose stop billing billing-db billing-rest` | egy rendszer kézi leállítása (a portálon egy gombbal lesz) |
| `npm run dev` | a portál natívan, hot reload-dal (a rendszerek konténerben) |
| `docker compose --profile stripe up -d` | + webhook-továbbító a fizetési rendszerhez |

**Csak a portál és az MCP portok** vannak a gépre kivezetve (`127.0.0.1`). A legacy interfészek is (a füsttesztekhez és a kézi kipróbáláshoz), szintén csak a `127.0.0.1`-re. A belső PostgREST-ek és az adatbázisok **nincsenek kivezetve**. Kivétel egy-egy fejlesztői port az adatbázisokhoz, ha a tesztek közvetlen ellenőrzést igényelnek: a megvalósításkor a minimumra csökkentem.

## 7. Tesztelés

- **A meglévő 01–14. füsttesztek átállnak a konténeres rendszerre.** A közvetlen adatbázis-ellenőrzéseik (pl. „a raktárban 12 db lefoglalva”) az adott rendszer saját adatkliensével mennek. **Mind zöld kell legyen.** Ez a bizonyíték, hogy a szétválasztás semmit nem rontott el. A 08 és a 11 a stripe profillal fut.
- **Új `15-rendszerek.ts`:**
  - minden rendszer `/health` → `ok`, a saját adatbázisával;
  - **függetlenség:**
    - a fizetési rendszer adatbázisában nincs `orders` séma;
    - a `quote` konténer környezetében nincs számlázó kulcs;
    - a számlázó képében nincs rendelési kód;
  - **ki/be kapcsolás a vezérlő API-n:**
    1. leállított számlázónál a homlokzat díjbekérő-kiállítása hibát ad;
    2. az MCP `get_document` hívása `UPSTREAM_UNAVAILABLE`, `retryable: true` hibát ad;
    3. a portál állapot-API-ja „leállt” állapotot mutat;
    4. visszakapcsolás után minden zöld;
  - leállított raktár-worker mellett a jóváhagyás időtúllépéssel elbukik, majd a worker visszakapcsolása után a sorban várakozó parancsok feldolgozódnak;
  - jogosultság: a vezérlő API `admin` nélkül 403-at ad, és a portál saját konténerét nem engedi leállítani.
- **Ellenőrzés a Supabase-ben:** a teszt végén a Supabase-ben nem keletkezett új modulsor (a régi sémák érintetlenek).

## 8. Dokumentáció

- README-napló;
- a `docs/CLAUDE.md` Parancsok és Állapot része;
- `BEMUTATO.md`: új architektúra-ábra, és bemutató-lépésként „egy rendszer kikapcsolása élőben”;
- `legacy-docs/`: minden leírásban az új cím; az `orders.md` új igével; a `raktar.md` a saját PostgREST-tel; a `szamlazo-protokoll.md` az új PDF-linkkel;
- `.env.example`: rendszerenkénti címek és kulcsok, `DOCKER_PROXY_URL`;
- `mcp/README.md`;
- `docs/MCP_AGENS_TERV.md`: fázisszámozás (portál = 16., ágensek = 17.).

## 9. Kockázatok

| Kockázat | Kezelés |
|---|---|
| Nagy átalakítás, sok mozgó rész | Lépésenként haladok, minden lépés után a megfelelő teszttel: (1) hosztoló és egy rendszer (számlázó); (2) a többi rendszer; (3) MCP; (4) portál BFF; (5) vezérlés; (6) a teljes tesztsor |
| A pgmq kép és a `pgmq_public` burkolók egyezése | A Supabase által használt függvény-aláírásokat a migrációból és a hívásokból veszem; a 03-as raktárteszt (DLQ is) igazolja |
| A Flowable új adatbázisa üres, a futó folyamatpéldányok elvesznek | Elfogadható: a seedelt rendeléseknek nincs folyamatuk, a BPMN-t induláskor automatikusan telepítjük (`flowable-deploy` init lépés) |
| A Supabase Auth felhasználói és a szerepkörök | Egy migráció létrehozza a `profiles` táblát, és a meglévő felhasználó(ka)t `admin`-ra állítja. A szerepkört csak service role írhatja. |
| Memória | A Postgres-ek kis beállításokkal futnak, a nem használt rendszer kikapcsolható. A mért értéket a README-be írom. |
| A Stripe webhook-titok a konténeres `stripe listen`-nél | A 14. fázisban a kulccsal indított `listen` ugyanazt a titkot adta. Ha eltér, a 08-as teszt jelzi. |

## 10. Nyitott kérdések

1. **Kétlépcsős megvalósítás:** előbb az infrastruktúra (15.), utána a portál felülete az integrációs varázslóval (16.), és csak azután az ágensek (17.). Jó így? Javaslatom: **igen**. Így a portál már valódi, független rendszereket köt be.
2. **Hol tárolja a portál az integrációs beállításokat** (melyik rendszer milyen címen, milyen kulccsal van bekötve)? Javaslatom: a **Supabase-ben, a felhasználók mellett**, titkosítva, mert ez a portál saját adata, nem egy vállalati rendszeré. Alternatíva: egy külön `portal-db` konténer, ha a Supabase-ben szigorúan csak a felhasználók lehetnek.
3. **Eltérő Postgres-verziók a rendszereknél** (a heterogenitás kedvéért)? Javaslatom: **igen**, ahol a pgmq nem köt meg.
4. **A Supabase régi modulsémáinak törlése a végén:** külön jóváhagyással, a sikeres teszt után. Ez így jó?

### Döntések (jóváhagyáskor)

- A **Stripe és a Számlázz.hu külső SaaS**, konténer nélkül. A saját **számlázó** (szöveges protokoll, díjbekérő, vevőtörzs) és **fizetési** (REST, fizetésnyilvántartás, webhook) kódunk viszont **vékony csatoló rendszerként külön konténerben** fut, saját adatbázissal, egyenként ki- és bekapcsolhatóan.
- Kétlépcsős megvalósítás: 15. infrastruktúra, 16. portál, 17. ágensek.
- Az integrációs beállítások a Supabase-ben lesznek (16. fázis), titkosítva.
- Eltérő Postgres-verziók, ahol a pgmq nem köt meg.
- A régi modulsémák törlése a Supabase-ből: a végén, külön jóváhagyással.
