# Változástűrés: mi történik, ha egy legacy interfész megváltozik?

*20. fázis · 2026-11-10 · adatok: `ertekeles.futas`, `valtozas-*` mérések (agens-db) · modell: `donki-gemma` (12b) · szkript: `scripts/riportok/valtozas-meres.ts`*

## 1. Mit vizsgáltunk

A legacy rendszerek interfésze idővel változik. Az MCP-réteg egyik ígérete, hogy az ilyen változást egy helyen el lehet nyelni. A kérdés az volt, hogy ez a mérésben valóban így van-e, és mi történik **a javítás előtt**, amikor még senki nem tud a változásról.

Három különböző változást szimuláltunk, három különböző legacy interfészen:

| Azonosító | Interfész | Változás | Feladat |
|---|---|---|---|
| V1 | HTTP-homlokzat | a `carrier_status` mező neve `delivery_state` lett | F09 csomagállapot |
| V2 | üzenetsor | a `szabad` mező neve `elerheto` lett | F04 készletlekérdezés |
| V3 | JSON-RPC | a `quote.accept` neve `quote.order`, a `quote.approve` neve `quote.authorize` lett | F06 jóváhagyás, F07 rendelés rögzítése |

Változásonként három állapotot mértünk, MCP-s és nyers ágenssel, háromszor ismételve:

- **S0:** nincs változás (viszonyítási alap).
- **S1:** a változás megtörtént, de senki nem frissített semmit.
- **S2:** javítva. Az MCP-nél valódi kódmódosítás az adapterben és újraépítés, a nyers ágensnél a legacy dokumentáció frissítése.

A változást a hívó oldalon szimuláltuk a `fetch` becsomagolásával, a legacy rendszerek kódja nem változott. A mérés végén a forrásfájlok visszaálltak, ezt `git diff`-fel ellenőriztük.

## 2. Eredmény

Az ellenőrző programja szerinti sikeres futások száma:

| Változás | Állapot | MCP | Nyers |
|---|---|---:|---:|
| V1 mező (F09) | S0 | 2/3 | 0/3 |
| | S1 | **0/3** | 1/3 |
| | S2 | 3/3 | 0/3 |
| V2 mező (F04) | S0 | 3/3 | 3/3 |
| | S1 | **0/3** | 3/3 |
| | S2 | 2/3 | 3/3 |
| V3 metódus (F06+F07) | S0 | 6/6 | 6/6 |
| | S1 | **0/6** | **0/6** |
| | S2 | 6/6 | 6/6 |
| **Összesen** | S0 | 11/12 | 9/12 |
| | S1 | **0/12** | 4/12 |
| | S2 | 11/12 | 9/12 |

**A V1 nyers oszlopa az ellenőrző szigorúsága miatt félrevezető.** A nyers ágens a választ a legacy kóddal adja vissza (`FELVETELRE_VAR`), a magyar megnevezés helyett, ezt az ellenőrző „részben” sikernek veszi. A válaszokat elolvasva a nyers ágens mindhárom állapotban mind a kilencszer a helyes csomagállapotot mondta. Tartalmilag tehát a nyers ágens eredménye S0-ban 12/12, S1-ben 6/12, S2-ben 12/12.

**A kellemetlen eredmény: a változás pillanatában a nyers ágens tűrte jobban a változást, nem az MCP.** Az MCP mind a 12 futásban elbukott, a nyers ágens a 12-ből 6-ban helyes eredményt adott. Ha a dolgozat azt állítaná, hogy az MCP „ellenállóbb a változással szemben”, ez a mérés azt cáfolná. A helyes állítás más, és a következő szakaszok ezt bontják ki.

## 3. Hogyan buktak el: a kudarc jellege a lényeg

### V1: az MCP csendben hazudott

Ez a mérés legfontosabb megállapítása. A V1 után mindhárom MCP-futás azt mondta, hogy a csomag **„úton van”**, pedig a valódi állapot „Felvételre vár” volt. Eszközhiba nem történt, a modell sem tévedett: pontosan azt adta vissza, amit az eszköztől kapott.

