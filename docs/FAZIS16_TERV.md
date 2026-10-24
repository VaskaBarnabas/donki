# 16. fázis – Portál: irányítópult, rendszerek vezérlése, integrációs varázsló (terv)

*Állapot: kész – `16-portal` 54/54, a 01–15. tesztek a konténeres rendszeren zöldek (kivéve a tesztfiók kiürülése miatti 2 PDF-ellenőrzést, lásd CLAUDE.md) · jóváhagyva (a 10. pont javaslatai szerint) + a §3.4 szinkron · előzmény: [FAZIS15_TERV.md](FAZIS15_TERV.md) (kész: független rendszerek) · utána: [17. fázis – ágens réteg](FAZIS17_TERV.md) (gemma4:12b)*

## 1. Cél

A portál legyen az a felület, amely **összefogja a független rendszereket**, mintha egy vállalat integrációs platformja lenne:

1. **Integrációs varázsló:** első belépéskor a portálhoz még egyetlen rendszer sincs bekötve. Az admin felhasználó lépésenként „beköti” a rendszereket:
   - megadja a címüket és a hozzáférési kulcsukat;
   - a portál kipróbálja a kapcsolatot;
   - elmenti a beállítást.

   Amíg egy rendszer nincs bekötve vagy le van kapcsolva, a portál ezt jelzi, és nem omlik össze.
2. **Irányítópult:** a bekötött rendszerekből lekért adatok egy helyen, például:
   - nyitott rendelések állapot szerint;
   - jóváhagyásra váró ajánlatok;
   - lejárt tartozások;
   - minimum alatti készlet;
   - nyitott hibajegyek;
   - a mai fizetések.

   Minden kártya a saját rendszerét kérdezi; ha az nem elérhető, csak az a kártya jelez.
3. **Rendszerek oldal (teljes):**
   - élő állapot;
   - kapcsolati térkép, amelyen piros a kiesett rendszer és sárga az érintett;
   - ki/be kapcsolás megerősítéssel;
   - élő napló;
   - műveleti napló (ki mikor mit kapcsolt).
4. **Felhasználók és szerepkörök:** az admin a portálon állítja be, ki milyen szerepkörű (a hat szerepkör). A felület és a műveletek a szerepkörhöz igazodnak.
5. **A 15. fázis átmeneti admin-kulcsainak megszüntetése:**
   - a portál **semmilyen rendszer adatbázisához nem fér hozzá közvetlenül**, csak a bekötött interfészeken;
   - a portál konténere a rendszerek kulcsai közül egyet sem kap környezeti változóként: minden a varázslóban megadott, titkosított beállításból jön.

## 2. Ütközés a 10. fázis döntésével – javaslat

A 10. fázisban **szándékosan** nem készült egységes, modulokat összekötő dashboard. A portál fejléce szerint: *„ez a »régi« munkamód, ehhez mérjük majd az ágenseket”*. Az új irányítópult éppen ilyen összekötő nézet.

**Javaslatom:** két külön réteg legyen, és mindkettő maradjon meg.

| Réteg | Mi | Szerepe a szakdolgozatban |
|---|---|---|
| **Modul-oldalak** (meglévő 8 oldal) | rendszerenként külön felület, a rendszer saját formátumaival | a „régi munkamód” – az **alapvonal** az ágensek méréséhez (19. fázis) |
| **Integrációs portál** (új) | varázsló, irányítópult, rendszerek, felhasználók | egy hagyományos integrációs megoldás – **második összehasonlítási pont**: ágens vs. integrációs portál vs. régi munkamód |

A menü két csoportra válik: **Portál** (irányítópult, rendszerek, integrációk, felhasználók) és **Rendszerek felületei** (a meglévő modul-oldalak). A modul-oldalak viselkedése nem változik, csak az adatforrásuk (a bekötött integráció).

## 3. Integrációk

### 3.1 Adatmodell (Supabase – a portál saját adata)

```sql
public.integrations (
  system        text primary key,      -- crm | quote | orders | inventory | billing | payments | support
  base_url      text not null,         -- pl. http://billing:4103
  secret_enc    text not null,         -- a hozzáférési kulcs AES-256-GCM-mel titkosítva (iv:tag:adat)
  status        text not null,         -- ok | hiba | nem_tesztelt
  last_test_at  timestamptz, last_test_msg text,
  configured_by uuid references auth.users, updated_at timestamptz
)
public.control_log (id, at, user_id, email, system, action, result)   -- a rendszerek ki/be kapcsolásának naplója
```

