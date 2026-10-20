# MCP réteg és ágensek – megvalósítási terv

*Állapot: terv, jóváhagyásra vár · 2026. október*

## 1. Cél és a kísérleti kérdés

A legacy rendszer (8 modul, 6 különböző protokoll) fölé két új réteg kerül:

1. **Standardizált MCP szerverek.** Elrejtik a nyers interfészeket: JSON-RPC, szöveges protokoll, SOAP, régi HTTP homlokzat, üzenetsor, PostgREST, Flowable. Egységes üzleti fogalmakat, formátumokat és hibakezelést adnak.
2. **Specializált ágensek Skillekkel.** Természetes nyelven vezérlik a vállalati folyamatokat: rendelésleadás chatben, státuszlekérdezés, kivétel- és hibakezelés.

A szakdolgozat mérhető kérdése:

> Mennyivel hatékonyabb (sikerességi arány, token-költség, válaszidő, lépésszám) egy ágens, ha a legacy rendszert **standardizált MCP rétegen** keresztül éri el, mint ha **közvetlenül a nyers legacy interfészeket** kapja meg (a `legacy-docs/` dokumentációval)? És mindkettő hogyan viszonyul a **„régi” munkamódhoz** (ember az admin felületen)?

Ezért a terv egy összehasonlítható alapvonalat is tartalmaz: egy „nyers” ágenst, amely ugyanazokat a feladatokat a legacy végpontokon próbálja megoldani.

## 2. Architektúra

