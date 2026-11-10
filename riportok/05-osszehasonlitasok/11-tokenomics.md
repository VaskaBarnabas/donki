# AI-tokenomika: token-költség és válaszidő a végrehajtási ciklusok mentén

*20. fázis · 2026-11-10 · alapmérés: `2026-11-07-javitott` (MCP, 99 futás modellenként) · optimalizált mérések: `tokenomics-elozmeny`, `tokenomics-semamind`, `tokenomics-mind` · generált táblázatok: [adatok/tokenomics-tablazatok.md](adatok/tokenomics-tablazatok.md) · ciklusadatok: [adatok/tokenomics-ciklus.csv](adatok/tokenomics-ciklus.csv) · szkriptek: `scripts/riportok/tokenomics.ts`, `tokenomics-bontas.ts`*

## 1. A kérdés és a rövid válasz

A tokenomika azt vizsgálja, mennyi tokent használ az ágens, hol keletkezik ez a ciklusok mentén, mennyibe kerül, mennyi ideig tart, és lehet-e csökkenteni anélkül, hogy a minőség romlana.

**A rövid válasz:**

1. **A költség szinte teljesen bemenet.** Egy futás átlagosan 8300–8900 bemeneti és 160–180 kimeneti tokent használ, a kettő aránya körülbelül 50:1.
2. **A bemenet minden ciklusban újra elmegy, és nő.** A front-desk 340 tokenből dolgozik, a szakágens első köre körülbelül 2500-ból, a hetedik már csaknem 7000-ből.
3. **A szakágens bemenetének 48–68%-a eszközleírás,** a többi főként rendszerutasítás. Az eszközválaszok csak a későbbi ciklusokban válnak jelentőssé.
4. **Helyi modellel a token szinte semmibe nem kerül:** az áram futásonként 0,02–0,03 Ft. Ugyanez felhőben, Claude Sonnet 5.5-tel 5,7–6,1 Ft.
5. **A három kipróbált optimalizáció a kisebb modellnél többet rontott, mint amennyit hozott:** 5–10% tokenmegtakarítás mellett a sikeresség 92%-ról 79–86%-ra esett, a válaszidő nem változott. A nagyobb modellnél a kombinált változat nem rontott (94% → 96%, −11% token), de érdemi gyorsulást sem hozott. **Az optimalizációk alapból kikapcsolva maradnak.**

## 2. Mit mértünk, és hogyan

A futásnapló (`agens.lepes`) minden modellhívásnál rögzíti a bemeneti és kimeneti tokenszámot és az időt, minden eszközhívásnál az időt. **Végrehajtási ciklusnak** egy futás egymás utáni modellhívásait nevezzük: az 1. ciklus a front-desk döntése, a 2. a szakágens első köre, utána minden eszközhívás után újabb kör jön.

- **Monitorozás:** a `tokenomics.ts` szkript bármelyik mérésre újra legenerálja a táblázatokat, ciklusonként, szakágensenként és változatonként.
- **Bontás:** a `tokenomics-bontas.ts` az Ollama saját tokenszámlálásával megméri, miből áll egy szakágens-hívás bemenete.
- **Optimalizáció:** két, alapból kikapcsolt beavatkozás (`agens/kozos/tokenopt.ts`, `AGENS_TOKEN_OPT`), mindegyik a teljes, 33 feladatos készleten, háromszor ismételve, a sikerességgel együtt.

## 3. A ciklusok mentén

| Ciklus | e4b: token be | e4b: idő (ms) | 12b: token be | 12b: idő (ms) | A futások hány %-ában van ilyen kör |
|---|---:|---:|---:|---:|---:|
| 1 (front-desk) | 342 | 1 169 | 336 | 1 161 | 100% |
| 2 | 2 513 | 2 026 | 2 513 | 4 662 | 100% |
| 3 | 2 822 | 2 257 | 2 854 | 3 489 | 100% |
| 4 | 3 085 | 2 551 | 3 337 | 3 367 | 37–48% |
| 5 | 3 676 | 2 517 | 3 818 | 2 989 | 18–24% |
| 6 | 4 904 | 1 986 | 4 774 | 4 173 | 7–9% |
| 7 | 6 959 | 8 653 | 6 682 | 842 | 3% |

**Mit mutat a táblázat:**

