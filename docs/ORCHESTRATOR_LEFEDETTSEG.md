# A „legacy” folyamatok az új orchestratorral – lefedettség, csatornák, gyors fejlesztések

*Előzmény: [LEGACY_FORGATOKONYV.md](LEGACY_FORGATOKONYV.md) (a régi munkamód 12 történetben). **Frissítés 2026-11-02: az L1–L7 elkészült (lásd 7. pont).** Ez a dokumentum azt vizsgálja meg, hogy ugyanezek a folyamatok hogyan valósíthatók meg az ágens-orchestratorral (17. fázis), milyen interfészeken, mi működik már ma, és mi az, ami kis munkával pótolható. Állapot: 2026-11-02.*

## 1. Az orchestrator röviden

```
 felhasználó (csatorna) ─► front-desk ─► szakágens ─► jóváhagyási kapu ─► MCP réteg ─► legacy rendszerek
                           (kit hívjon)   (saját eszközök,   (írás előtt      (5 szerver,
                                           Skillek)           ember dönt)       35 eszköz)
```

- **Front-desk:** eldönti, melyik szakágens dolgozzon. A választható szakágensek a felhasználó szerepkörétől függnek.
- **Szakágensek ma:** Értékesítés, Rendelés-státusz, Ügyfélszolgálat, Kivételkezelő (csak olvas), Felhasználókezelés (csak rendszergazdának).
- **Jóváhagyási kapu:** minden olvasásnál több kockázatú hívás előtt megáll, és az ember dönt. Ezt a kód kényszeríti ki, nem a modell.
- **MCP réteg:** egységes, kanonikus adatok (Ft, ISO dátum, angol kódok magyar felirattal), szerepkör szerinti jogosultság, idempotencia, napló.

## 2. Interfészek (csatornák)

| Csatorna | Ki használja | Azonosítás | Mit érhet el | Állapot |
|---|---|---|---|---|
| **A. Belső asszisztens** (portál, `/asszisztens`) | a cég munkatársai | Supabase-bejelentkezés, szerepkör | a szerepköréhez tartozó szakágensek; írás jóváhagyással | **kész** |
| **B. „Mindenes menedzser”** (ugyanez a felület, `admin` vagy `sales_manager` szerepkörrel) | ügyvezető, értékesítési vezető, rendszergazda | mint fent | minden szakágens; a teljes rendelési folyamat; felhasználókezelés (admin) | **kész**, egy korláttal: egy kérés egy szakágenshez megy (lásd 5.2) |
| **C. Ügyféloldali chat** (a honlapon, bejelentkezés nélkül) | érdeklődők, vevők | nincs, vagy rendelésszám + adószám | termékinfó, listaár, elérhetőség, saját rendelés állapota, érdeklődés vagy reklamáció leadása | **nincs** |
| **D. E-mail csatorna** (beérkező levél → ágens → válaszvázlat → ember küldi) | értékesítés, ügyfélszolgálat | a postafiók | mint A, de a bemenet egy e-mail | **nincs** |
| **E. Eseményvezérelt háttérágens** | senki nem kérdezi, magától jelez | – | elakadt rendelés, késő csomag, kifogyó készlet, jóváhagyásra váró ajánlat → riasztás vagy javaslat | **18. fázis** |
| **F. Külső MCP-kliens** (pl. Claude Desktop) | fejlesztő, haladó felhasználó | MCP token szerepkörrel | az 5 MCP szerver közvetlenül | **kész** (13–14. fázis) |

## 3. Lefedettség folyamatonként

Jelmagyarázat: **✔** ma is végigvihető · **◐** részben (egy lépés kézi vagy hiányzik) · **✘** nem.