```
┌──────────────────────────────────────────────────────────────────────┐
│ Felhasználói felületek                                                │
│  • Chat az admin felületen (/asszisztens)  • Claude Desktop / Code   │
└───────────────┬──────────────────────────────────────────────────────┘
                │ (üzenetek, stream, jóváhagyás kérések)
┌───────────────▼──────────────────────────────────────────────────────┐
│ Ágens réteg (Node, a Next.js mellett)                                │
│  Front-desk ágens ──► alágensek: Értékesítés · Rendelés-státusz ·     │
│                       Kivételkezelő (háttér) · Ügyfélszolgálat        │
│  Skillek (SKILL.md): üzleti eljárások, szabályok, példák              │
│  Hookok: jóváhagyás (human-in-the-loop), naplózás, költségmérés       │
└───────────────┬──────────────────────────────────────────────────────┘
                │ MCP (Streamable HTTP; fejlesztéshez stdio is)
┌───────────────▼──────────────────────────────────────────────────────┐
│ MCP réteg – 5 domain szerver, közös kanonikus modellel               │
│  sales (CRM+katalógus+ajánlat) · orders · inventory · finance ·       │
│  support                                                              │
│  belül modulonként „anti-corruption” adapter a legacy interfészre     │
└───────────────┬──────────────────────────────────────────────────────┘
                │ a legacy modulok SAJÁT interfészei (változatlanul)
┌───────────────▼──────────────────────────────────────────────────────┐
│ Legacy rendszer: PostgREST · JSON-RPC · HTTP homlokzat + Flowable ·   │
│ pgmq · szöveges protokoll · REST + Stripe · SOAP                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Elvek:**
- **A legacy rendszer nem változik.** Az MCP réteg ugyanazokon a nyilvános interfészeken dolgozik, mint eddig a modulok egymás között. Közvetlen DB-hozzáférése nincs; kivétel csak ott, ahol a legacy rendszer maga is így működik (pl. pgmq sorok).
- **Az ágens nem lát nyers API-t, kulcsot vagy SQL-t.** Csak üzleti eszközöket hív (pl. `orders.get_status`, `quotes.create`).
- **A heterogenitás az MCP rétegben oldódik fel, nem a legacy rendszerben.** Ez a szakdolgozat transzformációs módszertanának lényege: az MCP réteg egy „anti-corruption layer”.

## 3. MCP réteg – tervezés

### 3.1 Szerverek felosztása: domainenként, nem modulonként

| MCP szerver | Legacy modulok mögötte | Miért egy szerver |
|---|---|---|
| `sales` | CRM (PostgREST), katalógus (PostgREST), ajánlatmotor (JSON-RPC) | Az ajánlatkészítéshez együtt kell a vevő, a termék és az ár |
| `orders` | rendelési homlokzat + Flowable | A rendelés életciklusa |
| `inventory` | raktár (pgmq) + katalógus (cikk ↔ termékkód) | A készletet a termékkódon kell kérdezni, nem cikkszámon |
| `finance` | számlázás (szöveges protokoll), fizetés (REST) | A díjbekérő, a számla és a fizetés együtt értelmes |
| `support` | ügyfélszolgálat (SOAP), rendelési homlokzat (garancia) | Hibajegy, garancia, RMA |

Öt kisebb szerver jobb egy óriásnál. Az ágensek csak azokat kapják meg, amelyek a feladatukhoz kellenek, és ez kevesebb eszközleírást, kevesebb tokent és kevesebb rossz eszközválasztást jelent. Nyolc, modulonkénti szerver pedig a legacy szerkezetet tükrözné, nem az üzleti folyamatot. A választás egy egyszerű konfigurációval megfordítható: a szerverek egy közös csomagból épülnek.

### 3.2 Kanonikus modell – ami egységes lesz

| Fogalom | Legacy (eltérő) | MCP (egységes) |
|---|---|---|
| Azonosítók | UUID, `TK-00042`, `AJ-2026-0042`, `100045`/`RND-100045`, `4711`, `VEVO-1023`, `SZ-…`, `DB-…`, `HJ-…` | Mindenhol **szöveges üzleti azonosító** egységes mezőnévvel (`customerId`, `sku`, `quoteId`, `orderId` = `RND-100045`, `documentNo`, `ticketId`). A raktári cikkszám és a vevőkód **rejtett** belső részlet. |
| Dátum, idő | ISO, `YYYY-MM-DD`, epoch, `YYYY.MM.DD`, `xsd:dateTime` | **ISO 8601** (dátum: `YYYY-MM-DD`, időpont: UTC `…Z`) |
| Pénz | `numeric`, egész forint, fillér, `38100,00` | `{ "amount": "38100.00", "currency": "HUF" }` (string, pontos tizedes) |
| Állapotok | `JOVAHAGYASRA_VAR`, `TELJESITES_ALATT`, `UTON`, … | Kis szótár angol kulcsokkal + magyar `label`: pl. `order.status = "in_fulfillment"`, `"label": "Teljesítés alatt"` |
| Hibák | `-32010`, `{"success":false,"msg":"…"}`, `ERR\|E107`, `HD-404`, HTTP 422 | **Egy hibamodell** (3.4) |
| „Mi a következő lépés?” | Flowable user task kulcs | `nextAction`: `{ "code": "approve_order", "label": "Jóváhagyásra vár", "actor": "ertekesitesi_vezeto" }` |

### 3.3 Eszközök (tools), erőforrások (resources), promptok

Minden eszköz kap:
- **Pontos JSON sémát.** Szigorú, `additionalProperties: false`, és a kanonikus modellhez illő példák.
- **MCP annotációkat:** `readOnlyHint`, `destructiveHint`, `idempotentHint`. Az ágens-réteg ezek alapján dönti el, kell-e emberi jóváhagyás.
- **Kockázati osztályt:** `read`, `write`, illetve `financial` vagy `irreversible`.

**`sales`:**

| Eszköz | Osztály | Mögötte |
|---|---|---|
| `customers.search(query \| taxNumber)` | read | PostgREST crm |
| `customers.get(customerId)` (kapcsolattartókkal) | read | PostgREST crm |
| `products.search(query, category?, activeOnly?)` | read | PostgREST catalog |
| `products.get(sku)` (+ ár a vevő csoportjára, garancia, elérhetőség) | read | catalog + `price_for` + inventory `LEKERDEZ` |
| `quotes.create(customerId, lines[], template?)` | write | `quote.create` + `addLine` + `calculate` egyben |
| `quotes.get(quoteId)` / `quotes.list(customerId?, status?)` | read | `quote.get` / `quote.list` |
| `quotes.request_approval(quoteId, reason)` | write | `quote.requestApproval` |
| `quotes.approve(quoteId)` | write, **jóváhagyáshoz kötött** (vezetői szerep) | `quote.approve` |
| `quotes.accept(quoteId)` → `orderId` | write, **jóváhagyáshoz kötött** | `quote.accept` |

**`orders`:**
- **Olvasás:** `orders.get(orderId)` (állapot, `nextAction`, tételek, szállítás, díjbekérő/számla, fizetés, idővonal), `orders.list(customerId?, status?)`, `orders.timeline(orderId)`.
- **Írás:** `orders.approve`, `orders.start_fulfillment`, `orders.issue_invoice`, `orders.modify(lines)`.
- **Jóváhagyáshoz kötött, visszafordíthatatlan:** `orders.cancel(orderId, reason)`.

**`inventory`:** `stock.check(skus[])` (termékkódon, a háttérben cikkszám-leképezés és `LEKERDEZ`), `stock.alerts()`, `stock.adjust(sku, qty, reason)` (írás, jóváhagyáshoz kötött).

**`finance`:**
- **Olvasás:** `documents.get(documentNo)` (díjbekérő, számla vagy sztornó, egységes összegekkel és határidővel, a Számlázz.hu számla hivatkozásával), `documents.list_overdue()`, `documents.pdf_link(documentNo)`, `payments.get(paymentId | documentNo)`.
- **Írás, pénzügyi:** `payments.create_link(documentNo)`.

**`support`:**
- **Írás:** `tickets.create`, `tickets.update_status`.
- **Olvasás:** `tickets.get`, `tickets.list`, `warranty.check(orderId, sku)`.
- **Jóváhagyáshoz kötött:** `rma.start(ticketId, type)`, `rma.receive(rmaId)`.

**Resources (olvasható, feliratkozható tartalmak):**
- `orders://{orderId}`: állapotváltáskor értesítést küld. Forrása az `order_events` sor, így az ágensnek nem kell pollolnia.
- `catalog://categories`;
- `docs://processes/order-to-cash`: a folyamat leírása.

