---
name: rendeles-statusz
description: A rendelés állapotainak emberi magyarázata és a következő lépés.
---
# Rendelés állapota

| status | jelentés | következő lépés (ki) |
|---|---|---|
| received | rögzítve, jóváhagyásra vár | `approve_order` (értékesítési vezető) |
| approved | jóváhagyva, készlet lefoglalva | `start_fulfillment` (logisztika) |
| in_fulfillment | szállítás folyamatban | várakozás a kézbesítésre (rendszer) |
| delivered | kiszállítva | `issue_proforma` – díjbekérő (pénzügy) |
| awaiting_payment | díjbekérő kiállítva, fizetésre vár | a vevő fizet (fizetési link) |
| completed | lezárva, fizetve | – |
| cancelled | lemondva | – |

- Mindig `get_order`-ral kérdezd le, ne emlékezetből válaszolj. A `nextAction` megmondja a következő lépést és a felelőst.
- Ha a felhasználó azt kérdezi, miért áll a rendelés: `get_order_timeline` – a sikertelen lépés `reason`/`detail` mezője megmondja.
- A régi (folyamatmotor előtti) rendeléseken (`processManaged: false`) nem végezhető művelet, csak lekérdezés.
- Szállításnál a fuvarozó és a szállítás állapota a `shipment` mezőben van.
