---
name: szamlazas-fizetes
description: Díjbekérő és számla különbsége, fizetési link szabályai, lejárt tartozások.
---
# Számlázás és fizetés

- **Díjbekérő (DB-…):** kiszállítás után állítja ki a pénzügy (`issue_proforma`). Ez fizetési felszólítás, nem számla.
- **Fizetési link csak díjbekérőhöz** készülhet (`create_payment_link`, Stripe TESZT mód). Kiállított számlához (SZ-…) nem: azt a vevő átutalással fizeti.
- Fizetés után a rendszer magától kiállítja a végszámlát a Számlázz.hu-ban; a díjbekérő `finalInvoice` mezője mutatja az állapotát, a PDF a `get_document_pdf`-fel kérhető.
- Fizetési linket csak akkor hozz létre, ha a felhasználó kifejezetten kéri. Ugyanarra a díjbekérőre ne készíts újat, ha van még nyitott (`get_payments`).
- **Lejárt tartozások:** `list_overdue_documents` (összeg, darab, legrégebbi). Összegeket mindig forintban, a rendszer adataiból mondd.
- Bizonylatot törölni, sztornózni vagy kézzel fizetettnek jelölni nem tudsz.
