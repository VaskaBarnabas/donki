# 20. fázis terve: javítási ciklus, Gartner-alapú emberi tényező, pénzügyi riport

*1. változat · 2026-11-07 · jóváhagyva (döntések: §9) · 1. lépés kész (§12)*

## 1. Cél

A 19. fázis mérése megmutatta, hol gyenge az MCP-réteg. Ebben a fázisban ezt kijavítjuk, és újramérünk. A célérték: **90% fölötti sikeresség** az MCP-s ágensnél. Utána a mért számokra két riport épül:

- **emberi tényező** külső, validált becslésekkel, kizárólag a Gartner oldaláról;
- **pénzügyi riport**: miért éri meg megvenni.

Minden riport egy új, témánként rendezett `riportok/` mappába kerül.

## 2. Sorrend és indoklás

| # | Lépés | Miért ebben a sorrendben |
|---|---|---|
| 1 | Javítási ciklus + újramérés | A többi riport a mért sikerességre és időre épül, ezért ennek kell elsőnek lennie. |
| 2 | Gartner-forrásjegyzék | A 3. és 4. lépés feltevéseinek forrása. |
| 3 | Emberi tényező riport | A mért gépidő, a HITL-terhelés és a Gartner-adatok együtt adják a valós emberi megtakarítást. A pénzügyi riport erre épül. |
| 4 | Pénzügyi riport | A 1–3. lépés számaiból áll össze, generáló szkripttel, így újramérés után automatikusan frissül. |
| 5 | További összehasonlítások | A felsorolt ötletekből a jóváhagyottakat építjük meg. |
| 6 | Index, README, docs | A lezárás. |

## 3. Javítási ciklus (1. lépés)

### 3.1 A mérés tisztasága

A 90% csak akkor érv, ha nem a tesztet igazítjuk az eredményhez. Ezért:

- **Az ellenőrzők és a feladatszövegek befagyasztva.** A 27 feladat ellenőrző logikáján nem változtatunk. Kivétel csak egy bizonyítottan hibás ellenőrző lehet, és ezt a riportban külön jelöljük.
- **Kontrollfeladatok (6 új, F25–F30).** A javítások előtt írom meg őket, olyan esetekre, amelyekre a javítások nem célzottan készültek. Például: ékezet nélküli terméknév, másik kifutott termék, összeg kérdése már meglévő díjbekérőről, többtételes ajánlat, garancia rendelésszám nélkül, és lemondás már kiszállított rendelésnél. Ha ezeken is jó az eredmény, a javítás általánosít; ha nem, az túltanulás jele.
- **Őszinte riport.** Ha 90% alatt maradunk, a riport a valódi számot mutatja, a maradék hibák okával együtt.

### 3.2 Javítások (a 19. fázis hibaelemzése alapján)

| Feladat | Hiba | Javítás | Hol |
|---|---|---|---|
| F03 | A kivezetett termék rejtve marad | A `search_products` a kivezetett találatot is visszaadja `active: false` jelöléssel és a helyettesítő javaslatával (ugyanabban a kategóriában, aktív). | `mcp/servers/sales` |
| F22 | A vevőkeresés nem ékezetfüggetlen | Ékezet- és kisbetű-független keresés: `unaccent` a CRM-ben vagy normalizálás az MCP-ben. | `mcp/servers/sales`, esetleg a CRM init |
| F13 | Nettót mond bruttó helyett | Egyértelmű kimeneti mező: `amountToPay` (bruttó), és mellé egy rövid `summary` mondat. | `mcp/servers/finance` |
| F14 | A link kimarad a válaszból | Skill-lépés: a fizetési linket mindig szó szerint adja vissza. | `agens/skills/` |
| F05 | Nem kér jóváhagyást | Skill-lépés: 15% fölötti kedvezménynél kötelező a `request_approval`. | `agens/skills/` |
| F07 (12b) | A friss ajánlatot listában keresi | Az eszközleírás pontosítása: ajánlatszám alapján a `get_quote`, nem a lista. Meg kell nézni a futásnaplót. | `mcp/servers/sales`, ágensutasítás |
| F15a (12b) | Fizetett számláról azt mondja, nincs fizetve | Előbb a naplóból megállapítom az okot (eszközkimenet vagy modell), utána javítok. | ? |
| F20 | 3/4 rész | Új skill vagy egy összesítő olvasó eszköz (`business_summary`), amely a négy számot egyben adja. | `agens/skills/` vagy MCP |

