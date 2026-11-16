# Gartner-források: mit mond a piac az ágens alapú ügyintézésről és az emberi tényezőről

*Gyűjtve: 2026-11-07, a hivatkozási adatok pontosítva: 2026-11-11 · felhasználás: [01-meres](../01-meres/), [03-emberi-tenyezo](../03-emberi-tenyezo/), [04-penzugy](../04-penzugy/), [OSSZEFOGLALO](../OSSZEFOGLALO.md)*

## 1. A források típusa, azonosítása és bizonyító ereje

**Miért csak Gartner?** A piaci becslések egyetlen, széles körben hivatkozott elemzőháztól származnak, így a számok módszertana összevethető. A tudományos (lektorált) források a [03-emberi-tenyezo](../03-emberi-tenyezo/emberi-ido-pontositas.md) és a [02-hibak](../05-osszehasonlitasok/02-hibak-ember-es-agens.md) riportban vannak.

**Négy forrástípus, eltérő bizonyító erővel:**

| Jel | Típus | Mit jelent | Bizonyító erő |
|---|---|---|---|
| F | felmérés | a Gartner megkérdezett *n* vezetőt, munkavállalót vagy ügyfelet; múltbeli, önbevalláson alapuló adat | a mintával és az időszakkal együtt idézhető |
| E | előrejelzés | a Gartner elemzőinek várakozása (Gartner Predicts) | nem mérés; irányt és nagyságrendet mutat |
| B | benchmark | fizetős kutatási dokumentum nyilvános összefoglalója | nagyságrendi viszonyítás |
| A | elemzés | fizetős kutatási dokumentum vagy nyilvános cikk | érvelés, nem szám |

**Hogyan azonosíthatók a Gartner-források?** A Gartner sajtóközleményeinek és kutatási dokumentumainak nincs ISBN- vagy DOI-azonosítója. Az egyértelmű azonosításhoz ezért a következőket adjuk meg:

- **sajtóközleménynél:** a kiadás dátuma, a helye (ha ismert), a címe, a nyilatkozó elemző és a mögöttes felmérés adatai (minta, időszak, válaszadók köre), valamint a Gartner newsroom URL-je;
- **kutatási dokumentumnál:** a Gartner dokumentum-azonosítója (a `gartner.com/en/documents/<azonosító>` címben szereplő szám), a címe és a megjelenés dátuma;
- **cikknél:** a cím, az URL és a letöltés dátuma, mert a Gartner-cikkeken nincs megjelenési dátum.

**Hozzáférés.** A Gartner teljes kutatásai fizetősek, a sajtóközlemények nyilvánosak. A gartner.com oldalai automatikus letöltésre HTTP 403-at adnak, ezért a módszertani adatokat (minta, időszak, elemző) a sajtóközlemény címéből és nyilvános összefoglalójából, valamint legalább egy független szaksajtó-közlésből vettük át. Ahol a források eltérnek, azt jelezzük.

**A mi rendszerünkre vetítés.** A Gartner-számok többsége nagyvállalati ügyfélszolgálati és értékesítési szervezetekre vonatkozik. A mi esetünk KKV méretű belső ügyintézés (ajánlat, rendelés, számlázás, raktár, ügyfélszolgálat). A Gartner-számokat ezért **viszonyításra és korrekcióra** használjuk, nem közvetlen átvételre.

## 2. Az ágensek kockázata és a legacy-integráció: a dolgozat fő állítása

### G2 – 2027 végéig az ágenses MI-projektek több mint 40%-át leállítják (E)

> Gartner, Inc. (2025. június 25.): *Gartner Predicts Over 40% of Agentic AI Projects Will Be Canceled by End of 2027* [sajtóközlemény]. Sydney. Nyilatkozó elemző: Anushree Verma (Senior Director Analyst). [gartner.com/en/newsroom/press-releases/2025-06-25-…](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)

