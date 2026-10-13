# 13. fázis – MCP alapok és az `orders` pilot szerver (részletes terv)

*Állapot: kész – `13-mcp-orders.ts` 43/43 OK · előzmény: [MCP_AGENS_TERV.md](MCP_AGENS_TERV.md) · döntés: domain szerverek (5)*

## 1. Cél és hatókör

A fázis végére elkészül:

1. **A kanonikus modell** (adat-szerződés), amelyhez mind az öt domain szerver igazodik.
2. **Egy közös MCP alapcsomag** (`mcp/kozos/`): típusok, hibamodell, jogosultság, idempotencia, naplózás, a két szabványos átvitel indítása.
3. **Az `orders` pilot szerver.** A legösszetettebb domain, ezért mindent kipróbál: lassú hívás, folyamat-állapotok, készlethiány, jogosultság.
4. **Modell nélküli tesztek és egy „modellfüggetlenségi” ellenőrzés.**

**Nincs benne:** a többi négy szerver (14. fázis), az ágensek (15.), a resource-feliratkozás valós idejű értesítéssel (14.).

## 2. Ellenőrzött technikai alapok

| Elem | Forrás / verzió |
|---|---|
| `@modelcontextprotocol/sdk` | 1.32.1 (hivatalos TypeScript SDK) – a `zod` a meglévő függőségünk |
| `McpServer.registerTool(name, { title, description, inputSchema, outputSchema, annotations }, cb)` | a csomag típusdefiníciói (a régi `tool()` elavult) |
| Annotációk | `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` |
| Átvitel | `StreamableHTTPServerTransport` (hálózat), `StdioServerTransport` (helyi kliens) |
| Eszköznév | az SDK szerint `[A-Za-z0-9._-]{1,128}` |
| Tesztelés kézzel | `@modelcontextprotocol/inspector` 2.10.1 |

A HTTP-átvitel bekötésének pontos módját (Node `http` vagy a csomag Express-segédje, munkamenet-kezelés) a megvalósítás elején a csomag `docs/server.md`-je és példái alapján rögzítem.

## 3. Modellfüggetlenségi szabályok (minden szerverre kötelező)

| Szabály | Miért |
|---|---|
| Eszköznév: `^[a-z][a-z0-9_]{2,63}$` (pl. `get_order`) – **pont nélkül** | Az MCP megengedi a pontot, de több LLM eszközhívó felület (OpenAI-kompatibilis, Ollama) nem |
| Angol eszköznevek és -leírások, magyar `label` mezők a kimenetben | A modellek angol eszközleírással a legpontosabbak; a felhasználó felé magyar szöveg |
| Leírás legfeljebb ~400 karakter, egy mondatban a cél, egy mondatban a mellékhatás | Kis modell kontextusa és figyelme korlátos |
| Bemeneti séma lapos (legfeljebb 2 szint), kevés kötelező mező, `enum` a szabad szöveg helyett, **nincs `oneOf`/`anyOf`** | Gyengébb modellek a bonyolult sémákat rosszul töltik ki |
| Minden eszköznek van `outputSchema`-ja, a válasz `structuredContent` + egy rövid szöveges összefoglaló | Géppel és emberrel is olvasható; a kliens nem a szövegből parse-ol |
| Hiba = eszköz-eredmény `isError: true` + kanonikus hibaobjektum, sosem kivétel | Minden kliens ugyanúgy kezeli; a modell látja és reagálhat rá |
| Válasz mérete korlátos (lapozás `limit`/`cursor`, összefoglaló mezők) | Token-takarékosság |
| A szerverben nincs LLM-hívás, nincs modellspecifikus promptszöveg | Determinisztikus, bármelyik modellel működik |
| `nextAction` és `suggestedActions` a válaszokban | A modellnek nem kell kitalálnia a következő lépést |

Ezt egy automatikus „lint” teszt ellenőrzi (7. fejezet), így a 14. fázis szerverei sem térhetnek el tőle.

