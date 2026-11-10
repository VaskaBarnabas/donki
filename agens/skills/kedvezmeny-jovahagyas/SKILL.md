---
name: kedvezmeny-jovahagyas
description: A 15% feletti összesített kedvezmény jóváhagyása – mikor kell, kitől, milyen indoklással.
---
# Kedvezmény-jóváhagyás

- Az összesített kedvezmény = 1 − nettó / listaár. Ha **15% fölött** van, az ajánlat nem fogadható el (`accept_quote` → `APPROVAL_REQUIRED`), amíg jóvá nem hagyják.
- **Jóváhagyás kérése:** `request_quote_approval` a `quoteId`-val és egy rövid üzleti **indoklással** (`reason`, legalább 3 karakter). Ne találj ki üzleti okot.
  - Ha a felhasználó **kifejezetten kérte**, hogy kérd a jóváhagyást, de okot nem adott: kérd meg most, indoklásnak a tényt írd (pl. „20% kedvezmény az értékesítő kérésére”), és a válaszban mondd el, hogy a vezető az indoklást kiegészítve vagy elutasítva dönthet. Ne állj meg visszakérdezni.
  - Ha nem kérte, csak a kedvezményt: mondd meg, hogy jóváhagyás kell, és kérdezd meg az okot.
- **Jóváhagyni csak az értékesítési vezető** (`sales_manager`) tud (`approve_quote`). Ha a felhasználó nem értékesítési vezető, mondd meg, hogy az ajánlat jóváhagyásra vár, és a vezetőnek kell jóváhagynia.
- Jóváhagyás után az ajánlat `approved`, és `accept_quote`-tal elfogadható.
- Soha ne ígérj a felhasználónak kedvezményt, amit a rendszer nem adott.
