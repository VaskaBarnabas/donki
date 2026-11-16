# 21. fázis terve: Universal Commerce Protocol (UCP) integráció

*Állapot: megvalósítva (2026-11-11), a 8–9. lépés kivételével. Eredmény: [20-ucp.md](../riportok/05-osszehasonlitasok/20-ucp.md). Forrásellenőrzés: 2026-11-10.*

## 1. Mi az a UCP, egyszerűen

Ma, ha egy AI-asszisztens vásárolni akar egy webáruházban, vagy minden bolthoz külön integráció kell, vagy a weboldalt kell „nyomkodnia”. A **Universal Commerce Protocol** ezt váltja ki: egy nyílt szabvány (Apache-2.0), amelyen egy vásárló ágens és egy kereskedő közös nyelven tud beszélni, a termék megtalálásától a rendelés nyomon követéséig. A Google indította, a fejlesztése nyilvános, kormányzó testülettel.

Egy hasonlattal: **az MCP azt szabványosítja, hogyan használ egy ágens eszközöket, a UCP azt, hogyan vásárol egy ágens egy kereskedőtől.** A kettő nem versenytárs: a UCP egyik szállítási módja épp az MCP.

### A szereplők

| Szerep | Ki ez | Nálunk |
|---|---|---|
| **Platform** | a vásárlót képviselő ágens vagy felület (pl. Gemini, Google AI Mode, egy cég beszerző ágense) | külső fél |
| **Business** | a kereskedő, a törvényes eladó (Merchant of Record) | **ez leszünk mi** |
| **Credential provider** | a fizetési adatokat tárolja (pl. digitális pénztárca) | külső fél |
| **PSP** | a fizetést feldolgozza | Stripe (teszt mód) |

### Négy alapfogalom

1. **Felfedezés.** A kereskedő a `/.well-known/ucp` címen közzétesz egy JSON-profilt: mit tud, milyen csatornákon, milyen fizetéssel, milyen aláírókulcsokkal.
2. **Képességek (capabilities).** Moduláris funkciók: katalógus (`dev.ucp.shopping.catalog.search` és `.lookup`), fizetési folyamat (`dev.ucp.shopping.checkout`), rendelés (`dev.ucp.shopping.order`). Ezeket bővítmények (extensions) egészíthetik ki, például kedvezmény vagy szállítás.
3. **Egyeztetés.** Minden kérésnél megmondja a platform, ki ő (`UCP-Agent` fejléc a profiljára mutat). A kereskedő letölti és ellenőrzi a profilt, és a két fél a közös képességekkel, a legmagasabb közös verzióval dolgozik.
4. **Szállítás.** Ugyanaz a logika REST-en, MCP-n, A2A-n vagy beágyazott felületen érhető el.

### A vásárlás életútja

```
platform ──create──► incomplete ──update──► ready_for_complete ──complete──► completed (+ order)
                        │                                                       │
                        └► requires_escalation (ember kell, continue_url)       └► rendelésesemények webhookon
```

A `requires_escalation` a számunkra legfontosabb állapot: a kereskedő így jelzi, hogy **ember döntése kell**, és egy linket ad, ahol a folyamat folytatható.

### Fizetés

A platform nem kap és nem kezel nyers kártyaadatot. A kereskedő megmondja, milyen fizetési módokat fogad (payment handlers), a platform a szolgáltatótól egy átlátszatlan tokent szerez, és azt adja át a lezáráskor. Az önálló, emberi jelenlét nélküli vásárláshoz az **AP2 mandátumok** bővítmény kell: ez aláírt bizonyíték arra, hogy a felhasználó tényleg felhatalmazta az ágenst, és a feltételeket a kereskedő is aláírja.

## 2. Mit jelent ez a mi rendszerünkre

Most az ágens **befelé** dolgozik: a cég munkatársait segíti a saját legacy rendszereiben. A UCP egy **kifelé** nyíló csatorna: egy külső vásárló ágens képes lesz megtalálni a termékeinket, ajánlatot kérni és rendelést leadni. Ugyanarra az MCP-rétegre épül, így a dolgozat érve erősödik: a heterogén legacy rendszereket egyszer kellett szabványosítani, és onnan már egy újabb csatorna is kevés munkával rákapcsolható.

