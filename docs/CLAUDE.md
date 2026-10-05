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
- Flowable: `npm run flowable:up` / `flowable:down` / `flowable:logs`; BPMN telepítés: `npm run flowable:deploy` (vagy `-- <fájl>`); REST: `$FLOWABLE_REST_URL` Basic auth-tal (`FLOWABLE_REST_USER`/`PASSWORD`)
- Lint: `npx eslint app components lib legacy scripts` (az `eslint .` a `.next` kimenetet is linteli)
- Füsttesztek: `npx tsx scripts/smoke/01-alapok.ts`, `02-crm-katalogus.ts`, `03-raktar.ts` (a 03 ~2 perc a DLQ-teszt miatt), `04-ajanlat.ts`, `05-szamlazas.ts` (a 04 és 05 futó Next.js szervert igényel, `APP_BASE_URL`), `06-flowable.ts` (futó Flowable konténer kell), `07-rendelesek.ts` (Next.js + Flowable, ~3-4 perc), `08-fizetes.ts` (Next.js + Flowable + futó `stripe listen`, ~2 perc). A tesztek a kiszállított készletet a végén visszavételezik (KORREKCIO).
- Stripe: `stripe listen --all-snapshot --forward-to localhost:3000/api/legacy/payments/webhook` (a kiírt `whsec_…` a `STRIPE_WEBHOOK_SECRET`)
- curl (CRM/katalógus): `Accept-Profile: crm|catalog` olvasáshoz, `Content-Profile` íráshoz és RPC-hez; pl. `POST /rest/v1/rpc/price_for` `{"product_code":"TK-00008","customer_group":"KIEMELT"}`

## Állapot
- Kész fázisok:
  - 1. (Alapok) – migrációk feltöltve, seed betöltve, `scripts/smoke/01-alapok.ts` 37/37 OK
  - 2. (CRM + katalógus) – `catalog.price_for` (404/400 hibák), exposed sémák és Queues PostgREST bekapcsolva, `scripts/smoke/02-crm-katalogus.ts` 13/13 OK (csak service kulccsal, bejelentkezett ág kihagyva kérésre)
  - 3. (Raktár) – `inventory.process_commands()` + `inventory-worker` cron (5 mp), DLQ (`read_ct > 3` → archive + R-99), `MIN_KESZLET_ALATT` figyelmeztetés átlépéskor, poll segéd: `legacy/orders/raktar-hivas.ts`; `scripts/smoke/03-raktar.ts` 13/13 OK
  - 4. (Ajánlatmotor) – JSON-RPC `POST /api/legacy/quote-rpc`, `legacy/quote/` (pricing BigInt-tel, kulso.ts a CRM/katalógus/rendelés felé), `scripts/smoke/04-ajanlat.ts` 20/20 OK. Az `accept` a 7. fázis óta valódi rendelést hoz létre. `cacheComponents` kikapcsolva, `proxy.ts` nem fut az `/api/legacy/*`-on.
  - 5. (Számlázás) – szöveges protokoll `POST /api/legacy/billing`, `legacy/billing/`; Számlázz.hu helyett PDF bizonylat (`pdf-lib`, privát `szamlak` bucket, új parancs: `SZAMLA|PDF`), kiállítás/sztornó PL/pgSQL függvényben; `scripts/smoke/05-szamlazas.ts` 30/30 OK
  - 6. (Flowable alapok) – `docker-compose.yml` (`flowable/flowable-rest:7.2.0`, session pooler, 62 tábla a `flowable` sémában, Hikari max. 5), `lib/flowable/client.ts`, `flowable/deploy.ts`, próba BPMN: `flowable/test/proba_folyamat.bpmn20.xml`; `scripts/smoke/06-flowable.ts` 12/12 OK
  - 7. (Rendelések) – BPMN `flowable/processes/rendeles_folyamat.bpmn20.xml` (HTTP taskok, lemondási event subprocess, szállításkövető timer), motor-végpontok `app/api/legacy/orders/%5Fengine/[action]`, homlokzat `app/api/legacy/orders/[...path]`, `legacy/orders/`; `scripts/smoke/07-rendelesek.ts` 33/33 OK. BPMN módosítás után: `npm run flowable:deploy` (a futó példányok a régi verzión maradnak).
  - 8. (Fizetés) – REST `app/api/legacy/payments` (Bearer, modern hibák), webhook `app/api/legacy/payments/webhook` (aláírás nyers törzzsel, idempotens), `legacy/payments/`; Stripe Checkout HUF (fillér); sikeres fizetés → `SZAMLA|FIZETVE` + `FizetesBeerkezett` → `LEZART`; `scripts/smoke/08-fizetes.ts` 22/22 OK
- Következő: 9. fázis (Support SOAP). Előfeltétel: `.env.local`: `LEGACY_SUPPORT_KEY`
- Döntések (1. fázis): minden modulséma exposed, de jogot csak a `service_role` kap (a `crm`/`catalog` az `authenticated`-nek is); gyökér `app/` + `lib/` marad (nincs `src/`); az `inventory-worker` cron a 3. fázisban kerül be; a seedelt rendeléseknek nincs Flowable folyamatuk; a `createServiceClient()` a [lib/supabase/server.ts](../lib/supabase/server.ts)-ben, a meglévő kliens mellett.