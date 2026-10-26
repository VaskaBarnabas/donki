# 17. fázis – Ágens réteg helyi modellel, LangGraph vezérléssel (terv)

*Állapot: kész (2026-10-24) – `17-agens` 30/30, `17-agens-elo` 12/12 (e4b); 2. változat: LangGraph.js vezérlés · előzmény: [FAZIS16_TERV.md](FAZIS16_TERV.md) (portál, kész) · keret: [MCP_AGENS_TERV.md](MCP_AGENS_TERV.md) §4 · utána: 18. fázis – asszisztens felület + eseményvezérelt kivételkezelő*

## 1. Cél

Egy chat-szerű segéd: magyarul mondod meg, mit szeretnél („A Bakony Gépgyártó 12 monitort kér, mennyi lenne?”), és ő végzi el a vállalati rendszerekben. Vevőt keres, ajánlatot készít, rendelést ad le. Ha módosítana valamit, előtte megkérdez.

- A rendszereket **csak az MCP rétegen** éri el (5 szerver, 33 eszköz). Nem lát kulcsot, nyers API-t vagy SQL-t.
- A „gondolkodást” **helyben futó modell** végzi (Ollama, `gemma4:12b`), így nem megy ki adat a felhőbe.
- A lépések sorrendjét, a megállást jóváhagyásra és az állapot mentését a **LangGraph.js** vezérli.

**Elfogadási feltétel:** parancssorból végigvihető egy rendelésleadás, emberi jóváhagyással.

Ebben a fázisban a parancssori ágens készül el. A webes felület (`/asszisztens` az admin felületen) és az eseményekre magától induló kivételkezelő a 18. fázisba kerül, a mérés (az MCP-s és a „nyers” ágens összevetése, tokenek, költség) a 19.-be.

## 2. Felmérés

| Tény | Következmény |
|---|---|
| Az Ollama telepítve, natívan fut (0.40.6, `localhost:11434`) | Nem kell konténer; a Mac GPU-ját csak a natív Ollama éri el |
| `gemma4:12b`: ~8 GB (7,4 GB modell + 0,5 GB „draft” segédmodell, amely gyorsítja a szöveggenerálást), még nincs letöltve. Megvan: `gemma4:e4b` (effektív 4B, 128k szövegablak) | Fő modell: `12b`; tartalék és összehasonlítás: `e4b` (lásd §9, 0. lépés) |
| A gemma4 tud eszközt hívni, a gondolkodás kapcsolható | Az ágenshez ez kell |
| LangGraph.js 1.5.2, `@langchain/core` 1.3, `@langchain/ollama` 1.3, `@langchain/anthropic` 1.6, `@langchain/mcp-adapters` 2.0, `@langchain/langgraph-checkpoint-postgres` 1.1 – mind aktívan fejlesztett | A csomagok megvannak; a pontos API-t a megvalósításkor a dokumentációból ellenőrzöm |
| Az MCP eszközök már ágensbarátok: pont nélküli nevek, lapos sémák, `outputSchema`, kockázati jelölés (`_meta["donki/risk"]`: `read` / `write` / `financial` / `irreversible`), szerepkörönkénti tokenek | A jóváhagyás és az eszközszűrés erre épül |
| Az MCP adatbázisa (`mcp-db`) a gépről nem érhető el (csak a PostgREST-je) | A natív ágens állapotához és naplójához saját adatbázis kell (§8) |
| Gép: 25,7 GB RAM; a rendszerek ~2–3 GB | A modell (~8 GB) és a munkamemóriája (~3–4 GB) elfér |

**Figyelni kell:** az Ollama alapból kis szövegablakkal dolgozik (4–8 ezer token), a 33 eszköz leírása pedig önmagában több ezer token. Ezért egy saját modellváltozat kell, nagyobb ablakkal: `donki-gemma` (`FROM gemma4:12b`, `num_ctx 32768`).

## 3. Futtatókörnyezet: LangGraph.js (döntés: 2026-10-24)

