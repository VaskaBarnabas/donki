---
name: vezetoi-helyzetkep
description: „Hogy állunk?” – heti/napi helyzetkép négy részben (rendelések, kintlévőség, készlet, hibajegyek).
---
# Vezetői helyzetkép

Egy „Hogy állunk?” típusú kérdésre **mind a négy részt** válaszold meg, egymás után lekérdezve, rövid pontokban:

1. **Rendelések:** `list_orders` – hány nyitott rendelés van állapotonként (jóváhagyásra vár, jóváhagyva, szállítás alatt, kiszállítva, fizetésre vár). Ha valamelyik elakadt (pl. jóváhagyásnál készlethiány), `get_order_timeline`-nal nézd meg az okát, és mondd meg.
2. **Kintlévőség:** `list_overdue_documents` – hány lejárt, ki nem fizetett bizonylat van, mennyi összesen, és melyik a legrégebbi. Ha ehhez nincs jogosultság (FORBIDDEN), írd azt, hogy ezt a pénzügyi szerepkör láthatja.
3. **Készlet:** `list_low_stock` – melyik termék van a minimumszint alatt (név, szabad készlet / minimum).
4. **Hibajegyek:** `list_tickets` – a `counts` mezőből: hány **nyitott** (nem lezárt: új + folyamatban + várakozik) hibajegy van, és ebből hány új. A nyitott szám nem azonos az újak számával.

A végén egy mondatban: **mire kell ma figyelni** (a legsürgősebb 1–3 dolog). Csak a lekérdezett számokat használd.