### 3.3 Újramérés

- Csak az MCP-s változat fut, mindkét modellel, háromszor ismételve, új mérési címkével (`2026-11-xx-javitott`). Ez (27 + 6) × 2 × 3 = 198 futás, kb. 45–60 perc. A nyers változat a 2026-11-03-i mérésből marad, mert a nyers eszközök nem változnak.
- **Új mutató: pass^3**, vagyis a feladat mindhárom ismétlésben sikeres-e. Ez a megbízhatóságot méri, nem csak az átlagot, és a Gartner is a megbízhatóságot nevezi a pilotok fő buktatójának.
- A riport előtte–utána összevetést kap feladatonként.
- **Regressziós tesztek:** `14-mcp-sales`, `14-mcp-finance`, `17-agens`, `19-ertekeles` (bővítve az F25–F30 ideális és rossz megoldásával).

## 4. Gartner-forrásjegyzék (2. lépés)

**Korlát:** a Gartner teljes kutatásai fizetősek. A sajtóközlemények nyilvánosak, de automatikusan nem tölthetők le (403), ezért a számokat a keresőből vettem át. **A dolgozatba idézés előtt minden linket nyiss meg böngészőben, és ellenőrizd a számot.** A forrásjegyzékben minden tételnél jelölöm, hogy **előrejelzés** vagy **felmérés** (és a minta mérete), mert a kettő bizonyító ereje nagyon különböző.