**MCP promptok** (kész munkafolyamat-sablonok kliensekhez, pl. Claude Desktop): „Új rendelés felvétele”, „Rendelés státusza”, „Lejárt számlák áttekintése”.

### 3.4 Egységes hibamodell

```json
{ "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Nincs elég készlet: TK-00018 (hiány: 1 db)",
    "retryable": false,
    "suggestedActions": ["orders.modify", "stock.check"],
    "details": { "sku": "TK-00018", "missing": 1 },
    "upstream": { "system": "orders-facade", "raw": "Keszlet foglalas sikertelen: 4717 (hiany: 1 db)" } } }
```

| Kód | Legacy források (példák) |
|---|---|
| `NOT_FOUND` | `-32602 …_NOT_FOUND`, `Rendeles nem talalhato`, `ERR\|E107/E108`, `HD-404`, HTTP 404 |
| `VALIDATION` | `-32602`, `ERR\|E101/E120`, `HD-422`, HTTP 400 |
| `INVALID_STATE` | `-32012`, `Muvelet nem engedelyezett ebben az allapotban`, `HD-409`, HTTP 409 |
| `APPROVAL_REQUIRED` | `-32010 DISCOUNT_APPROVAL_REQUIRED` (`details.discountPct`, `limit`) |
| `EXPIRED` | `-32011 QUOTE_EXPIRED`, Stripe `EXPIRED` |
| `INSUFFICIENT_STOCK` | `R-03`, `Keszlet foglalas sikertelen: … (hiany: N db)` |
| `MISSING_DATA` | `hianyzo raktari kod`, `MISSING_STOCK_CODE` |
| `UPSTREAM_UNAVAILABLE` (retryable) | időtúllépés, `R-99`, `E200`, `HD-500`, 5xx, `Belso hiba` |
| `UNAUTHORIZED` / `FORBIDDEN` | az MCP réteg saját jogosultságkezelése |

A `suggestedActions` mező a kivételkezelő ágens kulcsa: a hiba mellé megmondja, milyen eszközzel lehet továbblépni.

