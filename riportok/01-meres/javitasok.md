# Javítási jegyzék: a 2026-11-03-i mérés hibáinak oka és javítása

*20. fázis · 2026-11-07 · előzmény: [ertekeles-2026-11-03.md](ertekeles-2026-11-03.md) · terv: [FAZIS20_TERV.md](../../docs/FAZIS20_TERV.md) §3*

## 1. Mit és hogyan vizsgáltunk

A 2026-11-03-i mérésben az MCP-s ágens a futások 75–78%-ában volt sikeres. A sikertelen és a részben sikeres MCP-futásokat egyenként vizsgáltuk az ágens naplójából (`agens.lepes`): melyik szakágens kapta meg a feladatot, milyen eszközt hívott, milyen hibakóddal, és mit válaszolt.

**Az eredmény:** a hibák többsége **nem véletlenszerű modellhiba**. A legtöbb feladat mindkét modellel, mind a három ismétlésben ugyanúgy bukott. Ez rendszerszintű okra utal: félrevezető eszközkimenetre, hiányzó keresési képességre vagy rossz irányításra. Ezek a hibák javíthatók, és a javításuk az MCP-réteg tervezéséről szóló megállapítás is.

## 2. A mérés tisztasága

- **Az ellenőrzők és a feladatszövegek nem változtak.** A 27 alapfeladat kérése, elvárt írásai és ellenőrző logikája bájtra azonos a 11-03-i méréssel. Ugyanaz a mérce, csak a mért rendszer más.
- **A nyers változat nem futott újra.** A nyers eszközök (`agens/nyers/`) és a legacy rendszerek viselkedése nem változott, ezért a nyers eredmények a 11-03-i mérésből származnak. Egyetlen kivétel a számlázó javítása (6. pont). Ez a hiba a nyers és az MCP-s ágenst egyformán érintette, és a mérésben előkészítési hibaként jelent meg, nem az ágens hibájaként.
- **6 kontrollfeladat (F25–F30).** A javítások után, de még modellfutás előtt írtuk őket, a javított esetek rokonaiként, más adattal és megfogalmazással:
  - ékezet nélkül írt másik vevő;
  - többtételes ajánlat terméknévvel;
  - meglévő díjbekérő összege;
  - ajánlat állapota;
  - garancia termékkód nélkül;
  - a legrégebbi lejárt tartozás.

  Ha a javítás csak a mért feladatokra „tanult volna rá”, a kontrollfeladatokon ez kiderül. Az ellenőrzőiket ugyanúgy ideális és rossz megoldással próbáltuk ki (`19-ertekeles`), mint a többit.
- **A modellek, a gráf, a jóváhagyási szabályok és a futtató nem változtak.**

## 3. A hibák és a javítások

