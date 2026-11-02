# „Legacy” forgatókönyv – így dolgozott a cég a portál és az asszisztens előtt

*A szakdolgozat kiinduló helyzetének leírása. Ez a „régi munkamód”, amelyhez a 19. fázisban a portált és az AI-asszisztenst mérjük.*

> **Minden cégnév kitalált.** A leírt kereskedő és a vevők (például „Bakony Gépgyártó Kft”, „Duna Irodaház Kft”) a prototípus mintaadataiból származnak; nevük, adószámuk, címük és adataik kitaláltak. Valós cégekkel való bármilyen egyezésük véletlen.

*A rendszerek, a formátumok, a hibák és a mintaadatok viszont pontosan azok, amelyek a prototípusban futnak; minden történet végigjátszható a „Rendszerek felületei” menüpont oldalain.*

## 1. A cég és a helyzet

**A cég** egy kb. 40 fős magyar B2B kereskedő. Irodatechnikát és ipari eszközöket árul cégeknek, hat termékkörben:
- nyomtatók és multifunkciós eszközök;
- számítástechnika;
- irodabútor;
- irodaszer és fogyóanyag;
- ipari kisgépek és szerszámok;
- munkavédelem.

A vevők nagy része visszatérő ügyfél (például a Duna Irodaház, a Bakony Gépgyártó), négy ügyfélcsoportban: normál, törzsvevő, viszonteladó, kiemelt.

**A rendszerek az évek alatt egyenként jöttek**, ahogy egy-egy igény felmerült. Mindegyiket más szállító vagy más kolléga készítette, és mindegyik „a maga nyelvén beszél”:

| Rendszer | Mire való | Milyen „nyelven” beszél |
|---|---|---|
| CRM és termékkatalógus | partnerek, kapcsolattartók, termékek, listaárak | adatbázis-felület; a partnert egy hosszú azonosító (UUID) jelöli |
| Ajánlatkezelő | ajánlatok, kedvezmények, jóváhagyás | JSON-RPC; dátum `2026-10-03`, összeg egész forint |
| Rendeléskezelő | rendelések életútja (BPMN folyamatmotorral) | régi HTTP-homlokzat; hibák ékezet nélkül: „Keszlet foglalas sikertelen” |
| Raktár | készlet, foglalás, mozgások | üzenetsor; a cikkszám **egész szám** (`4710`), az idő Unix-másodperc |
| Számlázó | díjbekérő, számla, sztornó, vevőtörzs | egyedi szöveges protokoll: `SZAMLA\|LEKER\|SZ-2026-000187`, dátum `2026.10.03`, összeg `38100,00` |
| Fizetés | online fizetési link (Stripe) | „modern” REST; összeg **fillérben** |
| Helpdesk | hibajegyek, garancia, csere és javítás | SOAP/XML; hibák kódként: `HD-409`, `W-EXP` |

