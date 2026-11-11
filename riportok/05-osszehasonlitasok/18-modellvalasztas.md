# Modellválasztás: e4b vagy 12b? (Ö9)

*20. fázis, 2. kör · 2026-11-11 · adatok: [adatok/osszevetesek.json](adatok/osszevetesek.json), [01-meres](../01-meres/ertekeles-2026-11-07-javitott.md), [11-tokenomics.md](11-tokenomics.md) · a 27b modellt nem mértük (döntés: a 24 GB-os gépen nem futna stabilan)*

## 1. A kérdés

Mekkora helyi modell kell? A nagyobb modell okosabb, de lassabb, és több memóriát kér. A kérdés az, hogy a mi feladatainkon hol van a „jó elég” pont, és hogyan függ ez attól, hogy az ágens MCP-n vagy nyers interfészen dolgozik.

## 2. A két modell egymás mellett

| | gemma4:e4b | gemma4:12b |
|---|---:|---:|
| Paraméter | 8,0 milliárd (effektív kb. 4) | 12,4 milliárd |
| Kvantálás, futtató | Q4_K_M, llama.cpp | NVFP4, MLX |
| Betöltve, memória (`ollama ps`) | **3,4 GB** | **13 GB** |
| **MCP-vel** | | |
| Siker (33 feladat, 99 futás) | 92% | 94% |
| Minden ismétlésben sikeres feladat | 82% | 88% |
| Válaszidő, medián | **8,0 mp** | 12,7 mp |
| Válaszidő, p95 | 15,7 mp | 23,0 mp |
| Token be / futás | 8 279 | 8 946 |
| **Nyers interfészen** (27 feladat) | | |
| Siker | **9%** | **41%** |
| Válaszidő, átlag | 4,6 mp | 305,8 mp |

## 3. A fő megállapítás: az MCP kiváltja a modellméretet

- **Nyers interfészen a modellméret mindent eldönt** (9% és 41%). A kisebb modell a 81 futásból csak 5-ben olvasta el a rendszer dokumentációját, a nagyobb 80-ból 76-ban (lásd [16-betanulas.md](16-betanulas.md)). A kicsi tehát találgat, a nagy olvas, de így is minden második feladatot elrontja, és nagyon lassú.
- **MCP-vel a különbség 2 százalékpontra szűkül** (92% és 94%). Az MCP-réteg elvégzi azt, amihez a nyers változatnak nagy modell kellene: a formátumok, az azonosítók és a hibák értelmezését.
- **Ezért a kisebb modell is elég:** másfélszer gyorsabb, és a memóriaigénye negyede. Egy 24 GB-os gépen így párhuzamosan több kérés is kiszolgálható (lásd a terhelés-mérést).

## 4. Hol számít mégis a nagyobb modell?

- **Hosszú, összesítő feladatoknál** ingadozik mindkettő. A „Hogy állunk?” (F20) feladatnál az e4b 3-ból 2-szer, a 12b egyszer sem volt teljesen sikeres.
- **Tűrőképesség:** a [tokenomika-mérésben](11-tokenomics.md) a 12b eltűrte a rövidített bemenetet (94% → 96%), az e4b nem (92% → 79%). A nagyobb modell kevésbé érzékeny a prompt kialakítására.
- **Megbízhatóság:** a minden ismétlésben sikeres feladatok aránya a 12b-nél 6 ponttal magasabb.

## 5. Ajánlás

| Felhasználás | Modell | Ok |
|---|---|---|
| Interaktív asszisztens a portálon | **e4b** | gyorsabb, kevesebb memória, a siker közel azonos |
| Háttérfigyelő elemzései | e4b | rövid, egy rendszerre szűkített feladat |
| Összesítő, vezetői riport, ritka hosszú feladat | 12b mérlegelhető | stabilabb, de lassabb |
| MCP nélküli integráció | egyik sem | a nyers változat egyik modellel sem üzletileg használható |

## 6. Korlátok

- **Két pont, nem görbe.** A 27b-t és a 2b-t nem mértük, ezért a „jó elég” pont a két mért modell között van, de pontosan nem tudjuk, hol.
- **A memóriát az Ollama jelenti,** két különböző futtatóval (MLX és llama.cpp), ezért az összevetés tájékoztató.
- **Egy gép.** Más hardveren az idők arányai is mások lehetnek.