- **A titkosítás kulcsa** (`PORTAL_INTEGRACIO_KEY`) csak a portál szerverén van (`.env.stack`). A Supabase-ben csak titkosított érték van: ha valaki a táblát kiolvassa, a kulcsot nem kapja meg.
- **RLS:**
  - olvasni minden bejelentkezett felhasználó tudja (a portál szervere az ő munkamenetével kérdezi; a titkot csak a szerver tudja visszafejteni);
  - írni csak `admin` tud.

  A szerepkör-ellenőrzés egy `security definer` függvényben (`public.sajat_szerepkor()`) van.
- **A felhasználók szerepkörét** a portál a `public.szerepkor_beallitas(user_id, role)` függvénnyel módosítja. Ez a függvény ellenőrzi, hogy a hívó admin-e. Így a portál a Supabase service role kulcsa nélkül maradhat.

### 3.2 A varázsló (`/integraciok`)

1. **Üdvözlő lépés:**
   - elmagyarázza, mi történik;
   - felajánlja a rendszerek javasolt címét (a konténerhálózaton: `http://billing:4103` …).
2. **Rendszerenként egy lépés** (CRM és katalógus, ajánlat, rendelés, raktár, számlázó, fizetés, helpdesk):
   - cím;
   - hozzáférési kulcs (jelszómező; mentés után csak „•••• beállítva” látszik);
   - „Kapcsolat tesztelése” gomb;
   - a lépés kihagyható.
3. **A teszt két részből áll:**
   - **elérhető-e** (`/health`, a CRM-nél és a raktárnál a PostgREST);
   - **jó-e a kulcs**: egy ártalmatlan, olvasó hívás a rendszer saját protokollján, és a válasz értelmezése a rendszer saját hibaformájában (táblázat lent).
4. **Összegzés:** mely rendszerek vannak bekötve, melyek nem, és átirányítás az irányítópultra.

| Rendszer | Kulcs-teszt (olvasó hívás) | Rossz kulcs jele |
|---|---|---|
| CRM és katalógus | `GET /categories?limit=1` | HTTP 401/403 (PostgREST) |
| Ajánlat | `quote.list` | `-32001 UNAUTHORIZED` |
| Rendelés | `GET list?state=LEZART` | `Hozzaferes megtagadva` |
| Raktár | `pgmq_public.read('inventory_alerts', 0, 1)` | HTTP 401/403 |
| Számlázó | `SZAMLA\|LEJART` | `ERR\|E001` |
| Fizetés | `GET ?invoiceRef=DB-0000-000000` | HTTP 401 `authentication_error` |
| Helpdesk | `ListTickets` | SOAP Fault `HD-401` |

**Első belépés:**
- Ha egy rendszer sincs bekötve, az admin felhasználót a portál a varázslóra irányítja.
- A nem admin felhasználó egy tájékoztatást lát: „a rendszergazda még nem kötötte be a rendszereket”.
- A varázsló később bármikor újra megnyitható. Egy-egy integráció módosítható, újratesztelhető vagy törölhető.

**A kulcsok honnan jönnek:** a `.env.local`-ból (legacy kulcsok) és a `.env.stack`-ből (CRM és raktár API-kulcs). A demó és a tesztek kedvéért lesz egy CLI parancs is: `npm run portal:integraciok`. Ez a gépen futva bekötné az összes rendszert ugyanazzal a titkosítással, a felület nélkül.

### 3.3 A portál adatelérése a 16. fázis után

- **Egyetlen kapu, az integrációs réteg** (`lib/portal/integraciok.ts`). Minden rendszerhívás innen kapja a címet és a kulcsot.
  - Nincs bekötve → egységes „nincs bekötve” állapot.
  - A rendszer nem elérhető → „nem elérhető” állapot.
  - Mindkét esetben a rendszer saját hibaformája megmarad a modul-oldalakon.
- **A listázó interfész nélküli rendszerek új, a saját stílusukhoz illő olvasó parancsot kapnak.** Ez váltja ki az átmeneti admin-kulcsot. A legacy-leírásuk is bővül.