- **A legnagyobb ugrás a 2. ciklus.** A front-desk még csak a kérést és a szakágensek listáját kapja. A szakágens első körében megjelenik a teljes rendszerutasítás és az összes eszközleírás.
- **Utána lassan nő a bemenet,** mert minden kör újraküldi az addigi eszközválaszokat. A futások többsége a 3. ciklusban végez.
- **A 12b második köre feltűnően lassú** (4,7 másodperc a 3. kör 3,5 másodpercével szemben). A valószínű ok, hogy a front-desk hívása kiszorítja a gyorsítótárból a szakágens előtagját, és a második körnek mindent újra fel kell dolgoznia. Ez következtetés, nem mértük közvetlenül.
- **A ritka, hosszú futások drágák:** a 7–8. kör 7000–9700 token, és a kimenet is megugrik, mert ezek lépéskorlátba futó, összefoglaló körök.

## 4. Miből áll egy szakágens-hívás bemenete

| Ágens | Eszköz | Rendszerutasítás | Eszközleírás | Eszköz aránya |
|---|---:|---:|---:|---:|
| ertekesites | 11 | 1 022 | 1 525 | 59% |
| rendeles | 15 | 932 | 2 002 | 68% |
| raktar | 6 | 794 | 758 | 48% |
| ugyfelszolgalat | 9 | 807 | 1 123 | 58% |
| kivetel | 11 | 904 | 1 259 | 58% |

Az Ollama-számlálás az e4b modellel készült, egyetlen rövid felhasználói kérdéssel.

**Az első ötlet nem működött.** Az eszközsémákban sok a modell számára felesleges korlát (például `minimum: -9007199254740991`, `maxLength`, `pattern`). Ezek törlése azonban csak 0–12 tokent spórolt, mert az Ollama sablonja eleve nem adja át őket a modellnek. Ezt az optimalizációt mérés nélkül elvetettük.

**Ami számít, az a paraméterek leírása.** Csak az opcionális paraméterek leírását elhagyva a bemenet 3–7%-kal, az összesét elhagyva 13–22%-kal csökken.

**A legnagyobb eszközválaszok** (MCP-hívásnapló): `list_quotes` átlag 8,4 KB (legfeljebb 19 KB), `list_tickets` 5,8 KB, `list_orders` 3,6 KB. Az ágens 6000 karakternél levágja őket. A későbbi ciklusok bemenetét főként ezek növelik.

## 5. Költség

| Futásonként | e4b | 12b |
|---|---:|---:|
| Helyi modell, áram (60 W, nem mért) | 0,02 Ft | 0,03 Ft |
| Claude Sonnet 5.5, azonos tokenszámmal | 5,73 Ft | 6,09 Ft |
| Claude Sonnet 5.5, gyorsítótárral (becslés) | 3,35 Ft | 3,43 Ft |
| Claude Haiku 5.5 | 0,29 Ft | 0,30 Ft |
| **Évente, Sonnet 5.5** (78 118 futás) | **448 ezer Ft** | **475 ezer Ft** |
| **Évente, Sonnet 5.5, gyorsítótárral** | **262 ezer Ft** | **268 ezer Ft** |

Az évi futásszám a [pénzügyi terv](../04-penzugy/penzugyi-elemzes.md) 25 felhasználós alapesete.

- **A gyorsítótár azért ennyire hatásos,** mert a ciklusok bemenete nagyrészt ugyanaz: minden kör az előző kör bemenetét ismétli meg, és ehhez fűz hozzá. A becslés az előző kör bemenetét gyorsítótárból olvasottnak veszi (0,10 $/M token), az újat írásnak (2,50 $/M token).
- **A felhős sorok csak a tokendíjat mutatják.** A felhőmodell sikerességét és válaszidejét nem mértük, és egy felhőmodell más hosszúságú válaszokat adhat.
- **A helyi modell valódi költsége a gép,** nem a token. A pénzügyi terv ezt amortizációként számolja, a tokenomika szempontjából pedig az a fontos, hogy a futások száma nem drágítja a rendszert.

## 6. Válaszidő

| | e4b | 12b |
|---|---:|---:|
| Futás medián | 8,0 mp | 12,7 mp |
| Futás p95 | 15,7 mp | 23,0 mp |
| Ebből a modell | 7,4 mp (87%) | 12,5 mp (89%) |
| Ebből az eszközhívások | 1,0 mp | 1,4 mp |
| Front-desk | 1,2 mp | 1,2 mp |

**A válaszidő szinte teljesen modellidő.** Az MCP-réteg és a legacy rendszerek a futás 11–13%-át teszik ki, ezért a tokenomikai optimalizáció is csak a modellidőt csökkentheti. Egy kiugrás volt: a 12b egy futásnál 180 másodpercig nem válaszolt, és az újrapróbálás után 481 másodpercig tartott. Ez a modellszerver ritka beragadása, amelyet a meglévő időkorlát kezel.