## 3. Amit őszintén előre kell mondani

| Korlát | Következmény |
|---|---|
| **A Google élő natív checkoutja Magyarországon nem elérhető.** A talált források szerint jellemzően USA-beli kereskedőknek érhető el, bővítés Kanada, Ausztrália, UK felé; magyar vagy EU-s elérhetőségre nem találtam forrást, és a Google saját oldala nem nevez meg országokat. | A Gemini vagy AI Mode felől a rendszer most nem lesz vásárolható. Amit építünk: **szabványkövető kereskedői oldal**, saját tesztplatformmal bizonyítva. |
| **Merchant Center-fiók és nyilvános HTTPS kell** az élő csatlakozáshoz. | Ezek a te döntéseid és beállításaid, a fázis nem igényli őket. |
| **A B2B-rész még készül.** Ajánlat, vevőspecifikus ár, beszerzési rendelés a szabványban tervezet állapotú, a mi cégünk pedig B2B. | Az adószámot saját bővítményként kell hozzáadni, ami más platformnak nem kötelezően érthető. |
| **A szabvány gyorsan változik.** A specifikáció példái `2026-08-25`, korábbi kiadás `2026-04-08` verziójú. | Egy verzióra rögzítünk, az egyeztetés a többit kezeli. |
| **A REST-útvonalakat még nem tudtam ellenőrizni** (a kötés oldala 404-et adott). | A megvalósítás első lépése a pontos kötés kiolvasása a hivatalos repóból. |

## 4. Tervezett felépítés

```
külső platform ─HTTPS─► UCP-átjáró (új konténer) ─MCP, „ucp” szerepkör─► sales / orders / inventory / finance MCP
                          │  /.well-known/ucp                                      │
                          │  REST és MCP kötés                                     ▼
                          │  aláírás, egyeztetés, állapotgép               legacy rendszerek
                          ▼
                     ucp séma (mcp-db): checkout, idempotencia, platformok, webhook-sor
```

**Fő döntések és indokuk:**

- **Külön konténer, nem a portálban.** Ez a rendszer nyilvános felülete lesz, ezért nem akarjuk, hogy a portál munkamenetei és titkai ugyanabban a folyamatban legyenek.
- **Az átjáróban nincs nyelvi modell.** Determinisztikus állapotgép: a külső ágens a modell, mi a szabályok. Így nincs prompt injection a rendelési útvonalon, nincs tokenköltség, és nem kell GPU-sor.
- **Az átjáró csak MCP-n át ér a rendszerekhez,** új, szűk `ucp` szerepkörrel. A jogosultság, naplózás és idempotencia a meglévő rétegé, és a legacy rendszerek nem változnak.
- **REST és MCP kötés együtt,** ez adja a platformfüggetlenséget. Az A2A és a beágyazott felület kimarad.
- **Fejlesztési környezetben a HTTPS-követelményt egy kifejezett, csak helyben működő kapcsoló lazítja.**

## 5. Megfeleltetés a meglévő rendszerrel

| UCP | Meglévő elem | Megjegyzés |
|---|---|---|
| `catalog.search` / `.lookup` | `search_products`, `check_stock` | listaár; a kifutott termék nem vásárolható |
| Checkout create / update | `create_quote`, `get_quote` | a checkout mögött egy ajánlat áll, a csoportár a vevőből jön |
| `ready_for_complete` | számolt ajánlat, készlet rendben, vevő azonosítva | |
| `requires_escalation` | `request_quote_approval`, jóváhagyási kártya | 15% fölötti kedvezmény, készlethiány, ismeretlen vevő, értékhatár fölött |
| Complete | `accept_quote`, utána `issue_proforma` | létrejön a rendelés és a díjbekérő |
| Fizetés | díjbekérő átutalással; Stripe-link a `continue_url`-en | lásd 7. szakasz, D3 |
| Cancel | ajánlat elutasítása | |
| `order` események | `order_events` sor, `get_order` | teljes állapot, aláírt webhook, újrapróbálással |