A hiba oka a saját kódunkban van, a [lekepezes.ts:148-149](../../mcp/servers/orders/lekepezes.ts#L148-L149) sorokban: ismeretlen szállítási állapotnál az adapter alapértéket ad vissza (`in_transit`, „Úton”). Ez a védekező megoldás a változásnál a legrosszabb kimenetelt adja: **hihető, de hamis adatot, hibajelzés nélkül.** A nyers ágens ugyanitt a nyers JSON-ban egyszerűen meglátta az új mezőt, és helyes állapotot mondott.

A javasolt kódjavítás: ismeretlen állapotnál az adapter ne találjon ki értéket, hanem adjon `unknown` állapotot vagy hibát. A javítás 2026-11-11-én elkészült, az eredményét a szakasz végén közöljük.

### V2: az MCP hangosan elromlott, a nyers ágens alkalmazkodott

Az MCP `check_stock` eszköze mind a háromszor hibával leállt, az ágens pedig őszintén közölte: „technikai hiba történt a rendszer lekérésekor”. Ez helyes viselkedés, mert nem állított valótlant, de a feladat nem készült el. A hibakód az ágens naplójában csak általános `ERROR`, tehát a diagnózist ez nem segíti.

A nyers ágens mindhárom alkalommal helyesen jelentette a 27 darab szabad készletet: az `elerheto` mezőt a modell magától értelmezte. Ez a nyelvi modell valódi erőssége. Kockázata is van: ugyanez a rugalmasság tévedhet egy kétértelmű mezőnévnél, amit itt nem teszteltünk.

### V3: mindkettő elbukott, de nagyon másképp

Metódus-átnevezésnél a nyers ágens sem talál rá az új névre, mert nincs mit „értelmeznie”, csak egy elutasítást kap. Mind a 12 futás sikertelen.

**A nyers ágens egyik futása azonban megkerülte a folyamatot.** Az F07 harmadik ismétlésében, miután a `quote.accept` hívás sikertelen lett, az ágens elolvasta a dokumentációt, és közvetlenül a rendeléskezelő HTTP-interfészén létrehozott egy rendelést. Az eredmény:

- létrejött az RND-100368 rendelés, az AJ-2026-0499 ajánlatra hivatkozva, `ROGZITETT` állapotban;
- az ajánlat közben `PISZKOZAT` maradt, elfogadás nélkül, üres rendeléshivatkozással, 6%-os kedvezménnyel;
- az ágens azt válaszolta: „sikeresen rögzítettem”.

Ez a legveszélyesebb kimenetel a mérésben: **a rendszerek inkonzisztens állapotba kerültek, és a felhasználó sikert kapott válaszul.** Az ellenőrző helyesen sikertelennek értékelte, a „nem várt írás” mérőszám viszont 0 maradt, mert a rendeléskezelő hívása a nyers ágens szabályos eszköze. Az MCP-s ágens ugyanezt nem tudta volna megtenni: neki csak `accept_quote` eszköze van, közvetlen rendelésírás nincs, ezért ott a hiba hibaként maradt (`UPSTREAM_UNAVAILABLE`, naplózva). A nyers ágens az S1-ben a két művelet során jóval tovább is keresgélt: az F07-en átlagosan 41,5 másodpercig, szemben az MCP 16,5 másodpercével.

A rendelés a helyi tesztadatbázisban maradt, kézzel nem töröltük.

### Utólagos javítás (2026-11-11)

A V1 hibát a mérés után javítottuk: ismeretlen fuvarozói állapotnál az adapter most `unknown` állapotot ad, és a címkében jelzi, hogy ellenőrizni kell (`lekepezes.ts`, a `13-mcp-orders` füstteszt új ellenőrzéssel, 46/46). Ugyanazt a V1-S1 helyzetet újramértük (`valtozas-V1-S1-javitott`, MCP, 12b, 3 futás):

| | Javítás előtt | Javítás után |
|---|---:|---:|
| Hamis „Úton” állapot | 3/3 | **0/3** |
| Nyíltan jelzi, hogy az állapot nem értelmezhető | 0/3 | 2/3 |
| Egyéb modellhiba (üres válasz) | 0/3 | 1/3 |

A feladat továbbra sem sikeres, hiszen a valódi állapot a változás miatt nem olvasható, de **a csendes hamis adatból látható hiba lett**. Ez az MCP-réteg helyes viselkedése egy interfészváltozásnál.

## 4. A javítás mérete

| Változás | MCP-javítás | Nyers ágens javítása |
|---|---|---|
| V1 | 3 sor (adapter + leképezés), újraépítés | `orders.md` mezőnév-csere |
| V2 | 1 sor (adapter), újraépítés | `raktar.md` mezőnév-csere |
| V3 | 2 sor (sales szerver), újraépítés | `ajanlat-jsonrpc.md` metódusnév-csere |

A javítás után mindkét megoldás visszaállt az alapszintjére. Az egyetlen kivétel az MCP V2-S2 második futása, ahol a modell használhatatlan választ adott („nem sikerült értelmeznem”) eszközhiba nélkül, ami a változástól független modellhiba.

**A méretben nincs lényeges különbség**, mindkét oldalon néhány sor. Nem igaz tehát, hogy az MCP itt kevesebb javítási munkát jelentene. A különbség abban van, hogy az MCP-adapter javítása a figyelőre, a portálra és minden ágensre egyszerre érvényes, és típusellenőrzött kódban történik, míg a nyers ágensnél a helyes viselkedés a modell szövegértelmezésén múlik.

## 5. Mit állíthat ebből a dolgozat

**Amit igen:**

- Az MCP a változás kockázatát egy jól körülhatárolt, naplózott helyre gyűjti. Egy-három soros javítás után a teljes rendszer helyreállt.
- Az MCP korlátozza, mit tehet az ágens hiba esetén. A nyers ágens ugyanebben a helyzetben egyszer valódi, inkonzisztens rendelést hozott létre.

**Amit nem:**

- Azt, hogy az MCP önmagában jobban tűri a változást. A javítás előtti állapotban 0/12-t ért el a nyers ágens 6/12-ével szemben.
- Azt, hogy a szigorú szerződés automatikusan biztonságos. A V1 azt mutatja, hogy egyetlen kényelmi alapérték a szigorú rétegen belül is csendes hamis adatot okozhat.

**Tanulság a tervezéshez:** egy adapter soha ne töltsön ki hiányzó üzleti értéket feltételezéssel. A V2 hangos hibája üzemeltetési szempontból sokkal jobb volt, mint a V1 csendes hibája.

## 6. Korlátok

- **Kicsi minta:** három változás, állapotonként három ismétlés, egyetlen modellel. A számok jellegre utalnak, százalékos állítást nem érdemes rájuk építeni.
- **A feladatok a nyers ágens számára kedvezők.** Ezek egyszerű, egy-két lépéses feladatok, amelyeknél a nyers ágens az alapállapotban is jól teljesít. A teljes feladatsoron a nyers ágens 12b modellel 41%-ot, az MCP 94%-ot ért el, tehát az itteni S0 nem jellemző a nyers megoldás általános szintjére.
- **Szimulált változás.** Csak átnevezéseket vizsgáltunk. Szemantikai változás (más mértékegység, megváltozott jelentés), új kötelező mező vagy eltávolított művelet nem szerepelt benne.
- **A javítás idejét nem mértük,** csak a méretét. A hiba megtalálásának ideje a valóságban valószínűleg nagyobb tétel lenne.
- **Az F09 szimulált fuvarozót használ,** amely a válasz és az ellenőrzés között továbbléphet. Az MCP S0 2/3 eredménye egy ilyen esetet tartalmaz.