- **Mögöttes adat:** a Gartner 2025. januári, webináriumi gyorsszavazása, **n = 3412** résztvevő. A válaszadók 19%-a jelentős, 42%-a óvatos ágenses MI-befektetésről számolt be, 8% semmilyenről, 31% várakozik vagy bizonytalan. Ez nem reprezentatív felmérés, hanem webináriumi szavazás.
- **Az előrejelzés:** az ágenses MI-projektek több mint 40%-át 2027 végéig leállítják. A Gartner szerint ennek három oka van: az elszálló költségek, a nem világos üzleti érték és az elégtelen kockázatkezelés.
- **Legacy-integráció:** a közlemény szerint az ágensek meglévő rendszerekbe illesztése technikailag bonyolult, gyakran megzavarja a munkafolyamatot, és költséges átalakítást igényel. A Gartner ezért sok esetben a munkafolyamat alapoktól való újragondolását tartja a jobb útnak. (A mondatot a szaksajtó a Gartner tanácsaként közli, például az RCR Wireless 2025. június 27-i cikke.)
- **Ágens-mosás („agent washing”):** a Gartner becslése szerint az ágenses megoldást kínáló több ezer szállítóból csak kb. 130 valódi.
- **Kapcsolódó előrejelzés ugyanebben a közleményben:** 2028-ra a vállalati szoftverek 33%-a tartalmaz majd ágenses MI-t (2024-ben kevesebb mint 1%).

**A mi esetünk: ez a dolgozat egyik legfontosabb mondanivalója.** A G2 a legacy-integráció drágaságát a bukás egyik okaként nevezi meg, és az újratervezést javasolja. A dolgozat ezzel szemben azt mutatja meg, hogy van egy harmadik út a „drága átalakítás” és az „újratervezés alapoktól” között. Egy vékony MCP-réteg pontosan a legacy-integráció drága részét választja le: a legacy rendszerek változatlanok maradnak, a fordítás egy helyen van. Hogy ez nem csak állítás, azt a mérések mutatják:

| A G2 szerinti ok | A mi válaszunk | Mérés |
|---|---|---|
| **költség** (az integráció és az üzem) | a legacy rendszereken nem kellett változtatni; a fordítás egy kb. 3000 soros rétegben van; egy új felhasználó bekötése kb. 120 sor; helyi modell, tokendíj nélkül | [15-integracio](../05-osszehasonlitasok/15-integracio.md), [20-ucp](../05-osszehasonlitasok/20-ucp.md), [11-tokenomics](../05-osszehasonlitasok/11-tokenomics.md) |
| **érték** (nem világos haszon) | a sikeresség feladatonként mért: MCP-vel 90–94%, kontrollfeladatokon 94–100%; integrációs réteg nélkül ugyanazzal a modellel 9–41% | [01-meres](../01-meres/ertekeles-2026-11-07-javitott.md) |
| **kockázat** (elégtelen kontroll) | minden írás csak emberi jóváhagyással; a feladaton kívüli írást a rendszer elutasítja; 110 jóváhagyott írásból 0 lett hibás | [02-hibak](../05-osszehasonlitasok/02-hibak-ember-es-agens.md), [12-biztonsag](../05-osszehasonlitasok/12-biztonsag.md), [19-jovahagyas](../05-osszehasonlitasok/19-jovahagyas.md) |