| # | Folyamat (forgatókönyv) | A/B: belső asszisztens | C: ügyféloldali chat | Mit használ / mi hiányzik |
|---|---|---|---|---|
| 3.1 | Érdeklődés e-mailben: ár, szállítási idő | **✔** ár (ajánlattal, mennyiségi kedvezménnyel), készlet · ◐ szállítási idő | ◐ | `search_customers`, `search_products`, `create_quote`, `check_stock`. **Hiányzik:** szállítási idő adat (a rendszerekben nincs); az e-mail mint bemenet (D) |
| 3.2 | Érdeklődés a honlapon: „van ilyen termék?” | ◐ létezik-e, kivezetett-e, ár **✔** · **új érdeklődőt nem tud felvenni** | ✘ | `search_products` (`includeInactive`). **Hiányzik:** CRM-partner felvétele (nincs eszköz) → nem tud ajánlatot adni új érdeklődőnek |
| 3.3 | Kedvezmény-jóváhagyás 15% fölött | **✔** | – | `request_quote_approval`, `approve_quote` (csak értékesítési vezető). **Hiányzik:** értesítés a vezetőnek (E) – addig az irányítópult „Jóváhagyásra vár” kártyája mutatja |
| 3.4 | Megrendelés, készlethiány | **✔** | – | `accept_quote`, `approve_order`, `modify_order`; a készlethiány termékkóddal (`INSUFFICIENT_STOCK`, nem raktári cikkszámmal) |
| 3.5 | Kiszállítás, „hol a csomag?” | **✔** | ◐ (rendelésszám + azonosítás kellene) | `start_fulfillment`, `get_order` (fuvarozó, követési szám, késés). **Hiányzik:** proaktív jelzés késésnél (E) |
| 3.6 | Raktár napi munkája | **✘ ma** – az eszköz megvan, de egyik szakágens sem kapta meg | – | `check_stock`, `list_low_stock`, `adjust_stock` (bevételezés, korrekció) létezik az MCP-ben. **Hiányzik:** Raktár szakágens. Beszerzés (utánrendelés) nincs a rendszerekben |
| 3.7 | Díjbekérő | **✔** | – | `issue_proforma`, `get_document`, `get_document_pdf` (Számlázz.hu PDF). Az e-mailes kiküldés kézi |
| 3.8 | Lemondás, sztornó | ◐ lemondás **✔** · sztornó ✘ | – | `cancel_order` (nem visszavonható → jóváhagyás). A sztornó a 14. fázisban **szándékosan** maradt ki az MCP-ből |
| 3.9 | Fizetés ellenőrzése | ◐ | ◐ (a vevő a saját díjbekérőjét) | `get_payments`, `get_document` (fizetve?), `create_payment_link`, `list_overdue_documents`. **Hiányzik:** átutalások (bankkivonat nincs a rendszerben); a lejárt Stripe-link átvétele (ismert eltérés) |
| 3.10 | Reklamáció, garancia, csere | **✔** | ◐ (bejelentés leadása) | `create_ticket`, `check_warranty` (kód + magyarázat), `start_rma`, `receive_rma` |
| 3.11 | Vezetői riport | ◐ | – | Kivételkezelő (rendelések, készlet, lejárt számlák, hibajegyek – csak olvas). **Hiányzik:** egy összefoglaló „recept”, amely a négy kérdést egyben megválaszolja; addig az irányítópult |
| 3.12 | Hozzáférések | ◐ szerepkör **✔** · új felhasználó ✘ | – | `set_user_role` (csak admin, jóváhagyással). Új felhasználót a regisztráció hoz létre, meghívás nincs |

**Összesítve (belső asszisztens):** a 12 folyamatból **6 ma is végigvihető** (3.1, 3.3, 3.4, 3.5, 3.7, 3.10), **5 részben** (3.2, 3.8, 3.9, 3.11, 3.12), **1 nem** (3.6, a raktári munka, pedig az eszköze kész).

## 4. A rések típusai

