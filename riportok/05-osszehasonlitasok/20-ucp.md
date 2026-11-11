# Universal Commerce Protocol: a cég mint kereskedő a külső vásárló ágenseknek (21. fázis)

*2026-11-11 · terv és döntések: [FAZIS21_TERV.md](../../docs/FAZIS21_TERV.md) · kód: `ucp/` · füstteszt: `scripts/smoke/21-ucp.ts` · hivatalos konformancia-teszt: [adatok/ucp-konformancia.txt](adatok/ucp-konformancia.txt) · szabványverzió: 2026-04-08*

## 1. Mit csináltunk, és miért

A **Universal Commerce Protocol (UCP)** nyílt szabvány arra, hogyan vásárol egy AI-ágens egy kereskedőtől: a kereskedő a `/.well-known/ucp` címen közzéteszi, mit tud, a vásárló ágens egyeztet vele, végigviszi a fizetési folyamatot (checkout), és aláírt eseményekben követi a rendelést.

A cég ágensei eddig befelé dolgoztak, a munkatársakat segítették. A UCP-vel **kifelé is nyílik egy csatorna**: egy külső vásárló ágens (egy partner beszerzési ágense, vagy később egy keresőplatform asszisztense) ajánlatot kérhet és rendelést adhat le. A dolgozat szempontjából ez a legerősebb gyakorlati próbája annak, hogy az MCP-réteg valóban egyszeri befektetés: az új csatorna **új legacy-kód nélkül**, a meglévő MCP-eszközökre épült.

## 2. Felépítés

```
külső vásárló ágens ─UCP (REST, aláírt)─► UCP-átjáró ─MCP, „ucp” szerepkör─► sales / inventory / orders / finance ─► legacy rendszerek
                                              │
                                              ├─ agens-db, ucp séma: checkout-állapot, idempotencia, webhook-sor
                                              └─ portál: „UCP-rendelések” → emberi jóváhagyás
```

| Döntés | Miért |
|---|---|
| Külön konténer (`ucp-gateway`), nem a portálban | ez a rendszer nyilvános felülete, ne osztozzon a portál munkameneteivel és titkaival |
| **Nincs nyelvi modell az átjáróban** | a vásárló ágens a modell, mi a szabályok: nincs prompt injection a rendelési útvonalon, nincs tokenköltség |
| Csak MCP-n ér a rendszerekhez, új, szűk `ucp` szerepkörrel | olvasás, `create_quote`, `accept_quote`; minden más írás tiltott (a füstteszt ellenőrzi) |
| A checkout mögött a meglévő ajánlat áll | az ügyfélcsoport- és mennyiségi kedvezmény, a 15% fölötti jóváhagyás szabálya változatlan |
| **Minden rendelést ember hagy jóvá** (D1) | a lezárás aszinkron (`complete_in_progress`), a rendelés a portálon kapott jóváhagyás után jön létre |

**Megfeleltetés:**
- **create / update:** tételek, készlet és vevő ellenőrzése, majd ajánlat;
- **complete:** jóváhagyásra vár;
- **jóváhagyás:** `accept_quote`, ebből lesz a rendelés;
- **rendelés-esemény:** aláírt webhook.

**Árazás és szállítás:** az összegek fillérben (ISO 4217), nettó + 27% ÁFA. A szállítás egy díjmentes futáros opció a platform által megadott címre. A díjbekérő és a Stripe-link a cég meglévő folyamatából jön a kiszállítás után, és a rendelés-eseményben jut el a vásárlóhoz.

## 3. Biztonság

A tervezett védelmeket egy automatikus biztonsági áttekintés négy találata alapján szigorítottuk:

| Kockázat | Védelem |
|---|---|
| Ismeretlen vagy hamis platform | pontos origin-egyezésű engedélyezőlista; éles módban a kérést a platformnak RFC 9421 szerint alá kell írnia, a profiljában közzétett kulccsal (Ed25519 vagy P-256), a törzs kivonatával és 5 perces időablakkal |
| Más platform checkoutjának olvasása (IDOR) | a checkout és a rendelés csak a létrehozó platformnak látszik, másnak 404 |
| SSRF a profil vagy a webhook címén | csak HTTPS; minden feloldott cím ellenőrizve (privát, loopback, link-local, CGNAT, IPv4-be ágyazott IPv6 tiltva); a webhook csak a platform saját gépnevére mutathat, és a kézbesítés előtt újra ellenőrizzük |
| A webhook hamisítása a vásárló felé | az átjáró aláírja az eseményeket (Ed25519, a kulcs a saját profiljában) |
| Kettős végrehajtás | idempotencia-kulcs műveletenként, a kéréstörzs kivonatával; más tartalommal 409 |
| Kártyaadat | nem érkezik és nem tárolódik; a fizetés díjbekérő alapján megy |
| **Nem hitelesített vevőazonosítás** | a vevőt a kapcsolattartói e-mail vagy az adószám azonosítja, ami **nem hitelesítés**. Ezért a válasz nem ad ki vevőadatot (címet, adószámot), és a jóváhagyó a portálon látja az azonosítás módját. **Nyitott pont:** a szabvány identity linking képessége (OAuth-fiókkötés) adná a valódi megoldást. |

## 4. A saját füstteszt

A `21-ucp` füstteszt 42 ellenőrzéssel, modell nélkül fut végig. A teszt maga játssza az aláíró vásárló platformot és a webhook-fogadót. **Eredmény: 42/42.**

**Ellenőrzött területek:**
- **felfedezés:** a profil, a kulcs, a képességek;
- **platformvédelem:** aláírás nélkül 401, módosított törzs 401, nem engedélyezett platform 403, régi verzió 422, más platform 404;
- **checkout:** árazás fillérben, ÁFA, kedvezmény, B2B-azonosítás;
- **hibák:** ismeretlen termék, készlethiány, ismeretlen vevő, hiányzó vevő vagy cím;
- **kérések:** teljes csere, idempotencia;
- **lezárás:** idegen fizetési mód elutasítva, jóváhagyásra vár, jóváhagyás után rendelés;
- **webhook:** megérkezik, az aláírása a profilkulccsal ellenőrizhető;
- **elutasítás és megszakítás.**

A teszt azt is ellenőrzi, hogy az `ucp` szerepkör nem hagyhat jóvá ajánlatot, nem mondhat le rendelést és nem állíthat ki díjbekérőt.

## 5. A hivatalos konformancia-teszt

A UCP hivatalos, nyílt forrású tesztcsomagja (`Universal-Commerce-Protocol/conformance`, Apache-2.0) **78 tesztje közül 46 sikeres, 14 kimaradt, 18 sikertelen**. A csomagot a saját átjárónk ellen, konformancia-tesztmódban futtattuk.

**A tesztmód két eltérése, nyíltan:**

1. **Szimulált jóváhagyó.** A tesztcsomag szinkron lezárást vár (a `complete` válaszában kész rendelést), mi viszont minden rendelést ember elé teszünk. Tesztmódban egy szimulált jóváhagyó azonnal dönt, ugyanúgy, ahogy a mérőfuttató is jóváhagyott a 19–20. fázis méréseiben.
2. **Tesztpartner.** A tesztcsomag névtelen vagy általa kitalált e-mailű vásárlóval dolgozik, a B2B-átjáró azonosított partnert kér. Tesztmódban az azonosítatlan vásárlót egy erre a futásra felvett tesztkapcsolattartó partneréhez rendeljük, a futás végén a kapcsolattartót töröljük.

**A 18 sikertelen teszt okai:**

| Ok | Tesztek | Megjegyzés |
|---|---:|---|
| **A tesztcsomag saját, nem szabványos végpontjai** (`PUT /orders/{id}`, `/testing/simulate-shipping`) | 8 | a 2026-04-08-as REST-kötés csak `GET /orders/{id}`-t ír elő; ezek a mintabolt teszthorgai, nálunk a szállítás a valódi fuvarozói szimulációból jön |
| **B2B-árazás:** nettó + 27% ÁFA és ügyfélcsoport-kedvezmény a listaár helyett, kuponkód nélkül | 4 | szándékos: a cég B2B kereskedő; a tesztcsomag ÁFA és csoportár nélküli, kuponos B2C árat vár |
| **A vevő tárolt címének kitöltése** | 3 | szándékosan nem tesszük meg: az azonosítás nem hitelesített, a cím kiadása adatszivárgás lenne (lásd 3. szakasz) |
| **Kártyás tokenes fizetés** | 1 | nem támogatott (D3: díjbekérő) |
| **Dinamikus szállítási opciók** (országonként más opció és díj) | 1 | nem hirdetett: egyetlen díjmentes B2B-opciónk van |
| **Webhook-újrapróbálás időzítése** | 1 | a tesztcsomag 5 másodperces ablakán belül háromszor kellene próbálkozni; az átjáró 1, 2, 4 … másodperces lépcsője ezt nem mindig éri el |