| Rendszer | Új olvasó művelet (a rendszer saját stílusában) | Mit vált ki |
|---|---|---|
| Számlázó | `SZAMLA\|LISTA\|<tól YYYY.MM.DD>\|<ig>` → `OK\|<db>\|<szam>;<tipus>;<vevo>;<brutto>;<hatarido>;<fizetve I/N>;<lejart I/N>\|…` és `SZAMLA\|TETELEK\|<szam>` | a számlák listája és részletei |
| Fizetés | `GET /api/legacy/payments?status=…&limit=…` (a meglévő REST bővítése) | a fizetések listája |
| Raktár | `{"cmd":"LISTA"}` (minden cikk) és `{"cmd":"KARTON","cikk":4701}` (foglalások és mozgások) – üzenetsoron, ahogy minden raktári parancs | a raktár oldalak |
| Üzenetsorok | a tulajdonos rendszerek `/health` válasza a sorok metrikáit is tartalmazza; a betekintés: `GET /ops/sor/<név>` a rendszer saját kulcsával | a sorpanel |

- **A portál konténeréből kikerül:** a rendszerek összes kulcsa és mind a négy átmeneti admin-kulcs. Marad: a Supabase címe és publikus kulcsa, az integrációs titkosító kulcs, és a docker-proxy címe.

### 3.4 Számlázó ↔ Számlázz.hu, fizetés ↔ Stripe: ugyanaz, egy forrásból (jóváhagyás után bekerült)

**Cél:** amit a felhasználó a portálon lát, ugyanaz legyen, mint amit a Számlázz.hu felületén lát, és ne is legyen különbség.

**Elv: minden adatnak egy gazdája van.**
- a bizonylatoké (díjbekérő, számla, sztornó) a **Számlázz.hu**;
- a kártyás fizetéseké a **Stripe**.

A saját számlázó vékony csatoló: a szöveges protokollja megmarad, de minden bizonylatot a Számla Agenten át a Számlázz.hu-ban állít ki. Nálunk csak a hivatkozás és a szinkron állapota marad.

**A próbahívás eredménye** (a felhasználó tesztfiókjában, 2026-10-20):
- díjbekérő kiállítása `dijbekero=true`-val és külső azonosítóval → `D-TST-…`;
- lekérdezés a külső azonosítóval → teljes XML;
- kifizetés rögzítése díjbekérőre → kintlévőség 0;
- törlés → kész.

A fiók: „TESZT - Teszt Kft.”, `11111111-1-11`. **Ugyanide dolgozik a SzámlaBridge is.**

| Protokoll-parancs | Új működés |
|---|---|
| `DIJBEKERO\|KESZIT` | díjbekérő a Számlázz.hu-ban (külső azonosító = a mi `DB-…` sorszámunk + a példány-azonosító), utána rögzítés nálunk; ha a Számlázz.hu nem érhető el: `ERR\|E200`, és nálunk sem jön létre |
| `SZAMLA\|KESZIT` | számla a Számlázz.hu-ban, ugyanígy |
| `SZAMLA\|STORNO` | sztornó a Számlázz.hu-ban (`action-szamla_agent_st`) |
| `SZAMLA\|FIZETVE` | kifizetés rögzítése a Számlázz.hu-ban is (`action-szamla_agent_kifiz`) |
| `SZAMLA\|PDF` | a Számlázz.hu PDF-je (a díjbekérőnél is; fizetés után a végszámláé, ahogy eddig) |
| `SZAMLA\|LISTA` (új) | a bizonylatok listája a portálnak (a Számlázz.hu nem tud listázni, ezért a lista nálunk van) |
| `SZAMLA\|SZINKRON` (új) | az egyeztetés eredménye: egyező / eltérő / hiányzó bizonylatok |

- **Egyeztetés:**
  - a számlázó 15 percenként minden saját bizonylatot lekér a Számlázz.hu-ból (külső azonosító alapján), és összeveti a bruttót, a fizetettséget és a sztornót;
  - eltérésnél jelölést tesz, amelyet a portál irányítópultja riasztásként mutat;
  - a fizetés ugyanígy a Stripe-pal egyeztet (itt a Stripe API listázni is tud, így a „csak a Stripe-ban létező” fizetés is kiderül).
