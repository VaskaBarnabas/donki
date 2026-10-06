# CRM és termékkatalógus – PostgREST

A CRM-nek és a katalógusnak nincs saját API-ja: a Supabase automatikusan generált REST felülete (PostgREST) szolgálja ki.

```
https://<projekt>.supabase.co/rest/v1/<tábla>
```

| Fejléc | Érték |
|---|---|
| `apikey` | publishable vagy service role kulcs |
| `Authorization` | `Bearer <felhasználói JWT vagy service role kulcs>` |
| `Accept-Profile` | `crm` / `catalog` (olvasás) |
| `Content-Profile` | `crm` / `catalog` (írás, RPC) |

**Jogosultság:** bejelentkezett felhasználó (`authenticated`) és service role. Az anonim kulccsal: `permission denied for schema crm`.

A szűrés, rendezés és beágyazás a PostgREST szokásos szintaxisa szerint működik (`?name=ilike.*kft*`, `?select=*,contacts(*)`, `?order=name`).

## CRM (`Accept-Profile: crm`)

| Tábla | Mezők |
|---|---|
| `partners` | `id` (uuid), `name`, `tax_number` (`12345678-2-41`, egyedi), `address`, `customer_group` (`NORMAL`, `TORZS`, `VISZONTELADO`, `KIEMELT`), `owner_name`, `created_at` |
| `contacts` | `id`, `partner_id`, `name`, `email`, `phone`, `role` |
| `deals` | `id`, `partner_id`, `title`, `stage` (`erdeklodo`, `ajanlat`, `megrendeles`, `lezart`), `value` (Ft), `expected_close`, `quote_ref` (pl. `AJ-2026-0040`), `order_ref` (pl. `RND-100042`), `created_at` |
| `activities` | `id`, `partner_id`, `deal_id`, `type` (`hivas`, `email`, `megbeszeles`, `statusz_valtas`, `megjegyzes`), `note`, `created_at` |

Idő: `timestamptz` (ISO 8601). Pénz: `numeric(14,2)`.

```bash
curl "$URL/rest/v1/partners?select=name,tax_number,customer_group,contacts(name,email,role)&tax_number=eq.32038523-2-19" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Accept-Profile: crm"
```

```json
[{"name":"Bakony Gépgyártó Kft","tax_number":"32038523-2-19","customer_group":"KIEMELT",
  "contacts":[{"name":"Mészáros Zsuzsanna","role":"üzemvezető","email":"zsuzsanna.meszaros@bakonygepgyarto.hu"}, …]}]
```

## Katalógus (`Accept-Profile: catalog`)

| Tábla | Mezők |
|---|---|
| `categories` | `id` (pl. `NYOMT`, `SZAMT`, `IRBUT`, `IRSZE`, `IPGEP`, `MUNVE`), `name` |
| `products` | `code` (`TK-00042`), `name`, `category_id`, `list_price` (nettó Ft), `unit`, `warranty_months`, `raktari_kod` (a raktári cikkszám, lehet `null`!), `active`, `created_at` |
| `customer_group_discounts` | `customer_group`, `category_id`, `discount_pct` |

### `price_for` – egy termék ára egy ügyfélcsoportnak

Listaár mínusz ügyfélcsoport-kedvezmény. A tétel- és mennyiségi kedvezményt nem tartalmazza, azt az ajánlatmotor számolja.

```bash
curl -X POST "$URL/rest/v1/rpc/price_for" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Profile: catalog" -H "Content-Type: application/json" \
  -d '{"product_code":"TK-00008","customer_group":"KIEMELT"}'
```

```json
{"product_code":"TK-00008","name":"Irodai asztali számítógép i5 / 16 GB / 512 GB SSD (PC-OF5)","category_id":"SZAMT",
 "customer_group":"KIEMELT","list_price":289900.00,"discount_pct":6.00,"price":272506.00,"active":true}
```

| Hiba | HTTP |
|---|---|
| ismeretlen termékkód (`Ismeretlen termekkod: …`) | 404 |
| ismeretlen ügyfélcsoport (`Ismeretlen ugyfelcsoport: …`) | 400 |

Inaktív termékre is ad árat; ezt az `active: false` mező jelzi.

## Ismert sajátosságok

- A partner azonosítója a CRM-ben UUID; a számlázó rendszer a partnert **adószám** alapján ismeri, saját vevőkóddal (`VEVO-…`), és a név ott eltérhet.
- Néhány terméknek nincs raktári kódja (`raktari_kod = null`), ezek nem foglalhatók a raktárban.
