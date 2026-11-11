# Terhelés: hány felhasználót bír egy gép? (Ö4)

*20. fázis, 2. kör · 2026-11-11 · adatok: [adatok/terheles.json](adatok/terheles.json) · szkript: `scripts/riportok/terheles-meres.ts` · gép: Apple M5, 24 GB, Ollama alapbeállítással (`OLLAMA_NUM_PARALLEL` nincs megadva)*

## 1. A kérdés

Eddig minden mérésben egyszerre egy kérés futott. Egy cégnél viszont többen használják az asszisztenst egyszerre. A kérdés az, hogyan változik a válaszidő és az áteresztőképesség, ha 2 vagy 4 kérés fut párhuzamosan ugyanazon a gépen, és ebből hány felhasználó jön ki.

## 2. A mérés

- **Feladatok:** négy olvasó feladat (készlet, csomag, „kifizették már?”, ajánlat állapota), modellenként és szintenként 12 futás, MCP-vel.
- **Párhuzamosság:** 1, 2 és 4 egyszerre futó ágens, külön munkamenettel.
- **Mérőszámok:**
  - **idő:** a kérés elküldésétől a válaszig, az előkészítés nélkül;
  - **áteresztőképesség:** befejezett futás percenként, a teljes falidőből.

## 3. Eredmény

| Modell | Párhuzamos kérés | Medián válaszidő | p95 | Futás / perc | Siker |
|---|---:|---:|---:|---:|---:|
| e4b | 1 | 7,6 mp | 11,3 mp | 4,9 | 10/12 |
| e4b | 2 | 6,2 mp | 10,9 mp | **10,1** | 10/12 |
| e4b | 4 | 10,4 mp | 15,5 mp | **13,6** | 10/12 |
| 12b | 1 | 11,3 mp | 16,9 mp | 3,6 | 10/12 |
| 12b | 2 | 14,9 mp | 25,0 mp | 5,7 | 11/12 |
| 12b | 4 | 27,3 mp | 35,0 mp | 7,0 | 12/12 |

**Mit mutat a táblázat:**

- **Az e4b két párhuzamos kérésnél a kétszeresét teljesíti, lassulás nélkül.** A gép egy kérésnél nincs kihasználva, a modell a második kérést gyakorlatilag ingyen kiszolgálja.
- **Négy kérésnél** az áteresztőképesség tovább nő (13,6 futás/perc), a válaszidő viszont kb. 40%-kal nő.
- **A 12b sokkal hamarabb telítődik:** négy kérésnél a medián 27 másodperc, ami interaktív használatra már kényelmetlen.
- **A siker nem romlott a terheléssel.** A hiányzó futások a „hol a csomag?” feladat ismert ingadozásából jönnek (a szimulált fuvarozó a válasz és az ellenőrzés között továbbléphet).

## 4. Hány felhasználó jön ki ebből?

A [pénzügyi terv](../04-penzugy/penzugyi-elemzes.md) 25 felhasználós alapesetében évi 78 118 futás van. Ez munkanaponként kb. 311 futás, a csúcsórában a napi 30%-a, kb. 93 futás óránként, vagyis 1,6 futás percenként.

| | e4b, 4 párhuzamos | 12b, 4 párhuzamos |
|---|---:|---:|
| Kapacitás | 13,6 futás/perc | 7,0 futás/perc |
| 25 felhasználó csúcsigénye | 1,6 futás/perc | 1,6 futás/perc |
| **Tartalék** | **kb. 8×** | **kb. 4×** |
| Becsült felső határ egy gépen | kb. 200 felhasználó | kb. 100 felhasználó |

A felső határ lineáris becslés a 25 fős igényből, a háttérfigyelő terhelése és a hosszabb (írós, összesítő) feladatok nélkül. **Óvatosan kezelve: egy gép e4b-vel kb. 100, 12b-vel kb. 50 felhasználót szolgálhat ki kényelmesen.** A pénzügyi terv 25 főtől két gépet számol (egy tartalékkal), ez a mérés szerint bőven elég.

## 5. Korlátok

- **Csak olvasó feladatok,** szintenként 12 futás. Az írós feladatok jóváhagyásra várnak, az összesítő feladatok hosszabbak.
- **Egy gép, alapbeállítás.** Az Ollama párhuzamossági beállításával (`OLLAMA_NUM_PARALLEL`) és a kontextusmérettel tovább lehetne hangolni. Ezt nem vizsgáltuk.
- **A Mac Studio szerverként nem mértük;** az M5 MacBook Pro eredménye rá csak közelítőleg érvényes.
- **A felhasználónkénti futásszám** a pénzügyi terv feltevése (78 118 futás / 25 fő / év), nem mért adat.