| Lehetőség | Miért nem / miért igen |
|---|---|
| Saját, egyszerű vezérlés az Anthropic SDK-val | Működne, de a megállást jóváhagyásra, az állapot mentését és a folytatást nekünk kellene megírni; a 18. fázis webes jóváhagyásához erre mindenképp szükség lesz |
| Claude Agent SDK | A Claude Code motorját futtatja, hosszú beépített rendszerprompttal és eszközökkel: egy 12B modellnél ez elviszi a szövegablak nagy részét, és nem garantált, hogy minden funkciója működik nem Claude modellel |
| **LangGraph.js – választva** | A működés gráfként írható le (rajzként a szakdolgozatba tehető). Készen adja a **megállást jóváhagyásra** (`interrupt()`), az **állapot mentését** (checkpointer, Postgresbe) és a **supervisor mintát** (front-desk → szakágensek). Nincs rejtett rendszerprompt: a modell azt kapja, amit mi írunk. A modell egy sorban váltható: `ChatOllama` (helyi) vagy `ChatAnthropic` (felhős Claude, a 19. fázis összehasonlításához) |

**Tudatos döntések a LangGraph mellett:**
- **A LangSmith ki van kapcsolva** (a LangChain felhős nyomkövetője): az adatnak helyben kell maradnia. A mérést a saját naplónk végzi (§8).
- **A Skilleket ebben sem kapjuk készen:** a „csak akkor töltsd be, ha kell” működést egy saját `load_skill` eszköz adja. A formátum a szabványos `SKILL.md` marad, így más keretrendszerbe is átvihető.
- **A kockázati jelölést ellenőrizni kell:** nem biztos, hogy az `@langchain/mcp-adapters` átadja az eszközök `_meta` mezőjét. Ha nem, a jelölést a meglévő MCP-kliensünkkel olvassuk ki a `tools/list`-ből, és mi csomagoljuk az eszközöket (néhány tucat sor). Ez a 0. lépés része.
- **Helyi modellhez a `ChatOllama`:** ez az Ollama saját API-ját használja, nem a Claude-kompatibilis átjárót, így az átjáró hiányosságai nem érintenek.

## 4. A gráf

```
                         ┌──────────────┐
  felhasználó kérése ──► │  front-desk  │  egy rövid, strukturált döntés:
                         │ (supervisor) │  melyik szakágens, milyen feladattal
                         └──────┬───────┘  (vagy visszakérdez)
         ┌───────────────┬──────┴────────┬────────────────┐
         ▼               ▼               ▼                ▼
   ┌───────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
   │értékesítés│  │rend.-státusz│  │ügyfélszolg. │  │kivételkezelő │
   └─────┬─────┘  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘
         └───────────────┴──── mindegyik ugyanígy épül fel: ┘

     ┌──────────┐  eszközhívás  ┌──────────────────┐  igen  ┌──────────┐
     │  modell  │ ────────────► │ jóváhagyási kapu │ ─────► │ MCP hívás│
     │          │ ◄──────────── │ read → mehet;    │        └────┬─────┘
     └────┬─────┘   eredmény    │ különben         │ ◄────────────┘
          │                     │ interrupt()      │  nem → „elutasítva”
          │ kész                └──────────────────┘
          └──────► vissza a front-deskhez ──► összefoglaló válasz
```

- **Állapot:** minden lépés után a checkpointer elmenti a gráf állapotát (beszélgetésenként egy `thread_id`). Jóváhagyásnál a gráf megáll, és később ugyanonnan folytatódik. Parancssorban ez az „[i]gen / [n]em” kérdés, a 18. fázisban egy jóváhagyási kártya a weboldalon, akár percekkel később, új böngészőkéréssel.
- **Hol fut:** a 17. fázisban parancssorból, a gépen. A 18. fázisban az admin felület (`npm run dev`) hívja ugyanezt a modult. Az Ollamát mindkettő a `localhost:11434` címen éri el. A vállalati rendszerek és az MCP szerverek továbbra is konténerben futnak.
- **Szerepkör:** az ágens mindig egy felhasználó nevében dolgozik (parancssorban: `--szerep sales`; ez választja ki az MCP tokent). Az MCP szerver a szerepkör szerint maga is tilt, így az ágens nem tehet többet, mint a felhasználó.

## 5. Ágensek

| Ágens | Feladat | Mihez fér hozzá | Írás |
|---|---|---|---|
| **Front-desk** (supervisor) | Besorolja és továbbítja a kérést; ha nem egyértelmű, visszakérdez; a végén összefoglal | – (csak dönt) | – |
| **Értékesítés** | Vevőt azonosít, terméket keres, ajánlatot készít, kedvezmény-jóváhagyást kér, elfogad → rendelés | `sales` (9), `inventory` (3, olvasás) | jóváhagyással |
| **Rendelés-státusz** | „Hol tart?”, következő lépés, díjbekérő, fizetési link, számla | `orders` (9), `finance` (5) | jóváhagyással |
| **Ügyfélszolgálat** | Hibajegy, garancia, csere/javítás (RMA) | `support` (7), `orders` (olvasás) | jóváhagyással |
| **Kivételkezelő** | Készlethiány, elakadt rendelés, lejárt számla: elemzés és javaslat | mind, **csak olvasás** | – |