## 4. Kanonikus modell (adat-szerződés) – vázlat

A teljes változat `docs/mcp-kanonikus-modell.md` néven készül el; ez a vázlat az `orders` pilothoz szükséges részt tartalmazza.

### 4.1 Közös típusok

```ts
Money      = { amount: string /* "38100.00", pont, 2 tizedes */, currency: "HUF" }
DateString = "YYYY-MM-DD"
Timestamp  = "2026-10-04T09:38:30.112Z"   // ISO 8601, UTC
NextAction = { code: string, label: string /* magyar */, actor: "sales" | "sales_manager" | "logistics" | "finance" | "customer" | "system", tool?: string }
Page<T>    = { items: T[], nextCursor: string | null }
```

### 4.2 Azonosítók

| Fogalom | Mező | Formátum | Legacy megfelelő |
|---|---|---|---|
| Vevő | `customerId` | UUID | `crm.partners.id` |
| Termék | `sku` | `TK-00001` | katalógus kód (a raktári cikkszám **rejtett**) |
| Ajánlat | `quoteId` | `AJ-2026-0042` | ugyanaz |
| Rendelés | `orderId` | `RND-100045` | a rendelésszám (`100045`) – a szerver mindkét alakot elfogadja |
| Bizonylat | `documentNo` | `DB-…`, `SZ-…` | számlázó sorszám |

### 4.3 Rendelés

```ts
Order = {
  orderId, status: OrderStatus, statusLabel,          // pl. "in_fulfillment", "Teljesítés alatt"
  customer: { customerId, name },                     // a név a CRM-ből
  quoteId: string | null,
  createdAt: Timestamp, updatedAt: Timestamp,
  lines: [{ sku, quantity, unitPrice: Money, lineTotal: Money }],
  total: Money,                                       // nettó
  nextAction: NextAction | null,
  shipment: { carrier, trackingNo, status: ShipmentStatus, statusLabel, eta: Timestamp | null } | null,
  billing: { documentNo, documentType: "proforma" | "invoice" } | null,
  processManaged: boolean                              // false: régi rendelés, csak olvasható
}
```

| Legacy állapot | `OrderStatus` | `statusLabel` |
|---|---|---|
| `ROGZITETT` | `received` | Rögzítve, jóváhagyásra vár |
| `JOVAHAGYOTT` | `approved` | Jóváhagyva, készlet lefoglalva |
| `TELJESITES_ALATT` | `in_fulfillment` | Teljesítés alatt (szállítás folyamatban) |
| `SZALLITVA` | `delivered` | Kiszállítva |
| `SZAMLAZVA` | `awaiting_payment` | Díjbekérő kiállítva, fizetésre vár |
| `LEZART` | `completed` | Lezárva (fizetve) |
| `LEMONDOTT` | `cancelled` | Lemondva |

| Legacy fuvarozói állapot | `ShipmentStatus` |
|---|---|
| `FELVETELRE_VAR` / `FELVEVE` / `UTON` / `KESIK` / `KEZBESITVE` | `awaiting_pickup` / `picked_up` / `in_transit` / `delayed` / `delivered` |

**`nextAction` leképezése:**

| Feltétel | `code` | `actor` | `tool` |
|---|---|---|---|
| aktív user task: `rendeles_jovahagyasa` | `approve_order` | `sales_manager` | `approve_order` |
| aktív user task: `kiszallitas_inditasa` | `start_fulfillment` | `logistics` | `start_fulfillment` |
| aktív user task: `szamla_kiallitasa` | `issue_proforma` | `finance` | `issue_proforma` |
| `in_fulfillment`, nincs user task | `wait_for_delivery` | `system` | `wait_for_order_status` |
| `awaiting_pickup`… `delayed` | (a szállítás állapotával kiegészítve) | | |
| `awaiting_payment` | `collect_payment` | `customer` | *(finance szerver, 14. fázis)* |
| `completed` / `cancelled` / régi rendelés | `null` | | |

