# Gartner-források: mit mond a piac az ágens alapú ügyintézésről és az emberi tényezőről

*20. fázis · gyűjtve: 2026-11-07 · felhasználás: [03-emberi-tenyezo](../03-emberi-tenyezo/), [04-penzugy](../04-penzugy/)*

## Hogyan olvasd ezt a jegyzéket

**Miért csak Gartner?** A külső becslések egyetlen, széles körben hivatkozott elemzőháztól származnak, hogy a számok módszertana összevethető legyen.

**Két különböző bizonyító erejű forrástípus:**

- **Felmérés (F):** a Gartner megkérdezett *n* vezetőt vagy munkavállalót, és ők mondták el, mi történt náluk. Ez **múltbeli, mért** adat (önbevallás), a mintával együtt idézhető.
- **Előrejelzés (E):** a Gartner elemzőinek véleménye arról, mi *lesz*. Ez **nem mérés**. Irányt és nagyságrendet mutat, bizonyítékként nem használható.
- Ezenkívül van **benchmark (B)** és **elemzés (A)**. Ezek a fizetős kutatások nyilvános összefoglalói.

**Hozzáférés:**

- A Gartner teljes kutatásai fizetősek; a sajtóközlemények (newsroom) nyilvánosak.
- A számokat a nyilvános közleményekből és összefoglalókból vettük át.
- A gyűjtéskor az oldalak automatikusan nem voltak letölthetők (HTTP 403), ezért a számok a kereső által indexelt szövegből származnak. **A dolgozatba idézés előtt minden linket nyiss meg böngészőben, és ellenőrizd a számot és a dátumot.**

**A mi rendszerünkre vetítés:** a Gartner-számok többsége ügyfélszolgálati és értékesítési szervezetekre vonatkozik, nagyvállalati mintán. A mi esetünk egy KKV méretű, belső ügyintézés (ajánlat, rendelés, számlázás, raktár, ügyfélszolgálat). Ezért a Gartner-számokat **viszonyításra és korrekcióra** használjuk, nem közvetlen átvételre.

## 1. Mit várnak az ágenstől? (felső korlát és piaci irány)

### G1 – Az ágensek 2029-re a gyakori ügyfélszolgálati ügyek 80%-át emberi beavatkozás nélkül megoldják (E)