### 3.5 Hosszú és aszinkron műveletek

- **Kb. 10 mp (jóváhagyás készletfoglalással):** szinkron tool hívás, MCP progress értesítésekkel.
- **Percek (szállítás, Számlázz.hu számla a fizetés után):** az eszköz azonnal visszatér az aktuális állapottal és a `nextAction`-nel. A változásról a resource-feliratkozás értesít. Opcionálisan egy `orders.wait_for(orderId, status, timeoutSec ≤ 60)` eszköz is lesz rövid várakozásokra.

### 3.6 Biztonság és megbízhatóság

- **Kulcsok:** a legacy kulcsokat csak az MCP szerverek ismerik, az ágens soha.
- **Hitelesítés az MCP felé:** bearer token vagy OAuth, szerepkörökkel. Az ügyfél a saját rendeléseit látja, az értékesítő többet, a vezető jóváhagyhat.
- **Idempotencia:** az írásoknál kötelező `idempotencyKey`, így egy újrapróbált „rendelés elfogadása” nem hoz létre két rendelést.
- **Validáció:** az eszközök bemenetét zod-sémák ellenőrzik.
- **Kimeneti korlát:** a válaszok mérete korlátozott (lapozás, összefoglaló mezők), hogy ne fogyasszanak fölösleges tokent.
- **Prompt injection elleni védelem:** az ügyféltől érkező szabad szöveg (pl. hibajegy leírása) adatként, egyértelműen jelölve megy vissza az ágensnek, sosem utasításként.
- **Naplózás:** minden tool hívásról sor kerül egy `mcp.tool_calls` táblába (ki, mit, mennyi ideig, mekkora válasz, milyen hiba). Ez a tokenomics mérés egyik alapja.

## 4. Ágens réteg – tervezés

### 4.1 Futtatókörnyezet: javaslat

| Lehetőség | Mellette | Ellene |
|---|---|---|
| **Claude Agent SDK** (TypeScript, saját szerveren) – **javasolt** | Natív MCP-kliens; **natív Skillek (SKILL.md)**; alágensek; hookok jóváhagyáshoz és naplózáshoz; a futás végén token- és költségadat | Külön termék, a beépített fájl/bash eszközöket ki kell kapcsolni (csak az MCP eszközök maradnak) |
| Claude API + Tool Runner | Legnagyobb kontroll a hurok fölött, finom mérés | A Skilleket és az alágenseket magunknak kell felépíteni; MCP → tool híd kell |
| Managed Agents | Az Anthropic futtatja és hosztolja | Távoli MCP-hez nyilvános URL kell (tunnel); kevésbé átlátható a méréshez |

A feladatleírás kifejezetten **Skillekkel felruházott ágenseket** kér. Az Agent SDK ezt natívan tudja, MCP-vel és alágensekkel együtt. Az API pontos használatát (opciók, hookok, skill-betöltés) a megvalósításkor a hivatalos dokumentációból ellenőrzöm.

**Modell:** alapértelmezésként Claude Opus 5.5 (`claude-opus-5-5`). A tokenomics-kísérletben összehasonlíthatjuk olcsóbb modellekkel is (Claude Sonnet 5.5, Claude Haiku 5.5), például az alágenseknél, de ezt te döntöd el (lásd a kérdéseket).

### 4.2 Ágensek

| Ágens | Feladat | MCP szerverek | Írási jog |
|---|---|---|---|
| **Front-desk** (belépési pont, router) | A kérés megértése, továbbítás a megfelelő alágensnek, a válasz összefoglalása | – (csak delegál) | – |
| **Értékesítési ágens** | Vevő azonosítása, termékkeresés, ajánlat, kedvezmény-jóváhagyás kérése, elfogadás, rendelés | `sales`, `inventory` (olvasás) | ajánlat, rendelés létrehozása (jóváhagyással) |
| **Rendelés-státusz ágens** | „Hol tart a rendelésem?”, szállítás, díjbekérő, fizetési link, számla PDF | `orders` (olvasás), `finance` | fizetési link (jóváhagyással) |
| **Kivételkezelő ágens** (háttér, eseményvezérelt) | Készlethiány, késés, lejárt számla, elakadt rendelés, dead letter üzenetek; javaslat vagy javítás | `orders`, `inventory`, `finance`, `sales` (olvasás) | módosítás és lemondás csak jóváhagyással |
| **Ügyfélszolgálati ágens** | Hibajegy, garancia, RMA | `support`, `orders` (olvasás) | jegy, RMA (jóváhagyással) |

