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
    kornyezet.ts    .env.local, service role kliens, stderr napló
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

```bash
npm run mcp:all                                  # mind az öt szerver (HTTP, 3201–3205); Ctrl+C mindet leállítja
npm run mcp:orders                               # egy szerver: Streamable HTTP, http://127.0.0.1:3201/mcp (Authorization: Bearer <token>)
npx tsx mcp/servers/orders/index.ts --stdio   # stdio: helyi kliensnek (Claude Desktop/Code, saját ágens)
npm run mcp:orders -- --port=3291                # másik port
```

A `.env.local`-ban:

```
MCP_TOKENS=<token>:sales_manager:demo-manager,<token2>:viewer:demo-viewer
MCP_STDIO_ROLE=sales_manager
```

A szerver csak `127.0.0.1`-en figyel, DNS-rebinding védelemmel (az SDK `createMcpExpressApp`-ja). Token nélkül HTTP 401 a válasz.

A szerverek a legacy interfészeket hívják, ezért a Next.js-nek (`APP_BASE_URL`) futnia kell; az `orders`-hez a Flowable is kell, az `inventory` csak a Supabase-t (a raktári sort) használja. A `mcp:sales` / `mcp:inventory` / `mcp:finance` / `mcp:support` scriptek ugyanígy működnek.

**Kézi kipróbálás:** `npx @modelcontextprotocol/inspector`, majd:
- HTTP: `http://127.0.0.1:3201/mcp` + `Authorization` fejléc;
- stdio: parancs `npx`, argumentumok `tsx mcp/servers/orders/index.ts --stdio`. Stdio-n nem `npm run`-t használunk, mert az npm a saját fejlécsorát a stdoutra írhatja, ami a protokollé.

**Claude Code-ban (stdio):** `claude mcp add donki-orders -- npx tsx mcp/servers/orders/index.ts --stdio` (a projekt mappájából). A szerepkör ilyenkor az `MCP_STDIO_ROLE`.

## Új szerver vagy eszköz írása

1. `mcp/servers/<nev>/adapter.ts`: a legacy hívások. Hálózati vagy formátumhiba esetén `McpHiba('UPSTREAM_UNAVAILABLE', …)`.
2. `lekepezes.ts`: zod sémák a kanonikus modell szerint, valamint legacy állapot → kanonikus, legacy hiba → `McpHiba`.
3. `index.ts`: `eszkoz(server, '<nev>', { name, title (HU), description (EN), input, output, annotations, risk, roles, summary (HU), run })`, végül `inditas({ nev, port, letrehoz })`.
4. A vevőt, a terméket és a rendelésazonosítót a `kozos/torzsadat.ts` fordítja; ügyfélszöveg-mezőhöz `untrustedText()`.
5. Füstteszt a `scripts/smoke/mcp-segedek.ts`-sel (saját szerverpéldány, tokenek, `eszkozlistaEllenorzes` = lint + kockázat, `legacyNyom`, napló).