## 7. Optimalizáció: mit próbáltunk, és mi lett

| Változat | Mit csinál | Modell | Siker | Token be/futás | Idő, medián |
|---|---|---|---|---|---|
| Alap | – | e4b | 92% | 8 279 | 8,0 mp |
| `elozmeny` | a legutóbbi körnél régebbi, 400 karakternél hosszabb eszközválaszokat rövidíti (a skillek teljesek maradnak) | e4b | 86% | 7 882 (−5%) | 7,5 mp |
| `sema-mind` | minden paraméterleírást elhagy (a hatás felső korlátja) | e4b | 83% | 7 427 (−10%) | 7,8 mp |
| `sema,elozmeny` | az opcionális paraméterek leírását hagyja el, és rövidít | e4b | **79%** | 7 598 (−8%) | 7,6 mp |
| Alap | – | 12b | 94% | 8 946 | 12,7 mp |
| `sema,elozmeny` | ugyanaz | 12b | **96%** | 7 987 (−11%) | 12,0 mp |

**Hol romlott a kisebb modell** (legalább két futással):

- **Hiányzó paraméterleírás** (F25, F26). Az ajánlatkérésnél a modell nem kereste meg magától a vevőt, hanem azonosítót kért a felhasználótól. A leírás nélkül nem derült ki számára, hogy a keresés elég.
- **Rövidített előzmény** (F19, F26, F18c). A modellnek egy korábbi eszközválasz egy részletére lett volna szüksége. Az F19-ben azonosítót talált ki („HJ-XXXXXXX”), az egyik válaszba pedig sablonmaradvány került. A csonkolás tehát a kisebb modellnél csendes hibát is okozott.
- **F09 és F20** az alapmérésben is ingadozott.

**Értékelés:**

- **A kisebb modellnél mindhárom változat egyértelműen rosszabb.** Három, egymástól független mérés ugyanabba az irányba mutat, 6–13 százalékpontos eséssel. Kevesebb tokenért cserébe nem gyorsult, mert a modellidőt kevésbé a bemenet hossza, inkább a ciklusok száma és a kimenet határozza meg.
- **A nagyobb modell tűri a rövidítést:** a sikeresség nem esett, a token 11%-kal csökkent, a medián idő 0,7 másodperccel lett rövidebb. A különbség feladatonként három futás mellett a véletlen ingadozáson belül van.
- **Ajánlás:** mindkét modellnél kikapcsolva marad. A kisebbnél rontana, a nagyobbnál a nyereség túl kicsi ahhoz, hogy egy beavatkozás kockázatát megérje. Felhős modellnél a 11% tokenmegtakarítás már pénzt jelentene, ott érdemes újramérni.

## 8. Mit tanultunk

1. **Helyi modellnél a token nem költség, hanem késleltetés.** Az optimalizáció célja ezért nem a tokenszám, hanem a ciklusok száma és a modellidő.
2. **Az eszközleírás nem „pazarlás”.** A kisebb modell épp ezekből érti meg, mit tehet. A tokenszám a minőség része.
3. **A legígéretesebb, még nem mért irányok:**
   - kevesebb ciklus, például párhuzamos eszközhívás ott, ahol a hívások nem függnek egymástól;
   - a 2. ciklus gyorsítótár-vesztésének megszüntetése (a front-desk és a szakágens ne szorítsa ki egymást);
   - a listázó eszközök tömörebb válasza (a `list_quotes` átlag 8,4 KB), az MCP-rétegben, nem az ágensben.
4. **Felhős modell esetén** a gyorsítótár a legnagyobb nyereség: becslés szerint 41–44%-kal csökkentené a tokendíjat, minőségvesztés nélkül.

## 9. Korlátok

- **Az alapmérés három nappal korábbi,** az optimalizált mérések egy napon futottak. A kód közben nem változott, a legacy szimulációk állapota viszont igen.
- **Feladatonként három futás.** A változatonkénti összesítés (99 futás) már megbízhatóbb, a feladatonkénti eltérés nem az.
- **A tokenszámot az Ollama méri,** felhős modellnél a tokenizáló más, a tokenszám ott eltérhet.
- **Az áramfelvétel nem mért érték.**
- **A gyorsítótáras felhős költség becslés,** a valós gyorsítótár-találat a szolgáltató viselkedésétől függ.
