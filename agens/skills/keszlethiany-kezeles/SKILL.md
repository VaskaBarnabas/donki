---
name: keszlethiany-kezeles
description: Mit lehet tenni, ha egy rendelés készlethiány miatt nem hagyható jóvá vagy elakadt.
---
# Készlethiány kezelése

- Jele: a rendelés jóváhagyása `INSUFFICIENT_STOCK` hibát ad, vagy a rendelés idővonalán (`get_order_timeline`) `INVENTORY_SHORTAGE` sikertelen lépés van („4717 (hiany: 1 db)”).
- **Részszállítás nincs:** a rendelés vagy egészben megy, vagy sehogy.
- A lehetőségek (javasold, a döntés a felhasználóé):
  1. **mennyiség csökkentése** a rendelkezésre álló készletre (`modify_order` – csak jóváhagyás előtt);
  2. **másik termék** ugyanabból a kategóriából (`search_products`, majd `check_stock`);
  3. **várakozás**, amíg a készlet beérkezik (a `list_low_stock` mutatja a minimum alatti cikkeket).
- A készletet te nem módosíthatod a hiány „megoldására”: a raktári korrekció a logisztika dolga.
- Mindig mondd meg pontosan, melyik termékből mennyi hiányzik.