- **Minden szakágens csak a saját eszközeit látja.** Kevesebb eszközleírás kevesebb tokent és kevesebb rossz eszközválasztást jelent.
- **A front-desk döntése strukturált kimenet** (a választható ágensek listájából), nem szabad szöveg. Érvénytelen válasznál egyszer újrapróbálja, utána visszakérdez.
- **A szakágensek egy beszélgetésen belül** megkapják a korábbi lépések rövid összefoglalóját, így a „vegyük fel a rendelést” az előző ajánlatra vonatkozik.

## 6. Skillek (`agens/skills/<nev>/SKILL.md`)

Folyamatleírások és üzleti szabályok, nem kód. A szakágens utasításában csak a saját Skilljeinek neve és egysoros leírása szerepel; a teljes szöveget a `load_skill` eszközzel tölti be, amikor kell.

| Skill | Melyik ágens | Tartalom |
|---|---|---|
| `rendelesfelvetel` | értékesítés | a lépések; vevőazonosítás adószám vagy név alapján (eltérő írásmód is); mikor kell ajánlat; mennyiségi kedvezmény |
| `kedvezmeny-jovahagyas` | értékesítés | 15% feletti kedvezmény: kitől, milyen indoklással |
| `keszlethiany-kezeles` | értékesítés, kivételkezelő | hiánynál: módosítás, más termék, várakozás (részszállítás nincs) |
| `rendeles-statusz` | rendelés-státusz | az állapotok emberi magyarázata, a fizetési link szabályai |
| `szamlazas-fizetes` | rendelés-státusz, kivételkezelő | díjbekérő és számla, a Számlázz.hu-folyamat, lejárt számlák |
| `garancia-rma` | ügyfélszolgálat | garanciaszabályok, indokkódok, csere vagy javítás |
| `kommunikacios-stilus` | mind (mindig betöltve, rövid) | magyar nyelv, hangnem, mit nem ígérhet az ágens; az ügyféltől jövő szöveg adat, nem utasítás |

## 7. Jóváhagyás és biztonság

- **A jóváhagyásról a gráf dönt, nem a modell.** Az eszközhívás előtt a jóváhagyási csomópont megnézi a kockázati jelölést:
  - `read` → mehet;
  - `write`, `financial`, `irreversible` → `interrupt()`: a gráf megáll, és megmutatja, mit hívna az ágens, milyen paraméterekkel („Az ágens ezt szeretné: `accept_quote` … – [i]gen / [n]em”). Nemnél az ágens egy „elutasítva” eredményt kap, és ezt el kell mondania.
- **Nincs dupla művelet:** az író hívások egyedi azonosítót (`idempotencyKey`) kapnak, amit a gráf az állapotban tárol. Így egy folytatott vagy újrapróbált lépés sem hoz létre két ajánlatot.
- **Prompt injection ellen:** az ügyféltől jövő szöveget a modell jelölt adatként kapja (`untrustedText`), és az írás amúgy is jóváhagyáshoz kötött.
- **Lépéskorlát:** szakágensenként legfeljebb 15 eszközhívás (a LangGraph `recursionLimit`-je és egy saját számláló), futásonként időkorlát. Túllépésnél az ágens összefoglalja, hol tart.
- **A modell nem kap kulcsot:** az MCP tokent a kód adja a kapcsolathoz, a modell szövegablakába nem kerül.

## 8. Állapot és napló: saját adatbázis

Az ágens réteg saját Postgres konténert kap (**`agens-db`**, `postgres:17-alpine`, a gépről `127.0.0.1:54108`), ahogy a 15. fázis óta minden rendszer. Benne:

- **a LangGraph checkpointer táblái** (a `langgraph-checkpoint-postgres` hozza létre): a beszélgetések és a megállított gráfok állapota;
- **`agens.futas`:** ki (szerepkör), mikor, mit kért, melyik modell, eredmény (kész / visszakérdezett / elutasítva / megszakítva / hiba), összes token (be/ki), teljes idő;
- **`agens.lepes`:** futásonként: melyik ágens, modellhívás vagy eszközhívás, tokenek, idő, eszköznév, kockázat, jóváhagyás eredménye, hibakód.