A kivételkezelő ágenst a `order_events`, `inventory_alerts` és `payment_events` sorok eseményei indítják (egy worker olvassa őket). Eredménye egy javaslat az admin felületen („3 rendelés készlethiány miatt áll – javaslat: …”), amelyet ember hagy jóvá.

### 4.3 Skillek (`.claude/skills/<nev>/SKILL.md`)

A Skillek a folyamatleírást és az üzleti szabályokat tartalmazzák, nem kódot. Csak akkor töltődnek be, amikor kellenek, ezért nem terhelik minden kérés kontextusát.

| Skill | Tartalom |
|---|---|
| `rendelesfelvetel` | A rendelésleadás lépései; vevőazonosítás adószám vagy név alapján; termékválasztás; mikor kell ajánlat; mennyiségi kedvezmények |
| `kedvezmeny-jovahagyas` | 15% feletti kedvezmény: mit kell kérni, kitől, milyen indoklással |
| `keszlethiany-kezeles` | Mit lehet tenni hiánynál: részszállítás nincs → módosítás, alternatív termék, várakozás; kommunikáció az ügyféllel |
| `rendeles-statusz` | Állapotok emberi magyarázata; mikor mit tud tenni az ügyfél; fizetési link küldésének szabályai |
| `szamlazas-fizetes` | Díjbekérő és számla különbsége; SzámlaBridge-folyamat; lejárt számlák kezelése |
| `garancia-rma` | Garanciaszabályok, indokkódok magyarázata, csere vagy javítás döntés |
| `kommunikacios-stilus` | Hangnem, magyar nyelv, mit nem ígérhet az ágens |

### 4.4 Human-in-the-loop

- **Jóváhagyás:** minden írási művelet, amely `destructiveHint` vagy pénzügyi jelölésű (rendelés elfogadása és lemondása, kedvezmény jóváhagyása, fizetési link küldése, RMA), egy jóváhagyási kártyát nyit a chatben („Az ágens ezt szeretné: … [Jóváhagyás] [Elutasítás]”). Ezt az ágens-réteg hookja intézi.
- **Szerepkör:** a jóváhagyó a bejelentkezett felhasználó szerepköre szerint dönthet; a kedvezményt csak az értékesítési vezető hagyhatja jóvá.
- **Napló:** minden döntés naplózásra kerül.

### 4.5 Felületek

- **Asszisztens oldal az admin felületen (`/asszisztens`):** chat streameléssel, tool hívások idővonala (mit kérdezett az ágens melyik rendszertől), jóváhagyási kártyák, és a beszélgetés token- és költségadatai.
- **Közvetlen MCP-elérés:** az MCP szerverek Claude Desktopból vagy Claude Code-ból is elérhetők a bemutatóhoz („bármelyik MCP-kliens tudja használni”).

## 5. Mérés és értékelés (AI tokenomics)

**Mérőszámok beszélgetésenként és feladatonként:**
- input-, output- és cache-tokenek, költség (USD);
- teljes válaszidő, a tool hívások száma és ideje;
- sikeresség: az adatbázis végállapota egyezik-e az elvárttal;
- emberi beavatkozások száma.

