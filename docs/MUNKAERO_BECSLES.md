# Munkaerő-becslés: legacy folyamatok vs. ágensekkel digitalizált folyamatok

*Előzmény: [LEGACY_FORGATOKONYV.md](LEGACY_FORGATOKONYV.md) (a régi munkamód) és [ORCHESTRATOR_LEFEDETTSEG.md](ORCHESTRATOR_LEFEDETTSEG.md) (mit tud az ágens). A számok egy paraméterezhető modellből jönnek: [`scripts/munkaero-becsles.ts`](../scripts/munkaero-becsles.ts). Minden feltevés ott van egy helyen, és módosítás után újraszámolható (`npx tsx scripts/munkaero-becsles.ts --rendeles 500 --erdeklodes 2000`). **Ezek becslések, nem mérések**; a 19. fázis méri le a valós lépésidőket, és a modell azokkal frissíthető.*

## 1. A kérdés

Adott volumen mellett **mennyi emberi munka kell** egy folyamathoz:
- **a régi munkamódban:** az ember végzi az egészet, hét rendszer között másolva;
- **az ágensekkel:** az ágens végzi a lekérdezést, az összerakást és a megfogalmazást, az ember **ellenőriz, jóváhagy, és a kivételeket viszi** (human-in-the-loop, röviden HITL).

## 2. A modell

Folyamatonként a napi munka (perc/nap):

- **Legacy:** `darab/nap × legacy perc/darab`
- **Ágens:** `darab/nap × [(1 − kivételarány) × HITL perc + kivételarány × (HITL perc + kivétel perc)]`
  - **HITL perc:** a jóváhagyási kártya elolvasása és eldöntése, illetve egy vázlat (ajánlat, e-mail) átnézése;
  - **kivétel:** amit az ágens nem tud (nem egyértelmű kérés, hiányzó adat, döntés kell); ilyenkor az ember viszi végig, de az ágens által előkészítve;
- **Munkaóra (emberóra):** az összes érintett dolgozó napi munkaidejének összege, nem a nap hossza. Például 10 fő × 8 óra = 80 munkaóra/nap.
- **FTE (létszámegyenérték):** 6 hasznos munkaóra/nap/fő; FTE = munkaóra / 6, azaz ennyi ember dolgozik párhuzamosan.

### 2.1 Volumen (a példa szerint) és a belőle származtatott gyakoriságok

| Feltevés | Érték |
|---|---|
| Megrendelés | **500 / nap** |
| Érdeklődés e-mailben | **2000 / nap**, ebből 30% új érdeklődő (CRM-ben még nincs) |
| Kedvezmény-jóváhagyás (15% fölött) | a rendelések 10%-a |
| Készlethiány a jóváhagyáskor | 5% |
| „Hol a csomag?” megkeresés | a rendelések 30%-a |
| Fizetés | 70% kártyával (Stripe), 30% átutalással |
| Lejárt tartozás | 5%; lemondás és sztornó 2%; reklamáció és RMA 1% |
| Árubeérkezés | 20 szállítmány / nap |
| Vezetői helyzetkép | naponta 1; hozzáférés-módosítás hetente 2 |

### 2.2 Lépésidők (perc / darab)

- **Legacy idők:** a legacy forgatókönyv becslései. Például érdeklődés 20 perc, megrendelés 10, díjbekérő 7,5, „hol a csomag?” 5.
- **HITL idők:** egy jóváhagyási kártya 0,3–0,5 perc; egy ajánlat és e-mail-vázlat átnézése 1–1,5 perc; döntést igénylő kivétel (készlethiány, reklamáció) 6 perc.
- **Kivételarányok:** 2–20%, folyamatonként (lásd a táblázatot).
- **Pontos értékek:** a szkriptben, indoklással.

## 3. Eredmény a példa-volumenre (napi 500 rendelés, 2000 érdeklődés)

#### Folyamatonként (napi 500 rendelés, 2000 e-mailes érdeklődés)