| # | Forrás (Gartner) | Típus | Amit mond | Mire használjuk |
|---|---|---|---|---|
| G1 | [Agentic AI will autonomously resolve 80% of common customer service issues by 2029](https://www.gartner.com/en/newsroom/press-releases/2025-03-05-gartner-predicts-agentic-ai-will-autonomously-resolve-80-percent-of-common-customer-service-issues-without-human-intervention-by-20290) (2025-03) | előrejelzés | 80% a gyakori ügyekből, −30% működési költség 2029-re | felső korlát; a mért 75–78%-unk összevetése |
| G2 | [Over 40% of agentic AI projects will be canceled by end of 2027](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027) (2025-06) | előrejelzés | okok: költség, nem világos érték, kockázatkezelés; a legacy integráció drága | kockázat a pénzügyi riportban; az MCP-réteg mint válasz a legacy-integrációs problémára |
| G3 | [Only 20% of customer service leaders report AI-driven headcount reduction](https://www.gartner.com/en/newsroom/press-releases/2025-12-02-gartner-survey-finds-only-20-percent-of-customer-service-leaders-report-ai-driven-headcount-reduction) (2025-12, n=321) | felmérés | 20% csökkentett létszámot; 55% azonos létszámmal nagyobb volument kezel | a megtakarítás **kapacitásként**, nem leépítésként számolva |
| G4 | [Half of companies that cut customer service staff due to AI will rehire by 2027](https://www.gartner.com/en/newsroom/press-releases/2026-02-03-gartner-predicts-half-of-companies-that-cut-customer-service-staff-due-to-ai-will-rehire-by-2027) (2026-02) | előrejelzés | a leépítések fele visszafordul | a pesszimista forgatókönyv |
| G5 | [85% of service leaders are expanding human agent responsibilities](https://www.gartner.com/en/newsroom/press-releases/2026-04-28-gartner-survey-finds-eighty-five-percent-of-service-and-support-leaders-are-expanding-human-agent-responsibilities-despite-expectations-of-mass-ai-layoffs) (2026-04) | felmérés | 31% tervez leépítést; 63% természetes fogyással | ugyanaz, mint a G3 |
| G6 | [AI saves sellers nearly 5 hours per week, yet 72% fail to reinvest](https://www.gartner.com/en/newsroom/press-releases/2026-05-19-gartner-survey-finds-ai-saves-sellers-nearly-five-hours-per-week-yet-seventy-two-percent-of-sales-organizations-fail-to-reinvest-time-in-high-value-activities) (2026-05, n=210) | felmérés | 4,8 óra/hét/értékesítő | **külső viszonyítás** a saját munkaerő-becslésünkhöz; a „felszabadult idő ≠ pénz” korrekció |
| G7 | [77% of sellers struggle to complete their assigned tasks efficiently](https://www.gartner.com/en/newsroom/press-releases/2023-11-02-gartner-survey-finds-77-percent-of-sellers-struggle-to-complete-their-assigned-tasks-efficiently) (2023-11, n=501) | felmérés | a sok rendszer és feladat terhe | a probléma létezése (legacy, sok felület) |
| G8 | [Benchmarks to Assess Your Customer Service Costs](https://www.gartner.com/en/documents/5164231) | benchmark (régebbi) | medián költség kapcsolatonként: önkiszolgáló kb. 1,84 $, asszisztált kb. 13,50 $ | ügyenkénti költség a pénzügyi riportban (régi adat, jelölve) |
| G9 | [GenAI cost per resolution will exceed offshore human agent costs by 2030](https://www.gartner.com/en/newsroom/press-releases/2026-01-26-gartner-predicts-genai-cost-per-resolution-for-customer-service-will-exceed-offshore-human-agent-costs-by-2030) (2026-01) | előrejelzés | több mint 3 $ / megoldás 2030-ra (drágul a felhő) | **a helyi modell érve**: a mi ügyenkénti költségünk áram és amortizáció, nem token |
| G10 | [AI inference costs per agentic workflow will increase more than fivefold through 2028](https://www.gartner.com/en/newsroom/press-releases/2026-08-17-gartner-predicts-ai-inference-costs-per-agentic-workflow-will-increase-more-than-fivefold-through-2028) (2026-08) | előrejelzés | az ágens-folyamat ötször annyi inferencia, mint egy chatbot | ugyanaz, mint a G9; a token/feladat mérésünk összevetése |
| G11 | [87% of customers say companies using GenAI must provide access to a human](https://www.gartner.com/en/newsroom/press-releases/2026-08-04-gartner-survey-finds-87-percent-of-customers-say-companies-using-genai-for-customer-service-must-provide-access-to-a-human-agent0) (2026-08) | felmérés | az ember nem hagyható ki | a HITL-tervezés indoklása |
| G12 | [Mastering Agentic AI: ROI lessons](https://www.gartner.com/en/articles/agentic-ai-roi), [A Human-in-the-Loop Framework for AI Agents](https://www.gartner.com/en/documents/7723857), [CHROs: manager oversight](https://www.gartner.com/en/articles/agentic-ai-for-chros) | elemzés | a megbízhatóság túlbecslése a fő buktató; kockázat szerinti, lépcsőzetes felügyelet | a jóváhagyási modellünk (read / write / kockázat) igazolása; a pass^3 mutató |
| G13 | [Top strategic technology trends 2025](https://www.gartner.com/en/newsroom/press-releases/2024-10-21-gartner-identifies-the-top-10-strategic-technology-trends-for-2025) | előrejelzés | 2028-ra a napi döntések legalább 15%-a autonóm; a vállalati szoftverek 33%-a ágenses | piaci kontextus (bevezető) |
| G14 | [Data quality: why it matters](https://www.gartner.com/en/data-analytics/topics/data-quality) (2020-as kutatás) | felmérés | a rossz adatminőség átlagosan legalább 12,9 M $/év | a legacy duplikált adatainak (F22) költségoldala, óvatosan |
| G15 | [Finance AI adoption remains steady in 2025](https://www.gartner.com/en/newsroom/press-releases/2025-11-18-gartner-survey-shows-finance-ai-adoption-remains-steady-in-2025) (n=183) | felmérés | 59% használ MI-t a pénzügyben; a szállítói számlák feldolgozása 37% | a pénzügyi feladatok (díjbekérő, fizetés) piaci relevanciája |
| G16 | [Market Guide for Mainframe and Legacy Systems Migration and Modernization Tools](https://www.gartner.com/en/documents/5769515), [Strategies for Enterprise Applications Modernization Success](https://www.gartner.com/en/documents/5947839) | elemzés (összefoglaló) | a technikai adósság költséget és interoperabilitási hiányt okoz; a modernizáció többnyire nem éri el a célját | **a „ne cseréld le, csomagold be” (MCP) érv** a teljes CRM-csere ellen |

A jegyzék a `riportok/02-szakirodalom/` mappába kerül, tételenként egy-két mondatos összefoglalóval és a felhasználás helyével.

## 5. Emberi tényező riport (3. lépés)

A kérdés: mennyi emberi munka marad, és mennyi szabadul fel valójában? Három réteg:

1. **Mért adat:** gépidő és jóváhagyási kártyák feladatonként, az újramérésből. Kártyánként 15–30 s ellenőrzéssel számolunk (feltevés, jelölve).
2. **Belső becslés:** a `MUNKAERO_BECSLES.md` volumenei, a mért sikerességgel korrigálva. A sikertelen futás emberi munkába kerül: a feladat kézi idejét plusz az észlelés idejét.
3. **Külső korrekció (Gartner):**
   - a felszabadult idő nem automatikusan megtakarítás: a G6 szerint a szervezetek 72%-a nem forgatja vissza;
   - a létszámcsökkentés ritka (G3, G5), a kapacitásnövelés a jellemző;
   - az ügyfél igényli az embert (G11).

**Kimenet:** három forgatókönyv (óvatos, reális, optimista), és a saját becslésünk összevetése a Gartner 4,8 óra/hét/értékesítő számával.

## 6. Pénzügyi riport (4. lépés)

Generáló szkript: `scripts/riportok/penzugy.ts`. A feltevések egy helyen, paraméterként állíthatók; a kimenet Markdown + CSV.

| Mutató | Tartalom |
|---|---|
| **TCO 3 évre** | legacy (emberi munkaidő + a rendszerek fenntartása) vs. MCP + ágens (fejlesztés, hardver a helyi modellhez, áram, üzemeltetés, a HITL ideje) |
| **Költség / megoldott ügy** | ember (G8) vs. helyi ágens (áram + amortizáció, a mért idővel) vs. felhő-ágens (G9, G10, a mért tokenszámmal) |
| **ROI, megtérülési idő, NPV** | volumenenként (pl. 100 / 500 / 2000 rendelés havonta) |
| **Fedezeti pont** | hány ügy/hó fölött éri meg |
| **Érzékenységvizsgálat** | mely feltevés mozgatja leginkább az eredményt: sikeresség, bér, volumen, hardverár (tornádó-táblázat) |
| **A hibák költsége** | a sikertelen és részben sikeres futás emberi utómunkája; a nem várt írási kísérlet mint kockázat (ezt a jóváhagyás megfogja) |
| **Alternatíva: teljes CRM-csere** | a modernizációs kockázat (G16) és a projekt-lemorzsolódás (G2) mellett mennyibe kerülne |

## 7. További összehasonlítás-ötletek (5. lépés – válassz)

| # | Riport | Mit mutat | Ráfordítás |
|---|---|---|---|
| Ö1 | **Megbízhatóság (pass^k)** | Az átlag helyett: hányszor sikeres mindháromszor. A Gartner megbízhatósági érvére felel. | kicsi (a meglévő adatból) |
| Ö2 | **Biztonság / prompt injection** | Hibajegy- és e-mail-szövegbe rejtett utasítás: megfogja-e az `untrustedText` és a jóváhagyás? Nyers vs. MCP. | közepes |
| Ö3 | **Kiesés és robusztusság** | Egy-egy rendszer leállítása feladat közben: helyes hibaüzenet, nincs félkész írás (az F24 kiterjesztése). | közepes |
| Ö4 | **Terhelés és skálázás** | 1 / 2 / 4 párhuzamos felhasználó a helyi Ollamán: várakozási idő, áteresztőképesség, mikor kell második GPU. | közepes |
| Ö5 | **Energia / feladat** | Mért teljesítményfelvétel (W) futás közben, kWh/feladat → Ft/feladat. A pénzügyi riport bemenete. | kicsi |
| Ö6 | **Integrációs költség** | Egy új (8.) legacy rendszer bekötése MCP-vel vs. pont-pont integrációval: kódsor, óra, érintett komponensek. | kicsi–közepes |
| Ö7 | **Betanulás** | Új munkatárs: hány oldal dokumentáció és kód kell egy feladathoz (a nyers ágens tokenszáma mint mérőszám) vs. egy mondat az asszisztensnek. | kicsi |
| Ö8 | **A hibák súlyossága** | Nem minden hiba egyforma: rossz válasz, elmaradt írás, rossz írás. Súlyozott pontszám, „mi történt volna jóváhagyás nélkül”. | kicsi |
| Ö9 | **Modellméret-görbe** | e4b → 12b → (opcionálisan 27b): siker, idő, memória. Hol a „jó elég” pont? | közepes (gépidő) |
| Ö10 | **Felhőmodell-összevetés** | Egy felhőmodell ugyanazon a 27+6 feladaton: siker, idő, Ft/feladat. Korábban kihagytad, csak lehetőségként szerepel. | közepes, költséges |

Javaslat: **Ö1, Ö5, Ö8** (kicsi, közvetlenül erősíti a pénzügyi riportot), majd **Ö2** (a dolgozatban erős biztonsági érv).

## 8. A `riportok/` mappa

```
riportok/
  README.md                       – index: mi hol van, melyik riport melyik méréshez tartozik
  01-meres/
    ertekeles-2026-11-03.md       – az eredeti mérés (a docs/ERTEKELES_RIPORT.md ide költözik)
    ertekeles-javitott.md         – az újramérés, előtte–utána
    javitasok.md                  – mit javítottunk és miért, a kontrollfeladatokkal
    adatok/*.csv
  02-szakirodalom/
    gartner-forrasok.md           – G1–G16, típus, szám, felhasználás
  03-emberi-tenyezo/
    emberi-tenyezo.md             – a három réteg, forgatókönyvek
  04-penzugy/
    penzugyi-elemzes.md           – TCO, ROI, megtérülés, érzékenység
    feltevesek.md                 – minden feltevés forrással (Gartner / mért / saját)
    adatok/*.csv
  05-osszehasonlitasok/
    <a választott Ö-riportok>
```

A riportok generáló szkriptjei a `scripts/riportok/` mappába kerülnek; a `scripts/ertekeles/riport.ts` a `riportok/01-meres/`-be ír. Minden riport elején: kérdés, módszer, forrás, korlátok.

## 9. Döntések (2026-11-07)

1. **Bérköltség:** KSH, STADAT 20.1.1.52. (teljes munkaidős bruttó átlagkereset foglalkozás szerint, 2025), plusz a munkáltatói szociális hozzájárulási adó.
2. **Hardver:** a fejlesztő gépe (Apple M5, 24 GB egyesített memória) – ezen futott minden mérés; a pénzügyi riport ennek az árával és fogyasztásával számol.
3. **Ö-riportok:** mind a tíz, és két további (Ö11, Ö12), de **először a saját mérés** működjön és értelmes eredményt adjon.
   - **Ö11 – Kitalált adat a válaszban:** a válaszokban szereplő összegek és azonosítók közül hány nem létezik a rendszerben (pl. az F01-ben a modell más összeget mond, mint az ajánlaté). Nyers vs. MCP. A pénzügyi bizalom kulcskérdése, és a meglévő válaszokból utólag kiszámolható.
   - **Ö12 – Az emberi jóváhagyás terhelése és haszna:** kártya / feladat, a jóváhagyásra kerülő írások hány százaléka volt helyes, hány hibás írást fogott meg a jóváhagyás (nem várt írás), és mennyi emberi időt kér (a pénzügyi riport HITL-költsége).

## 10. Tesztek és elfogadás

- Újramérés: MCP-sikeresség ≥ 90% mindkét modellen (cél, nem feltétel), a kontrollfeladatokon külön kimutatva.
- `14-mcp-sales`, `14-mcp-finance`, `17-agens`, `19-ertekeles` zöld.
- A pénzügyi szkript a feltevésfájl módosítására újragenerálja a riportot.
- Minden Gartner-szám mellett: link, dátum, típus (előrejelzés vagy felmérés).

## 11. Becsült idő

| Lépés | Becsült idő |
|---|---|
| Javítások + kontrollfeladatok | ~fél nap |
| Újramérés | ~1 óra gépidő |
| Gartner-jegyzék + emberi tényező riport | ~2–3 óra |
| Pénzügyi riport | ~3 óra |
| Választott Ö-riportok | darabonként 1–3 óra |

## 12. Eredmények (1. lépés: javítási ciklus, 2026-11-07)

- **Javítások:** 9 ok a futásnaplókból, javítva az MCP-rétegben (kivezetett termék a keresésben, ékezet- és cégforma-független vevőkeresés, a díjbekérő bruttója, a fizetettség a `get_payments`-ben, a hibajegy-számláló, a csomag állapota), az irányításban (elfogadott ajánlat → értékesítés) és két skillben. A számlázó a Számlázz.hu tesztfiók újra kiadott sorszámait kezeli. Részletek: [javitasok.md](../riportok/01-meres/javitasok.md).
- **Újramérés (`2026-11-07-javitott`, csak MCP, 198 futás, 51 perc):**

  | | 12b | e4b |
  |---|---|---|
  | Siker a 27 alapfeladaton | 78% → **94%** | 75% → **90%** |
  | pass^3 | 74% → 89% | 70% → 78% |
  | Kontrollfeladatok | 94% | 100% |

  Riport: [ertekeles-2026-11-07-javitott.md](../riportok/01-meres/ertekeles-2026-11-07-javitott.md).
- **Ellenőrző-javítás:** a garancia-minta két helyes fordulatot nem ismert fel. Javítva, és minden mérésre alkalmazva a tárolt válaszokból; 3 futás változott, mind a 11-07-i mérésben, sikertelenből sikeresre.
- **Maradék hibák:** modellhibák (F05 e4b, F20 12b, egyedi esetek); az eszközszintű okok megszűntek.
- **Tesztek:**

  | Teszt | Eredmény |
  |---|---|
  | `19-ertekeles` | 92/92 |
  | `14-mcp-sales` | 41/41 |
  | `14-mcp-finance` | 26/26 |
  | `14-mcp-support` | 27/27 |
  | `13-mcp-orders` | 45/45 |
  | `17-agens` | 41/41 |
  | `05-szamlazas` | OK |

## 13. Eredmények (emberi idő és négy további mérés, 2026-11-10)

| Mérés | Fő eredmény | Riport |
|---|---|---|
| Emberi idő (KLM, irodalom) | tíz feladat 15,4 perc (korábbi becslés 104 perc); megtakarítás e4b 29/56/67%, 12b 25/45/49% | [emberi-ido-pontositas.md](../riportok/03-emberi-tenyezo/emberi-ido-pontositas.md) |
| 2: hibaarány | csendes rossz adat 4,0% (198 futás), rossz írás 0; ember számítva 5–17%; azonos nagyságrend | [02-hibak-ember-es-agens.md](../riportok/05-osszehasonlitasok/02-hibak-ember-es-agens.md) |
| 3: háttérfigyelő | 33/33 észlelve; esemény medián 8,5 mp, időzített medián 290 mp; téves riasztás 0 | [03-figyelo-haszna.md](../riportok/05-osszehasonlitasok/03-figyelo-haszna.md) |
| 9: változástűrés | javítás előtt MCP 0/12, nyers 6/12 (tartalmilag); javítás 1–3 sor; egy csendes hamis adat (MCP) és egy folyamatmegkerülés (nyers) | [09-valtozastures.md](../riportok/05-osszehasonlitasok/09-valtozastures.md) |
| 10: adatkimenet | konténerek csak Számlázz.hu és Stripe felé; Ollama alkalmazás 14,8 KB ollama.com és GitHub felé három óra alatt | [10-adatkimenet.md](../riportok/05-osszehasonlitasok/10-adatkimenet.md) |
| Tokenomika | futásonként 8300–8900 token be, 160–180 ki; a szakágens bemenetének 48–68%-a eszközleírás; áram 0,02–0,03 Ft/futás, Sonnet 5.5-tel 5,7–6,1 Ft; három optimalizáció: e4b siker 92% → 79–86% (−5–10% token), 12b 94% → 96% (−11% token); kikapcsolva marad | [11-tokenomics.md](../riportok/05-osszehasonlitasok/11-tokenomics.md) |
| Pénzügy (szerver + setup + felhasználónkénti havidíj) | 25 felhasználónál a vevő 3 éves NPV-je: óvatos −18,0 M, reális +1,1 M (nullszaldós), optimista +66,5 M Ft; reális fedezeti létszám 19 fő; az eladónál reálisan 8 ügyfél fedezi a fix költséget | [penzugyi-elemzes.md](../riportok/04-penzugy/penzugyi-elemzes.md) |

**Javítva (2026-11-11):** az [orders leképezés](../mcp/servers/orders/lekepezes.ts) ismeretlen szállítási állapotnál `unknown`-t ad „Úton” helyett; a V1-S1 újramérésben a hamis állapot 3/3 → 0/3.
