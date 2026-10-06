# Rendeléskezelő – interfész leírás

*Belső wiki oldal. Kérdés esetén: értékesítési informatika.*

A rendelések életciklusát a **Flowable** folyamatmotor futtatja (BPMN folyamat: `rendeles_folyamat`). Előtte egy **régi stílusú HTTP homlokzat** áll, amelyen keresztül a rendszerek eddig is dolgoztak. A Flowable REST API-ja **közvetlenül is elérhető** második interfészként (lásd lent).

---

## 1. Régi homlokzat

```
Alap URL:   /api/legacy/orders
Fejléc:     X-Legacy-Key: <LEGACY_ORDERS_KEY>
```

> **FONTOS:** a homlokzat **mindig HTTP 200**-at ad. A sikert a válasz törzse jelzi:
>
> `{"success":true,"data":{…}}` vagy `{"success":false,"msg":"…"}`
>
> A `msg` ékezet nélküli, magyar, szabad szöveg (nem kód!).

### Lekérdezések

| Hívás | Mit ad |
|---|---|
| `GET list?state=JOVAHAGYOTT` | rendelések (max. 200, a legújabb elöl), opcionális állapotszűrővel |
| `GET 100045` | a rendelés + `ref`, `lines`, `current_task` (az aktív user task: `{key, name}` vagy `null`) |
| `GET 100045/history` | folyamattörténet: `from_state`, `to_state`, `action`, `ok`, `reason`, `detail`, `ts` |
| `GET 100045/shipping` | szállítás: `carrier`, `tracking_no`, `carrier_status`, `eta`, `updated_at` |

A rendelés mezői: `order_no`, `quote_ref`, `partner_id` (CRM UUID), `state`, `process_instance_id`, `invoice_ref`, `created_at`, `updated_at`.

### Műveletek

| Hívás | Törzs | Mit csinál |
|---|---|---|
| `POST create` | `{"quoteRef":"AJ-…" vagy null, "partnerId":"<uuid>", "lines":[{"productCode":"TK-00001","qty":2,"unitPrice":85405}]}` | rendelés rögzítése + folyamatindítás → `data: {"orderNo":100046,"ref":"RND-100046"}` |
| `POST 100045/approve` | – | **Rendelés jóváhagyása** user task lezárása. Közben készletfoglalás a raktárban (~10 mp). |
| `POST 100045/fulfil` | – | **Kiszállítás indítása** user task: szállítmány létrehozása, a lefoglalt készlet kiadása |
| `POST 100045/invoice` | – | **Számla kiállítása** user task: számla a számlázó rendszerben |
| `POST 100045/cancel` | – | lemondás (`RendelesLemondas` üzenet a folyamatnak) |
| `POST 100045/modify` | `{"lines":[…]}` | tételek cseréje (lásd lent) |

**Szabályok:**
- Egy művelet csak akkor fut le, ha a hozzá tartozó user task éppen aktív. Különben: `Muvelet nem engedelyezett ebben az allapotban`.
- **Lemondás:** `LEZART` és `LEMONDOTT` rendelésnél nem lehetséges. A lemondás feloldja a foglalást, és ha már van számla, **sztornózza**.
- **Módosítás:** csak akkor lehet, ha a folyamat a jóváhagyáson vagy a kiszállítás indításán áll, vagyis a kiszállítás még nem indult el. `JOVAHAGYOTT` rendelésnél a régi foglalás feloldódik, és új foglalás készül. Ha az új tételekre nincs készlet, minden visszaáll.
- **Régi rendelések:** a 100034–100045 közötti rendelések a folyamatmotor előtti időből származnak, **nincs folyamatpéldányuk** (`process_instance_id: null`). Ezekre minden művelet „nem engedélyezett”, csak lekérdezhetők.

### Gyakori válaszok

```
{"success":false,"msg":"Hozzaferes megtagadva"}
{"success":false,"msg":"Ismeretlen muvelet"}
{"success":false,"msg":"Rendeles nem talalhato: 100999"}
{"success":false,"msg":"Muvelet nem engedelyezett ebben az allapotban"}
{"success":false,"msg":"Keszlet foglalas sikertelen: 4717 (hiany: 1 db)"}
{"success":false,"msg":"Keszlet foglalas sikertelen: hianyzo raktari kod (TK-00012)"}
{"success":false,"msg":"Modositas sikertelen, keszlet foglalas sikertelen: 4717 (hiany: 1 db)"}
{"success":false,"msg":"Ismeretlen partner: <uuid>"}
{"success":false,"msg":"Hibas keres: quoteRef, partnerId, lines[{productCode, qty, unitPrice}] kotelezo"}
{"success":false,"msg":"Hibas JSON"}
{"success":false,"msg":"Nincs szallitas ehhez a rendeleshez"}
{"success":false,"msg":"Folyamat inditasa sikertelen, a rendeles nem jott letre"}
{"success":false,"msg":"Belso hiba, probalja ujra kesobb"}
```