### 4.4 Egységes hibamodell

```ts
McpError = {
  code: "NOT_FOUND" | "VALIDATION" | "INVALID_STATE" | "APPROVAL_REQUIRED" | "EXPIRED"
      | "INSUFFICIENT_STOCK" | "MISSING_DATA" | "FORBIDDEN" | "UNAUTHORIZED" | "UPSTREAM_UNAVAILABLE",
  message: string,              // magyar, emberi
  retryable: boolean,
  suggestedActions: string[],   // eszköznevek
  details: object,              // pl. { sku: "TK-00018", missing: 1 }
  upstream?: { system: string, raw: string }   // a nyers legacy válasz, hibakereséshez
}
```

**Az `orders` adapter leképezései** (a rendelési homlokzat szabad szöveges `msg`-jeiből):

| Legacy `msg` | Kanonikus kód | `details` / `suggestedActions` |
|---|---|---|
| `Rendeles nem talalhato: N` | `NOT_FOUND` | – |
| `Muvelet nem engedelyezett ebben az allapotban` | `INVALID_STATE` | `{ status, nextAction }` / `["get_order"]` |
| `Keszlet foglalas sikertelen: <cikk> (hiany: N db)` | `INSUFFICIENT_STOCK` | `{ sku, missing }` (a cikkszám visszafordítva termékkódra) / `["modify_order", "check_stock"]` |
| `Keszlet foglalas sikertelen: hianyzo raktari kod (TK-…)` | `MISSING_DATA` | `{ sku }` / `["modify_order"]` |
| `Modositas sikertelen, keszlet foglalas sikertelen: …` | `INSUFFICIENT_STOCK` | ugyanígy |
| `Hibas keres: …`, `Hibas JSON` | `VALIDATION` | – |
| `Ismeretlen partner: …` | `NOT_FOUND` | `{ customerId }` |
| `Folyamat inditasa sikertelen…`, `Belso hiba…`, hálózati hiba, időtúllépés | `UPSTREAM_UNAVAILABLE` (`retryable: true`) | – |
| `Hozzaferes megtagadva` | `UPSTREAM_UNAVAILABLE` (konfigurációs hiba – naplózva, nem a hívó hibája) | – |

## 5. Az `orders` pilot szerver eszközei

| Eszköz | Bemenet | Kimenet | Annotációk | Jogosultság | Legacy hívás |
|---|---|---|---|---|---|
| `get_order` | `orderId` | `Order` | readOnly | viewer+ | homlokzat `GET {no}` + `/shipping`, CRM partner neve |
| `list_orders` | `status?`, `customerId?`, `limit≤50`, `cursor?` | `Page<OrderSummary>` | readOnly | viewer+ | homlokzat `GET list?state=` |
| `get_order_timeline` | `orderId` | `[{ at, from, to, action, ok, reason?, detail? }]` (kanonikus állapotkulcsokkal) | readOnly | viewer+ | homlokzat `GET {no}/history` |
| `wait_for_order_status` | `orderId`, `status`, `timeoutSeconds ≤ 60` | `{ reached: boolean, order: Order }` | readOnly | viewer+ | a fenti, ismételve (progress értesítéssel) |
| `approve_order` | `orderId`, `idempotencyKey?` | `Order` | idempotent | **sales_manager** | homlokzat `POST {no}/approve` (~10 mp – progress értesítés) |
| `start_fulfillment` | `orderId`, `idempotencyKey?` | `Order` | idempotent | logistics+ | `POST {no}/fulfil` |
| `issue_proforma` | `orderId`, `idempotencyKey?` | `Order` (a `billing` kitöltve) | idempotent | finance+ | `POST {no}/invoice` |
| `modify_order` | `orderId`, `lines: [{ sku, quantity }]`, `idempotencyKey?` | `Order` | idempotent | sales+ | `POST {no}/modify` – az egységár meglévő tételnél a régi, új tételnél a katalógus `price_for` a vevő csoportjára |
| `cancel_order` | `orderId`, `reason`, `idempotencyKey?` | `Order` | **destructive**, idempotent | sales_manager | `POST {no}/cancel` |