**Forgatókönyv-készlet:** kb. 20 írott feladat, mindegyikhez automatikusan ellenőrizhető végállapottal. Néhány példa:
1. „A Bakony Gépgyártó szeretne 12 monitort, mennyi lenne?” → ajánlat, helyes ár.
2. „Vegyük fel a rendelést.” → jóváhagyás kérése (15% fölött), elfogadás, rendelés.
3. „Hol tart az RND-100046?” → helyes állapot és a következő lépés.
4. „Miért nem hagyható jóvá a rendelés?” → készlethiány felismerése, módosítási javaslat.
5. „Küldj fizetési linket a díjbekérőhöz.” → helyes link.
6. „A nyomtató elromlott, van még garancia?” → helyes indokkód (mind a négy esetre).
7. Lejárt számlák listája és összegzése.
8. Eltérő vevőnév-írás (DUNA-IRODAHAZ KFT.) és hiányzó raktári kód kezelése.

**Kísérleti változatok (ugyanazokon a forgatókönyveken):**
- **A – „nyers” ágens:** a legacy végpontokat kapja eszközként, a `legacy-docs/` leírásokkal. A protokollt, formátumot és hibát neki kell értelmeznie.
- **B – MCP ágens:** ugyanaz a modell, de a standardizált MCP eszközökkel és Skillekkel.
- **C – (opcionális) modell-összehasonlítás:** B olcsóbb modellel, illetve olcsóbb modellű alágensekkel.
- **Emberi alapvonal:** egy ember ugyanazokat a feladatokat az admin felületen végzi; mérjük az időt és a kattintásszámot.

A feladatokat ismételten futtatjuk (pl. 5×), mert az eredmény futásonként szóródhat. A riport táblázatban és grafikonon hasonlítja össze a változatokat. Minden futtatás valódi API-költséggel jár, ezért a mérési keretet előre egyeztetjük.

## 6. Ütemezés (fázisok)

| # | Fázis | Eredmény | Elfogadás |
|---|---|---|---|
| 13 | **MCP alapok** | `mcp/` csomag (TypeScript, hivatalos MCP SDK), közös kanonikus típusok, hibamodell, hitelesítés, naplózás (`mcp.tool_calls`), egy minta szerver | MCP Inspectorral listázható és hívható |
| 14 | **Domain MCP szerverek** | `sales`, `orders`, `inventory`, `finance`, `support`, adapterekkel a legacy interfészekre | Füstteszt: minden eszköz és minden hiba-leképezés (pl. `-32010` → `APPROVAL_REQUIRED`) |
| 15 | **Független rendszerek** *(beszúrva)* | Rendszerenként saját konténer és adatbázis, a Supabase csak a felhasználóké, ki/be kapcsolás | `15-rendszerek.ts` + 01–14 a konténereken – **kész** |
| 16 | **Portál** *(beszúrva)* | Irányítópult, Rendszerek oldal, integrációs varázsló első belépéskor | (külön terv) |
| 17 | **Ágens réteg** (helyi modell: `gemma4:12b`, Ollama) | Agent SDK, front-desk és 4 alágens, Skillek, jóváhagyási hook, költségnaplózás | Parancssorból végigvihető egy rendelésleadás jóváhagyással |
| 18 | **Asszisztens felület + eseményvezérelt kivételkezelő** | `/asszisztens` oldal, worker az eseménysorokra | Chatben leadott rendelés; készlethiány-esemény esetén javaslat jelenik meg |
| 19 | **Értékelés és tokenomics** | Forgatókönyv-készlet, A/B(/C) futtatás, riport | A riport elkészül, az eredmények reprodukálhatók |
| 20 | *(következő projektszakasz)* UCP integráció | – | – |

## 7. Kockázatok

| Kockázat | Kezelés |
|---|---|
| Lassú legacy hívások (~10 mp foglalás, percek a szállításig) | Progress értesítés, aszinkron állapot, resource-feliratkozás |
| Az ágens rossz írási műveletet indít | Jóváhagyási kapu, idempotencia, szerepkörök, a minta fiókok tesztüzemben |
| Költség a mérés során | Előre egyeztetett keret, prompt caching, a forgatókönyvek kis kezdő készlettel |
| Az MCP SDK vagy az Agent SDK API-ja eltér a feltételezettől | Megvalósítás előtt a hivatalos dokumentációból ellenőrzöm, ahogy eddig is |
| Prompt injection az ügyféladatokban | Adatként jelölt visszaadás, az írás jóváhagyáshoz kötött |