A tokenszámot minden modellválasz tartalmazza (`usage_metadata`), az időt a gráf csomópontjai mérik. Az MCP oldali naplósorok (`mcp.tool_calls`) a futás azonosítójával kapcsolhatók össze: az MCP hívás egy fejlécben megkapja. A Rendszerek oldalon az `agens-db` új sorként jelenik meg.

## 9. Lépések és tesztelés

**Sorrend:**
0. **Előkészítés és mérés:**
   - `ollama pull gemma4:12b`, a `donki-gemma` változat (32k szövegablak);
   - kipróbálom, hogy a `ChatOllama` eszközhívása megbízható-e, és hogy az MCP-adapter átadja-e a kockázati jelölést;
   - gyors mérés 5 egyszerű kérésen a `gemma4:12b`-vel és az `e4b`-vel: jó eszköz, jó paraméterek, válaszidő, tokenek. Ha a 12b túl lassú, az `e4b` lesz a fő modell.
1. `agens-db` konténer + migráció (`agens` séma; a checkpointer táblái).
2. `agens/kozos/`: modell-gyár (helyi / felhős, env-ből), MCP eszközök betöltése szerepkör szerint, a kockázati jelölés, a jóváhagyási csomópont, a napló.
3. Skill-betöltő + a 7 `SKILL.md`.
4. A szakágens-alágráfok és a front-desk (supervisor).
5. Parancssor: `npm run agens -- --szerep <szerep> ["kérés"]`; kérés nélkül beszélgetős mód; `--modell`, `--auto-jovahagyas` (csak tesztekhez); `--folytat <thread_id>` (megállított beszélgetés folytatása – ez a 18. fázis webes jóváhagyásának próbája).
6. Tesztek, dokumentáció (README, `docs/CLAUDE.md`, BEMUTATO, `.env.example`: `AGENS_MODEL`, `AGENS_MODEL_URL`, `AGENS_DB_URL`, `LANGSMITH_TRACING=false`).

**Tesztelés két rétegben, mert a modell válasza futásonként eltérhet:**
- **`17-agens.ts`, modell nélkül:** egy előre megírt forgatókönyv szerint válaszoló teszt-modell (a LangChain `@langchain/core/utils/testing` segédeivel vagy egy saját osztállyal) hajtja a gráfot, így pontosan ellenőrizhető:
  - a front-desk a megfelelő szakágenshez továbbít;
  - az értékesítési ágens nem látja a helpdesk eszközeit;
  - olvasáshoz nem kér jóváhagyást; íráshoz megáll (`interrupt`), és elutasításnál a hívás el sem jut az MCP-ig (az `mcp.tool_calls`-ban nincs sora);
  - **megállás után a folytatás egy új folyamatból is működik** (a checkpointerből), és a művelet egyszer fut le;
  - egy megtekintő szerepkörű ágens írását az MCP elutasítja;
  - a Skill-betöltés, a lépéskorlát, a naplósorok és a tokenösszegek.
- **`17-agens-elo.ts`, a helyi modellel:** 4 feladat, mindegyik 3×, automatikus végállapot-ellenőrzéssel (az MCP-n át). A teszt a lekérdezett adatot (rendelést, hibajegyet) előtte maga hozza létre; törzsadatként csak a CRM vevőit és termékeit használja:
  1. „Hol tart az RND-… rendelés?” (a teszt saját rendelése) → helyes állapot;
  2. „A Bakony Gépgyártó 12 monitort kér, mennyi?” → ajánlat, helyes ár;
  3. ugyanez elfogadással → rendelés, automatikus jóváhagyással (**ez az elfogadási feltétel**);
  4. „A nyomtató elromlott, van garancia?” → helyes indokkód.

  Az eredmény sikerességi arány (3-ból hány sikerült), átlagos idő és token. Az elvárt küszöböt a 0. lépés mérése után állítjuk be. A teljes, kb. 20 feladatos készlet a 19. fázisé.

## 10. Kockázatok