**Szerepkörök:**

| Szerepkör | Mit tehet |
|---|---|
| `viewer` | csak olvas |
| `sales` | módosíthat |
| `logistics` | kiszállítást indíthat |
| `finance` | díjbekérőt állíthat ki |
| `sales_manager` | jóváhagyhat és lemondhat |
| `admin` | minden |

A szerepkör a hívó tokenjéből jön. A jogosulatlan hívás `FORBIDDEN` hibát ad, a legacy rendszert el sem éri.

**Rendelés létrehozása szándékosan nincs az `orders` szerverben.** A rendelés a `sales` szerver `accept_quote` eszközével jön létre (14. fázis), ahogy a valódi folyamatban is.

**Resource:** `order://{orderId}` olvasható (ugyanaz, mint a `get_order`). A változásértesítés (`sendResourceUpdated` az `order_events` sor alapján) a 14. fázisban jön.

**Prompt:** `order_status_report(orderId)` – egy kész sablon a „mondd el, hol tart a rendelés és mi a következő lépés” kérésre.

## 6. A közös alapcsomag (`mcp/kozos/`)

```
mcp/
  kozos/
    kanonikus.ts      – Money, Timestamp, NextAction, Page, McpError: zod sémák és TS típusok
    hiba.ts           – McpError előállítása, eszköz-eredménnyé alakítás (isError)
    jogosultsag.ts    – token → { clientId, role }; szerepkör-ellenőrzés eszközönként
    idempotencia.ts   – idempotencyKey alapján a korábbi eredmény visszaadása
    naplo.ts          – mcp.tool_calls írása (idő, eszköz, kliens, szerepkör, eredmény, méret)
    eszkoz.ts         – egy „defineTool” segéd: séma + annotáció + jogosultság + napló + hibakezelés egy helyen
    indito.ts         – a szerver indítása stdio-n vagy Streamable HTTP-n (port, /mcp útvonal, token-ellenőrzés)
    lint.ts           – a 3. fejezet szabályainak ellenőrzése a regisztrált eszközökön
  servers/
    orders/
      index.ts        – szerver-definíció, eszközök regisztrálása
      adapter.ts      – a rendelési homlokzat, a CRM (név) és a katalógus (árak, cikk→sku) hívása
      lekepezes.ts    – legacy → kanonikus (állapotok, nextAction, hibák)
```

**A legacy hívás az MCP rétegben saját klienssel megy, nem az admin felület kódjával.** Az MCP egy önálló integrációs réteg, a saját kulcsaival.

**Futtatás:**
- **HTTP:** `npm run mcp:orders` (Streamable HTTP, `http://localhost:3201/mcp`);
- **stdio:** `npm run mcp:orders -- --stdio` (helyi kliensek: Claude Desktop/Code, később a saját Ollama-ágens).

**Konfiguráció (`.env.local`):**
```
MCP_TOKENS=<token1>:sales_manager:demo-manager,<token2>:viewer:demo-viewer   # token:szerepkör:kliensnév
MCP_STDIO_ROLE=sales_manager                                                  # stdio-n nincs token
```

**Migráció: új `mcp` séma**, csak a service role éri el:
- `mcp.tool_calls`: id, időpont, szerver, eszköz, kliens, szerepkör, kivonatolt bemenet (érzékeny mezők nélkül), `ok`, hibakód, időtartam (ms), válaszméret (bájt);
- `mcp.idempotency`: kulcs, eszköz, kliens, a válasz, létrehozás ideje; 24 óra után eldobható.

## 7. Tesztelés