**Egy könnyen elrontható részlet.** A UCP az összegeket ISO 4217 szerinti legkisebb egységben kéri, és a forintnál ez a **fillér**, tehát a 38 100 Ft értéke `3810000`. Az ajánlatkezelő egész forintban számol, a Stripe-réteg már most fillérben. Az átváltás egy helyen lesz, teszttel.

**B2B-bővítmény.** A szabvány vevője csak nevet, e-mailt és telefont ismer, nekünk adószám és számlázási cím kell. Ez saját bővítmény lesz, a szabvány névtér-szabálya szerint a mi domainünk alatt (D2). Ha hiányzik, a checkout `requires_escalation` állapotba kerül.

## 6. Biztonság

A jelenlegi biztonsági modell szerint minden írás emberi jóváhagyással megy. A UCP ezt megnyitja, ezért itt a legnagyobb a kockázat.

- **Kapu minden lezárás előtt.** Az autonóm út csak akkor engedett, ha a vevő ismert, a tételek készleten vannak, nincs jóváhagyást igénylő kedvezmény, és az összeg a beállított határ alatt marad. Minden más `requires_escalation`, és jóváhagyási kártya a portálon (D1).
- **Platform-engedélyezőlista.** Csak ismert profilú platform kérése megy tovább.
- **Aláírások** RFC 9421 szerint, a webhookokon kötelezően. A kulcs környezeti változóból jön, a `.env.local`-t továbbra is te töltöd ki, csak a `.env.example` változik.
- **Profil letöltése:** a szabvány szerint tiltott belső és metaadat-címek, méretkorlát, átirányítás nélkül.
- **Korlátok:** kérésszám-korlát platformonként, a checkout lejárata, idempotencia a lezárásnál.
- **Adatvédelem:** azonosítatlan kérés nem kap vevőadatot és vevőspecifikus árat.
- **Külső szöveg** (`untrustedText`): ha egy UCP-üzenet a belső ágenshez kerül, adat, nem utasítás.
- **Kártyaadat nem érinti a rendszert.** A NAV felé továbbra sem megy semmi: csak Számlázz.hu tesztfiók és Stripe teszt mód.

## 7. Eldöntendő kérdések

| # | Kérdés | Javaslat |
|---|---|---|
| D1 | Mennyire legyen autonóm a rendelés? | **Értékhatáros:** ismert vevő, készleten, jóváhagyás nélküli kedvezmény és például 200 000 Ft alatt automatikus, minden más emberi kártya. Ez adja az „autonóm” folyamatot a jóváhagyási elv feladása nélkül. |
| D2 | Milyen domain legyen a bővítmény névtere? | Ha nincs saját domain, a prototípusban egy jelölt helyőrző, élesítés előtt cserélve. |
| D3 | Fizetés első körben? | **Díjbekérő és átutalás, opcionális Stripe-link.** Ez illik a B2B-hez és a meglévő folyamathoz. Tokenes kártyafizetés és AP2 későbbi fázis. |
| D4 | Letölthetem a hivatalos JS SDK-t és a konformancia-tesztcsomagot? | **Igen.** Ez a legerősebb bizonyíték a szabványosságra. Az Apache-2.0 licencű kódot a hivatalos GitHub-szervezetből, futtatás előtt átnézve használnám. |

## 8. Lépések

| # | Lépés | Tartalom | Becslés |
|---|---|---|---|
| 1 | Alapok | a specifikáció rögzítése, pontos kötések, `ucp` séma, konténer, `ucp` MCP-szerepkör | 0,5 nap |
| 2 | Felfedezés | profil, aláírókulcs, `UCP-Agent`, egyeztetés, hibakódok | 0,5 nap |
| 3 | Katalógus | keresés és lekérdezés, fillér-átváltás | 0,5 nap |
| 4 | Checkout | állapotgép, ajánlat-megfeleltetés, B2B-bővítmény, kapu, eszkaláció | 1,5 nap |
| 5 | Lezárás | rendelés, díjbekérő, idempotencia | 0,5 nap |
| 6 | Rendelés | webhook, aláírás, újrapróbálás | 0,5 nap |
| 7 | MCP-kötés | ugyanaz a logika MCP-n | 0,5 nap |
| 8 | Portál | UCP-rendelések a jóváhagyásoknál, egy új figyelőszabály | 0,5 nap |
| 9 | Bizonyítás | füstteszt, konformancia, tesztplatform-ágens, riport, dokumentáció | 1 nap |