[Gartner Predicts Agentic AI Will Autonomously Resolve 80% of Common Customer Service Issues Without Human Intervention by 2029](https://www.gartner.com/en/newsroom/press-releases/2025-03-05-gartner-predicts-agentic-ai-will-autonomously-resolve-80-percent-of-common-customer-service-issues-without-human-intervention-by-20290) – 2025-03-05

- **A Gartner szerint:** 2029-re az ágens alapú MI a *gyakori* ügyfélszolgálati ügyek 80%-át emberi beavatkozás nélkül megoldja, ami kb. 30%-os működésiköltség-csökkenést hoz.
- **A mi esetünk:** a mi mérésünk ma, helyi modellel mér sikerességet hasonló, gyakori ügyeken: ajánlat, státusz, díjbekérő, garancia. A G1 tehát **piaci viszonyítási pont**. A mért eredményünk ehhez mérhető, nem bizonyíték rá.
- **Korlát:** előrejelzés; csak a „gyakori” ügyekre vonatkozik, nem minden munkára.

### G13 – 2028-ra a napi munkahelyi döntések legalább 15%-át ágensek hozzák meg; a vállalati szoftverek 33%-a ágenses lesz (E)

[Gartner Identifies the Top 10 Strategic Technology Trends for 2025](https://www.gartner.com/en/newsroom/press-releases/2024-10-21-gartner-identifies-the-top-10-strategic-technology-trends-for-2025) – 2024-10-21

- **A Gartner szerint:** a döntések autonóm aránya a 2024-es 0%-ról 2028-ra legalább 15%-ra nő, és a vállalati alkalmazások harmadában lesz ágenses MI (2024-ben 1% alatt).
- **A mi esetünk:** a dolgozat bevezetésében piaci kontextus, és ebből adódik a kérdés, hogyan kapcsolható egy *meglévő* (legacy) rendszer ehhez a trendhez.

## 2. Mi szokott elromlani? (kockázat)

### G2 – 2027 végéig az ágenses MI-projektek több mint 40%-át leállítják (E)

[Gartner Predicts Over 40% of Agentic AI Projects Will Be Canceled by End of 2027](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027) – 2025-06-25

- **Okok a Gartner szerint:** elszálló költségek, nem világos üzleti érték, elégtelen kockázatkezelés.
- **Legacy-integráció:** a Gartner kiemeli, hogy az ágensek legacy rendszerekbe illesztése technikailag bonyolult, gyakran megzavarja a munkafolyamatot, és drága átalakítást igényel.
- **Ágens-mosás („agent washing”):** a több ezer „ágenses” szállítóból a Gartner szerint csak kb. 130 valódi.
- **A mi esetünk:** ez a dolgozat legerősebb érve a választott architektúra mellett. Az MCP-réteg pontosan a legacy-integráció drága részét választja le: a legacy rendszerek változatlanok maradnak, a fordítás egy helyen van. A G2 három okára mi így felelünk:

  | A G2 szerinti ok | A mi válaszunk |
  |---|---|
  | költség | helyi modell, nincs tokendíj; lásd G9/G10 |
  | érték | mért sikeresség feladatonként |
  | kockázat | írás csak jóváhagyással; nem várt írás = hiba a mérésben |

### G12 – A megbízhatóság túlbecslése az egyik fő buktató; a felügyelet kockázat szerint lépcsőzzön (A)

- [Mastering Agentic AI: Multimillion-Dollar ROI Lessons](https://www.gartner.com/en/articles/agentic-ai-roi): a pilotok elakadásának egyik oka a megbízhatóság túlbecslése; emberi felügyelet nélkül kontextusvesztés, célelcsúszás, ismétlődő hibahurkok és halmozódó hibák jönnek.
- [A Human-in-the-Loop Framework for AI Agents: Balance Autonomy With Oversight](https://www.gartner.com/en/documents/7723857): a „mindig legyen ember a hurokban” tanács nem skálázódik. Olyan keret kell, amelyben az ágens kontrollok között önállóan dolgozhat.
- [Agentic AI: How CHROs Can Redefine Manager Oversight](https://www.gartner.com/en/articles/agentic-ai-for-chros): a feladatokat kockázat és szükséges emberi részvétel szerint kell osztályozni (tanácsadó, segítő, átvevő, autonóm), és küszöböket kell adni az emberi beavatkozásnak.

**A mi esetünk:** a jóváhagyási modellünk ugyanez a lépcsőzés. Az olvasás autonóm; az írás jóváhagyással megy; a háttérfigyelő csak olvashat, írni soha. A **megbízhatóságot külön mérjük:** a pass^k azt mutatja, hogy egy feladat *minden* ismétlésben sikeres-e, nem csak átlagosan. Erre a Gartner érve miatt van szükség.

### G16 – A legacy-modernizáció többnyire nem éri el a célját (A)

- [Market Guide for Mainframe and Legacy Systems Migration and Modernization Tools](https://www.gartner.com/en/documents/5769515): a legacy alkalmazások technikai adóssága költséget, interoperabilitási hiányt és elmaradt üzleti lehetőséget okoz.
- [Strategies for Enterprise Applications Modernization Success](https://www.gartner.com/en/documents/5947839): jelentős befektetések ellenére a legtöbb szervezet nem éri el a modernizáció kitűzött eredményét.

**A mi esetünk:** a „teljes CRM-csere” alternatívája ellen szól. A pénzügyi riportban a teljes cserét magasabb kockázati felárral számoljuk, mint az MCP-s becsomagolást. A Gartner nem ad számszerű sikertelenségi arányt, ezért a felár mértéke a mi feltevésünk (jelölve).

## 3. Mi lesz az emberrel? (a munkaerő-megtakarítás korrekciója)

### G3 – A vezetők csak 20%-a csökkentette MI miatt a létszámot; 55%-uk azonos létszámmal nagyobb volument kezel (F, n = 321)

[Gartner Survey Finds Only 20% of Customer Service Leaders Report AI-Driven Headcount Reduction](https://www.gartner.com/en/newsroom/press-releases/2025-12-02-gartner-survey-finds-only-20-percent-of-customer-service-leaders-report-ai-driven-headcount-reduction) – 2025-12-02, felmérés 2025 októberében

- **A Gartner felmérése szerint:** a megkérdezett ügyfélszolgálati vezetők 20%-a csökkentett létszámot MI miatt; 55% stabil létszámmal nagyobb ügyfélvolument kezel. (Egy 2026-11-es konferencia-közlemény 21%-ot említ.)
- **A mi esetünk:** a megtakarítást elsősorban **felszabaduló kapacitásként** (több rendelés ugyanannyi emberrel) számoljuk, nem leépítésként. A leépítéses forgatókönyv az optimista ág.

### G5 – A vezetők 85%-a bővíti az emberi munkatársak feladatait; 31% tervez leépítést 2027 I. negyedévéig, 63% inkább természetes fogyással csökkent (F)

[Gartner Survey Finds 85% of Service and Support Leaders are Expanding Human Agent Responsibilities Despite Expectations of Mass AI Layoffs](https://www.gartner.com/en/newsroom/press-releases/2026-04-28-gartner-survey-finds-eighty-five-percent-of-service-and-support-leaders-are-expanding-human-agent-responsibilities-despite-expectations-of-mass-ai-layoffs) – 2026-04-28

- **A mi esetünk:** a létszámhatás lassú, és természetes fogyással jön. A pénzügyi riport első évében ezért a megtakarítás csak részben realizálódik; ez a felfutási tényező.

### G4 – Akik MI miatt leépítettek, azok fele 2027-ig visszavesz embert (E)

[Gartner Predicts Half of Companies That Cut Customer Service Staff Due to AI Will Rehire by 2027](https://www.gartner.com/en/newsroom/press-releases/2026-02-03-gartner-predicts-half-of-companies-that-cut-customer-service-staff-due-to-ai-will-rehire-by-2027) – 2026-02-03

- **A mi esetünk:** a pesszimista forgatókönyv indoka. A gépi munka ellenőrzése, a kivételek kezelése és a jóváhagyás emberi munka marad; ezt a HITL-időként külön számoljuk.

### G6 – Az MI heti 4,8 órát takarít meg értékesítőnként, de a szervezetek 72%-a nem fordítja vissza értékes munkára (F, n = 210)

[Gartner Survey Finds AI Saves Sellers Nearly 5 Hours Per Week, Yet 72% of Sales Organizations Fail to Reinvest Time in High-Value Activities](https://www.gartner.com/en/newsroom/press-releases/2026-05-19-gartner-survey-finds-ai-saves-sellers-nearly-five-hours-per-week-yet-seventy-two-percent-of-sales-organizations-fail-to-reinvest-time-in-high-value-activities) – 2026-05-19, felmérés 2026. január–február, értékesítési vezetők

- **A mi esetünk:** két felhasználás.
  1. **Külső viszonyítás:** a saját munkaerő-becslésünk értékesítőre jutó heti megtakarítása összevethető a 4,8 órával. Ha a mi számunk ennél sokkal nagyobb, az magyarázatot kér (pl. a legacy több felülete miatt nagyobb a kiinduló teher).
  2. **Realizálási korrekció:** a felszabadult idő nem automatikusan pénz. A reális forgatókönyvben a felszabadult időnek csak egy részét számoljuk értékként.

### G7 – Az értékesítők 77%-a nehezen tudja hatékonyan elvégezni a kiosztott feladatait (F, n = 501)

[Gartner Survey Finds 77% of Sellers Struggle to Complete Their Assigned Tasks Efficiently](https://www.gartner.com/en/newsroom/press-releases/2023-11-02-gartner-survey-finds-77-percent-of-sellers-struggle-to-complete-their-assigned-tasks-efficiently) – 2023-11-02

- **A mi esetünk:** a kiinduló probléma létezése. A sok felület és a sok feladat terhe ugyanaz, amit a legacy forgatókönyvünk leír: hét rendszer, hét felület, a szabályok a fejekben.

### G11 – Az ügyfelek 87%-a szerint aki GenAI-t használ az ügyfélszolgálaton, annak emberi elérhetőséget is kell biztosítania (F)

[Gartner Survey Finds 87% of Customers Say Companies Using GenAI for Customer Service Must Provide Access to a Human Agent](https://www.gartner.com/en/newsroom/press-releases/2026-08-04-gartner-survey-finds-87-percent-of-customers-say-companies-using-genai-for-customer-service-must-provide-access-to-a-human-agent0) – 2026-08-04

- **A mi esetünk:** a megoldásunk belső ügyintézés, nem ügyfél felé néző chatbot. Az ember a döntésnél és a vevővel való kapcsolatban marad. A G11 azt támasztja alá, hogy a létszámot nem lehet nullára vinni.

## 4. Mennyibe kerül egy ügy? (költségoldal)

### G8 – Egy ügyfélkapcsolat medián költsége: önkiszolgáló csatornán kb. 1,84 $, asszisztált (emberi) csatornán kb. 13,50 $ (B)

[Benchmarks to Assess Your Customer Service Costs](https://www.gartner.com/en/documents/5164231)

- **A mi esetünk:** az ügyenkénti költség nemzetközi viszonyítási pontja. Mi a magyar bérrel (KSH) és a mért idővel számolunk. A G8 azt mutatja meg, hogy a mi Ft/ügy számunk nagyságrendben reális-e.
- **Korlát:** régebbi adat (kb. 2023), USA-dominált minta. Ugyanezen a vonalon a Gartner maga figyelmeztet, hogy a *kapcsolatonkénti* költség félrevezető. A *megoldott ügyenkénti* költség a helyes mérőszám, mert az ismételt kapcsolatfelvétel is pénz. Ezért mi a sikertelen futás utómunkáját is beszámoljuk.

### G9 – 2030-ra a GenAI-megoldás ügyenkénti költsége meghaladja a 3 $-t, és drágább lesz sok offshore emberi ügyintézőnél (E)

[Gartner Predicts GenAI Cost Per Resolution for Customer Service Will Exceed Offshore Human Agent Costs by 2030](https://www.gartner.com/en/newsroom/press-releases/2026-01-26-gartner-predicts-genai-cost-per-resolution-for-customer-service-will-exceed-offshore-human-agent-costs-by-2030) – 2026-01-26

- **Okok a Gartner szerint:** dráguló adatközpontok, a szállítók átállása a támogatott növekedésről a nyereségességre, és egyre tokenigényesebb felhasználási esetek.

### G10 – Egy ágenses munkafolyamat inferenciaköltsége 2028-ig több mint ötszörösére nő; egy ágenses lépés legalább ötször annyiba kerül, mint egy egyszerű chatbot-válasz (E)

[Gartner Predicts AI Inference Costs Per Agentic Workflow Will Increase More Than Fivefold Through 2028](https://www.gartner.com/en/newsroom/press-releases/2026-08-17-gartner-predicts-ai-inference-costs-per-agentic-workflow-will-increase-more-than-fivefold-through-2028) – 2026-08-17

- **A G9 és a G10 együtt** a helyi modell melletti érv. A mi ügyenkénti költségünk nem tokenár, hanem áram és a gép amortizációja, és nem függ a szállító árazásától.
- **A felhőváltozat költsége:** a mért tokenszámunkat (token be/ki feladatonként) a pénzügyi riportban felhős árakkal is beárazzuk, és a G10 drágulási irányával érzékenységet számolunk.

## 5. Egyéb, óvatosan használható

### G14 – A rossz adatminőség átlagosan legalább 12,9 M $/év kárt okoz egy szervezetnek (F, 2020-as kutatás)

[Data Quality: Why It Matters and How to Achieve It](https://www.gartner.com/en/data-analytics/topics/data-quality)

- **A mi esetünk:** a legacy rendszerekben többféle névírás és azonosító él (F22, F25: „DUNA-IRODAHAZ KFT.”), és ebből duplikált vevőfelvétel lesz. A szám nagyvállalati, ezért **nem vetítjük** a KKV-ra; csak minőségi érvként idézzük.

### G15 – A pénzügyi vezetők 59%-a használ MI-t; a szállítói számlák automatizálása a második leggyakoribb alkalmazás (37%) (F, n = 183)

[Gartner Survey Shows Finance AI Adoption Remains Steady in 2025](https://www.gartner.com/en/newsroom/press-releases/2025-11-18-gartner-survey-shows-finance-ai-adoption-remains-steady-in-2025) – 2025-11-18

- **A mi esetünk:** a pénzügyi feladataink (díjbekérő, fizetésellenőrzés, sztornó) a piacon is a leggyakoribb MI-felhasználás közé tartoznak.

## 6. Összefoglaló: melyik szám mire megy

| Forrás | Típus | Felhasználás | Hol |
|---|---|---|---|
| G1 | E | felső viszonyítás a mért sikerességhez | 01-meres, 03 |
| G2 | E | kockázat; az MCP-réteg indoklása | 04 (kockázati felár) |
| G3, G5 | F | a megtakarítás mint kapacitás, lassú létszámhatás | 03, 04 (felfutás) |
| G4 | E | pesszimista forgatókönyv | 03, 04 |
| G6 | F | heti 4,8 óra viszonyítás; realizálási korrekció | 03 |
| G7 | F | a kiinduló probléma | 03 |
| G8 | B | ügyenkénti költség viszonyítás | 04 |
| G9, G10 | E | helyi vs. felhőmodell költségiránya | 04 (érzékenység) |
| G11 | F | az ember nem hagyható ki | 03 |
| G12 | A | lépcsőzött felügyelet; pass^k | 01-meres, 03 |
| G13 | E | piaci kontextus | bevezető |
| G14, G15 | F | minőségi érvek | 03 |
| G16 | A | a teljes csere kockázata | 04 |

## 7. Amit a Gartner nem ad meg (és honnan pótoljuk)

- **Magyar bérköltség:** KSH, STADAT 20.1.1.52., foglalkozás (FEOR) szerint. Lásd a [04-penzugy/feltevesek.md](../04-penzugy/feltevesek.md) fájlt.
- **Feladatonkénti emberi idő a mi folyamatainkban:** saját becslés a legacy forgatókönyvből (`docs/LEGACY_FORGATOKONYV.md`, `docs/MUNKAERO_BECSLES.md`). Mérőlappal később pontosítható.
- **A gépidő és a sikeresség:** saját mérés ([01-meres](../01-meres/)).