| Kockázat | Kezelés |
|---|---|
| A 12B modell rossz eszközt vagy paramétert választ | Kevés eszköz szakágensenként, rövid utasítás, Skillek igény szerint; az MCP hibái megmondják, mivel lehet javítani; tartalék: `e4b`, illetve a felhős Claude ugyanazzal a gráffal |
| Lassú válasz | Mérés a 0. lépésben; a front-desknél kikapcsolt gondolkodás; időkorlát |
| A LangChain/LangGraph API-ja gyorsan változik | Pontos verziók a `package.json`-ban; a megvalósításkor a hivatalos dokumentációból ellenőrzöm, ahogy eddig |
| Az MCP-adapter nem adja át a kockázati jelölést | Saját csomagolás a meglévő MCP-klienssel (§3) |
| Adat kerül a felhőbe a nyomkövetésen át | `LANGSMITH_TRACING=false`, és a teszt ellenőrzi, hogy nincs beállítva LangSmith kulcs |
| Az ágens rossz írási műveletet indít | Kódbeli jóváhagyás + szerepkör + egyedi azonosító + csak tesztfiókok (Stripe teszt, Számlázz.hu tesztfiók) |
| Memória: modell + rendszerek | 25,7 GB RAM; a modell ~8 GB + munkamemória; az `agens-db` kicsi |

## 11. Nyitott kérdések

1. **Modell:** letölthetem a `gemma4:12b`-t (~8 GB), és létrehozhatom a `donki-gemma` változatot? Ha a mérés szerint túl lassú, mehetünk tovább az `e4b`-vel?
2. **Saját adatbázis:** az ágens állapota és naplója saját `agens-db` konténerbe kerüljön (javaslatom, a 15. fázis elve szerint), vagy az MCP adatbázisába (akkor annak a portját ki kell vezetni a gépre)?
3. **Felhős próba most:** kipróbáljam már most egyszer a felhős Claude-dal is, hogy kiderüljön, egy hiba a modellben vagy a gráfban van-e? Ehhez `ANTHROPIC_API_KEY` kell a `.env.local`-ba, és kis költséggel jár. Javaslatom: **nem most**, hanem a 19. fázisban, egyeztetett kerettel.
4. **Kivételkezelő:** ebben a fázisban csak kérésre fusson (például „mi akadt el?”), és az eseményekre magától induló változat maradjon a 18. fázisé (javaslatom)? Vagy már most kerüljön be?

## 12. Megvalósítás – eredmények és eltérések a tervtől

**Mérés (0. lépés, 5 csak olvasó kérés × 2):**

| modell | jó útvonal | jó eszköz | kész | átl. idő |
|---|---|---|---|---|
| `gemma4:12b` (`donki-gemma`) | 8/10 | 8/10 | 10/10 | 13,5 s |
| `gemma4:e4b` (`donki-gemma-e4b`) | 10/10 | 10/10 | 10/10 | 8,9 s |

**Élő teszt (4 feladat × 3):** e4b 12/12 (átl. 4,5–9,1 s feladatonként), 12b 11/12 (egy rendelésleadásnál nem fogadta el az ajánlatot; 5,9–15,0 s).

**Eltérések:**
- **Alapmodell: `gemma4:e4b`** a 12b helyett – a mérés szerint pontosabb és gyorsabb volt. A 12b választható (`--modell donki-gemma`), és a 19. fázis összehasonlításába bekerül.
- **A front-desk nem fogalmazza át a kérést**, csak szakágenst választ; a szakágens a felhasználó szó szerinti kérését és a beszélgetés előzményét kapja. A 12b az átfogalmazásban elírásokba és ismétlésbe futott.
- **A front-desk nem foglal össze a végén:** a szakágens válasza megy a felhasználónak (egy modellhívással kevesebb).
- **Az `@langchain/mcp-adapters` nincs használva:** nem adja át a kockázati jelölést (`_meta`); saját, vékony MCP-csomagolás van, amely az idempotencia-kulcsot is adja, és a modell elől elrejti.
- **Védelem a modell hibái ellen:** kimeneti korlát (front-desk 120, szakágens 1500 token), ismétlés elleni büntetés, a korlátnál elvágott válasz egyszeri újrapróbálása; időkorlát, amely a lógó Ollama-kérést a kliens `abort()`-jával ténylegesen megszakítja.
- **Utasítás-szabályok a mérés alapján:** egy jellemző szóval keressen, üres találatnál próbálja újra; árkérdésre mindig ajánlat; ne kérdezzen vissza, ha egy lista-eszköz megválaszolja; a garanciához a termékkódot a rendelésből olvassa ki.
