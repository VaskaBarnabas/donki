# Az emberi jóváhagyás terhelése és haszna (Ö12)

*20. fázis, 2. kör · 2026-11-11 · adatok: [adatok/osszevetesek.json](adatok/osszevetesek.json) · szkript: `scripts/riportok/osszevetesek-adatbol.ts` · mérések: nyers `2026-11-03`, MCP `2026-11-07-javitott`*

## 1. A kérdés

A rendszerben minden írás (ajánlat, elfogadás, díjbekérő, fizetési link, sztornó) emberi jóváhagyással megy. Ez biztonságos, de munka is, és ha sok a kártya, megjelenik a „gépies bólintás” veszélye. A kérdés:

- mennyi kártyát kér az ágens;
- a jóváhagyott írások jó futásokhoz tartoztak-e;
- hány rossz írást fogott meg a kapu;
- mennyi emberi idő ez éves szinten.

A mérésben a jóváhagyást a futtató végezte: a feladathoz tartozó írást engedte, minden mást elutasított és megszámolt.

## 2. Eredmény

| Változat | Futás | Kártya | Kártya / futás | Ebből sikeres futásban | Nem várt írási kísérlet (elutasítva) |
|---|---:|---:|---:|---:|---:|
| MCP · 12b | 99 | 55 | 0,56 | **55 (100%)** | 0 |
| MCP · e4b | 99 | 55 | 0,56 | 50 (91%) | 0 |
| nyers · 12b | 80 | 64 | 0,80 | 35 (55%) | 0 |
| nyers · e4b | 81 | 15 | 0,19 | 4 (27%) | **3** |

**Mit mutat a táblázat:**

1. **MCP-vel a kártya szinte mindig jó írást kér.** A 12b-nél mind az 55 jóváhagyott írás sikeres futáshoz tartozott, az e4b-nél 55-ből 50. A jóváhagyó tehát jellemzően helyes dolgot hagy jóvá, és a kártyán az MCP-eszköz pontos, emberi nyelvű összefoglalója áll.
2. **Nyers interfésszel a kártyák fele rossz futáshoz tartozott.** A 12b-nél 64 kártyából csak 35 vezetett sikerhez. A jóváhagyó olyan írást engedélyez, ami végül nem azt csinálja, amit kellene, és a kártyán nyers JSON-RPC-hívás vagy szöveges protokollsor áll, amit ember nehezen ellenőriz.
3. **A kapu háromszor fogott meg jogosulatlan írást,** mind a nyers e4b-nél. MCP-vel ilyen nem volt: az MCP-s ágens csak a szakágensének engedett eszközöket látja.

## 3. Mennyi emberi idő?

Egy kártya elolvasása és eldöntése a feltevésünk szerint 20 másodperc (a [pénzügyi terv](../04-penzugy/penzugyi-elemzes.md) és az [emberi idő](../03-emberi-tenyezo/emberi-ido-pontositas.md) is ezzel számol).

| | Érték |
|---|---:|
| Évi futás (a pénzügyi terv 25 felhasználós alapesete) | 78 118 |
| Kártya / futás (MCP) | 0,56 |
| Kártya / év | kb. 43 700 |
| Kártya / munkanap (251 nap) | kb. 174 |
| **Emberi idő / munkanap** | **kb. 58 perc**, a csapat egészére |

Ez 25 felhasználóra elosztva fejenként napi 2–3 perc, tehát a terhelés kicsi. **A veszély nem az idő, hanem a figyelem:** napi 174 kártyánál könnyű rutinból jóváhagyni. A [munkaerő-becslés](../../docs/MUNKAERO_BECSLES.md) nagy volumenre (napi 500 rendelés) már napi kb. 4700 kártyát számolt, ami jóváhagyónként kb. 200.

## 4. Következtetések

- **A jóváhagyás MCP-vel hatékony szűrő:** kevés kártya, a jóváhagyott írások jók, a kártya érthető.
- **A nyers interfésznél a jóváhagyás nem véd eléggé,** mert a jóváhagyó nem tudja megítélni a nyers hívást. A kártyák fele rossz futáshoz tartozik.
- **Nagyobb volumennél kockázatalapú jóváhagyás kell,** ahogy a Gartner is javasolja (G12): az alacsony kockázatú, visszafordítható írás menjen szabály szerint, szúrópróbával, a pénzügyi és visszavonhatatlan maradjon emberi döntés. Ezt a [munkaerő-becslés](../../docs/MUNKAERO_BECSLES.md) 5. pontja részletezi. A rendszerben ma minden írás kártyát kér.

## 5. Korlátok

- **A mérésben a jóváhagyást program végezte**, a feladat elvárt írásai alapján. Egy valódi jóváhagyó elutasíthatott volna olyan írást is, amit a program engedett, és fordítva.
- **A 20 másodperc feltevés.** Egy alaposabb ellenőrzés (amikor a jóváhagyó utánanéz valaminek) ennél tovább tart.
- **A „sikeres futásban” arány** nem azt jelenti, hogy maga az írás volt hibás a többi esetben. Lehet, hogy az írás jó volt, csak a válasz hiányos.