| Folyamat | db/nap | Legacy perc/db | Ágens: HITL perc/db (kivétel %) | Legacy munkaóra/nap | Ágens: HITL munkaóra/nap | Megtakarítás |
|---|---:|---:|---:|---:|---:|---:|
| Érdeklődés e-mailben (ár, készlet) | 2000 | 20 | 1,5 (15% → +8 p) | 666,7 | 90 | 87% |
|   ebből új érdeklődő felvétele (30%) | 600 | 8 | 0,3 (5% → +5 p) | 80 | 5,5 | 93% |
| Kedvezmény-jóváhagyás (a rendelések 10%-a) | 50 | 15 | 1,5 | 12,5 | 1,3 | 90% |
| Megrendelés (ajánlat elfogadása → rendelés) | 500 | 10 | 0,5 (3% → +6 p) | 83,3 | 5,7 | 93% |
| Rendelés jóváhagyása (vezető) | 500 | 3 | 0,3 | 25 | 2,5 | 90% |
| Készlethiány a jóváhagyáskor (5%) | 25 | 25 | 6 | 10,4 | 2,5 | 76% |
| „Hol a csomag?” (a rendelések 30%-a) | 150 | 5 | 0,2 (5% → +5 p) | 12,5 | 1,1 | 91% |
| Kiszállítás indítása | 500 | 2 | 0,3 | 16,7 | 2,5 | 85% |
| Árubeérkezés | 20 | 15 | 3 (10% → +10 p) | 5 | 1,3 | 73% |
| Kifogyó készlet, utánrendelési lista | 1 | 30 | 3 | 0,5 | 0,1 | 90% |
| Díjbekérő kiállítása és kiküldése | 500 | 7,5 | 1 (2% → +10 p) | 62,5 | 10 | 84% |
| Kártyás fizetés ellenőrzése (70%) | 350 | 1 | 0 (2% → +3 p) | 5,8 | 0,4 | 94% |
| Átutalás egyeztetése (30%) | 150 | 3 | 3 | 7,5 | 7,5 | 0% |
| Lejárt tartozás, felszólítás (5%) | 25 | 10 | 2 (10% → +10 p) | 4,2 | 1,3 | 70% |
| Lemondás, sztornó (2%) | 10 | 15 | 2 (10% → +10 p) | 2,5 | 0,5 | 80% |
| Reklamáció, garancia, RMA (1%) | 5 | 25 | 6 (20% → +15 p) | 2,1 | 0,8 | 64% |
| Vezetői helyzetkép (napi) | 1 | 90 | 5 | 1,5 | 0,1 | 94% |
| Hozzáférés, szerepkör (heti 2 → napi 0,4) | 0,4 | 90 | 12 | 0,6 | 0,1 | 87% |
| **Összesen** | | | | **999,3** | **132,9** | **87%** |

#### Csoportonként, létszámegyenértékben (FTE = 6 hasznos óra/nap)

| Terület | Legacy FTE | Ágens: HITL FTE |
|---|---:|---:|
| Értékesítés | 126,5 | 16,1 |
| Rendelés | 19,8 | 1,8 |
| Ügyfélszolgálat | 2,4 | 0,3 |
| Raktár | 3,7 | 0,6 |
| Pénzügy | 13,8 | 3,3 |
| Vezetés, admin | 0,4 | 0 |
| **Összesen** | **166,5** | **22,2** |

#### Érzékenység (a HITL-idők és a kivételarány bizonytalansága)

| Változat | Ágens: HITL munkaóra/nap | FTE | Megtakarítás a legacyhez képest |
|---|---:|---:|---:|
| Optimista (HITL ×0,5, kivétel ×0,5) | 66,5 | 11,1 | 93% |
| Alap | 132,9 | 22,2 | 87% |
| Alap + kockázatalapú jóváhagyás | 111,4 | 18,6 | 89% |
| Pesszimista (HITL ×2, kivétel ×2) | 265,9 | 44,3 | 73% |
| Nagyon pesszimista (HITL ×3, kivétel ×3) | 398,8 | 66,5 | 60% |

#### Jóváhagyási kártyák naponta

| Változat | Kártya / nap | Kártya / jóváhagyó (a HITL FTE-re vetítve) |
|---|---:|---:|
| Minden írás kártyával (ma) | 4715 | 213 |
| Kockázatalapú (ajánlat, vevőfelvétel, kiszállítás szabály szerint) | 1615 | 87 |

#### Az ágens gépigénye

| Mutató | Érték |
|---|---:|
| Ágensfuttatás / nap | 4917 |
| Gépidő / nap (9 s / futás, sorban) | 12,3 óra |
| Ehhez szükséges párhuzamos modellpéldány (8 órás munkanap, 70% kihasználtság) | 3 |
| Token / nap (6000 / futás) | 29,5 millió |


## 4. Ugyanez a forgatókönyv cégméretére (napi 40 rendelés, 150 érdeklődés)