| # | Feladat (11-03 MCP-eredmény) | Mit mutatott a napló | Ok | Javítás |
|---|---|---|---|---|
| 1 | **F03** kifutott termék (0/6) | `search_products` „OF-16” → „Nincs ilyen termék.” → a modell visszakérdez | A kereső alapból kiszűri a kivezetett terméket, így a modell nem tudhatta, hogy a termék létezik, csak kifutott. Az utasítás ugyan kérte a jelzést, de a modell az adatot nem kapta meg. | Ha **csak** kivezetett termék illeszkedik, a kereső azt is visszaadja „KIVEZETETT, már nem rendelhető” jelöléssel, és mellé legfeljebb 5 aktív helyettesítőt ugyanabból a kategóriából (`alternatives`). Vegyes találatnál marad a régi viselkedés. |
| 2 | **F22** eltérő vevőnév-írás (0/6) | `search_customers` „DUNA-IRODAHAZ KFT.” → üres → a modell új vevőt próbál felvenni (elutasítva) | A CRM `ilike` keresése nem kezeli az ékezetet, a kötőjelet és a cégformát. | Ha a szó szerinti keresés üres, ékezet-, írásjel- és cégforma-független keresés jön (minden szónak szerepelnie kell a névben). Közös modulban van (`mcp/kozos/torzsadat.ts`), így minden szerver vevőkeresése megkapja. |
| 3 | **F13** díjbekérő összege (0/6 siker, 6/6 részben) | `issue_proforma` → a modell a rendelés **nettóját** mondja fizetendőnek | Az eszköz összefoglalója a rendelés nettóját mutatta, a bruttót nem (a rendeléskezelő nem látja a számlázót). | Az összefoglaló kimondja, hogy a fizetendő összeg a díjbekérő bruttója, és megnevezi a lekérdező eszközt (`get_document`). A rendelés-ágens utasítása ugyanezt kéri. |
| 4 | **F15a** „Kifizették már?” (12b: 0/3) | `get_payments` → „még nem készült fizetési link” → a modell: „nincs kifizetve” | A díjbekérőt átutalással fizették (a számlázóban rögzítve), kártyás kísérlet nem volt. A kimenetből a modell joggal következtetett tévesen. | A `get_payments` kimenete megkapja a bizonylat fizetettségét a számlázótól (`documentPaid`), és az összefoglaló ezzel kezdődik. |
| 5 | **F07** ajánlat elfogadása (12b: 0/3) | A front-desk a **rendelés**-ágenshez irányította („Rögzítsd a rendelést”); annak nincs `accept_quote` eszköze | Irányítási hiba: az elfogadott ajánlat → rendelés átmenet a leírások alapján mindkét ágenshez illett. | Az értékesítés leírása kimondja, hogy ide tartozik az „elfogadta az AJ-… ajánlatot, rögzítsd a rendelést” eset; a rendelés-ágens leírása a meglévő RND-… rendelésekre szűkül. |
| 6 | **F20** „Hogy állunk?” (2/6 siker, 4/6 részben) | A modell „2 új hibajegyet” mond, a nyitott 5 | A skill a „nyitott, ebből új” számot kérte, de a `list_tickets` csak egy oldal listát adott, összesítés nélkül. | A `list_tickets` az összes illeszkedő jegyre ad számlálót (`counts`: összes, nyitott, állapotonként), és a skill ezt kéri. |
| 7 | **F05** kedvezmény-jóváhagyás (e4b: 0/3 siker, 3/3 részben) | Ajánlat kész, utána a modell **indoklást kér** ahelyett, hogy a jóváhagyást kérné | A skill szerint indoklás nélkül vissza kellett kérdezni, a kérés viszont kifejezetten a jóváhagyás kérését kérte. A skill és a feladat ellentmondott. | A skill pontosítva: ha a felhasználó kifejezetten kéri a jóváhagyást, a tényt kell indoklásnak írni („20% kedvezmény az értékesítő kérésére”), és jelezni, hogy a vezető dönt. Üzleti okot továbbra sem szabad kitalálni. |
| 8 | **F14** fizetési link (e4b: 0/3 siker, 3/3 részben) | A link létrejött, a válaszból kimaradt (12b: egyszer elrontotta a hosszú URL-t) | A Stripe Checkout URL nagyon hosszú, kódolt töredékkel; a kis modell kihagyja vagy csonkítja. | Az eszköz összefoglalója és a rendelés-ágens utasítása kéri a link szó szerinti, teljes átadását. *Ha ez nem elég, a következő lépés egy rövid átirányító link lenne a fizetési rendszerben (nem tettük meg).* |
| 9 | **F09** „Hol a csomag?” (e4b: 1/3 siker) | A modell a rendelés állapotát („teljesítés alatt”) mondja a csomagé („Felvételre vár”) helyett | A rendelés összefoglalójában nem szerepelt a csomag állapota, csak a JSON-ban. | A rendelés összefoglalója kiírja a futárt, a csomag állapotát, a követési számot és a várható érkezést; a skill pontosítva. |

## 4. Mellékhatások és tesztek

- **`14-mcp-sales`:** egy ellenőrzés a régi viselkedést várta („kivezetett termék csak `includeInactive`-vel”). Ezt a szándékos változásra cseréltük, és 3 új ellenőrzés került be: csak kivezetett találat a helyettesítőkkel, vegyes találat, vevőkeresés írásjel és ékezet nélkül. Egy másik ellenőrzés a mérés miatt felhalmozódott 100+ Bakony-ajánlat miatt hamisan bukott (a legacy lista 100 sornál megáll). Ez most az új azonosítót nézi, nem a darabszámot. **41/41.**
- **`14-mcp-finance`:** új ellenőrzés: `documentPaid` és az összefoglaló. **26/26.**
- **`14-mcp-support` 27/27, `13-mcp-orders` 45/45, `17-agens` 41/41, `05-szamlazas` OK.**
- **`19-ertekeles`:** az ellenőrzők próbája (ideális → siker, rossz → nem siker) a javított és az új feladatokon a mérés előtt **48/48**, a teljes készleten (33 feladat, a javított garancia-ellenőrzővel) a mérés után **92/92**.

## 5. A számlázó javítása (nem az ágens hibája)

A 11-03-i mérésben 2 F17-futás (sztornó) azért esett ki, mert a számlázó nem tudott tesztszámlát kiállítani (`E999`). Az ok most derült ki:

- **A jelenség:** a Számlázz.hu tesztfiók időnként törli a bizonylatait, és a sorszámokat (TST-2026-1…) újra kiadja.
- **Miért bukott:** a mi adatbázisunkban ezek a sorszámok még a régi, azóta törölt bizonylatokhoz tartoztak. Az egyedi kulcs ezért visszadobta az újat.
- **A javítás (`legacy/billing/szinkron.ts`):** ütközéskor a számlázó megnézi a gazdánál, hogy a régi bizonylat létezik-e még. Ha nem, a régit `HIANYZIK` állapotba teszi, ahogy az egyeztetés is tenné, és a sorszám az újé lesz. Ha létezik, a hiba marad, mert ott valódi ütközés van.
- **Egyszeri lépés a javítás előtt:** 20 tesztszámla-kísérlettel léptünk túl a foglalt tartományon, kizárólag a Számlázz.hu tesztfiókban.

