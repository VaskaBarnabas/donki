# Tokenomika: generált táblázatok

*`scripts/riportok/tokenomics.ts` · alapmérés: `2026-11-07-javitott` · változatok: *

## 1. Összkép

| Mérés | Modell | Futás | Siker | Modellhívás/futás | Token be/futás | Token ki/futás | Idő (mp) | p50 | p95 | Modellidő | Eszközidő |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-07-javitott | e4b | 99 | 92% | 3,7 | 8279 | 178 | 8,5 | 8,0 | 15,7 | 7,4 | 1,0 |
| 2026-11-07-javitott | 12b | 99 | 94% | 3,8 | 8946 | 158 | 14,0 | 12,7 | 23,0 | 12,5 | 1,4 |

## 2. Végrehajtási ciklusok (alapmérés)

**e4b**

| Ciklus | Futás | Token be | Token ki | Modellidő (ms) | Bemeneti token/mp* |
|---|---|---|---|---|---|
| 1 (front-desk) | 99 | 342 | 25 | 1169 | 293 |
| 2 | 99 | 2513 | 26 | 2026 | 1241 |
| 3 | 99 | 2822 | 68 | 2257 | 1250 |
| 4 | 37 | 3085 | 76 | 2551 | 1209 |
| 5 | 24 | 3676 | 75 | 2517 | 1460 |
| 6 | 7 | 4904 | 53 | 1986 | 2470 |
| 7 | 3 | 6959 | 279 | 8653 | 804 |

**12b**

| Ciklus | Futás | Token be | Token ki | Modellidő (ms) | Bemeneti token/mp* |
|---|---|---|---|---|---|
| 1 (front-desk) | 99 | 336 | 11 | 1161 | 289 |
| 2 | 99 | 2513 | 28 | 4662 | 539 |
| 3 | 99 | 2854 | 66 | 3489 | 818 |
| 4 | 48 | 3337 | 56 | 3367 | 991 |
| 5 | 18 | 3818 | 48 | 2989 | 1277 |
| 6 | 9 | 4774 | 75 | 4173 | 1144 |
| 7 | 3 | 6682 | 12 | 842 | 7939 |
| 8 | 3 | 9730 | 312 | 20 505 | 475 |

*A teljes modellidővel osztva, a kimenet generálását is beleértve.

## 3. Szakágensenként (alapmérés, modellhívásonként)

| Ágens | Modellhívás | Token be | Token ki | Modellidő (ms) |
|---|---|---|---|---|
| ertekesites | 211 | 2949 | 54 | 2640 |
| frontdesk | 198 | 339 | 18 | 1165 |
| rendeles | 148 | 3164 | 57 | 3789 |
| ugyfelszolgalat | 87 | 2351 | 52 | 3098 |
| kivetel | 63 | 4222 | 51 | 3983 |
| raktar | 39 | 1978 | 54 | 2673 |

## 4. Egy szakágens-hívás bemenete (Ollama-számlálás, e4b)

| Ágens | Eszköz | Rendszerutasítás | Eszközleírás | Eszköz aránya | Opcionális leírás nélkül | Minden leírás nélkül |
|---|---|---|---|---|---|---|
| ertekesites | 11 | 1022 | 1525 | 59% | 2383 (−7%) | 2166 (−16%) |
| rendeles | 15 | 932 | 2002 | 68% | 2880 (−3%) | 2301 (−22%) |
| raktar | 6 | 794 | 758 | 48% | 1526 (−3%) | 1374 (−13%) |
| ugyfelszolgalat | 9 | 807 | 1123 | 58% | 1822 (−7%) | 1636 (−16%) |
| kivetel | 11 | 904 | 1259 | 58% | 2043 (−7%) | 1848 (−15%) |

## 5. A legnagyobb eszközválaszok (MCP-hívásnapló, 2026-11-07 óta)

| Eszköz | Hívás | Átlag (bájt) | Maximum (bájt) |
|---|---|---|---|
| list_quotes | 145 | 8385 | 19317 |
| list_tickets | 67 | 5841 | 15123 |
| list_orders | 92 | 3589 | 17137 |
| get_customer | 3 | 2555 | 2589 |
| list_overdue_documents | 75 | 2072 | 4205 |
| start_fulfillment | 113 | 1302 | 1307 |
| accept_quote | 180 | 1261 | 1311 |
| issue_proforma | 24 | 1224 | 1226 |

## 6. Költség futásonként

| Modell | Token be | Token ki | Helyi áram | Sonnet 5.5 | Sonnet 5.5, gyorsítótárral (becslés) | Haiku 5.5 | Sonnet / év | Sonnet gyorsítótárral / év |
|---|---|---|---|---|---|---|---|---|
| e4b | 8279 | 178 | 0,02 Ft | 5,73 Ft | 3,35 Ft | 0,29 Ft | 447 547 Ft | 261 946 Ft |
| 12b | 8946 | 158 | 0,03 Ft | 6,09 Ft | 3,43 Ft | 0,30 Ft | 475 447 Ft | 268 213 Ft |

Évi futásszám: 78 118 (a pénzügyi terv 25 felhasználós alapesete). A felhős sorok csak a tokendíjat mutatják azonos token-számmal, a felhőmodell viselkedését nem mértük. A helyi áram 60 W-tal számol, ami nem mért érték.

## 7. Optimalizáció az alapméréshez képest

Még nincs optimalizált mérés.

## 8. Feladatok, ahol romlott a siker (legalább 2 futással az alapméréshez képest)

Egyik feladaton sem romlott legalább 2 futással.