| Mutató | Legacy | Ágens + HITL |
|---|---:|---:|
| Emberi munka / nap | 83,2 munkaóra (~14 fő) | 11,6 munkaóra (~2 fő; kockázatalapú jóváhagyással 10 munkaóra) |
| Létszámegyenérték | **13,9 FTE** | **1,9 FTE** (1,7) |
| Jóváhagyási kártya / nap | – | 383 (kockázatalapúval 148) |
| Ágens gépideje / nap | – | 1 óra, egy modellpéldány elég |

**Ellenőrzés:** a forgatókönyv 40 fős cégénél a legacy modell kb. 14 fős értékesítési, pénzügyi és raktári adminisztrációt ad ki. Ez egy ekkora B2B kereskedőnél reális, tehát a lépésidő-feltevések nagyságrendileg helyesek.

## 5. Értelmezés

1. **Az érdeklődés viszi a munka nagyját.** Napi 2000 e-mail × 20 perc a legacy munka kétharmada (667 munkaóra/nap, kb. 111 fő). Ilyen volumenre egy 40 fős cég a régi munkamóddal **képtelen** volna. Az ágenssel ugyanez kb. 90 munkaóra (15 fő), mert az ember csak az elkészült ajánlatot és e-mail-vázlatot nézi át, és a kivételeket (15%) viszi.
2. **Összességében kb. 87% megtakarítás** (166,5 → 22,2 FTE). A bizonytalanság nagy: ha a HITL-idők és a kivételarányok kétszer akkorák, mint feltételeztük, a megtakarítás akkor is 73%; háromszoros értéknél is 60%.
3. **Ami nem csökken:**
   - **Átutalások egyeztetése** (7,5 munkaóra/nap, kb. 1,3 fő): a bankkivonat nincs bent a rendszerben, ez rés. Egy banki adatforrás bekötése a következő legnagyobb nyereség volna.
   - **Döntést igénylő kivételek:** készlethiány, reklamáció, a vevővel való beszélgetés. Itt az ágens csak előkészít.
4. **A jóváhagyás maga is munka, és kockázat.** Ha minden írás kártyát kér, napi kb. **4700 kártya** keletkezik, egy jóváhagyóra kb. 200. Ennyinél fennáll a **gépies bólintás** veszélye: rutinból jóváhagyni, ellenőrzés nélkül. Ezért javasolt a **kockázatalapú jóváhagyás**:
   - **szabály szerint, szúrópróbás utólagos ellenőrzéssel megy** az alacsony kockázatú, visszafordítható írás: ajánlat készítése, vevő felvétele, kiszállítás indítása;
   - **mindig emberi döntés** marad a pénzügyi és a visszavonhatatlan művelet (fizetési link, sztornó, lemondás) és a kedvezmény-jóváhagyás;
   - így a kártyák száma kb. **1600/nap**-ra csökken (egy jóváhagyóra kb. 90), a HITL-munka pedig 22,2 → 18,6 FTE.

   A jóváhagyási kapu ma a kockázati osztály alapján dönt (minden nem olvasó művelet kártyát kér); a kockázatalapú szabály ebből egy konfigurálható listával megvalósítható.
5. **Az ágens gépigénye nem elhanyagolható.** Napi kb. 4900 futás × 9 másodperc = **12,3 gépóra**. Egy munkanapon ehhez kb. **3 párhuzamos modellpéldány** kell (egy helyi gép, mint a mostani, egyszerre egy kérést szolgál ki hatékonyan). Ez kb. 30 millió token naponta. Cégméretben (40 rendelés/nap) egy gép bőven elég.

## 6. Korlátok

- **A lépésidők becslések.** A 19. fázis méri le őket (régi munkamód, portál, ágens ugyanazokon a feladatokon), és a modell a mért értékekkel frissül.
- **A modell lineáris.** A torlódást, a csúcsidőt, a betanulást és a hibák javításának költségét (egy rossz ajánlat vagy egy félrevezető válasz utólagos rendbetétele) nem tartalmazza. A hibaarányt az élő tesztek alapján érdemes beépíteni: a helyi modell az élő teszten 12/12-t teljesített, a mérésen 10/10 jó eszközválasztást.
- **A csatornák nincsenek mind kész.** Az e-mailes érdeklődés teljes digitalizálásához kell az e-mail csatorna (D), a „hol a csomag?” nullára csökkentéséhez az ügyféloldali chat (C). A modell ezeket a 0,2–1,5 perces HITL-időkkel már feltételezi; nélkülük a munkatárs maga másolja be a kérést az asszisztensbe, ami darabonként kb. +0,5–1 perc.
- **Nem számol a bevezetés költségével:** fejlesztés, gépek, felügyelet, a szabályok karbantartása.