## 6. Egy ellenőrző-javítás a mérés után (és miért nem torzít)

A 11-07-i mérés maradék hibáit is egyenként átnéztük. Három futásnál a válasz **helyes** volt, az ellenőrző mégis elutasította, mert a mondatmintája nem ismert egy gyakori fordulatot:

| Futás | Válasz (részlet) | Igazság | Ami hiányzott a mintából |
|---|---|---|---|
| F18d · e4b #1 | „…nem érvényes a garancia, mert a rendelés még nem került kiszállításra.” | még nincs kiszállítva | „nem került kiszállításra” |
| F18d · e4b #2 | „…nincs érvényes garancia, mert a rendelés még nem került kiszállításra” | még nincs kiszállítva | ugyanaz |
| F18c · 12b #2 | „…a megadott rendelésben (RND-…) nincs szerepelő a TK-00010 termék…” | nincs a rendelésben | „nincs szerepel…” |

**A javítás:** a garancia-ellenőrző mintája bővült ezzel a két fordulattal (`GARANCIA_MINTA`, `scripts/ertekeles/feladatok.ts`).

**Az alkalmazás:** mindkét mérés minden garancia-futására, a nyers változatra is, a tárolt válaszból (`scripts/ertekeles/ujraertekel.ts`). Igazságként az ellenőrzéskor lekért, a futásnál tárolt értéket használtuk, nem a feladat felépítéséből adódót, mert az F18d rendelése a szállítás-szimuláció miatt a mérés közben kiszállítottá válhat.

**Az eredmény:** 70 futásból 3 változott, mind sikertelenből sikeresre, mind a fenti három. Egy korábbi siker sem lett sikertelen, a 11-03-i mérés és a nyers változat egyetlen futása sem változott. A javítás tehát nem a 11-07-i javításokat „segíti”: ugyanaz a mérce minden mérésre. Az érintett futások megjegyzésében ott a jelölés: „[újraértékelve 2026-11-07: javított garancia-ellenőrző]”.

## 7. Az eredmény

Részletesen: [ertekeles-2026-11-07-javitott.md](ertekeles-2026-11-07-javitott.md).

| | MCP · 12b előtte → utána | MCP · e4b előtte → utána |
|---|---|---|
| Sikeres (27 alapfeladat) | 78% → **94%** | 75% → **90%** |
| Megbízható feladat (mindhárom ismétlés sikeres) | 74% → **89%** | 70% → **78%** |
| Kontrollfeladatok (6 új) | – → **94%** | – → **100%** |
| Átlagos idő / feladat | 22 s → 14,4 s | 7,8 s → 8,9 s |

**Ami javult:**
- **F03** (kifutott termék): 0/6 → 6/6.
- **F22** (eltérő névírás): 0/6 → 6/6.
- **F07** (12b): 0/3 → 3/3.
- **F15a** (12b): 0/3 → 3/3.
- **F13** (díjbekérő összege): 0/6 → 5/6.
- **F14** (fizetési link): 2/6 → 6/6.

**Ami maradt (a modell hibái, nem az eszközöké):**
- **F05 (e4b, 1/3):** a pontosított skill ellenére is visszakérdez az indoklásért ahelyett, hogy kérné a jóváhagyást. A 12b 3/3. Ez a kis modell utasításkövetési korlátja.
- **F20 (12b, 0/3; e4b, 2/3):** a 12b érvénytelen szűrővel hívja a hibajegy-listát, majd 0 nyitott jegyet mond. Az eszköz a hibát jelezte, a modell rossz paraméterrel próbálta újra.
- **Egyedi hibák:**
  - F01 (e4b): rossz összeget mond az ajánlat nettója helyett;
  - F06 (12b): jóváhagyás helyett indoklást kér;
  - F25 (12b): elírja a vevő nevét a keresésben;
  - F09: a csomag állapotát rosszul adja vissza.

  Az F09-nél nem zárható ki, hogy a szimulált szállítás a válasz és az ellenőrzés között továbblépett („Felvételre vár” → „A futár felvette”); ezt nem tudtuk utólag eldönteni, ezért hibának számoltuk.

**A kontrollfeladatok eredménye azt mutatja, hogy a javítások általánosítanak:** egy új vevő más írásmóddal, többtételes ajánlat, meglévő díjbekérő összege, garancia termékkód nélkül. Az egyetlen kontroll-hiba (F25, 12b #1) modellhiba, nem eszközhiba.

## 8. Ami nem változott (szándékosan)

- **A modell nem változott:** nincs finomhangolás, nincs más prompt-sablon.
- **Az ellenőrzők nem lazultak:** a „részben” továbbra sem siker.
- **Egyik feladat sem lett könnyebb.**
- **A rövidített fizetési link nem készült el.** Ha az F14 marad a gyenge pont, ez lesz a javaslat.