Készlethiány után a rendelés **visszakerül jóváhagyásra** (`ROGZITETT`), és újra jóváhagyható, például módosítás után.

---

## 2. Állapotok és folyamat

```
ROGZITETT → JOVAHAGYOTT → TELJESITES_ALATT → SZALLITVA → SZAMLAZVA → LEZART
                                                                 (és bármikor LEZART előtt: → LEMONDOTT)
```

| Lépés | Mi történik |
|---|---|
| jóváhagyás | készletfoglalás minden tételre. Hiány, hiányzó raktári kód vagy időtúllépés esetén vissza a jóváhagyáshoz. |
| kiszállítás | szállítmány `FELVETELRE_VAR` állapotban, a foglalások kiadása |
| szállításkövetés | percenként lekérdezi a fuvarozói állapotot: `FELVETELRE_VAR` → `FELVEVE` → `UTON` → `KEZBESITVE`, vagy átmenetileg `KESIK`. Az első késésnél esemény megy ki. Kézbesítés után `SZALLITVA`. |
| számlázás | a számlázó rendszeren: vevő keresése adószámmal (ha nincs, felvétele), majd számla. 8 napos fizetési határidő. |
| fizetés | a fizetési modul jelzi (`FizetesBeerkezett` üzenet) → `LEZART` |

A `history` `action` értékei: `start`, `approve`, `fulfil`, `delivered`, `invoice`, `payment`, `cancel`, `modify`. A sikertelen próbálkozás `ok: false` sor, `reason` + `detail` mezővel. A `reason` lehet: `INVENTORY_SHORTAGE`, `MISSING_STOCK_CODE`, `INVENTORY_TIMEOUT`, `INVENTORY_ERROR`.

---

## 3. Események (`order_events` sor)

Supabase Queues (pgmq) sor, olvasás a `pgmq_public` sémán keresztül (lásd a raktári leírást).

```json
{"event":"ORDER_STATE_CHANGED","orderNo":100046,"orderRef":"RND-100046","from":"ROGZITETT","to":"JOVAHAGYOTT","action":"approve","ts":"2026-10-04T09:38:30.112Z"}
{"event":"ORDER_ACTION_FAILED","orderNo":100047,"orderRef":"RND-100047","state":"ROGZITETT","action":"approve","reason":"INVENTORY_SHORTAGE","detail":"4717 (hiany: 1 db)","ts":"…"}
{"event":"ORDER_MODIFIED","orderNo":100047,"orderRef":"RND-100047","state":"JOVAHAGYOTT","ts":"…"}
{"event":"SHIPMENT_DELAYED","orderNo":100046,"orderRef":"RND-100046","carrier":"DPD","trackingNo":"DPD03701702","eta":"…","ts":"…"}
```

---

## 4. Flowable REST API (közvetlen elérés)

A folyamatmotor REST API-ja **közvetlenül is használható** második interfészként:

```
Alap URL:  http://localhost:8080/flowable-rest/service/
Hitelesítés: HTTP Basic (FLOWABLE_REST_USER / FLOWABLE_REST_PASSWORD)
```

| Mire | Hívás |
|---|---|
| folyamatpéldány a rendelésszámmal | `GET runtime/process-instances?processDefinitionKey=rendeles_folyamat&businessKey=100046` |
| aktív user taskok | `GET runtime/tasks?processInstanceId=<id>` |
| user task lezárása | `POST runtime/tasks/<taskId>` + `{"action":"complete"}` |
| üzenetre váró execution | `GET runtime/executions?processInstanceId=<id>&messageEventSubscriptionName=FizetesBeerkezett` |
| üzenet küldése | `PUT runtime/executions/<executionId>` + `{"action":"messageEventReceived","messageName":"FizetesBeerkezett"}` |
| folyamatváltozók | `GET runtime/process-instances/<id>/variables` |
| API leírás (OpenAPI) | `GET /flowable-rest/docs/specfile/process/flowable-swagger-process.json` |

**Folyamat adatai:**
- process key: `rendeles_folyamat`; business key: a rendelésszám (szövegként);
- user taskok: `rendeles_jovahagyasa` (csoport: `ertekesitesi_vezeto`), `kiszallitas_inditasa` (`logisztika`), `szamla_kiallitasa` (`penzugy`);
- üzenetek: `FizetesBeerkezett`, `RendelesLemondas`;
- folyamatváltozók: `orderNo`, `appBaseUrl`, `engineKey`, `invoiceRef` (számlázás után), valamint a HTTP taskok válaszai (`keszletValasz`, `szallitasValasz`, `szamlazasValasz`, `kesesJelzes`).

> **Figyelem:** a közvetlen REST hívás megkerüli a homlokzat ellenőrzéseit (pl. jogosultság, módosítási szabályok). Állapotváltáshoz a homlokzat használata ajánlott.

A folyamat a Next.js belső motor-végpontjait hívja (`/api/legacy/orders/_engine/<akcio>`, `X-Engine-Key` fejléccel). Ezek **nem külső használatra** valók.
