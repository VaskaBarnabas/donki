# Betanulás: mennyit kell megtanulni egy feladathoz? (Ö7)

*20. fázis, 2. kör · 2026-11-11 · adatok: [adatok/osszevetesek.json](adatok/osszevetesek.json), [adatok/tokenomics-bontas.json](adatok/tokenomics-bontas.json) · szkript: `scripts/riportok/osszevetesek-adatbol.ts`*

## 1. A kérdés

Egy új munkatársnak, és ugyanígy egy AI-ágensnek is, meg kell tanulnia, hogyan kell a hét legacy rendszert használni. A kérdés: mennyi tudás kell ehhez a régi munkamódban, a nyers ágensnek és az MCP-s ágensnek? A tudás mennyiségét a dokumentáció hosszával mérjük, szóban, tokenben és olvasási időben.

## 2. A legacy dokumentáció

A `legacy-docs/` mappa a hét rendszer interfész-leírása. Ugyanezt kapja a nyers ágens, és ezt kellene megértenie egy új kollégának is, ha a rendszerek mélyére lát.

| Dokumentum | Rendszer | Szó | Token (e4b) |
|---|---|---:|---:|
| `crm-katalogus.md` | CRM és katalógus (PostgREST) | 384 | 1 374 |
| `ajanlat-jsonrpc.md` | ajánlatkezelő (JSON-RPC) | 614 | 2 183 |
| `orders.md` | rendeléskezelő (HTTP-homlokzat) | 899 | 3 157 |
| `raktar.md` | raktár (üzenetsor) | 577 | 2 493 |
| `szamlazo-protokoll.md` | számlázó (szöveges protokoll) | 992 | 4 067 |
| `payments.md` | fizetés (REST) | 849 | 2 276 |
| `helpdesk-soap.md` + `helpdesk.wsdl` | ügyfélszolgálat (SOAP) | 1 036 | 5 335 |
| `README.md` | áttekintés | 237 | 747 |
| **Összesen** | | **5 588** | **21 632** |

**Egy ember számára** ez 238 szó/perc olvasási sebességgel (Brysbaert 2019) **kb. 24 perc egyszeri átolvasás**. A megértés, a formátumok begyakorlása (a raktár egész számú cikkszáma, a számlázó vesszős összege, a fillérben megadott fizetés) és a hibakódok megtanulása ennek a többszöröse. A [legacy forgatókönyv](../../docs/LEGACY_FORGATOKONYV.md) szerint ezt a tudást ma a kollégák fejben hordják.

## 3. Mennyit olvas az ágens?

| | Nyers · e4b | Nyers · 12b | MCP (szakágensenként) |
|---|---:|---:|---:|
| Dokumentum-olvasás / futás | **0,06** (5 a 81-ből) | **0,95** (76 a 80-ból) | 0 |
| Amit a modell lát a rendszerről | a dokumentum, ha elolvassa | a dokumentum, ha elolvassa | 6–15 eszköz leírása, 758–2002 token |
| Token be / futás | 5 661 | 19 954 | 8 171–9 209 |
| Siker | 9% | 41% | 90–94% |

**Megállapítások:**

1. **A kisebb modell nem tanul, hanem találgat.** A nyers e4b a futások 6%-ában olvasta el a dokumentációt, a többiben kitalálta a hívás formáját. Ez a 9%-os sikeresség fő oka.
2. **A nagyobb modell olvas, de az olvasás drága és nem elég.** A nyers 12b szinte minden futásban dokumentumot olvas. A bemenete ettől 20 ezer token, és a sikere így is csak 41%.
3. **Az MCP-s ágensnek nincs mit megtanulnia.** Szakágensenként 6–15 eszközleírást lát, ami a teljes dokumentáció 3,5–9%-a tokenben. A formátumok fordítását az MCP-réteg végzi.

## 4. Mit jelent ez egy új munkatársnak?

| | Régi munkamód | Ágenssel |
|---|---|---|
| Mit kell tudni | hét rendszer felülete, formátuma, azonosítói, hibái | mit akar elérni, magyarul |
| Dokumentáció | kb. 5600 szó, a gyakorlati tudás ennél sokkal több | a portál és a jóváhagyási kártyák |
| Egy példa | „a Bakony 12 monitort kér, mennyi?” → CRM, katalógus, ajánlatkezelő, kedvezményszabály | ugyanez egy mondatban az asszisztensnek |

Az MCP-réteg itt kettős hasznot hoz. Az ágens számára ez az, ami a kis modellt használhatóvá teszi. Az ember számára pedig a tudás a rendszerbe kerül, nem a kollégák fejébe. Ez a betanulási időt csökkenti, és csökkenti a függést attól a néhány kollégától, aki „tudja”.

## 5. Korlátok

- **A betanulási időt nem mértük,** csak a dokumentáció méretét. A 24 perc az egyszeri átolvasás, nem a megtanulás ideje.
- **A token-számlálás az e4b tokenizálójával készült,** más modellel kissé eltér.
- **Az új munkatársnak** a rendszer mellett a cég szabályait (kedvezményhatár, jóváhagyás) is meg kell tanulnia, ez mindkét munkamódban szükséges.
