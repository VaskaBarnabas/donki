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

## Állapot
- Kész fázisok: 1. (Alapok) – migrációk feltöltve, seed betöltve, `scripts/smoke/01-alapok.ts` 37/37 OK
- Következő: 2. fázis (CRM + katalógus). Előfeltétel: exposed schemas + Queues PostgREST a Dashboardon, `SUPABASE_SERVICE_ROLE_KEY` a `.env.local`-ban
- Megjegyzés: a `db push --include-seed` a seedet nem futtatta le; a seed betöltése: `npx supabase db query --linked -f supabase/seed.sql`
- Döntések (1. fázis): minden modulséma exposed, de jogot csak a `service_role` kap (a `crm`/`catalog` az `authenticated`-nek is); gyökér `app/` + `lib/` marad (nincs `src/`); az `inventory-worker` cron a 3. fázisban kerül be; a seedelt rendeléseknek nincs Flowable folyamatuk; a `createServiceClient()` a [lib/supabase/server.ts](../lib/supabase/server.ts)-ben, a meglévő kliens mellett.