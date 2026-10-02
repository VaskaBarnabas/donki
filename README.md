Téma leírása
A vállalati szoftverarchitektúrák napjainkban paradigmaváltáson mennek keresztül: a merev, determinisztikus SaaS és ERP integrációk helyét a dinamikus, ágens-alapú (Agentic) orkesztrációs munkafolyamatok veszik át. A modern LLM-ek és ágensek már nem csupán asszisztensi funkciókat látnak el, hanem teljes üzleti folyamatokat képesek önállóan koordinálni.
A vállalatok legnagyobb kihívása azonban a meglévő, heterogén legacy rendszereik (adatbázisok, REST/SOAP API-k, hagyományos BPEL/BPMN folyamatmotorok) biztonságos és hatékony bevonása ebbe az új ökoszisztémába. A modernizáció kulcsa a Model Context Protocol (MCP), amely standard interfészként („USB-portként”) elrejti az alrendszerek komplexitását az ágensek elől, valamint a digitális tranzakciókat és kereskedelmi folyamatokat szabványosító Google Universal Commerce Protocol (UCP).
A hallgató feladatai lépésről lépésre:
A mock legacy vállalati infrastruktúra gyors prototipizálása („vibe coding”):
Egy működő, realisztikus vállalati mikrokörnyezet felépítése generatív AI eszközökkel (pl. Cursor, Claude Code, GitHub Copilot).
Alrendszerek létrehozása:
Adatbázisok és alapvető entitások (termékkatalógus, raktárkészlet, rendelések, partnerek).
API végpontok és hagyományos üzleti logikát / folyamatokat leíró engine (pl. BPEL/BPMN munkafolyamat motor).
Modulok lefedése: raktárkezelés/logisztika, számlázás és könyvelési modulok, valamint külső fizetési integráció szimulációja (pl. Stripe API).
Ágens-alapú refaktorálás és MCP Server réteg kialakítása:
Standardizált MCP (Model Context Protocol) szerverek megtervezése és implementálása a legacy komponensek fölé, amelyek elrejtik a nyers API-kat és közvetlen DB hozzáféréseket.
Specializált képességekkel (Skills) felruházott ágensek konfigurálása, amelyek természetes nyelven (pl. chatbottal történő rendelésleadás, státuszlekérdezés, hibakezelés) vezérlik a vállalati folyamatokat.
AI Tokenomics mérés és optimalizáció: token-költség és válaszidő monitorozása a végrehajtási ciklusok során.
Google Universal Commerce Protocol (UCP) integráció:
A rendszer felkészítése és összekötése az UCP szabvánnyal, megvalósítva az autonóm, platformfüggetlen kereskedelmi és tranzakciós folyamatokat.
Transzformációs metodológia kidolgozása és dokumentálása:
Egy reprodukálható módszertani útmutató összeállítása arról, hogy hagyományos monolit / mikroszerviz alapú vállalati rendszereket milyen lépések mentén érdemes autonóm, MCP-alapú ágens architektúrára átállítani.
---

# Legacy CRM prototípus – fejlesztői leírás

A teljes specifikáció: [docs/LEGACY_CRM_BUILD_SPEC.md](docs/LEGACY_CRM_BUILD_SPEC.md).

## Adatbázis (Supabase)

A projekt egy Supabase felhőprojekthez van linkelve (`npx supabase link`). Migrációk: `supabase/migrations`, seed: `supabase/seed.sql`.

```bash
npx supabase db push                               # migrációk a felhőprojektre
npx supabase db query --linked -f supabase/seed.sql  # seed betöltése
npx tsx scripts/smoke/01-alapok.ts                 # 1. fázis füstteszt
```

A seed újrafuttatható (először kiüríti a modultáblákat és a sorokat).

### Sémák

Minden modul saját sémát kap, saját azonosító-, dátum- és pénzformátummal: `crm`, `catalog`, `quote`, `orders`, `inventory`, `billing`, `payment`, `support`. A `flowable` sémát a Flowable konténer kezeli.

### Exposed schemas (Dashboard → Project Settings → Data API → Exposed schemas)

Ide fel kell venni: `crm`, `catalog`, `quote`, `orders`, `inventory`, `billing`, `payment`, `support`.

- `crm` és `catalog`: kívülről is elérhető PostgREST-en (`Accept-Profile: crm` / `catalog`), az `authenticated` szerep olvashatja és írhatja.
- A többi modulséma csak azért exposed, hogy a Next.js szerver oldali kódja a service role kulccsal elérje (`createServiceClient().schema('quote')`). Az `anon` és `authenticated` szerepnek nincs `usage` joga ezekre, így kívülről nem érhetők el.
- A `flowable` séma **ne** legyen exposed.

### Üzenetsorok (Supabase Queues / pgmq)

Sorok: `inventory_commands`, `inventory_replies`, `inventory_alerts`, `order_events`, `payment_events`.

Dashboard → Integrations → Queues → Settings: **Expose Queues via PostgREST** bekapcsolása (ez hozza létre a `pgmq_public` sémát), hogy a későbbi MCP szerver is tudjon olvasni/írni.

### Időzített feladatok (pg_cron, UTC)

| Név | Ütemezés | Feladat |
|---|---|---|
| `billing-lejart` | `15 2 * * *` | `billing.jelol_lejart()` – lejárt, nem fizetett számlák megjelölése |
| `orders-szallitas-szimulacio` | `* * * * *` | `orders.leptet_szallitasok()` – fuvarozói állapotok léptetése, ~15% KESIK |