1. **Bekötetlen eszköz:** megvan az MCP-ben, csak egyik szakágensnél sincs (raktár).
2. **Hiányzó eszköz:** a legacy rendszer tudja, az MCP réteg nem ajánlja ki (CRM-partner felvétele; sztornó).
3. **Hiányzó „recept”:** az eszközök megvannak, de egy összetett feladathoz (vezetői riport, válasz-e-mail) nincs Skill, így a kis modell nem tudja megbízhatóan összerakni.
4. **Hiányzó csatorna:** ügyféloldali chat, e-mail.
5. **Hiányzó proaktivitás:** senki nem kérdez, mégis jelezni kellene (18. fázis).
6. **Szándékosan emberi vagy a rendszereken kívüli:** banki átutalások egyeztetése, beszerzés, szállítási idő ígérése, kézi „fizetve” jelölés.

## 5. Gyors fejlesztések („low hanging fruit”)

Az alábbiak kis munkával, a meglévő architektúrán belül elkészíthetők: új szakágens-definíció, Skill, egy-egy új MCP-eszköz. A hozzájuk tartozó tesztekkel együtt kb. egy munkanap.

| # | Fejlesztés | Mit old meg | Munka | Kockázat |
|---|---|---|---|---|
| **L1** | **Raktár szakágens** (`logistics` és vezető): `check_stock`, `list_low_stock`, `adjust_stock`, `get_order`, `list_orders`, `start_fulfillment` + Skill: `raktari-munka` (bevételezés, korrekció, minimumszint) | 3.6 ✘ → ✔ | definíció + Skill | alacsony: az eszközök és a jogosultságok már tesztelve |
| **L2** | **`create_customer` MCP-eszköz** (`sales` szerver, `write`, jóváhagyással): új partner a CRM-be (név, adószám, cím, alapból „normál” csoport), adószám-ellenőrzéssel és duplikációszűréssel | 3.2 ◐ → ✔ (új érdeklődő → ajánlat) | 1 eszköz + teszt | alacsony–közepes: írás a CRM-be; a duplikáció a fő veszély |
| **L3** | **Kivezetett termék és alternatíva** a `rendelesfelvetel` Skillben: inaktív terméknél mondja meg, hogy kivezetett, és ajánljon azonos kategóriájú aktív terméket | 3.2 pontosabb | Skill | nincs |
| **L4** | **Vezetői helyzetkép** Skill a kivételkezelőnek: „Hogy állunk?” → nyitott és elakadt rendelések, lejárt kintlévőség, minimum alatti készlet, nyitott hibajegyek, egy válaszban | 3.11 ◐ → ✔ | Skill | nincs |
| **L5** | **Válasz-e-mail vázlat** Skill (`ugyfel-valasz`): kérésre a válaszból kész, a vevőnek küldhető e-mail-szöveg (megszólítás, ajánlatszám, összeg, határidő); **nem küldi el**, csak megírja | 3.1, 3.2, 3.5, 3.9: a kézi gépelés helyett másolás | Skill | nincs (küldés nincs) |
| **L6** | **Lejárt Stripe-link átvétele:** a fizetés egyeztetése a Stripe szerint lejárt linket nálunk is „lejárt” állapotra teszi | 3.9 pontosabb; a 16. fázis óta nyitott eltérés megszűnik | kis kódmódosítás a fizetésben + teszt | alacsony |

**Döntést kér (nem „low hanging”, de olcsó):**
- **L7: Sztornó eszköz** (`finance`, „nem visszavonható” → jóváhagyás). A legacy protokoll tudja; a 14. fázisban azért maradt ki, mert akkor még nem volt jóváhagyási kapu. Most már van, így a 3.8 teljessé tehető.

