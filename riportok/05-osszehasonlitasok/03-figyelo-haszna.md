# A háttérfigyelő haszna: észlelési idő és téves riasztás

*20. fázis · 2026-11-10 · adatok: [figyelo-meres.json](adatok/figyelo-meres.json), [figyelo-meres-j9.json](adatok/figyelo-meres-j9.json) · szkript: `scripts/riportok/figyelo-meres.ts`*

## 1. Mit vizsgáltunk

A chates ágens csak akkor dolgozik, ha kérdeznek tőle. A háttérfigyelő ezzel szemben magától veszi észre a kivételeket: készlethiányt, elakadt rendelést, lejárt tartozást. A kérdés az, hogy valóban észreveszi-e őket, mennyi idő alatt, és fals riasztásokkal terheli-e a felhasználót.

A mérés a figyelő **valódi kódját, valódi ütemezésével** futtatta: az eseménykör 15 másodpercenként, az időzített kör 600 másodpercenként, az elemzés 10 másodpercenként fut. Az elemzéseket a helyi modell írta. Közben a szkript szándékosan problémás helyzeteket hozott létre mind a kilenc szabályra (J1–J9), ismert időponttal, és mellette nyolc hibátlan kontrollrendelést is futtatott.

**Eredmény egy mondatban: 33 szándékos esetből 33-at észlelt, az eseményalapú szabályok medián 8,5 másodperc alatt, az időzítettek medián 290 másodperc alatt, téves riasztás nem volt.** A minta kicsi, ezért ez működési bizonyíték, nem statisztikai garancia.

## 2. Észlelési idők

Az észlelési idő a probléma létrehozása és a jelzés megjelenése között eltelt idő. Az elemzés ideje ugyanettől a ponttól a modell szöveges elemzésének elkészültéig tart.

| Szabály | Probléma | Esetek | Észlelve | Észlelés (mp) | Elemzés kész (mp) |
|---|---|---:|---:|---|---|
| J1 | készlethiány miatt megakadt rendelés | 4 | 4 | 11–12 | 25–26 |
| J2 | sikertelen folyamatlépés a rendelésen | 3 | 3 | 5 | 23–33 |
| J3 | késő szállítás | 4 | 4 | 6–7 | 18–19 |
| J4 | minimum alá esett készlet | 3 | 3 | 10 | 19–20 |
| J5 | sikertelen fizetés | 4 | 4 | 2–14 | 17–25 |
| J6 | lejárt tartozás | 4 | 4 | 26, 240, 357, 581 | 961, 267, 374, 617 |
| J7 | jóváhagyásra váró ajánlat | 3 | 3 | 124, 304, 514 | 182, 372, 591 |
| J8 | elakadt rendelés | 4 | 4 | 205, 265, 475, −8 | 213, 273, 493, 8 |
| J9 | régóta nyitott hibajegy | 4 | 4 | 125, 275, 425, 575 | 141, 300, 460, 621 |

A J6–J9 soraiban a két oszlop értékei párban tartoznak össze, észlelési idő szerint rendezve.

**Eseményalapú szabályok (J1–J5, 18 eset).** Medián 8,5 másodperc, legrosszabb 14 másodperc. A J4 is ide tartozik, mert az időzített készletellenőrzést készletesemény is elindítja. Az idő az eseménykör 15 másodperces ütemét követi, tehát ez a szám lényegében a beállítás következménye.

**Időzített szabályok (J6–J9, 14 értékelhető eset).** Medián 290 másodperc, átlag 321, legrosszabb 581. Ezek pontosan azt mutatják, amit egy 600 másodperces körtől várni lehet: az észlelés attól függ, hogy a probléma mikor keletkezik a két kör között. Az elméleti tartomány 0–600 másodperc, 300 másodperces átlaggal. Ha egy vállalkozásnak elég a lejárt tartozást óránként látnia, a kör ritkítható. Ha gyorsabban kell, a kör sűríthető, a korlátot itt a legacy rendszerek terhelése adja.

**A −8 másodperces J8 mérési műtermék.** Az időzített kör éppen a beoltás befejezése előtt 8 másodperccel érte el a rendelést. Az időbélyeget a beoltás végén rögzítettük, a rendelés addigra már feltételeinek megfelelt. Ezt az esetet észleltnek számoljuk, de az időstatisztikából kihagytuk.

**Az elemzés elkészülte.** Az eseményalapú szabályoknál 17–33 másodperccel a probléma után kész a szöveges elemzés. Az időzítetteknél az észlelés után 8–77 másodperccel, mert egy körben több jelzés keletkezik, és ezek sorban várnak a modellre. Az egyetlen kiugró a 961 másodperces J6 (935 másodperccel az észlelés után), amelyet nagy valószínűséggel a Mac alvása okozott (lásd 6. szakasz).

## 3. Téves riasztás

A kontrollcsoport nyolc hibátlan rendelés volt. Ezen kívül a mérés alatt minden új jelzést összevetettünk a beoltásokkal.

A beoltásokon kívül **négy új jelzés** jött létre a főmérésben, a J9-pótlásban egy sem:

| Jelzés | Hol | Valós volt-e |
|---|---|---|
| J3 | RND-100322 (kontroll) | igen: a szimulált fuvarozó valódi `SHIPMENT_DELAYED` eseményt küldött |
| J3 | RND-100334 (kontroll) | igen: ugyanaz |
| J3 | RND-100343 (kontroll) | igen: ugyanaz |
| J4 | TK-00001 | igen: a cikk valóban a minimum alatt volt |