A teljes érvelés a mérések alapján: [OSSZEFOGLALO, 1. fejezet](../OSSZEFOGLALO.md#1-a-dolgozat-fő-állítása-és-a-mérések).

### G12 – A megbízhatóság túlbecslése az egyik fő buktató; a felügyelet kockázat szerint lépcsőzzön (A)

> Gartner, Inc. (2026. április 15.): *A Human-in-the-Loop Framework for AI Agents: Balance Autonomy With Oversight* [kutatási dokumentum]. Gartner-azonosító: 7723857. [gartner.com/en/documents/7723857](https://www.gartner.com/en/documents/7723857)
>
> Gartner, Inc.: *Mastering Agentic AI: Multimillion-Dollar ROI Lessons* [cikk]. [gartner.com/en/articles/agentic-ai-roi](https://www.gartner.com/en/articles/agentic-ai-roi), letöltve: 2026-11-07.
>
> Gartner, Inc.: *How Agentic AI Is Reshaping Manager Oversight* [cikk]. [gartner.com/en/articles/agentic-ai-for-chros](https://www.gartner.com/en/articles/agentic-ai-for-chros), letöltve: 2026-11-07.

- **A kutatási dokumentum összefoglalója szerint:** a „mindig legyen ember a hurokban” tanács nem skálázódik, mert a felügyeletet véglegesnek tekinti. Olyan keret kell, amelyben az ágens kontrollok között, biztonságosan dolgozhat önállóan.
- **A ROI-cikk szerint:** a pilotok elakadásának egyik oka a megbízhatóság túlbecslése. Emberi felügyelet nélkül kontextusvesztés, célelcsúszás, ismétlődő hibahurkok és halmozódó hibák jönnek.
- **A vezetői cikk szerint:** a feladatokat kockázat és szükséges emberi részvétel szerint kell osztályozni (tanácsadó, segítő, átvevő, autonóm), és küszöböket kell adni az emberi beavatkozásnak.

**A mi esetünk:** a jóváhagyási modellünk ugyanez a lépcsőzés. Az olvasás autonóm, az írás jóváhagyással megy, a háttérfigyelő csak olvashat. A **megbízhatóságot külön mérjük:** a pass^k azt mutatja, hogy egy feladat *minden* ismétlésben sikeres-e, nem csak átlagosan.

### G16 – A legacy-modernizáció eszközei a változatlan áttelepítéstől a teljes cseréig terjednek (A)

> Gartner, Inc. (2025. augusztus 18.): *Market Guide for Mainframe and Legacy Systems Migration and Modernization Tools* [kutatási dokumentum]. Gartner-azonosító: 6853966. [gartner.com/en/documents/6853966](https://www.gartner.com/en/documents/6853966)

- **Az összefoglaló szerint:** a piaci útmutató olyan eszközöket tekint át, amelyek a modernizáció különböző útjait támogatják: a változatlan kód más platformra költöztetésétől a teljes technológiai csere megvalósításáig.
- **A mi esetünk:** a mi megoldásunk a skála „nem nyúlunk a legacy kódhoz” végén áll: becsomagolás, nem áttelepítés és nem csere. A pénzügyi riport a teljes CRM-cserét illusztratív költségként mutatja be.
- **Korlát:** a dokumentum teljes szövege nem hozzáférhető. A modernizációs projektek sikertelenségi arányára a Gartner nyilvános anyagaiban nem találtunk számot, ezért ilyet nem idézünk.

## 3. Mit várnak az ágenstől? (piaci irány)

### G1 – Az ágensek 2029-re a gyakori ügyfélszolgálati ügyek 80%-át emberi beavatkozás nélkül megoldják (E)

> Gartner, Inc. (2025. március 5.): *Gartner Predicts Agentic AI Will Autonomously Resolve 80% of Common Customer Service Issues Without Human Intervention by 2029* [sajtóközlemény]. Nyilatkozó elemző: Daniel O'Sullivan (Senior Director Analyst, Customer Service & Support). [gartner.com/en/newsroom/press-releases/2025-03-05-…](https://www.gartner.com/en/newsroom/press-releases/2025-03-05-gartner-predicts-agentic-ai-will-autonomously-resolve-80-percent-of-common-customer-service-issues-without-human-intervention-by-20290)

- **Az előrejelzés:** 2029-re az ágenses MI a *gyakori* ügyfélszolgálati ügyek 80%-át emberi beavatkozás nélkül megoldja, ami kb. 30%-os működésiköltség-csökkenést hoz.
- **A mi esetünk:** a mi mérésünk ma, helyi modellel mér sikerességet hasonló gyakori ügyeken (ajánlat, státusz, díjbekérő, garancia). A G1 piaci viszonyítási pont; a mért eredményünk ehhez mérhető, de nem bizonyíték rá.
- **Korlát:** előrejelzés, és csak a „gyakori” ügyekre vonatkozik.

### G13 – 2028-ra a napi munkahelyi döntések legalább 15%-át ágensek hozzák meg (E)

> Gartner, Inc. (2024. október 21.): *Gartner Identifies the Top 10 Strategic Technology Trends for 2025* [sajtóközlemény]. Nyilatkozó elemző: Gene Alvarez (Distinguished VP Analyst). [gartner.com/en/newsroom/press-releases/2024-10-21-…](https://www.gartner.com/en/newsroom/press-releases/2024-10-21-gartner-identifies-the-top-10-strategic-technology-trends-for-2025)

- **Az előrejelzés:** az ágenses MI a 2025-ös stratégiai technológiai trendek első helyén áll. A napi munkahelyi döntések autonóm aránya a 2024-es 0%-ról 2028-ra legalább 15%-ra nő.
- **A mi esetünk:** piaci kontextus a dolgozat bevezetéséhez. Ebből adódik a kérdés, hogyan kapcsolható egy *meglévő* (legacy) rendszer ehhez a trendhez.

## 4. Mi lesz az emberrel? (a munkaerő-megtakarítás korrekciója)

### G3 – Az ügyfélszolgálati vezetők csak 20%-a csökkentette MI miatt a létszámot (F)

> Gartner, Inc. (2025. december 2.): *Gartner Survey Finds Only 20% of Customer Service Leaders Report AI-Driven Headcount Reduction* [sajtóközlemény]. [gartner.com/en/newsroom/press-releases/2025-12-02-…](https://www.gartner.com/en/newsroom/press-releases/2025-12-02-gartner-survey-finds-only-20-percent-of-customer-service-leaders-report-ai-driven-headcount-reduction)
>
> Gartner, Inc. (2026. november 5.): *Gartner Survey Finds 21% of Service and Support Leaders Have Reduced Human Agent Headcount Because of AI* [sajtóközlemény]. [gartner.com/en/newsroom/press-releases/2026-11-05-…](https://www.gartner.com/en/newsroom/press-releases/2026-11-05-gartner-survey-finds-21-percent-of-service-and-support-leaders-have-reduced-human-agent-headcount-because-of-ai)

- **Felmérés (2025):** **n = 321** ügyfélszolgálati és támogatási vezető, világszerte. A felvétel ideje a források szerint 2025 szeptembere–októbere (néhány szaksajtó-közlés csak októbert említ). A vezetők 20%-a csökkentett létszámot MI miatt; 55% stabil létszámmal nagyobb ügyfélvolument kezel.
- **Követő felmérés (2026):** **n = 275** vezető. 21% csökkentett létszámot MI miatt, átlagosan az állomány 16,7%-ával az előző 18 hónapban.
- **A mi esetünk:** a megtakarítást elsősorban **felszabaduló kapacitásként** (több rendelés ugyanannyi emberrel) értelmezzük, nem leépítésként.

### G5 – A vezetők 85%-a bővíti az emberi munkatársak feladatait (F)

> Gartner, Inc. (2026. április 28.): *Gartner Survey Finds 85% of Service and Support Leaders are Expanding Human Agent Responsibilities Despite Expectations of Mass AI Layoffs* [sajtóközlemény]. [gartner.com/en/newsroom/press-releases/2026-04-28-…](https://www.gartner.com/en/newsroom/press-releases/2026-04-28-gartner-survey-finds-eighty-five-percent-of-service-and-support-leaders-are-expanding-human-agent-responsibilities-despite-expectations-of-mass-ai-layoffs)
>
> Gartner, Inc. (2026. április 23.): *Gartner Survey Finds 31% of Service and Support Leaders Have Implemented or Are Planning AI-Driven Frontline Layoffs Through 1Q27* [sajtóközlemény]. [gartner.com/en/newsroom/press-releases/2026-04-23-…](https://www.gartner.com/en/newsroom/press-releases/2026-04-23-gartner-survey-finds-31-percent-of-service-and-support-leaders-have-implemented-or-are-planning-ai-driven-frontline-layoffs-through-1q27)

- **Felmérés:** ugyanaz a **n = 321** fős, 2025. szeptember–októberi felmérés, mint a G3-nál. A vezetők 85%-a új feladatokat ad az emberi munkatársaknak; 31% hajtott végre vagy tervez leépítést 2027 első negyedévéig; 63% fokozatosan, természetes fogyással csökkenti a létszámot.
- **A mi esetünk:** a létszámhatás lassú, és természetes fogyással jön. A megtakarítás ezért az első évben csak részben realizálódik.

### G4 – Akik MI miatt leépítettek, azok fele 2027-ig visszavesz embert (E)

> Gartner, Inc. (2026. február): *Gartner Predicts Half of Companies That Cut Customer Service Staff Due to AI Will Rehire by 2027* [sajtóközlemény]. Stamford. Nyilatkozó elemző: Kathy Ross (Senior Director Analyst, Customer Service & Support). [gartner.com/en/newsroom/press-releases/2026-02-03-…](https://www.gartner.com/en/newsroom/press-releases/2026-02-03-gartner-predicts-half-of-companies-that-cut-customer-service-staff-due-to-ai-will-rehire-by-2027)

- **A dátumról:** az URL 2026. február 3-át, egyes közlések február 2-át adnak meg.
- **Az előrejelzés:** azoknak a cégeknek a fele, amelyek MI-re hivatkozva csökkentették az ügyfélszolgálati létszámot, 2027-ig hasonló feladatkörre, de más munkakörnévvel újra embert vesz fel. A 2026. novemberi követő felmérés (G3) szerint a vezetők 7%-a már visszavett, 11% tervezi 18 hónapon belül.
- **A mi esetünk:** a gépi munka ellenőrzése, a kivételek kezelése és a jóváhagyás emberi munka marad; ezt az ágens melletti emberi időként külön számoljuk.

### G6 – Az MI heti 4,8 órát takarít meg értékesítőnként, de a szervezetek 72%-a nem fordítja vissza értékes munkára (F)

> Gartner, Inc. (2026. május 19.): *Gartner Survey Finds AI Saves Sellers Nearly 5 Hours Per Week, Yet 72% of Sales Organizations Fail to Reinvest Time in High-Value Activities* [sajtóközlemény]. [gartner.com/en/newsroom/press-releases/2026-05-19-…](https://www.gartner.com/en/newsroom/press-releases/2026-05-19-gartner-survey-finds-ai-saves-sellers-nearly-five-hours-per-week-yet-seventy-two-percent-of-sales-organizations-fail-to-reinvest-time-in-high-value-activities)

- **Felmérés:** **n = 210** értékesítési igazgató (CSO) és vezető értékesítési döntéshozó, 2026. január–február. Az MI átlagosan heti 4,8 órát takarít meg értékesítőnként; a szervezetek 72%-a a felszabadult időt kevéssé fordítja vissza értékes értékesítési munkára.
- **A mi esetünk:** két felhasználás. (1) Külső viszonyítás a saját, értékesítőre jutó heti megtakarításunkhoz. (2) Realizálási korrekció: a felszabadult idő nem automatikusan pénz.

### G7 – Az értékesítők 77%-a nehezen tudja hatékonyan elvégezni a kiosztott feladatait (F)

> Gartner, Inc. (2023. november 2.): *Gartner Survey Finds 77% of Sellers Struggle to Complete Their Assigned Tasks Efficiently* [sajtóközlemény]. [gartner.com/en/newsroom/press-releases/2023-11-02-…](https://www.gartner.com/en/newsroom/press-releases/2023-11-02-gartner-survey-finds-77-percent-of-sellers-struggle-to-complete-their-assigned-tasks-efficiently)

- **Felmérés:** **n = 501** értékesítő, 2023. március–április, az értékesítők technológiához való viszonyáról.
- **A mi esetünk:** a kiinduló probléma létezése. A sok felület és a sok feladat terhe ugyanaz, amit a legacy forgatókönyv leír: hét rendszer, hét felület, a szabályok a fejekben.

### G11 – Az ügyfelek 87%-a szerint aki GenAI-t használ az ügyfélszolgálaton, annak emberi elérhetőséget is kell biztosítania (F)

> Gartner, Inc. (2026. augusztus 4.): *Gartner Survey Finds 87% of Customers Say Companies Using GenAI for Customer Service Must Provide Access to a Human Agent* [sajtóközlemény]. Nyilatkozó elemző: Eric Keller. [gartner.com/en/newsroom/press-releases/2026-08-04-…](https://www.gartner.com/en/newsroom/press-releases/2026-08-04-gartner-survey-finds-87-percent-of-customers-say-companies-using-genai-for-customer-service-must-provide-access-to-a-human-agent0)

- **Felmérés:** **n = 3566** B2B és B2C ügyfél, 2026. február–március.
- **A mi esetünk:** a megoldásunk belső ügyintézés, nem ügyfél felé néző chatbot. Az ember a döntésnél és a vevővel való kapcsolatban marad. A G11 azt támasztja alá, hogy a létszámot nem lehet nullára vinni.

## 5. Mennyibe kerül egy ügy? (költségoldal)

### G8 – Egy ügyfélkapcsolat medián költsége önkiszolgáló csatornán 1,84 $, asszisztált (emberi) csatornán 13,50 $ (B)

> Gartner, Inc. (2024. február 1.): *Benchmarks to Assess Your Customer Service Costs* [kutatási dokumentum]. Gartner-azonosító: 5164231. [gartner.com/en/documents/5164231](https://www.gartner.com/en/documents/5164231)

- **A mi esetünk:** az ügyenkénti költség nemzetközi viszonyítási pontja. Mi a magyar bérrel (KSH) és a mért idővel számolunk; a G8 azt mutatja meg, hogy a mi Ft/ügy számunk nagyságrendben reális-e.
- **Korlát:** amerikai dominanciájú minta, a módszertan a nyilvános összefoglalóból nem látszik. A Gartner maga figyelmeztet, hogy a *kapcsolatonkénti* költség félrevezető; a *megoldott ügyenkénti* költség a helyes mérőszám, mert az ismételt kapcsolatfelvétel is pénz. Ezért a sikertelen futás utómunkáját is beszámoljuk.

### G9 – 2030-ra a GenAI-megoldás ügyenkénti költsége meghaladja a 3 $-t, és drágább lesz sok offshore emberi ügyintézőnél (E)

> Gartner, Inc. (2026. január 26.): *Gartner Predicts GenAI Cost Per Resolution for Customer Service Will Exceed Offshore Human Agent Costs by 2030* [sajtóközlemény]. Nyilatkozó elemző: Patrick Quinlan. [gartner.com/en/newsroom/press-releases/2026-01-26-…](https://www.gartner.com/en/newsroom/press-releases/2026-01-26-gartner-predicts-genai-cost-per-resolution-for-customer-service-will-exceed-offshore-human-agent-costs-by-2030)

- **Az előrejelzés:** 2030-ra a GenAI megoldott ügyenkénti költsége 3 $ fölé megy, többe kerül, mint sok B2C offshore emberi ügyintéző. Okok: dráguló adatközpontok, a szállítók átállása a támogatott növekedésről a nyereségességre, egyre tokenigényesebb felhasználási esetek. Ugyanebben a közleményben: a szabályozás miatt 2028-ra 30%-kal nő az asszisztált (emberi) ügyfélszolgálati volumen.

### G10 – Egy ágenses munkafolyamat inferenciaköltsége 2028-ig több mint ötszörösére nő (E)

> Gartner, Inc. (2026. augusztus 17.): *Gartner Predicts AI Inference Costs Per Agentic Workflow Will Increase More Than Fivefold Through 2028* [sajtóközlemény]. Nyilatkozó elemző: Will Sommer (Senior Director Analyst). [gartner.com/en/newsroom/press-releases/2026-08-17-…](https://www.gartner.com/en/newsroom/press-releases/2026-08-17-gartner-predicts-ai-inference-costs-per-agentic-workflow-will-increase-more-than-fivefold-through-2028)

- **Az előrejelzés:** ha egy feladatot ágenses, következtető modell kap, az inferenciaköltség legalább ötszöröse egy egyszerű chatbot-válaszénak, összetett feladatnál ennél is több. A tokenár csökkenését a növekvő tokenigény felemészti. A szaksajtó szerint az előrejelzés a Gartner Tokenomics Forecast nevű ökonometriai modelljén alapul. A Gartner ajánlása a modellek lépcsőzése: a munkafolyamat egyes részeit a szükséges képesség szerint más-más modell kapja.
- **A G9 és a G10 együtt** a helyi modell melletti érv. A mi ügyenkénti költségünk nem tokenár, hanem áram és a gép amortizációja, és nem függ a szállító árazásától. A mérésünk a Gartner-ajánlással egybevág: az MCP-réteggel a kisebb modell (e4b) közel ugyanazt teljesíti, mint a nagyobb ([18-modellvalasztas](../05-osszehasonlitasok/18-modellvalasztas.md)).

## 6. Egyéb, óvatosan használható

### G14 – A rossz adatminőség átlagosan legalább 12,9 M $/év kárt okoz egy szervezetnek (F)

> Gartner, Inc.: *Data Quality: Why It Matters and How to Achieve It* [témaoldal]. [gartner.com/en/data-analytics/topics/data-quality](https://www.gartner.com/en/data-analytics/topics/data-quality), letöltve: 2026-11-07. A szám forrása az oldal szerint egy 2020-as Gartner-kutatás. Másodlagos hivatkozások ezt a *How to Create a Business Case for Data Quality Improvement* (2020) dokumentumhoz kötik, és a 2020-as Magic Quadrant for Data Quality Solutions referenciaügyfeleinek felméréséből származtatják.

- **A mi esetünk:** a legacy rendszerekben többféle névírás és azonosító él (F22, F25: „DUNA-IRODAHAZ KFT.”), és ebből duplikált vevőfelvétel lesz. A szám nagyvállalati, ezért **nem vetítjük** a KKV-ra; csak minőségi érvként idézzük.

### G15 – A pénzügyi vezetők 59%-a használ MI-t; a szállítói számlák automatizálása a második leggyakoribb alkalmazás (37%) (F)

> Gartner, Inc. (2025. november 18.): *Gartner Survey Shows Finance AI Adoption Remains Steady in 2025* [sajtóközlemény]. Nyilatkozó elemző: Marco Steecker. [gartner.com/en/newsroom/press-releases/2025-11-18-…](https://www.gartner.com/en/newsroom/press-releases/2025-11-18-gartner-survey-shows-finance-ai-adoption-remains-steady-in-2025)

- **Felmérés:** **n = 183** pénzügyi igazgató (CFO) és vezető pénzügyi döntéshozó, 2025. május–június. A leggyakoribb alkalmazás a tudásmenedzsment (49%), utána a szállítói számlák automatizálása (37%) és a hiba- és anomáliafelismerés (34%).
- **A mi esetünk:** a pénzügyi feladataink (díjbekérő, fizetésellenőrzés, sztornó) a piacon is a leggyakoribb MI-felhasználások közé tartoznak.

## 7. Összefoglaló: melyik szám mire megy

| Forrás | Típus | Minta / alap | Felhasználás | Hol |
|---|---|---|---|---|
| G1 | E | – | felső viszonyítás a mért sikerességhez | 01-meres |
| G2 | E | webináriumi szavazás, n = 3412 | a legacy-integráció kockázata; az MCP-réteg indoklása | OSSZEFOGLALO 1., 04 |
| G3, G5 | F | n = 321 (2025), n = 275 (2026) | a megtakarítás mint kapacitás, lassú létszámhatás | 03, 04 |
| G4 | E | – | pesszimista forgatókönyv | 03, 04 |
| G6 | F | n = 210 | heti 4,8 óra viszonyítás; realizálási korrekció | 03, 04 |
| G7 | F | n = 501 | a kiinduló probléma | bevezető |
| G8 | B | Gartner-benchmark | ügyenkénti költség viszonyítás | 04 |
| G9, G10 | E | ökonometriai modell (G10) | helyi vs. felhőmodell költségiránya | 04, 11 |
| G11 | F | n = 3566 | az ember nem hagyható ki | 03 |
| G12 | A | – | lépcsőzött felügyelet; pass^k | 01-meres, 19 |
| G13 | E | – | piaci kontextus | bevezető |
| G14, G15 | F | 2020-as kutatás; n = 183 | minőségi érvek | 03 |
| G16 | A | – | a modernizációs utak skálája | 04 |

## 8. Amit a Gartner nem ad meg (és honnan pótoljuk)

- **Magyar bérköltség:** KSH, STADAT 20.1.1.52., foglalkozás (FEOR) szerint ([04-penzugy/feltevesek.md](../04-penzugy/feltevesek.md)).
- **Feladatonkénti emberi idő a mi folyamatainkban:** a tipikus felhasználó ideje és a Keystroke-Level Model szerinti alsó korlát a legacy forgatókönyv lépéseiből ([03-emberi-tenyezo](../03-emberi-tenyezo/emberi-ido-pontositas.md)).
- **A gépidő és a sikeresség:** saját mérés ([01-meres](../01-meres/)).