**Nem gyors, a következő fázisokba való:**
- **C: Ügyféloldali chat** (közepes). A belátható minimális változat:
  - új, korlátozott szerepkör (`vendeg`);
  - egy „Ügyfél” szakágens csak termékkereséssel (listaár, kapható-e), rendelésállapottal (rendelésszám + adószám egyezése után), és érdeklődés vagy reklamáció leadásával (hibajegyként);
  - publikus oldal bejelentkezés nélkül, kérésszám-korláttal.

  A fő munka a biztonság: azonosítás, prompt injection, és hogy más vevő adata ne szivároghasson ki.
- **D: E-mail csatorna** (közepes): beérkező levelek oldala (vagy egy tesztpostafiók), az ágens választ fogalmaz (L5), ember küldi.
- **E: Eseményvezérelt háttérágens:** a 18. fázis (értesítés jóváhagyásra váró ajánlatról, késésről, kifogyó készletről).
- **Több szakágens egy kérésben** („rendeld meg, és állítsd ki a díjbekérőt”): a front-desk láncolhatná a szakágenseket. Ma egymás után, külön kérésekben működik.

## 6. Javasolt sorrend

1. **Most:** L1–L6 (és L7, ha jóváhagyod). Az L1–L6-tal a belső asszisztens a 12 folyamatból **9-et** visz végig (+3.2, 3.6, 3.11). Az L7-tel **10-et**; részben marad a 3.9 (átutalások) és a 3.12 (új felhasználó). A bővített eszközkészlettel újrafuttatjuk az élő tesztet.
2. **18. fázis:** eseményvezérelt háttérágens (E).
3. **Opcionális:** ügyféloldali chat minimális változata (C). Ez a 19. fázis mérésében külön oszlop lehet („az ügyfél maga”).

## 7. Megvalósítva (2026-11-02): L1–L7

| # | Mi készült | Ellenőrzés |
|---|---|---|
| L1 | **Raktár szakágens** (logisztika, értékesítési vezető, admin): `check_stock`, `list_low_stock`, `adjust_stock`, `list_orders`, `get_order`, `start_fulfillment` + `raktari-munka` Skill | `17-agens`: a front-desk csak a jogosultaknak kínálja fel, csak raktári eszközökkel; élőben: „Beérkezett 5 db TK-00010…” → jóváhagyás → bevételezés |
| L2 | **`create_customer`** MCP-eszköz (sales, `write`): adószám-formátum és ellenőrző számjegy, duplikáció esetén a meglévő vevőt adja (`created: false`), hasonló nevű vevők listája | `14-mcp-sales` (+6 ellenőrzés); élőben: új érdeklődő → felvétel → ajánlat normál áron |
| L3 | Kivezetett termék: a `rendelesfelvetel` Skill szerint `includeInactive`-val is keres, jelzi a kivezetést, és alternatívát ajánl | Skill |
| L4 | **`vezetoi-helyzetkep`** Skill a kivételkezelőnek: rendelések, kintlévőség, készlet, hibajegyek egy válaszban | élőben: „Hogy állunk?” → mind a négy rész lekérdezve |
| L5 | **`ugyfel-valasz`** Skill (értékesítés, rendelés-státusz, ügyfélszolgálat): elküldhető e-mail-vázlat; az ágens nem küld e-mailt | Skill |
| L6 | **Lejárt Stripe-linkek átvétele:** 10 percenkénti háttérfeladat a fizetésben + `POST /api/legacy/payments/reconcile` (az irányítópult „Egyeztetés most” gombja is hívja) | `08-fizetes` (+3 ellenőrzés: elmaradt webhook szimulálása) |
| L7 | **`cancel_invoice`** (sztornó) MCP-eszköz (finance, `irreversible` → mindig jóváhagyás): csak számlára, díjbekérőre `INVALID_STATE` (+ `cancel_order` javaslat), ismétlésre ugyanazt a sztornót adja | `14-mcp-finance` (+5 ellenőrzés) |

**Az eszközkészlet most:** 35 MCP-eszköz (+2 helyi), 6 szakágens, 10 Skill. A belső asszisztens a 12 legacy folyamatból 10-et visz végig.
