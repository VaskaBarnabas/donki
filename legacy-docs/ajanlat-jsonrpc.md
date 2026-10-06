# Ajánlatmotor – JSON-RPC 2.0 API

## Végpont

```
POST /api/legacy/quote-rpc
Content-Type: application/json
```

- **Szabvány:** [JSON-RPC 2.0](https://www.jsonrpc.org/specification), név szerinti paraméterekkel (`params` objektum).
- **HTTP státusz:** mindig `200`, a hiba a válasz `error` mezőjében van.
- **Értesítés:** az `id` nélküli kérés értesítésnek számít. Lefut, de nincs válasz (HTTP `204`, üres törzs).
- **Batch:** a tömb (batch) kérés nem támogatott, rá `-32600` a válasz.

### Hitelesítés

A kulcs a **paraméterek között** utazik, minden hívásban:

```json
{"jsonrpc":"2.0","id":1,"method":"quote.list","params":{"apiKey":"<LEGACY_QUOTE_KEY>"}}
```

Hiányzó vagy rossz kulcs: `-32001 UNAUTHORIZED`.

### Formátumok

| Elem | Formátum |
|---|---|
| ajánlat azonosító | `AJ-2026-0042` |
| partner | CRM UUID (`partnerId`) |
| termék | katalógus kód (`TK-00001`) |
| dátum | `YYYY-MM-DD` |
| pénz | egész forint (nettó) |
| kedvezmény | százalék, 2 tizedes |

## Árazás

Tételenként, egymás után szorzatként, a tétel nettó értéke egész forintra kerekítve:

1. listaár (a katalógusból);
2. ügyfélcsoport-kedvezmény (a katalógusból, a partner csoportja szerint);
3. tételkedvezmény (`lineDiscountPct`);
4. mennyiségi kedvezmény: 10 db felett +3%, 50 db felett +5%.

**Összesített kedvezmény** = 1 − nettó összesen / listaár összesen.

**Jóváhagyási küszöb:** ha az összesített kedvezmény **> 15%**, a `quote.calculate` sikeres (`approvalRequired: true`), de a `quote.accept` `-32010`-et ad, amíg az ajánlat nincs `JOVAHAGYOTT` állapotban.

## Állapotok

```
PISZKOZAT ──requestApproval──► JOVAHAGYASRA_VAR ──approve──► JOVAHAGYOTT
    │                                                            │
    └────────────────────────── accept ──────────────────────────┴──► ELFOGADVA
LEJART      – a nyitott ajánlat érvényessége lejárt (az első módosító hívás vagy accept állítja be)
ELUTASITVA  – (csak meglévő adatokban)
```

## Metódusok

### `quote.create`

| Paraméter | Típus | |
|---|---|---|
| `partnerId` | UUID | kötelező, létező CRM partner |
| `templateId` | int | opcionális, alapértelmezés `1` (az érvényesség napjait a sablon adja: 1 → 30 nap, 2 → 15 nap) |

Eredmény: az ajánlat `PISZKOZAT` állapotban, üres `lines` tömbbel.

### `quote.addLine` – csak `PISZKOZAT` állapotban

| Paraméter | Típus | |
|---|---|---|
| `quoteId` | string | |
| `productCode` | string | `TK-NNNNN` |
| `qty` | int > 0 | |
| `lineDiscountPct` | number 0–100 | opcionális |

Inaktív termékre `-32013`, ismeretlen termékre `-32602` (`data.reason: PRODUCT_NOT_FOUND`).

### `quote.calculate` – `PISZKOZAT`, `JOVAHAGYASRA_VAR`, `JOVAHAGYOTT`

Friss katalógusárakkal újraszámol, és elmenti a tételek és az összesítő értékét.

```json
{"jsonrpc":"2.0","id":7,"method":"quote.calculate","params":{"apiKey":"…","quoteId":"AJ-2026-0041"}}
```

```json
{"jsonrpc":"2.0","id":7,"result":{
  "id":"AJ-2026-0041","partnerId":"10000000-0000-4000-8000-000000000025","status":"JOVAHAGYASRA_VAR",
  "createdOn":"2026-09-30","validUntil":"2026-10-15","totalNet":2507503,"totalDiscountPct":17.86,
  "lines":[{"lineId":…,"productCode":"TK-00029","qty":60,"unitPrice":32900,"lineDiscountPct":5,"lineNet":…}, …],
  "totalGross":3052800,"approvalRequired":true,"approvalLimitPct":15}}
```

### `quote.requestApproval` – csak `PISZKOZAT`

Paraméterek: `quoteId`, `reason` (kötelező szöveg). Eredmény: `JOVAHAGYASRA_VAR`.

### `quote.approve` – csak `JOVAHAGYASRA_VAR`

Paraméterek: `quoteId`, `approver` (név). Eredmény: `JOVAHAGYOTT`, kitöltött `approvedBy` és `approvedOn` mező.

### `quote.accept` – `PISZKOZAT` vagy `JOVAHAGYOTT`

- Újraszámol, ellenőrzi a jóváhagyást, majd **a rendelésmodul HTTP homlokzatán létrehozza a rendelést**.
- Az ajánlat állapota `ELFOGADVA` lesz.

```json
{"jsonrpc":"2.0","id":9,"result":{"quoteId":"AJ-2026-0043","status":"ELFOGADVA","orderNo":100046,"orderRef":"RND-100046"}}
```

Ha a rendelésmodul nem érhető el: `-32603`, `data: {"reason":"ORDER_CREATE_FAILED","detail":"…"}`. Ilyenkor az ajánlat állapota nem változik.

### `quote.get`

Paraméter: `quoteId`. Eredmény: az ajánlat a `lines` tömbbel.

### `quote.list`

Opcionális szűrők: `partnerId`, `status`. Eredmény: legfeljebb 100 ajánlat, a legújabb elöl, tételek nélkül.

### Az ajánlat mezői

`id`, `partnerId`, `templateId`, `createdOn`, `validUntil`, `status`, `totalNet`, `totalDiscountPct`, `approvalReason`, `approvedBy`, `approvedOn`, `orderRef`, és a `get`/`addLine`/`calculate` válaszában a `lines`.

## Hibakódok

| Kód | `message` | Mikor |
|---|---|---|
| `-32700` | Parse error | nem érvényes JSON |
| `-32600` | Invalid Request | nem JSON-RPC 2.0 kérés, vagy batch |
| `-32601` | Method not found | |
| `-32602` | Invalid params | validációs hiba (`data`: mezőnkénti üzenetek), vagy `data.reason`: `QUOTE_NOT_FOUND`, `PARTNER_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `PRODUCT_NOT_FOUND` |
| `-32603` | Internal error | belső hiba, vagy `ORDER_CREATE_FAILED` |
| `-32001` | UNAUTHORIZED | rossz vagy hiányzó `apiKey` |
| `-32010` | DISCOUNT_APPROVAL_REQUIRED | `data: {"discountPct": 15.22, "limit": 15}` |
| `-32011` | QUOTE_EXPIRED | `data: {"quoteId", "validUntil"}` |
| `-32012` | INVALID_STATE | `data: {"quoteId", "status", "allowed"}`, vagy `data.reason: NO_LINES` |
| `-32013` | PRODUCT_INACTIVE | `data: {"productCode"}` |

Példa:

```json
{"jsonrpc":"2.0","id":3,"error":{"code":-32010,"message":"DISCOUNT_APPROVAL_REQUIRED","data":{"discountPct":15.22,"limit":15}}}
```
