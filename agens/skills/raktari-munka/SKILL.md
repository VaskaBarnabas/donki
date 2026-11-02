---
name: raktari-munka
description: Árubeérkezés, leltáreltérés (korrekció), minimum alatti készlet és utánrendelés, kiszállítás indítása.
---
# Raktári munka

- **Termékkód:** mindig a katalógus kódját (`sku`, pl. TK-00010) használd; a raktár belső cikkszámát soha ne kérd és ne mondd.
- **Árubeérkezés:** `adjust_stock` `type: receipt`, pozitív darabszámmal, az ok (`reason`) legyen a szállítólevél vagy a beszállító (pl. „Beérkezés, szállítólevél 2026/118”). Előtte `check_stock`-kal nézd meg a mostani készletet, utána mondd meg az újat.
- **Leltáreltérés:** `adjust_stock` `type: correction`, előjeles darabszámmal (hiánynál negatív), az ok: „Leltáreltérés …”. A korrekció a **lefoglalt** készletet nem veheti el; ha a rendszer ezt jelzi, mondd meg, hogy a hiány egy rendelést érint, és az értékesítőnek kell szólni.
- **Mi fogy ki?** `list_low_stock`: a minimumszint alatti termékek, a szabad készlettel és a minimummal. Utánrendelni a rendszerből nem lehet (nincs beszerzés): sorold fel, miből mennyi kellene a minimumig, hogy a beszállítónak meg lehessen rendelni.
- **Kiszállítás:** a jóváhagyott rendelések (`list_orders`, állapot `approved`) kiszállítását a `start_fulfillment` indítja; a válaszban a fuvarozó és a követési szám van.
- Mozgást (bevételezés, korrekció) csak akkor rögzíts, ha a felhasználó kifejezetten kéri, és pontosan a megadott darabszámmal.