## 9. Tesztek és elfogadás

- **`21-ucp` füstteszt:** profil, egyeztetés, teljes vásárlás autonóm úton, minden eszkalációs ág, idempotens lezárás, webhook-aláírás, fillér-átváltás, tiltott platform, rossz aláírás.
- **Hivatalos konformancia-teszt** (D4 után) és sémaérvényesítés.
- **Végpontos bemutató:** egy külön tesztplatform-ágens (helyi modell) csak a UCP-t látja, a `/.well-known/ucp`-ből indul, és rendelést ad le a meglévő rendszerbe.
- **Regresszió:** a `17-agens` és az MCP-füsttesztek változatlanul zöldek.
- **Riport** a `riportok/05-osszehasonlitasok/` alá: mennyi kód kellett az új csatornához, a sikerességi arány és a válaszidő.

**Nem része a fázisnak:** élő Google-kapcsolat, Merchant Center, nyilvános telepítés, A2A és beágyazott felület, AP2, tokenes kártyafizetés.

## 10. Források

- [Universal Commerce Protocol, hivatalos oldal](https://ucp.dev/) és [specifikáció](https://ucp.dev/specification/overview/)
- [Checkout képesség](https://ucp.dev/specification/shopping/checkout/), [Rendelés képesség](https://ucp.dev/specification/shopping/order/), [Katalógus (2026-04-08)](https://ucp.dev/2026-04-08/specification/catalog/)
- [GitHub-szervezet: specifikáció, SDK-k, konformancia](https://github.com/Universal-Commerce-Protocol)
- [Under the Hood: UCP (Google Developers)](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/)
- [Google Merchant Center UCP-dokumentáció](https://developers.google.com/merchant/ucp)
- Másodlagos, az elérhetőséghez és a B2B-hez, ellenőrizendő: [Semrush](https://www.semrush.com/blog/universal-commerce-protocol/), [Uncap](https://www.uncap.com/post/universal-commerce-protocol-ucp), [scandiweb](https://scandiweb.com/blog/universal-commerce-protocol/)

## 11. Döntések (2026-11-11) és a pontosított terv

| # | Döntés | Következmény |
|---|---|---|
| D1 | **Mindig emberi jóváhagyás** | A külső ágens önállóan végigviszi a vásárlást a lezárásig. A lezárás aszinkron (`complete_in_progress`): a rendelés a portálon jóváhagyásra vár, és csak utána jön létre (`completed` + rendelés-webhook). Elutasításnál `canceled`. |
| D2 | **Helyőrző névtér:** `com.example.donki` | A B2B-bővítmény neve `com.example.donki.b2b_buyer`, a séma a névtér szerint az `example.com` alatt. A `example.com` dokumentációs célra fenntartott domain, így egyértelműen helyőrző. Egy helyen cserélhető. |
| D3 | **Díjbekérő + Stripe-link** | Saját fizetési handler (`com.example.donki.proforma`): a lezárás után díjbekérő készül (Számlázz.hu tesztfiók), a rendelésben a Stripe teszt-link. Kártyaadat nem érkezik. |
| D4 | **JS SDK és konformancia-teszt letöltve** (külön mappába, futtatás előtt átnézve) | A szabványverzió **2026-04-08**, mert erre a verzióra van hivatalos konformancia-teszt (`DEFAULT_UCP_VERSION`) és SDK (`@ucp-js/sdk@0.4.6`, `ucp-sdk==0.4.6`). Az újabb `2026-08-25` verzió egyeztetéssel később felvehető. |

**Az átvizsgált konformancia-tesztből adódó pontosítások:**

- **A tesztcsomag egy B2C virágbolt-mintára épül:** kártyás tesztfizetés (`mock_payment_handler`), szállítási cím, kuponkódok. A képességhez kötött teszteket a csomag kihagyja, ha a kereskedő nem hirdeti a képességet. Ezért csak `checkout` és `order` képességet hirdetünk (a katalógus a 2026-04-08 verzióban külön képesség), a kedvezménykód és a szállítási bővítmény nem része a fázisnak.
- **A teszt szinkron lezárást vár** (`completed` + `order` a `complete` válaszában). Ez ütközik a D1-gyel, ezért **konformancia-tesztmód** készül (`UCP_KONFORMANCIA=1`, alapból kikapcsolva): ebben egy szimulált jóváhagyó dönt azonnal, ugyanúgy, ahogy a mérőfuttató is jóváhagyott a 19–20. fázis méréseiben, és a teszt kártyás handlerét a díjbekérővel egyenértékűnek kezeljük. Az éles mód eltérését a riport nyíltan jelzi.
- **A vevő azonosítása B2B módon:** a `buyer.email` egy ismert kapcsolattartó (`crm.contacts`) e-mail-címe, ebből jön a partner és az ügyfélcsoport-ár. Ismeretlen e-mail esetén a `com.example.donki.b2b_buyer` bővítmény adószáma alapján keresünk. Ha egyik sem azonosít, `requires_escalation` állapot jön, a `continue_url` a kapcsolatfelvételre mutat.
- **Új MCP-szerepkör: `ucp`.** Olvasás, ajánlat létrehozása, elfogadás, díjbekérő és fizetési link; más írás nem. A tokent a `stack:secrets` generálja (`.env.stack`), ahogy a `monitor` szerepkörét.
- **A jóváhagyás a portálon:** új „UCP-rendelések” lista a jóváhagyásokkal (jóváhagyás vagy elutasítás). A jóváhagyott rendelést az átjáró egy háttérfolyamata hajtja végre az MCP-n.

**Lépések, a 8. szakasz frissítése:**

| # | Lépés | Állapot |
|---|---|---|
| 1 | Alapok: `ucp` séma (az agens-db-ben, mert a portál azt már olvassa), `ucp` szerepkör, konténer, kulcs | kész |
| 2 | Felfedezés: `/.well-known/ucp`, `UCP-Agent`, egyeztetés, hibakódok | kész |
| 3 | Checkout: create, get, update, cancel, complete; megfeleltetés az ajánlatra; fillér-átváltás; ÁFA; B2B-azonosítás; szállítás (a konformancia-teszt miatt) | kész |
| 4 | Aszinkron lezárás és jóváhagyás: `complete_in_progress`, portál-lista, végrehajtó háttérfolyamat | kész |
| 5 | Rendelés: `GET /orders/{id}`, aláírt webhook (RFC 9421), újrapróbálás | kész |
| 6 | Idempotencia, aláírás-ellenőrzés, engedélyezőlista (origin), IDOR- és SSRF-védelem | kész (a biztonsági áttekintés után szigorítva) |
| 7 | Bizonyítás: `21-ucp` füstteszt (42/42), hivatalos konformancia-teszt (tesztmódban, 46 sikeres / 14 kimaradt / 18 sikertelen a 78-ból), riport ([20-ucp.md](../riportok/05-osszehasonlitasok/20-ucp.md)) | kész |
| 8 | Bemutató: tesztplatform-ágens (helyi modell), amely csak a UCP-t látja | nem készült el |
| 9 | MCP-kötés (ugyanaz a logika MCP-n) | nem készült el |

**Eltérések a tervtől:** a díjbekérő a cég folyamatában csak a kiszállítás után készül, ezért az `ucp` szerepkör írása az ajánlatra és az elfogadásra szűkült (a díjbekérő és a fizetési link a rendelés-eseményben jelenik meg). A partner címét nem töltjük ki (a vevőazonosítás nem hitelesített). Egy automatikus biztonsági áttekintés négy találata nyomán bekerült a kötelező kérésaláírás éles módban, a pontos origin-engedélyezés, a platformra szűkített láthatóság és a webhook-cím ellenőrzése.