**`scripts/smoke/13-mcp-orders.ts`:** a hivatalos MCP kliens SDK-val, **LLM nélkül**, mindkét átvitelen (HTTP és stdio).
1. **Eszközlista:** a 9 eszköz megvan, a nevek, annotációk és sémák helyesek, és a **lint** (3. fejezet) hibátlan.
2. **Olvasás:**
   - `get_order RND-100034` (seedelt, lezárt): kanonikus mezők, `processManaged: false`, `nextAction: null`;
   - `get_order 100034` (szám alakban is);
   - `list_orders status=completed`;
   - `get_order_timeline` kanonikus állapotkulcsokkal.
3. **Hibák:**
   - ismeretlen rendelésre `NOT_FOUND`;
   - régi rendelés jóváhagyására `INVALID_STATE` + `suggestedActions`;
   - érvénytelen bemenetre `VALIDATION`.
4. **Teljes út egy friss rendelésen.** A rendelést a teszt a legacy ajánlatmotorral hozza létre, előkészítésként.
   - `approve_order`: `approved` lesz, `nextAction = start_fulfillment`;
   - `start_fulfillment`, a szállítás gyorsítása, `wait_for_order_status delivered`;
   - `issue_proforma`: `awaiting_payment` lesz, `billing.documentType = proforma`.
5. **Készlethiány:** egy 0 készletű termékkel `INSUFFICIENT_STOCK` jön `{ sku, missing }` adattal, **termékkóddal, nem cikkszámmal**. Utána `modify_order`, majd `approve_order` sikeres.
6. **Jogosultság:** `viewer` tokennel `approve_order` → `FORBIDDEN`; token nélkül HTTP 401.
7. **Idempotencia:** ugyanaz az `idempotencyKey` kétszer → egy hatás, ugyanaz a válasz.
8. **Naplózás:** minden hívásról van sor a `mcp.tool_calls`-ban, helyes eredménnyel és időtartammal.
9. **Takarítás:** a teszt a kiszállított készletet visszavételezi, ahogy a korábbi tesztek is.

**Kézi ellenőrzés:** MCP Inspectorral (`npx @modelcontextprotocol/inspector`) az eszközök kipróbálhatók, és a bemutatón is jól mutatnak.

## 8. Elfogadási feltételek

- [ ] A kanonikus modell dokumentuma (`docs/mcp-kanonikus-modell.md`) elkészült, az `orders` szerver ehhez igazodik.
- [ ] Az `orders` szerver stdio-n és Streamable HTTP-n is fut, az Inspector csatlakozik és minden eszközt meghív.
- [ ] A `13-mcp-orders.ts` füstteszt minden pontja zöld, a lint hibátlan.
- [ ] Az ágens soha nem lát legacy formátumot. Kivétel csak az `upstream.raw` hibakeresési mező.
- [ ] A README változtatási naplója, a `legacy-docs`-hoz hasonló MCP-leírás (`mcp/README.md`) és az Állapot frissül.

## 9. Kockázatok

| Kockázat | Kezelés |
|---|---|
| A homlokzat hibái szabad szövegesek, a leképezés törékeny | Pontos minták a meglévő üzenetekre (a kódból kiolvasva), ismeretlen üzenet → `UPSTREAM_UNAVAILABLE` + `upstream.raw`, és teszt minden ismert üzenetre |
| A ~10 mp-es jóváhagyás alatt a kliens időtúllépést kap | Progress értesítés; ha kell, az SDK kísérleti „tasks” képessége (a megvalósításkor ellenőrizve) |
| A cikkszám → termékkód visszafordításhoz a katalógus kell | Az adapter a katalógus PostgREST-jét kérdezi, a válasz rövid ideig gyorsítótárazva |

## 10. Nyitott kérdések

1. **Eszközök nyelve:** angol eszköznevek és -leírások, magyar `statusLabel`/`message` (javaslatom), vagy minden magyarul?
2. **Portok:** `3201`–`3205` megfelel az öt szervernek (orders = 3201)?
3. **Szerepkörök:** jó a fenti hat szerepkör, vagy egyszerűsítsünk (pl. `viewer` / `operator` / `manager`)?
