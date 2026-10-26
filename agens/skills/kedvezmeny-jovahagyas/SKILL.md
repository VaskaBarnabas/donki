---
name: kedvezmeny-jovahagyas
description: A 15% feletti összesített kedvezmény jóváhagyása – mikor kell, kitől, milyen indoklással.
---
# Kedvezmény-jóváhagyás

- Az összesített kedvezmény = 1 − nettó / listaár. Ha **15% fölött** van, az ajánlat nem fogadható el (`accept_quote` → `APPROVAL_REQUIRED`), amíg jóvá nem hagyják.
- **Jóváhagyás kérése:** `request_quote_approval` a `quoteId`-val és egy rövid üzleti **indoklással** (`reason`, legalább 3 karakter). Ha a felhasználó nem adott indoklást, kérdezd meg tőle – ne találj ki.
- **Jóváhagyni csak az értékesítési vezető** (`sales_manager`) tud (`approve_quote`). Ha a felhasználó nem értékesítési vezető, mondd meg, hogy az ajánlat jóváhagyásra vár, és a vezetőnek kell jóváhagynia.
- Jóváhagyás után az ajánlat `approved`, és `accept_quote`-tal elfogadható.
- Soha ne ígérj a felhasználónak kedvezményt, amit a rendszer nem adott.