Egy termékre tehát legalább háromféleképpen hivatkoznak:
- a katalógusban `TK-00010` („Monitor 24" IPS Full HD”);
- a raktárban `4710`;
- a számlázóban a megnevezés szövege nagybetűvel, ékezet nélkül.

Egy vevő a CRM-ben „Duna Irodaház Kft”, a számlázóban „DUNA-IRODAHAZ KFT.”, `VEVO-1001` kóddal. A rendszerek egymásról nem tudnak, **a kapcsolatot az emberek tartják**: e-mailben, telefonon, Excelben, cetliken.

## 2. Szerepkörök és feladataik

| Szerepkör | Feladatai a régi munkamódban | A rendszerben |
|---|---|---|
| **Értékesítő** (több fő, mindegyiknek saját vevőköre) | ügyfélérdeklődések megválaszolása (e-mail, honlap), annak ellenőrzése, hogy a termék létezik-e és kapható-e, új partner felvétele, ajánlatkészítés, kedvezmény-jóváhagyás kérése, az elfogadott ajánlatból rendelés, lemondás, a vevő tájékoztatása a rendelés állapotáról | `sales` |
| **Értékesítési vezető** | a 15% fölötti kedvezmények és a rendelések jóváhagyása, döntés készlethiány vagy módosítás esetén | `sales_manager` |
| **Raktárvezető** | árubeérkezés rögzítése, a minimum alatti cikkek figyelése és utánrendelés, leltár és készletkorrekció, kiszállítás indítása, kapcsolattartás a fuvarozókkal, visszáru és javításra érkező készülékek beérkeztetése | `logistics` |
| **Pénzügy** | díjbekérő kiállítása, vevők felvétele a számlázóba, sztornó és javított számla, fizetési linkek, átutalások egyeztetése, lejárt tartozások és felszólítások, havi zárás | `finance` |
| **Ügyfélszolgálat** | a honlapról és a közös postafiókba érkező érdeklődések szétosztása, reklamációk és hibajegyek, garancia-ellenőrzés, csere és javítás (RMA) indítása | `sales` (a helpdeskben dolgozik) |
| **Rendszergazda** (félállásban) | hozzáférések és jogosultságok kiosztása és visszavonása mind a hét rendszerben, hibakeresés | `admin` |
| **Ügyvezető** | a heti helyzetkép: nyitott rendelések, kintlévőség, készlet, reklamációk | `viewer` |

## 3. Egy átlagos kedd – a folyamatok történetekben

### 3.1 Ügyfélérdeklődés e-mailben: „Mennyibe kerülne 12 monitor?”

**Reggel 8:40.** Az értékesítő postafiókjába e-mail érkezik a Bakony Gépgyártó beszerzőjétől:

> „Jó napot! Új irodát nyitunk Veszprémben, 12 darab 24 colos monitorra lenne szükségünk. Mennyiért tudják adni, és mikor tudnák szállítani?”

Az **értékesítő** így dolgozik:

1. **Megnyitja a CRM-et**, és rákeres a Bakonyra. Megnézi, melyik ügyfélcsoportban van („Kiemelt”), és kimásolja a partner hosszú azonosítóját (`10000000-0000-4000-8000-000000000003`). Ezt később az ajánlatkezelő kérni fogja, mert az nem ismeri a cégneveket.
2. **A katalógusban** megkeresi a monitort: `TK-00010`, listaár 54 900 Ft. A kiemelt vevő a számítástechnikára 6% kedvezményt kap, ezt az „ár ügyfélcsoportonként” mezőben látja: 51 606 Ft.
3. **Fejben számol**, és itt jön az első csapda. A katalógus ára **nem tartalmazza a mennyiségi kedvezményt**: 10 darab fölött +3%, 50 fölött +5%. Ezt csak az ajánlatkezelő számolja ki. A tapasztalt értékesítő tudja, mert egyszer már rosszul árazott, és a vevő kérte vissza a különbözetet. Az új kollégák nem tudják.
4. **Megnyitja az ajánlatkezelőt**, beilleszti a partner azonosítóját, felvesz egy tételt (`TK-00010`, 12 db), majd rákattint a „Számolás” gombra. Az ajánlat kap egy számot: `AJ-2026-…`.
5. **Raktárkészlet:** a vevő a szállítási időt is kérdezte. A raktár nem a `TK-00010` kódot ismeri, hanem a `4710`-es cikkszámot. Az értékesítő vagy fejből tudja, vagy kikeresi a katalógusból, majd a raktár oldalán elküld egy `LEKERDEZ` parancsot, és vár pár másodpercet a válaszra. A válaszban a „szabad” készlet áll, és egy Unix-időbélyeg, amelyből senki nem tudja fejből, mikor volt.
6. **Válasz-e-mailt ír** a vevőnek: az ajánlat számát, a végösszeget és a szállítási időt kézzel másolja be.

**Ami itt elcsúszhat:** rossz ár (a mennyiségi kedvezmény kimarad), rossz partner (két hasonló nevű cég), elírt cikkszám, és az, hogy a válasz a többi e-mail alatt eltűnik.

**Rendszerváltás:** e-mail → CRM → katalógus → ajánlatkezelő → (katalógus) → raktár → e-mail. **Becsült idő:** 15–25 perc.

### 3.2 Érdeklődés a honlapon: „Van ilyen termékük?”

**9:10.** A cég honlapján van egy régi, PDF-es árlista (listaárakkal) és egy kapcsolatfelvételi űrlap. Az űrlap üzenetei egy közös `info@` postafiókba érkeznek, amit az **ügyfélszolgálat** néz reggelente és délután. Egy eddig ismeretlen cégtől ez jön:

> „Van A3-as színes multifunkciós nyomtatójuk? És az árlistájukban szereplő oszlopos fúrógép kapható még? Mennyibe kerülnének?”

1. **Az ügyfélszolgálat továbbítja** a levelet egy értékesítőnek: mivel új érdeklődő, ahhoz, aki épp ráér. Ez egy továbbított e-mail, a rendszerben sehol nem látszik, hogy valaki már foglalkozik vele.
2. **Az értékesítő megnézi a katalógusban, létezik-e a termék:**
   - **A3-as színes multifunkciós:** van, `TK-00004`, listaár 1 249 000 Ft.
   - **Oszlopos fúrógép** (`TK-00033`): a katalógusban szerepel, de **„inaktív”**, a cég már nem forgalmazza. A honlapi árlista régi, ezért még ott van. Ezt az értékesítő csak akkor veszi észre, amikor felvenné az ajánlatba, és az ajánlatkezelő ezt adja: `-32013 PRODUCT_INACTIVE`. Hasonló terméket keres helyette a katalógusban, kategória szerint böngészve.
   - Ha a vevő **olyat kérdez, ami egyáltalán nincs a kínálatban**, a katalógusban kulcsszóra keres; ha nincs találat, egy rokon termékkört ajánl, vagy nemet mond.
3. **Az ár:** az érdeklődő **még nem vevő**, nincs a CRM-ben, ezért normál (kedvezmény nélküli) árat kap. Ajánlatot csak akkor tud készíteni, ha előbb **felveszi partnerként a CRM-be**; az ajánlatkezelő csak meglévő partnerre dolgozik. Ha később rendel, a pénzügynek a **számlázóba is külön fel kell vennie** ugyanezt a céget, mert az a CRM-ről nem tud.
4. **Válasz e-mailben:** a meglévő termék ajánlata, a kivezetett helyett egy alternatíva, és egy mondat, hogy „a honlapi árlista nem naprakész”.

**Ami itt elcsúszhat:** a honlapi árlista elavult (kivezetett termék, régi ár); egy érdeklődésre két kolléga is válaszol, vagy egy sem; az új partner háromszor kerül rögzítésre (CRM, ajánlat, számlázó), háromféle írásmóddal.

### 3.3 Nagyobb kedvezmény: „Engedj még egy kicsit…”

**10:15.** Egy viszonteladó vevő egy nagyobb projektre kér ajánlatot, és 18% kedvezményt szeretne. Az ajánlatkezelő a számolásnál nem szól semmit, de amikor az **értékesítő** el akarja fogadtatni az ajánlatot, hibát kap:

> `-32010 DISCOUNT_APPROVAL_REQUIRED {"discountPct": 18.2, "limit": 15}`

Az értékesítő tudja, hogy 15% fölött az **értékesítési vezetőnek** jóvá kell hagynia.
1. Az ajánlatkezelőben megnyomja a „Jóváhagyás kérése” gombot, és beírja az indoklást.
2. **Ezt a rendszer senkinek nem jelzi.** Az értékesítő ezért ír egy e-mailt is a vezetőnek („nézd meg légyszi az AJ-2026-0047-et, versenyajánlat”).
3. Ha délig nincs válasz, telefonál.

A vezető este, a telefonjáról látja az e-mailt, de az ajánlatkezelőt csak a gépén éri el. Másnap reggel hagyja jóvá. Addigra a vevő egy konkurens ajánlatát is megkapta.

**Ami itt elcsúszhat:** a jóváhagyási kérés észrevétlen marad; a jóváhagyás nem dokumentált (csak e-mail van róla); a határidős ajánlat lejár (`-32011 QUOTE_EXPIRED`).

### 3.4 Megrendelés: „Mehet!”

**13:30.** A Bakony visszaírt: „Rendben, megrendeljük.”

1. **Az értékesítő elfogadja az ajánlatot** az ajánlatkezelőben. A rendszer ekkor a háttérben létrehozza a rendelést a rendeléskezelőben (`RND-1000…`), „ROGZITETT” állapotban. A rendelésszámot kimásolja, és megírja a vevőnek.
2. **A rendelést az értékesítési vezetőnek jóvá kell hagynia.** Erről megint nem kap értesítést, ezért az értékesítő a délutáni értekezleten szól neki.
3. **A vezető megnyomja a „Jóváhagyás” gombot** a rendeléskezelőben. A rendszer ekkor próbálja lefoglalni a készletet a raktárban, és a monitornál ezt kapja:

   > `{"success":false,"msg":"Keszlet foglalas sikertelen: 4710 (hiany: 3 db)"}`

   A vezető nem tudja, mi a 4710; a rendeléskezelő a raktári cikkszámot írja ki, nem a terméket. Átszól a raktárba.
4. **A raktárvezető** megnézi a raktárban: tényleg csak 9 darab szabad. Részszállítás nincs: a rendelés vagy egészben megy, vagy sehogy. Az értékesítő ezért felhívja a vevőt, hogy menjen-e 9 darab most, vagy várjon a teljes 12-re.
5. A vevő a 9 darabot választja. Az értékesítő a rendeléskezelőben módosítja a tételt (ez csak jóváhagyás előtt lehetséges), a vezető pedig újra jóváhagyja.

**Egy másik napon:** egy USB-C dokkolót rendelnek (`TK-00012`). Ennek **nincs raktári kódja** a katalógusban, a jóváhagyás `MISSING_STOCK_CODE` hibával elakad. Hetekig senki nem tudja, kinek kellene ezt pótolnia.

**Ami itt elcsúszhat:** a rendelés napokig jóváhagyásra vár, mert senki nem tud róla; a hibaüzenet nem mondja meg, melyik termékről van szó; a vevő nem tudja, hol tart a rendelése.

### 3.5 Raktár és kiszállítás: „Hol a csomag?”

**Szerda 9:00.** A **raktárvezető** reggel végignézi a rendeléskezelőben a jóváhagyott rendeléseket.
1. Mindegyiknél megnyomja a „Kiszállítás indítása” gombot. A rendszer fuvarozót rendel (GLS, DPD vagy MPL) és követési számot ad, a rendelés „TELJESITES_ALATT” lesz.
2. A kiadásokat a raktár rendszerében látja mozgásként, cikkszámokkal és Unix-időbélyegekkel.

**Péntek 11:20.** Felhív a Bakony beszerzője: „Hol vannak a monitorok?”
1. Az **értékesítő** megnyitja a rendeléskezelőt. A szállítás állapota „KESIK”, a fuvarozónál késik a csomag.
2. Ezt korábban senki nem vette észre, mert a rendszer ilyenkor egy eseményt tesz egy üzenetsorba, amit egyik ember sem figyel.
3. Az értékesítő elnézést kér, és a követési számot e-mailben is elküldi.

**Ami itt elcsúszhat:** a késésről a vevő előbb tud, mint a cég; a „hol tart?” kérdésekre minden alkalommal egy embernek kell rákeresnie; a minimumszint alá csökkenő készletről a raktár szintén csak egy figyelmen kívül hagyott üzenetsorba szól.

### 3.6 A raktár napi munkája: beérkezés, minimumszint, leltáreltérés

A **raktárvezető** napja nem csak a kiszállításról szól.

1. **Árubeérkezés.** Megjön a beszállító kamionja 20 darab monitorral.
   - A szállítólevélen a **beszállító saját cikkszáma** áll, a cég katalógusában `TK-00010`, a raktárban `4710`. A raktárvezető egy saját Excel-táblából keresi ki a párosítást.
   - A raktár felületén egy `MOZGAS` parancsot küld (`tipus: BE`, `cikk: 4710`, `db: 20`), és megvárja a választ: „MOZGAS ROGZITVE”.
   - Két terméknél a **raktári megnevezés eltér a katalógusbelitől**, ezeknél mindig kétszer ellenőriz.
2. **Mi fogy ki?**
   - Amikor egy cikk készlete a minimumszint alá csökken, a raktár egy `MIN_KESZLET_ALATT` figyelmeztetést tesz egy üzenetsorba. **Ezt az üzenetsort senki nem figyeli.**
   - A raktárvezető ezért hetente egyszer végignézi a teljes raktárlistát, és kigyűjti a minimum alatti cikkeket: legutóbb négy cikk volt a minimumszint alatt, kettő pedig teljesen elfogyott.
   - Beszerzési rendszer nincs: az utánrendelés e-mailben megy a beszállítónak.
3. **Leltáreltérés.** A negyedéves leltárnál egy irodai széknél eggyel kevesebb van a polcon, mint a rendszerben.
   - A raktárvezető `KORREKCIO` mozgást rögzít (`db: -1`), és papíron jelenti a pénzügynek.
   - Ha a hiányzó darab egy rendeléshez már le van foglalva, a korrekció a foglalt készletet nem veheti el; ilyenkor az értékesítőnek kell szólnia, hogy a rendelés csúszik.
4. **Visszáru.** A javításra beérkező készülékeket (lásd 3.10) `VISSZARU` mozgással veszi vissza.

**Ami itt elcsúszhat:** rossz cikkszámra rögzített bevételezés; későn észrevett kifogyás, amiből készlethiány lesz egy rendelés jóváhagyásakor; a leltáreltérés és a foglalások ütközése.

### 3.7 Számlázás: díjbekérő

Amikor a fuvarozó kézbesít, a rendelés „SZALLITVA” lesz. A **pénzügy** innen dolgozik tovább:

1. **Díjbekérőt állít ki** a rendeléskezelőben a „Díjbekérő kiállítása” gombbal, ami a számlázót hívja. A rendelés állapota „SZAMLAZVA” lesz. Az állapotnév félrevezető: ilyenkor még csak a díjbekérő van kiállítva, a végszámla a fizetés után jön.
2. **A vevőnevek nem egyeznek.** A számlázó saját vevőtörzzsel dolgozik, és a CRM-ről nem tud. A Duna Irodaház a számlázóban „DUNA-IRODAHAZ KFT.”; két CRM-partner pedig hiányzik is a számlázóból.
   - Ilyenkor a pénzügyes a számlázó **terminálján** kézzel gépeli be a vevőt (`PARTNER|UJ|<adószám>|<név>|<cím>`).
   - Ha egy mezőt elír, csak ennyit kap: `ERR|E101|HIBAS MEZOSZAM VAGY MEZOFORMATUM`.
3. **A díjbekérőt e-mailben küldi el:** letölti a PDF-et a számlázóból, és csatolja.

**Ami itt elcsúszhat:** kétszer felvett vevő; hibás adószám; a díjbekérő késve megy ki, mert a pénzügy csak délutánonként nézi meg, mely rendelések lettek „kiszállítva”.

### 3.8 Lemondás és sztornó: „Mégsem kell”

**Csütörtök 10:00.** Egy vevő telefonon lemondja a két napja jóváhagyott rendelését, mert a projektje elmaradt.

1. **Az értékesítő** a rendeléskezelőben megnyomja a „Lemondás” gombot. A folyamat feloldja a raktári foglalásokat, a rendelés „LEMONDOTT” lesz. Ha a kiszállítás már elindult, a lemondás nem segít: a csomagot vissza kell hívni a fuvarozótól, ami telefonos ügy a raktárvezetőnek.
2. **Ha díjbekérő is ment már,** az értékesítő szól a pénzügynek, hogy ne küldjön rá felszólítást, és a vevő ne fizesse ki. Erről a rendszer nem értesít senkit.

**Egy másik eset: hibás számla.** Egy kiállított számlán rossz a vevő címe.
1. **A pénzügy** számlát nem javíthat: a számla nem módosítható. Sztornózni kell.
2. A számlázó termináljában kiadja a `SZAMLA|STORNO|SZ-2026-…` parancsot. Erre egy **új, negatív összegű sztornószámla** keletkezik, saját sorszámmal.
3. A vevő címét javítja a számlázó vevőtörzsében.
4. Kiállít egy új, helyes számlát, és mindhármat (eredeti, sztornó, új) elküldi a vevőnek egy magyarázó e-mail kíséretében.
5. A sztornó dátuma csak a mai nap lehet.

**Ami itt elcsúszhat:** a lemondott rendelés díjbekérőjére felszólítás megy; a vevő a régi, sztornózott számlát fizeti ki; a sztornó és az új számla közti kapcsolatot csak az e-mail őrzi.

### 3.9 Fizetés ellenőrzése: „Kifizették már?”

A cég két éve vezette be az **online fizetési linket** (Stripe).
1. A **pénzügy** a fizetési oldalon a díjbekérő számához linket kér, és a linket e-mailben elküldi a vevőnek.
2. **Ha a vevő kártyával fizet,** a számlázó és a rendeléskezelő automatikusan értesül: a díjbekérő „fizetve”, a rendelés „LEZART”, és a végszámlát a számlázási szolgáltató (Számlázz.hu) állítja ki. Ez ma a legjobban működő rész.
3. **Ami továbbra is kézi:**
   - **A lejárt fizetési link:** a link 24 óra után érvénytelen, a vevő pedig ezt csak akkor veszi észre, amikor rákattint. A pénzügy ilyenkor újat kér; a régi a nyilvántartásban „létrehozva” marad.
   - **Az átutalások:** a díjbekérő nélküli, közvetlenül kiállított számlákat a vevők átutalással fizetik. A pénzügy ezeket hetente egyszer a bankszámlakivonatból egyezteti, és a számlázó termináljában egyenként fizetettnek jelöli (`SZAMLA|FIZETVE|SZ-2026-000187|2026.10.15`).
   - **A lejárt tartozások:** hétfőnként lefuttatja a `SZAMLA|LEJART` parancsot. Az eredményt (`OK|3|SZ-2026-000185;VEVO-1004;584411,00;2026.07.15|…`) bemásolja egy Excelbe, a vevőkódokat a CRM-ben visszakeresi cégnévre, és felszólító e-maileket ír.

**Ami itt elcsúszhat:** egy átutalás „elveszik” a kivonatban; a felszólító e-mail olyan vevőnek is kimegy, aki már fizetett; a vevőkód és a cégnév párosítása kézi munka.

### 3.10 Reklamáció és garancia: „Elromlott a nyomtató”

**Csütörtök 14:00.** Felhív egy vevő: a fél éve vett lézernyomtató (`TK-00001`) nem húzza be a papírt.

Az **ügyfélszolgálat**:
1. **Hibajegyet nyit** a helpdeskben (`HJ-000…`), a vevő szavaival.
2. **Garancia:** a garancia a kiszállítás napjától számít, a termék garanciaideje (12 hónap) a katalógusban van. Az ügyfélszolgálatos a helpdesk „Garancia” gombjával ellenőrzi, és egy kódot kap: `W-OK`. Ha a rendelésszámot rosszul adja meg, `W-NOORDER`-t; ha a rendelés még nincs kiszállítva, `W-NOTDELIVERED`-et. A kódok jelentését a monitor szélére ragasztott cetliről nézi.
3. **Csere vagy javítás (RMA):**
   - **Cserénél** a helpdesk azonnal lefoglal egy új készüléket a raktárban. Ha nincs készlet, `HD-409`-et kap, ami azt is jelentheti, hogy a jegy rossz állapotban van. Ilyenkor átszól a raktárba, hogy kiderüljön, melyik.
   - **Javításnál** a raktárvezető a beérkező készüléket a helpdeskben beérkeztetni jelöli, a raktár pedig visszáruként bevételezi.
4. **A vevő tájékoztatása** e-mailben.

**Ami itt elcsúszhat:** a garancia kezdete nem a vásárlás, hanem a kiszállítás napja, és ezt a vevők is, a kollégák is összekeverik; a kódok nem beszédesek; a csere és a raktár között telefonos egyeztetés kell.

### 3.11 Hétfő reggel: „Hogy állunk?”

**Hétfő 8:00.** Az **ügyvezető** négy kérdést tesz fel:
- hány nyitott rendelés van, és mi akadt el;
- mennyi a lejárt kintlévőség;
- mi fogy ki a raktárból;
- hány nyitott reklamáció van.

A válaszhoz négy rendszert kell megnyitni, mindegyiknek más a formátuma:
- **A rendelések állapotát** a pénzügy a rendeléskezelőből számolja össze.
- **A kintlévőséget** a hétfői `SZAMLA|LEJART` listából (vesszős összegekkel) Excelben adja össze.
- **A minimum alatti cikkeket** a raktárvezető a raktárból mondja meg, cikkszámmal. Hogy ezek milyen termékek, azt a katalógusból kell visszakeresni.
- **A hibajegyek számát** az ügyfélszolgálat a helpdeskből mondja.

A négy szám összerakása általában délelőtt 10-ig tart. Addigra a számok egy része már nem is aktuális.

### 3.12 Új kolléga: „Nem tudok belépni”

Új kolléga érkezik a pénzügyre.
1. **A rendszergazda** mind a hét rendszerben külön ad neki hozzáférést; mindegyikben másképp kell, és van, amelyikben csak egy közös kulcs létezik.
2. A jogosultságokat egy Excel-táblában vezeti.
3. Amikor egy kolléga kilép, a hét rendszerből általában hatban veszi el a hozzáférését.

## 4. Összefoglaló: a folyamatok egy táblázatban

| Folyamat | Szerepkörök | Érintett rendszerek | Kézi átadások | Becsült idő (régi munkamód) | Tipikus hiba |
|---|---|---|---|---|---|
| Érdeklődés → ár | értékesítő | e-mail, CRM, katalógus, ajánlatkezelő, raktár | partnerazonosító, cikkszám és ár másolása | 15–25 perc | kimaradt mennyiségi kedvezmény, rossz partner |
| Érdeklődés a honlapon, „van ilyen termék?” | ügyfélszolgálat, értékesítő, (pénzügy) | közös postafiók, katalógus, CRM, ajánlatkezelő, számlázó | továbbított e-mail, új partner háromszori rögzítése | 15–30 perc | elavult honlapi árlista, kivezetett termék, kettős válasz |
| Kedvezmény-jóváhagyás | értékesítő, értékesítési vezető | ajánlatkezelő, e-mail, telefon | értesítés kézzel | órák – 1 nap | észrevétlen kérés, lejárt ajánlat |
| Megrendelés és jóváhagyás | értékesítő, értékesítési vezető, raktárvezető | ajánlatkezelő, rendeléskezelő, raktár, telefon | rendelésszám, hibaüzenet „lefordítása” | 10–30 perc + várakozás | készlethiány cikkszámmal, hiányzó raktári kód |
| Kiszállítás és követés | raktárvezető, értékesítő | rendeléskezelő, raktár | követési szám a vevőnek | 5 perc rendelésenként | késésről a vevő tud előbb |
| Raktári napi munka | raktárvezető | raktár, Excel, e-mail | beszállítói és saját cikkszám párosítása, utánrendelés | napi 1–2 óra | rossz cikkre rögzített bevételezés, késve észrevett kifogyás |
| Díjbekérő | pénzügy | rendeléskezelő, számlázó, e-mail | vevőadat kézzel, PDF csatolása | 5–10 perc | eltérő vevőnév, kettős vevő |
| Lemondás, sztornó | értékesítő, pénzügy, raktárvezető | rendeléskezelő, számlázó, e-mail | szólni a pénzügynek, vevő tájékoztatása | 10–20 perc | felszólítás lemondott rendelésre, sztornózott számla kifizetése |
| Fizetés ellenőrzése | pénzügy | fizetés, számlázó, bankkivonat, Excel | átutalások egyeztetése, lejárt linkek | heti 1–2 óra | elveszett átutalás, téves felszólítás |
| Reklamáció, garancia | ügyfélszolgálat, raktárvezető | helpdesk, rendeléskezelő, raktár | kódok értelmezése, egyeztetés a raktárral | 15–30 perc | rossz garanciakezdet, `HD-409` félreértése |
| Vezetői riport | ügyvezető, pénzügy, raktárvezető, ügyfélszolgálat | 4 rendszer, Excel | mindegyik számot más mondja | 1–2 óra | elavult szám |
| Hozzáférés | rendszergazda | 7 rendszer, Excel | rendszerenként külön | 1–2 óra kollégánként | elfelejtett hozzáférés |

*A becsült idők szemléltető értékek egy ilyen méretű cégre; a pontos összehasonlítás a 19. fázis mérésének feladata.*

## 5. Mi következik ebből a dolgozat számára

A fenti történetek közös mintája:
1. **Az információ megvan, csak szét van szórva.** Minden adat benne van valamelyik rendszerben, de a válaszhoz embernek kell összeraknia, másik formátumból másik formátumba „fordítva”.
2. **A rendszerek nem szólnak egymásnak, és az embereknek sem.** A jóváhagyásra váró ajánlat, az elakadt rendelés, a késő csomag és a kifogyó termék is egy listában vagy egy üzenetsorban ül, amit senki nem figyel.
3. **A szabályok a fejekben vannak:** a 15%-os határ, a mennyiségi kedvezmény, a garancia kezdete, a kódok jelentése.

A prototípus három munkamódot tesz egymás mellé ugyanazokon a rendszereken:

| Munkamód | Hogyan oldja meg a fenti történeteket |
|---|---|
| **Régi munkamód** (Rendszerek felületei) | ahogy ez a dokumentum leírja: rendszerenként, a saját formátumban, emberi átadásokkal |
| **Portál** (Irányítópult, Integrációk) | egy helyen, egységes formában (Ft, dátum) mutatja a rendelések, a tartozások, a készlet és a hibajegyek állapotát; egy kiesett rendszer csak a saját kártyáját érinti |
| **Asszisztens** | a kérést természetes nyelven kapja („A Bakony Gépgyártó 12 monitort kér, mennyi?”), és a szabályokat (mennyiségi kedvezmény, jóváhagyási határ, garancia) maga alkalmazza. Módosítás előtt jóváhagyást kér |

A 19. fázisban ennek a dokumentumnak a történetei lesznek a mérési feladatok. Mindhárom munkamódban elvégezzük őket, és a következőket hasonlítjuk össze:
- az **időt** és a **lépésszámot** (rendszerváltás, kattintás, gépelés);
- a **pontosságot** (helyes ár, helyes állapot, helyes kód);
- az **emberi beavatkozások számát** (átadás, kérdés, jóváhagyás);
- az asszisztensnél a **token- és erőforrás-igényt** is.