**A 14 kimaradt teszt** olyan képességekhez tartozik, amelyeket szándékosan nem hirdetünk: kuponkód, beleegyezés, AP2-mandátum, dinamikus szállítási opciók. A tesztcsomag ezeket magától kihagyja.

**A sikeres 45 teszt** lefedi a felfedezést, a verzióegyeztetést, a teljes checkout-életciklust (létrehozás, lekérdezés, csere, megszakítás, lezárás, a lezárt és megszakított checkout tiltott műveletei), az idempotenciát, a hibaüzenetek szerkezetét (készlethiány, nem létező termék, fizetési hiba, hiányzó szállítás), a rendelés lekérdezését, a rendelés-webhook szerkezetét és aláírását, valamint az összesítők szerkezetét.

**Iteráció:** az első futás 28 sikeres tesztet hozott. Hat javítás után lett 46:
- a tesztpartner a tesztmódban;
- a `payment` mező a válaszban;
- 409 a lezárt checkout újabb lezárásánál;
- gyorsabb webhook-kézbesítés és újrapróbálás;
- az `@authority` és a `@path` lefedése az aláírásban;
- állandó `Webhook-Id` az újrapróbálásnál.

Mindegyik a szabvány pontosabb követése volt.

**Egy tanulság a tesztkörnyezetből:** egy közbülső futás 42-re esett vissza, mert a teszt idejére indított átjáró mellett a konténeres, éles beállítású átjáró is futott ugyanazzal az adatbázissal. A közös webhook-sorból elvitte és elutasította a teszt eseményeit (a http-s localhost-címet élesben nem engedi). A teszt- és az éles példány ezért nem oszthat közös adatbázist. A tesztszkriptek most a futás idejére leállítják a konténert.

## 6. Mit lehet és mit nem lehet állítani

**Amit igen:**

- A meglévő MCP-rétegre egy szabványos kereskedelmi csatorna épült **új legacy-kód nélkül**. Az átjáró kb. 1000 sor, megjegyzésekkel együtt, és csak két MCP-írást használ.
- A szabvány fő mechanizmusai működnek, és a hivatalos teszt ellenőrzi őket: felfedezés, egyeztetés, checkout-életciklus, idempotencia, aláírt rendelés-esemény.
- Az ember a hurokban marad, és ez a szabvány aszinkron lezárásával összefér.

**Amit nem:**

- Hogy a rendszer élőben elérhető a Google vásárlási felületein. A natív UCP-checkout a talált források szerint Magyarországon nem elérhető, és ehhez Merchant Center-fiók és nyilvános HTTPS-telepítés is kellene.
- Hogy a vevőazonosítás biztonságos. Hitelesített identity linking nélkül nem az, ezt a jóváhagyás ellensúlyozza.
- Hogy a B2B-részek szabványosak. Az adószám és a csoportár saját bővítmény (`com.example.donki`, helyőrző névtér), mert a szabvány B2B-része még tervezet.

## 7. Korlátok

- **Csak tesztmódban szinkron a lezárás,** élesben a jóváhagyás percekig vagy órákig tarthat. A vásárló ágensnek ezt kezelnie kell (`complete_in_progress`, utána webhook).
- **A konformancia-teszt B2C mintára készült,** ezért a számszerű eredményt (46/78) csak a fenti bontással együtt érdemes idézni.
- **Egy saját tesztplatformmal mértünk,** külső vásárló ágenssel (például egy modellel vezérelt vásárlóval) nem. Ez a terv 8. lépése, és nem készült el.
- **A szabvány gyorsan változik** (2026-04-08 után már 2026-08-25 is van). Az újabb verzió egyeztetéssel felvehető.