- **NAV-biztosíték (új, erősebb):** a számlázó induláskor egy próba-díjbekérővel igazolja, hogy a kulcs tesztfiókhoz tartozik: a sorszámban `TST` van; utána a próbadarabot törli. Díjbekérőről nincs NAV-adatszolgáltatás. **Számlát csak igazolt tesztfiók mellett** állít ki; egyébként `ERR|E200`. Ez mellett megmaradnak a meglévő feltételek is: `SZAMLABRIDGE_MODE=test` és `sk_test_` kulcs.
- **A seedelt bizonylatok** induláskor egyszer átkerülnek a Számlázz.hu-ba (a kifizetettséggel és a sztornóval együtt), hogy a régi adatok se térjenek el. A külső azonosítóban egy adatbázis-példányonként egyedi azonosító van, így egy `stack:reset` után az új példány nem keveredik a régivel. **Tudatos következmény:** minden reset új bizonylatokat hoz létre a tesztfiókban (kb. 10 db), és minden tesztfutás is hoz létre néhányat. A tesztek a saját díjbekérőiket a végén törlik.
- **Szabály:** a Számlázz.hu felületén csak nézni szabad, kiállítani csak a rendszeren át. A Számlázz.hu nem tud listázni, így egy kézzel kiállított számlát a rendszer nem venne észre.

## 4. Irányítópult (`/`, bejelentkezve)

| Kártya | Forrás (a bekötött interfészen) |
|---|---|
| Rendelések állapot szerint (darab, a legrégebbi várakozó) | rendelés: `GET list` |
| Jóváhagyásra váró ajánlatok és rendelések | ajánlat: `quote.list status=JOVAHAGYASRA_VAR`; rendelés: `ROGZITETT` |
| Lejárt tartozások (darab, összeg) | számlázó: `SZAMLA\|LEJART` |
| Minimum alatti készlet | raktár: `LISTA` |
| Nyitott hibajegyek, nyitott RMA | helpdesk: `ListTickets` |
| Mai fizetések (sikeres, sikertelen) | fizetés: lista |
| **Egyeztetés** („minden egyezik” / „N eltérés”) | számlázó: `SZAMLA\|SZINKRON`; fizetés: Stripe-egyeztetés |
| Rendszerek állapota (mini nézet) | vezérlés |

- **Minden kártya külön tölt** (React Suspense). Egy kiesett rendszer csak a saját kártyáját teszi „nem elérhető” állapotúvá, egy linkkel a Rendszerek oldalra.
- A kártyák a rendszer saját adatát mutatják, de egységes megjelenítéssel (Ft, dátum). Ez az „integrációs platform” értéke, szemben a modul-oldalak nyers formátumaival.
- **Szerepkör szerint szűrt:** a pénzügy a tartozásokat látja elöl, a logisztika a készletet stb. Az admin mindent lát.

## 5. Rendszerek oldal (teljes változat)

- **Rendszerkártyák élő frissítéssel** (5 mp-enkénti lekérdezés a vezérlő API-n):
  - állapot, egészség és válaszidő;
  - memória, üzemidő, konténerek;
  - a háttérfeladatok utolsó futása.
- **Kapcsolati térkép:** saját SVG, a §3 függőségei szerint. A kiesett rendszer piros, a tőle függő sárga, az ép zöld.
- **Ki/be kapcsolás:**
  - megerősítő párbeszéddel;
  - a művelet a `control_log`-ba kerül (ki, mikor, mit, eredmény);
  - az utolsó 20 bejegyzés látszik.
- **Napló:** egy rendszerre kattintva oldalsó panel nyílik a konténerek utolsó naplósoraival, automatikus frissítéssel.
- **Csak `admin` szerepkörrel**, ahogy most is.

## 6. Felhasználók (`/felhasznalok`, csak admin)

- Lista: név, e-mail, szerepkör, regisztráció ideje.
- Szerepkör módosítása (a §3.1 függvénnyel). Az admin a saját admin szerepkörét nem veheti el, így mindig marad legalább egy admin.
- **A szerepkör hatása a felületre:**
  - a menü csak azt mutatja, amihez a szerepkörnek köze van;
  - a modul-oldalak író műveletei szerepkörhöz kötöttek, ugyanazzal a mátrixszal, mint az MCP eszközök (pl. jóváhagyás: `sales_manager`, kiszállítás: `logistics`, díjbekérő: `finance`);
  - a szerver-akció maga is ellenőriz, nem csak a gomb rejtőzik el.

## 7. Megvalósítási sorrend

