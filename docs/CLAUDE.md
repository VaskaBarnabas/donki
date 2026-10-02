# Legacy CRM – szakdolgozati prototípus

A teljes felépítést a @docs/LEGACY_CRM_BUILD_SPEC.md írja le. Ezt kövesd, fázisonként haladva.

## Munkamód
- Egyszerre mindig csak egy fázison dolgozz. A fázis végén futtasd a füsttesztet, foglald össze, mit csináltál, és állj meg.
- Mielőtt egy fázisba kezdesz, írj tervet, és várd meg a jóváhagyásomat.
- Ha a spec valamiben nem egyértelmű vagy ellentmondásos, kérdezz, ne találgass.
- Az Állapot részt midnig frissítsd, hogy nyomon tudjuk követni éppen hol áll a folyamat

## Környezet
- Supabase felhőprojekt, már linkelve. Migrációk: `npx supabase db push` (nem `db reset`).
- Az exposed sémákat és a Queues PostgREST-kiajánlását én kapcsolom be a Dashboardon; szólj, amikor erre szükség van.
- A `.env.local`-t én töltöm ki; te a `.env.example`-t tartsd karban.
- A README változtatási napló: fázisonként mit változtattunk és miért. Futtatási parancsok, curl-példák ne kerüljenek bele (azok itt vannak).

## Parancsok
- Migrációk: `npx supabase db push -p "$SUPABASE_DB_PASSWORD"` (a CLI token nélkül is működik)
- Seed: `npx supabase db query --linked -f supabase/seed.sql` (a `db push --include-seed` nem futtatja le); újrafuttatható
- SQL a távoli DB-n: `npx supabase db query --linked "<sql>"`
- Füsttesztek: `npx tsx scripts/smoke/01-alapok.ts`, `npx tsx scripts/smoke/02-crm-katalogus.ts`
- curl (CRM/katalógus): `Accept-Profile: crm|catalog` olvasáshoz, `Content-Profile` íráshoz és RPC-hez; pl. `POST /rest/v1/rpc/price_for` `{"product_code":"TK-00008","customer_group":"KIEMELT"}`

## Állapot
- Kész fázisok:
  - 1. (Alapok) – migrációk feltöltve, seed betöltve, `scripts/smoke/01-alapok.ts` 37/37 OK
  - 2. (CRM + katalógus) – `catalog.price_for` (404/400 hibák), exposed sémák és Queues PostgREST bekapcsolva, `scripts/smoke/02-crm-katalogus.ts` 13/13 OK (csak service kulccsal, bejelentkezett ág kihagyva kérésre)
- Következő: 3. fázis (Raktár)
- Döntések (1. fázis): minden modulséma exposed, de jogot csak a `service_role` kap (a `crm`/`catalog` az `authenticated`-nek is); gyökér `app/` + `lib/` marad (nincs `src/`); az `inventory-worker` cron a 3. fázisban kerül be; a seedelt rendeléseknek nincs Flowable folyamatuk; a `createServiceClient()` a [lib/supabase/server.ts](../lib/supabase/server.ts)-ben, a meglévő kliens mellett.