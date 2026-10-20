# MCP réteg

Standardizált [Model Context Protocol](https://modelcontextprotocol.io) szerverek a legacy modulok fölött. Az ágens (vagy bármelyik MCP kliens) csak ezeket az eszközöket látja. A nyers legacy API-k (homlokzat, JSON-RPC, szöveges protokoll, SOAP) és a közvetlen DB-hozzáférés rejtve maradnak.

- **Adat-szerződés:** [docs/mcp-kanonikus-modell.md](../docs/mcp-kanonikus-modell.md)
- **Terv:** [docs/MCP_AGENS_TERV.md](../docs/MCP_AGENS_TERV.md), [docs/FAZIS13_TERV.md](../docs/FAZIS13_TERV.md)

## Felépítés

```
mcp/
  kozos/            közös alap, minden szerver ezt használja
    kanonikus.ts    Money, NextAction, hibakódok, szerepkörök, idempotencyKey mező
    hiba.ts         McpHiba → isError eredmény (magyar szöveg + kanonikus hiba JSON), hibaKiolvasas()
    eszkoz.ts       eszköz-regisztráló: jogosultság, idempotencia, naplózás, progress, hibakezelés
    indito.ts       stdio vagy Streamable HTTP (Bearer token → szerepkör)
    naplo.ts        mcp.tool_calls
    idempotencia.ts mcp.idempotency
    lint.ts         modellfüggetlenségi szabályok ellenőrzése a tools/list-en (+ kockázati osztály)
    torzsadat.ts    közös fordítás: termékkód ↔ raktári cikkszám, CRM UUID ↔ adószám, price_for
    kornyezet.ts    env (.env.local + .env.stack), saját adatbázis (mcp-db), CRM és raktár kliens, stderr napló
  servers/<szerver>/
    adapter.ts      a legacy interfész kliense (homlokzat, JSON-RPC, pgmq, szöveges protokoll, REST, SOAP)
    lekepezes.ts    legacy → kanonikus (állapot, nextAction, hibák)
    index.ts        eszközök, resource, prompt
  osszes.ts         mind az öt szerver indítása (npm run mcp:all)
```

## Szerverek

| Szerver | Port | Legacy háttér (a saját interfészén) | Eszközök |
|---|---|---|---|
| `orders` | 3201 | rendelési homlokzat + Flowable | 9 |
| `sales` | 3202 | CRM és katalógus (PostgREST), ajánlatmotor (JSON-RPC) | 9 |
| `inventory` | 3203 | raktár (pgmq üzenetsor) | 3 |
| `finance` | 3204 | számlázó (szöveges protokoll), fizetés (REST, Stripe teszt) | 5 |
| `support` | 3205 | ügyfélszolgálat (SOAP) | 7 |

Kockázati osztály (`_meta["donki/risk"]`): **R** = read, **W** = write, **F** = financial, **I** = irreversible. Az `admin` minden eszközt hívhat.

### `sales`

| Eszköz | Magyar név | Szerepkör | Kockázat |
|---|---|---|---|
| `search_customers` | Vevő keresése | viewer+ | R |
| `get_customer` | Vevő adatai | viewer+ | R |
| `search_products` | Termék keresése (a vevő árával) | viewer+ | R |
| `create_quote` | Ajánlat készítése (egy lépésben, árazással) | sales, sales_manager | W |
| `get_quote` / `list_quotes` | Ajánlat lekérdezése / listázása | viewer+ | R |
| `request_quote_approval` | Jóváhagyás kérése (> 15% kedvezmény) | sales, sales_manager | W |
| `approve_quote` | Ajánlat jóváhagyása (a jóváhagyó a hívó azonosítója) | sales_manager | W |
| `accept_quote` | Ajánlat elfogadása → rendelés | sales, sales_manager | W |

Resource: `catalog://categories`. Prompt: `new_order`.

### `orders`

| Eszköz | Magyar név | Szerepkör | Kockázat |
|---|---|---|---|
| `get_order` / `list_orders` / `get_order_timeline` | Rendelés lekérdezése / listázása / története | viewer+ | R |
| `wait_for_order_status` | Várakozás a rendelés állapotára (max. 60 mp, progress) | viewer+ | R |
| `approve_order` | Rendelés jóváhagyása (~10 mp, progress) | sales_manager | W |
| `start_fulfillment` | Kiszállítás indítása | logistics, sales_manager | W |
| `issue_proforma` | Díjbekérő kiállítása | finance | W |
| `modify_order` | Rendelés módosítása | sales, sales_manager | W |
| `cancel_order` | Rendelés lemondása | sales_manager | **I** |

Resource: `order://{orderId}`, **feliratkozható**: állapotváltáskor `notifications/resources/updated` (a szerver 10 mp-enként nézi a feliratkozott rendeléseket). Prompt: `order_status_report`.

### `inventory`

| Eszköz | Magyar név | Szerepkör | Kockázat |
|---|---|---|---|
| `check_stock` | Készlet lekérdezése (max. 20 termék, egy raktári üzenettel) | viewer+ | R |
| `list_low_stock` | Minimum alatti készlet | viewer+ | R |
| `adjust_stock` | Készletmozgás rögzítése (beérkezés / korrekció; lefoglalt készletet nem vehet el) | logistics, sales_manager | W |

A foglalás, a kiadás és a feloldás szándékosan nincs kiajánlva: ezek a rendelési folyamat belső lépései.

### `finance`

| Eszköz | Magyar név | Szerepkör | Kockázat |
|---|---|---|---|
| `get_document` | Bizonylat lekérdezése (a díjbekérőnél a Számlázz.hu végszámla állapotával) | viewer+ | R |
| `list_overdue_documents` | Lejárt tartozások | finance, sales_manager | R |
| `get_document_pdf` | Bizonylat PDF (1 órás link) | viewer+ | R |
| `create_payment_link` | Fizetési link (Stripe **teszt**) | finance | **F** |
| `get_payments` | Fizetések lekérdezése | viewer+ | R |

Kézi „fizetve” rögzítés és sztornó szándékosan nincs. A sztornó a rendelés lemondásának része, a kézi fizetésrögzítés pedig nem zárná le a rendelést. Prompt: `overdue_review`.

### `support`

| Eszköz | Magyar név | Szerepkör | Kockázat |
|---|---|---|---|
| `create_ticket` | Hibajegy nyitása | sales, sales_manager | W |
| `get_ticket` / `list_tickets` | Hibajegy lekérdezése / listázása | viewer+ | R |
| `update_ticket_status` | Hibajegy állapota | sales, sales_manager | W |
| `check_warranty` | Garancia ellenőrzése | viewer+ | R |
| `start_rma` | Csere vagy javítás indítása (a garanciát nem ellenőrzi!) | sales_manager | W |
| `receive_rma` | Javításra beérkezett termék | logistics, sales_manager | W |

A hibajegy leírása megbízhatatlan ügyfélszöveg (prompt injection ellen jelölve). Prompt: `warranty_claim`.

Rendelést csak ajánlatból lehet létrehozni (`sales.accept_quote`), ahogy a valódi folyamatban.

## Indítás és csatlakozás

**15. fázis óta az MCP réteg is független rendszer:** az öt szerver a saját konténerében fut (`mcp-orders` … `mcp-support`), saját adatbázissal (`mcp-db`: napló, idempotencia), és a legacy rendszereket a saját címükön, a saját interfészükön hívja. Az `npm run stack:up` elindítja őket:

| Szerver | Cím a gépről | A legacy háttér, amit elér |
|---|---|---|
| `orders` | `http://127.0.0.1:3201/mcp` | rendeléskezelő (`ORDERS_URL`), CRM |
| `sales` | `http://127.0.0.1:3202/mcp` | ajánlatkezelő (`QUOTE_URL`), CRM |
| `inventory` | `http://127.0.0.1:3203/mcp` | a raktár üzenetsora (`INVENTORY_API_URL` + a csak sorhoz jogosult kulcs), CRM |
| `finance` | `http://127.0.0.1:3204/mcp` | számlázó (`BILLING_URL`), fizetés (`PAYMENTS_URL`), CRM |
| `support` | `http://127.0.0.1:3205/mcp` | helpdesk (`SUPPORT_URL`), CRM |

**Tokenek:** `Authorization: Bearer <token>`. Ha a `.env.local`-ban nincs `MCP_TOKENS`, az `npm run stack:secrets` szerepkörönként egy demo-tokent generál a `.env.stack`-be (`token:szerepkör:demo-<szerepkör>`).

A konténerben a szerver minden interfészen figyel, de a DNS-rebinding védelem megmarad: csak a `localhost`, a `127.0.0.1` és a saját szolgáltatásneve fogadható el Host fejlécként.

**Natívan** (fejlesztéshez vagy stdio-hoz; a legacy rendszerek konténerben futnak, a címek alapból a gépre kivezetett portok):

```bash
npx tsx mcp/servers/orders/index.ts --stdio      # stdio: helyi kliensnek (Claude Desktop/Code, saját ágens)
npm run mcp:orders -- --port=3291                # HTTP, másik porton (a konténeres 3201 foglalt)
```

Natív futáskor a `.env.local` és a `.env.stack` töltődik be; a saját adatbázisához a `RENDSZER_DB_URL=http://localhost:54107` és a `RENDSZER_DB_JWT_SECRET` (az `MCP_JWT_SECRET` értéke) kell. A füsttesztek ezt maguk beállítják.

**Kézi kipróbálás:** `npx @modelcontextprotocol/inspector`, majd:
- HTTP: `http://127.0.0.1:3201/mcp` + `Authorization` fejléc;
- stdio: parancs `npx`, argumentumok `tsx mcp/servers/orders/index.ts --stdio`. Stdio-n nem `npm run`-t használunk, mert az npm a saját fejlécsorát a stdoutra írhatja, ami a protokollé.

**Claude Code-ban (HTTP, a konténeres szerverhez):** `claude mcp add --transport http donki-orders http://127.0.0.1:3201/mcp --header "Authorization: Bearer <token>"`. Stdio-n: `claude mcp add donki-orders -- npx tsx mcp/servers/orders/index.ts --stdio` (a projekt mappájából; a szerepkör az `MCP_STDIO_ROLE`).

## Új szerver vagy eszköz írása

1. `mcp/servers/<nev>/adapter.ts`: a legacy hívások. Hálózati vagy formátumhiba esetén `McpHiba('UPSTREAM_UNAVAILABLE', …)`.
2. `lekepezes.ts`: zod sémák a kanonikus modell szerint, valamint legacy állapot → kanonikus, legacy hiba → `McpHiba`.
3. `index.ts`: `eszkoz(server, '<nev>', { name, title (HU), description (EN), input, output, annotations, risk, roles, summary (HU), run })`, végül `inditas({ nev, port, letrehoz })`.
4. A vevőt, a terméket és a rendelésazonosítót a `kozos/torzsadat.ts` fordítja; ügyfélszöveg-mezőhöz `untrustedText()`.
5. Füstteszt a `scripts/smoke/mcp-segedek.ts`-sel (saját szerverpéldány, tokenek, `eszkozlistaEllenorzes` = lint + kockázat, `legacyNyom`, napló).