0. **Számlázó ↔ Számlázz.hu és fizetés ↔ Stripe szinkron (§3.4)**, a saját tesztjeivel.
1. Supabase-migráció: `integrations`, `control_log`, `sajat_szerepkor()`, `szerepkor_beallitas()`.
2. A legacy rendszerek új olvasó műveletei (számlázó, fizetés, raktár, `/health` sor-metrikák, `/ops/sor`), a saját tesztjeikkel.
3. Integrációs réteg (titkosítás, kulcs-tesztek) + varázsló + `npm run portal:integraciok`.
4. A modul-oldalak átállítása az integrációs rétegre; az átmeneti admin-kulcsok és a portál env-kulcsainak kivezetése.
5. Irányítópult.
6. Rendszerek oldal (teljes).
7. Felhasználók + szerepkör szerinti felület.
8. Tesztek, dokumentáció.

## 8. Tesztelés

- **A meglévő 01–15. tesztek zöldek maradnak.** A 05, a 08 és a 03 a rendszerek új olvasó műveleteivel bővül.
- **Új `16-portal.ts`**, a portál szerverlogikáján (Next nélkül hívható modulok) és a portál HTTP-végpontjain:
  - **titkosítás:** a kulcs titkosítva van a Supabase-ben, és visszafejthető;
  - **kulcs-teszt rendszerenként:** jó kulcs → `ok`; rossz kulcs → a rendszer saját hibaformájából felismert „rossz kulcs”; leállított rendszer → „nem elérhető”;
  - **irányítópult-adatok:** minden kártya értéke a seedből ismert (pl. 4 minimum alatti cikk, 3 lejárt számla); leállított számlázónál csak a tartozás-kártya „nem elérhető”, a többi rendben;
  - **a portál konténerében nincs rendszerkulcs** (csak a környezeti változók nevét vizsgálja);
  - **jogosultság:**
    - a vezérlő API és a felhasználók oldal nem admin felhasználónak 403;
    - a szerepkör-függvény nem admin hívónak hibát ad.
- **A bejelentkezett ágak tesztelése:** egy dedikált tesztfelhasználó kell hozzá, amelyet a teszt a Supabase admin API-jával hoz létre, és a végén töröl. A 2. fázisban kérésedre kihagytuk a bejelentkezett ágat; itt a szerepkörök miatt ez kellene (lásd 10. pont).
- **Böngészős ellenőrzés:** nincs. A dizájnra te jelzel vissza, ahogy eddig.

## 9. Kockázatok

| Kockázat | Kezelés |
|---|---|
| A rendszerek új olvasó műveletei „belenyúlnak” a legacy rendszerekbe | Mindegyik a rendszer saját stílusában készül (szöveges protokoll, pgmq parancs, REST), és bekerül a `legacy-docs`-ba, ahogy egy valódi rendszer is bővül egy riport-igény miatt. Írási művelet nem jön. |
| A titkosítási kulcs elvesztése | A `.env.stack`-ben van. Ha elvész, az integrációkat újra kell kötni (a varázslóval vagy a CLI-vel); adat nem vész el. |
| Sok rendszerhívás az irányítópulton | Kártyánként párhuzamos, rövid (3 mp) időkorláttal; a lassú rendszer csak a saját kártyáját késlelteti |
| A szerepkör-mátrix eltér az MCP-étől | Egy közös forrásból: a mátrix a `mcp/kozos`-ból kerül egy közös helyre, és mindkettő onnan olvassa |

## 10. Nyitott kérdések

1. **Két réteg (§2):** maradjanak meg a modul-oldalak változatlanul „régi munkamódként”, és az új integrációs portál mellettük legyen? Javaslatom: **igen**. Így a 19. fázisban három dolgot mérhetünk össze: a régi munkamódot, a portált és az ágenst.
2. **A listázó interfész hiánya:** új, a rendszerek stílusához illő olvasó műveletek (§3.3, javaslatom), vagy a varázslóban egy külön „riport-hozzáférés” (csak olvasó adatbázis-elérés) rendszerenként, ahogy egy BI-eszközt kötnek be?
3. **Tesztfelhasználó a bejelentkezett ágakhoz:** a teszt létrehozhat-e és törölhet-e egy ideiglenes Supabase-felhasználót a szerepkörök ellenőrzéséhez? Javaslatom: **igen**. Enélkül a szerepkör szerinti viselkedést csak a szerverlogika szintjén tudom tesztelni.
