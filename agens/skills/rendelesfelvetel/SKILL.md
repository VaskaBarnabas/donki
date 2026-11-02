---
name: rendelesfelvetel
description: Rendelés felvétele lépésről lépésre – vevő azonosítása, termékválasztás, ajánlat, elfogadás.
---
# Rendelésfelvétel

Rendelés csak elfogadott ajánlatból jön létre. A lépések:

1. **Vevő:** `search_customers` a név **egy jellemző szavával** (pl. „Bakony”), vagy pontos adószámmal. Ha nincs találat, próbáld újra egy másik szóval. A név eltérő írásmódban is jöhet („DUNA-IRODAHAZ KFT.” = „Duna Irodaház Kft”). Ha több találat van, kérdezz vissza. Ha nincs, és a felhasználó szerint **új érdeklődő**: kérd el a cégnevet és az adószámot (és ha van, a címet), majd `create_customer`; új vevő a normál ügyfélcsoportba kerül, így normál árat kap.
2. **Termék:** `search_products` (kulcsszó, kategória). A termék kódja a `sku` (pl. TK-00001).
   - **Létezik-e?** Ha nincs találat, próbáld `includeInactive: true`-val is. Ha így megvan, de `active: false`: **kivezetett termék** – mondd meg, hogy már nem forgalmazzuk, és ajánlj helyette egy aktív terméket ugyanabból a kategóriából. Ha így sincs, mondd meg, hogy nincs ilyen termékünk.
   - Inaktív termékre ajánlat nem készülhet.
3. **Készlet (tájékoztató):** `check_stock` a sku-ra. Ha `available` kevesebb a kértnél, szólj előre: a rendelés jóváhagyásakor a hiányzó tétel miatt elakadhat.
4. **Ajánlat:** `create_quote` a vevő `customerId`-jával és a tételekkel (sku, quantity). Az ár a vevő ügyfélcsoportjától és a mennyiségtől függ (10 db felett +3%, 50 db felett +5% mennyiségi kedvezmény). Az árat mindig az ajánlatból mondd, ne számold fejben.
5. **Kedvezmény-jóváhagyás:** ha az ajánlatnál `approvalRequired: true` (összesített kedvezmény > 15%), előbb `request_quote_approval` kell indoklással – lásd a `kedvezmeny-jovahagyas` skillt.
6. **Elfogadás:** ha a felhasználó kéri a rendelést, `accept_quote` → létrejön a rendelés (RND-…), állapota „Rögzítve, jóváhagyásra vár”. A rendelés jóváhagyása az értékesítési vezető dolga.

A végén mondd meg: az ajánlat számát (AJ-…), a nettó összeget, és ha van, a rendelés számát (RND-…) és a következő lépést (`nextAction`).