**Mind a négy valós helyzetre mutatott, téves riasztás nem volt.** A három kontrollrendelésnél ez elsőre riasztásnak látszik, de a szimulátor valóban késést jelentett rájuk, tehát a figyelő helyesen reagált. A kontrollcsoport így nem maradt teljesen „tiszta”, ami a mérés gyengesége: a nyolcból öt rendelésnél maradt ki minden kivétel.

## 4. Az elemzések minősége

Mind a 33 elemzést a modell írta, sablonra egyszer sem esett vissza a rendszer. Mindet elolvastuk.

- **Azonosító:** 33/33 esetben a megfelelő ügyre hivatkozik.
- **Kitalált adat:** nem találtunk kitalált számot vagy azonosítót. A válaszokban szereplő, elsőre idegennek látszó cikkszámok és összegek eszközhívásból származtak.
- **Gyenge elemzés:** a 29 J1–J8 elemzésből körülbelül 6 gyenge vagy hibás. Három J6-nál a javaslat az volt, hogy „átutalással kell fizetnie”, ami nem cselekvési javaslat. Egy J6 „elévülő” tartozásról beszél, ami rossz szó. Egy J5 azt írja, „Az ügynek újra kell megpróbálnia”. Egy J2-nél az ok ellentmondó.
- **Nyelvi csúszások:** előfordul idegen szó („işlemi”) és nem létező alak („rendelemény”). A J9-ek közül kettő nyelvileg gyenge („értékesnek kell vennie a jegyet”, „Az ügynek kell továbbítani”).
- **Műtermékek:** két J9-elemzés azt írja, a jegy „már lezárva”. Ez helyes volt abban a pillanatban, mert a szkript az elemzés elkészülte előtt szüntette meg a problémát. A J3-aknál a szintetikus, 2099-es érkezési dátum szintén a mérés következménye.

Összefoglalva: **az észlelés determinisztikus és megbízható, a szöveg inkább segítség, mint kész utasítás.** Az elemzések körülbelül negyede alapján nem lehetne gondolkodás nélkül cselekedni. Ez azért elfogadható, mert a jelzés szabályból, tényadatból születik, a modell csak magyarázatot fűz hozzá, és semmit nem módosít a rendszerekben.

## 5. Összevetés az emberi munkamóddal

Ez a szakasz **becslés**, a prototípus forgatókönyvének munkamenetéből (milyen gyakran néz meg valaki egy adott listát), nem mérés.

| Helyzet | Emberi észlelés (feltételezett) | Figyelő (mért) |
|---|---|---|
| Sikertelen folyamatlépés, üzenetsorba került hiba | gyakran csak akkor, ha a vevő reklamál: senki nem figyeli az üzenetsort | 5 mp |
| Készlethiány miatt megakadt rendelés | a következő rendelésellenőrzéskor, órák vagy napok | 11–12 mp |
| Késő csomag | sokszor a vevő előbb tudja | 6–7 mp |
| Minimum alatti készlet | heti készletlista | 10 mp |
| Sikertelen fizetés | heti átutalás-ellenőrzés | 2–14 mp |
| Lejárt tartozás | hétfői kintlévőség-lista | legfeljebb 10 perc |
| Jóváhagyásra váró kedvezmény | a vezető másnap reggel | legfeljebb 10 perc |

A nagyságrendi különbség (percek a napok helyett) nem a mesterséges intelligencia érdeme, hanem a folyamatos ellenőrzésé: ugyanezt egy hagyományos riasztórendszer is tudná. A figyelő hozzáadott értéke az, hogy **a heterogén legacy rendszerekre az MCP-rétegen keresztül néhány szabállyal rá lehet ülni**, és a jelzéshez azonnal tartozik egy érthető magyarázat és javasolt következő lépés. A valódi üzleti haszon attól függ, hogy a jelzésre ki és mikor reagál, ezt ez a mérés nem vizsgálta.

## 6. Korlátok

- **A minta kicsi:** szabályonként 3–4 eset. A 33/33 azt mutatja, hogy a szabályok működnek, a tényleges észlelési arány ennél kevésbé pontosan ismert (95%-os alsó korlát durván 90%).
- **Csak a beoltott hibatípusokat teszteli.** Azt nem méri, mit nem vesz észre a figyelő, mert nincs rá szabály.
- **A Mac alvó állapotba ment** a főmérés közben: a tervezett 42 perc helyett 87 percig tartott, az időzített körök 2228, 3186 és 4273 másodpercnél futottak a tervezett ütem helyett. A J9-pótlás már ébren tartott géppel futott. Az alvás az észlelési időket a későn beoltott eseteknél torzíthatja, ezért a 961 másodperces elemzést nem szabad jellemzőnek tekinteni.
- **A lezárási időket nem közöljük.** Több jelzés a mérés szimulációja miatt korábban lezárult, mint ahogy a szkript megszüntette volna a problémát: a J3-akat a szimulált kézbesítés zárta le, egy J1-et és egy J8-at a rendelés továbblépése. Az alvás alatt három lemondás MCP-időtúllépéssel meghiúsult.
- **Részben szintetikus események.** A J3-at és a J5-öt szintetikus eseménnyel oltottuk be, valódi rendelésen, illetve valódi díjbekérőn. A többi szabály a rendszer valódi állapotán alapult.
- **Az első J9-beoltások elbuktak** a szkript hibája miatt (szöveges azonosítót számként kezelt), ezért a J9 külön, javított futásban készült el, ugyanazzal az ütemezéssel.
