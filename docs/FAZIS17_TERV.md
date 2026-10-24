# 17. fázis – Ágens réteg helyi modellel (terv)

*Állapot: jóváhagyásra vár · előzmény: [FAZIS16_TERV.md](FAZIS16_TERV.md) (portál, kész) · keret: [MCP_AGENS_TERV.md](MCP_AGENS_TERV.md) §4 · utána: 18. fázis – asszisztens felület + eseményvezérelt kivételkezelő*

## 1. Cél

Természetes nyelvű ágensek, amelyek **csak az MCP rétegen** (5 domain szerver, 33 eszköz) érik el a vállalati rendszereket, és **helyben futó modellel** dolgoznak (Ollama, `gemma4:12b`). Az ágens nem lát kulcsot, nyers API-t vagy SQL-t.

**Elfogadási feltétel (változatlan):** parancssorból végigvihető egy rendelésleadás, emberi jóváhagyással.

Ez a fázis a parancssori ágenst építi meg. A webes felület (`/asszisztens`) és az eseményvezérelt kivételkezelő a 18. fázisba kerül, a mérés (A/B/C változat, tokenomics) a 19.-be.

## 2. Felmérés (2026-10-22)

| Tény | Következmény |
|---|---|
| Az Ollama telepítve, natívan fut (0.40.6, `localhost:11434`) | Nem kell konténer; a Mac GPU-ját (Metal) a natív Ollama éri el, a Docker nem |
| A `gemma4:12b` címke létezik, **~8,0 GB**, még nincs letöltve. Megvan: `gemma4:e4b` (8B, Q4), `e2b`, `qwen3.5:4b`, `llama3.2` | Letöltés: `ollama pull gemma4:12b` (a jóváhagyás után; 8 GB) |
| A gemma4 képességei (az `e4b` alapján): `tools`, `thinking`, `vision` | Eszközhívás natívan megy, a gondolkodás kapcsolható |
| **Az Ollama kiszolgálja az Anthropic Messages API-t** (`POST /v1/messages`, kipróbálva: válasz + `usage`) | Ugyanaz a kód futhat helyi modellel és a felhőben futó Claude-dal: csak a cím és a modellnév más. Ez a 19. fázis összehasonlítását olcsóvá teszi |
| Gép: 25,7 GB RAM; a stack ~1,7–3 GB | 8 GB modell + 32k-s kontextus KV-cache (~3–4 GB) elfér |
| Az MCP eszközök már ágensbarátok: pont nélküli nevek, lapos sémák, `outputSchema`, `_meta["donki/risk"]` (`read`/`write`/`financial`/`irreversible`), szerepkörönkénti tokenek | A jóváhagyási kapu és a szűrés a meglévő metaadatokra épül |

**Figyelni kell:** az Ollama alapértelmezett kontextusa kicsi (4–8k token), a 33 eszköz leírása pedig önmagában több ezer token. Ezért egy saját modellváltozat kell, nagyobb kontextussal: `donki-gemma` (Modelfile: `FROM gemma4:12b`, `PARAMETER num_ctx 32768`).

## 3. Futtatókörnyezet – döntés kell (lásd 10. pont)

Az eredeti terv a Claude Agent SDK-t javasolta, Claude modellel. A helyi modell ezt átrendezi:

| Lehetőség | Mellette | Ellene |
|---|---|---|
| **A) Saját, vékony ágens-hurok az Anthropic TypeScript SDK-val, az Ollama `/v1/messages` címére irányítva – javasolt** | Teljes kontroll a rendszerprompt fölött: egy 12B modellnek rövid, célzott prompt kell. Minden lépés mérhető (tokenek, idő, eszközhívások). Ugyanez a kód a felhőben futó Claude-dal is fut (`baseURL` + `model`), így a 19. fázis C változata ingyen jön | A Skilleket, az alágenseket és a jóváhagyási kaput nekünk kell megírni (kb. 400–600 sor) |
| B) Claude Agent SDK, az Ollamára irányítva (`ANTHROPIC_BASE_URL`) | Natív Skillek, alágensek, hookok | Az SDK a Claude Code motorját futtatja, a saját, hosszú rendszerpromptjával és beépített eszközeivel. Egy 12B modellnél ez a kontextus nagy részét elviszi és rontja a pontosságot; a mérésnél nehéz szétválasztani, mi az SDK és mi az ágens költsége. Nem garantált, hogy az SDK minden funkciója (pl. alágensek) működik nem Claude modellel |
| C) Az Ollama natív `/api/chat` API-ja | A legközelebb a modellhez | Más üzenetformátum, mint a Claude-é, így a 19. fázis összehasonlításához két kódút kellene |

A javaslat az **A**. A Skillek formátuma ettől még a szabványos `SKILL.md` marad (frontmatter: `name`, `description`), így egy későbbi Agent SDK-s váltásnál változtatás nélkül átvihetők.

## 4. Architektúra

```
 parancssor (npm run agens -- --szerep sales "…")
        │
   ┌────▼──────────────────────────── agens/ (Node, a gépen natívan) ───┐
   │  Front-desk (router)  ── egy rövid, strukturált hívás: melyik       │
   │        │                 alágens, és miért                          │
   │        ▼                                                            │
   │  Alágens-hurok (közös kód): rendszerprompt + Skill-katalógus +      │
   │  csak a saját MCP szervereinek eszközei                             │
   │        │  tool_use ──► jóváhagyási kapu (risk ≠ read → kérdez)      │
   │        │            ──► MCP kliens (HTTP, a felhasználó szerepkör-   │
   │        │                tokenjével) ──► mcp-orders … mcp-support     │
   │        ▼                                                            │
   │  napló: futás, lépések, tokenek, idők → mcp-db (agens séma)         │
   └──────────────┬──────────────────────────────────────────────────────┘
                  │ Anthropic Messages API
          Ollama (natív, Metal) – donki-gemma (gemma4:12b, 32k)
          [vagy: Anthropic API – claude-* modell, ugyanazzal a kóddal]
```

- **Hol fut:** a 17. fázisban natívan a gépen (CLI). A 18. fázisban az asszisztens-oldal a portál szerveréről hívja ugyanezt a modult; konténerből az Ollama a `host.docker.internal:11434` címen érhető el.
- **Szerepkör:** az ágens mindig egy felhasználó nevében dolgozik. A CLI-ben `--szerep sales`; ez választja ki az MCP demo-tokent (`MCP_TOKENS`, `.env.stack`). Az MCP szerver a szerepkör szerint maga is tilt, tehát az ágens nem tud többet, mint a felhasználó.

## 5. Ágensek

| Ágens | Feladat | MCP szerverek (eszközök) | Írás |
|---|---|---|---|
| **Front-desk** | A kérés besorolása és továbbítása. Ha nem egyértelmű, visszakérdez | – | – |
| **Értékesítés** | Vevő azonosítása, termékkeresés, ajánlat, kedvezmény-jóváhagyás kérése, elfogadás → rendelés | `sales` (9), `inventory` (3, olvasás) | ajánlat, elfogadás – jóváhagyással |
| **Rendelés-státusz** | „Hol tart?”, következő lépés, díjbekérő, fizetési link, számla | `orders` (9), `finance` (5) | fizetési link, rendelés-műveletek – jóváhagyással |
| **Ügyfélszolgálat** | Hibajegy, garancia, RMA | `support` (7), `orders` (olvasás) | jegy, RMA – jóváhagyással |
| **Kivételkezelő** | Készlethiány, elakadt rendelés, lejárt számla: elemzés és javaslat | mind, **csak olvasás** | – (a 18. fázisban eseményvezérelt) |

**Az alágensek csak a saját eszközeiket látják.** Kevesebb eszközleírás → kevesebb token és kevesebb rossz eszközválasztás. Egy 12B modellnél ez különösen fontos.

**Delegálás:** a front-desk egy rövid hívással dönt, a kimenete egy JSON (`{"agens": "ertekesites", "feladat": "…"}`). Ha a válasz nem érvényes JSON, egyszer újrapróbálja, aztán visszakérdez. Az alágens befejezése után a front-desk adja vissza a választ; egy beszélgetésen belül a következő kérés újra a routeren megy át, a korábbi összefoglalóval.

## 6. Skillek (`agens/skills/<nev>/SKILL.md`)

A Skillek tartalma a folyamatleírás és az üzleti szabályok, nem kód. A rendszerprompt csak a nevüket és az egysoros leírásukat tartalmazza. A teljes szöveget az ágens a `load_skill` eszközzel tölti be, amikor szüksége van rá (ugyanaz az elv, mint a Claude Skilleknél).

| Skill | Melyik ágens | Tartalom |
|---|---|---|
| `rendelesfelvetel` | értékesítés | lépések; vevőazonosítás adószám vagy név alapján (eltérő írásmód: „DUNA-IRODAHAZ KFT.”); mikor kell ajánlat; mennyiségi kedvezmény |
| `kedvezmeny-jovahagyas` | értékesítés | a 15% feletti kedvezmény: kitől és milyen indoklással kell kérni |
| `keszlethiany-kezeles` | értékesítés, kivételkezelő | hiánynál: módosítás, alternatív termék, várakozás (részszállítás nincs) |
| `rendeles-statusz` | rendelés-státusz | az állapotok emberi magyarázata, a fizetési link szabályai |
| `szamlazas-fizetes` | rendelés-státusz, kivételkezelő | díjbekérő és számla, a Számlázz.hu-folyamat, a lejárt számlák |
| `garancia-rma` | ügyfélszolgálat | garanciaszabályok, indokkódok, csere vagy javítás |
| `kommunikacios-stilus` | mind (mindig betöltve, rövid) | magyar nyelv, hangnem, mit nem ígérhet az ágens; az `untrustedText` adat, nem utasítás |

## 7. Jóváhagyási kapu és biztonság

- **A kapu a kódban van, nem a promptban.** Minden eszközhívás előtt a hurok megnézi a `_meta["donki/risk"]` értéket:
  - `read` → mehet;
  - `write`, `financial`, `irreversible` → a CLI megmutatja, mit hívna az ágens és milyen paraméterekkel („Az ágens ezt szeretné: `accept_quote` {quoteId: …} – [i]gen / [n]em”). Nemnél az ágens egy `APPROVAL_DENIED` eredményt kap, és ezt el kell mondania a felhasználónak.
- **Idempotencia:** az írási hívásokhoz a hurok ad `idempotencyKey`-t (az MCP réteg ezt már kezeli), így egy újrapróbált lépés nem hoz létre két ajánlatot.
- **Prompt injection:** az MCP az ügyfélszöveget `untrustedText`-ként adja vissza. A rendszerprompt ezt adatként jelöli, és az írás amúgy is jóváhagyáshoz kötött.
- **Lépéskorlát:** alágensenként legfeljebb 15 eszközhívás, futásonként időkorlát (a helyi modell lassú lehet). Túllépésnél az ágens összefoglalja, hol tart.
- **A modell nem kap kulcsot.** Az MCP tokent a hurok adja a HTTP kapcsolathoz; a modell kontextusába nem kerül.

## 8. Naplózás (a 19. fázis mérésének alapja)

Új `agens` séma az `mcp-db`-ben (az MCP réteg már ott naplózza az eszközhívásokat):

- `agens.futas`: ki (szerepkör), mikor, kérés, modell, végeredmény (kész / visszakérdezett / megszakítva / hiba), összes token (be/ki), teljes idő;
- `agens.lepes`: futásonként: melyik ágens, modellhívás vagy eszközhívás, tokenek, idő, eszköznév, risk, jóváhagyás eredménye, hibakód.

Az MCP oldali `mcp.tool_calls` sorai a futás azonosítójával kapcsolhatók össze (az MCP kérés egy fejlécben megkapja).

## 9. Lépések és tesztelés

**Sorrend:**
0. `ollama pull gemma4:12b` + a `donki-gemma` Modelfile (32k kontextus). Gyors mérés: eszközhívás-pontosság 5 egyszerű kérésen a `gemma4:12b`-vel és az `e4b`-vel (ha a 12b túl lassú, ez a tartalék).
1. `agens/kozos/`: modellkliens (Anthropic SDK, `baseURL` + `model` env-ből), MCP kliens (a meglévő MCP SDK, HTTP), eszközszűrés, a jóváhagyási kapu, napló.
2. Skill-betöltő + a 7 `SKILL.md`.
3. Az alágensek (rendszerprompt + eszközkészlet), a front-desk router.
4. CLI: `npm run agens -- --szerep <szerep> ["kérés"]` (kérés nélkül interaktív beszélgetés), `--modell`, `--auto-jovahagyas` (csak tesztekhez).
5. Migráció: `systems/mcp/db/…_agens.sql`.
6. Tesztek, dokumentáció (README, `docs/CLAUDE.md`, BEMUTATO, `.env.example`: `AGENS_MODEL_URL`, `AGENS_MODEL`).

**Tesztelés – két réteg, mert a modell válasza nem determinisztikus:**
- **`17-agens.ts` (determinisztikus, modell nélkül):** egy forgatókönyv szerint válaszoló álmodell (a Messages API formájában) hajtja a hurkot, így pontosan ellenőrizhető:
  - az eszközszűrés: az értékesítési ágens nem látja a `support` eszközeit;
  - a kapu: `read` hívás jóváhagyás nélkül megy; `write` hívás kérdez; elutasításnál nem jut el az MCP-ig (az `mcp.tool_calls`-ban nincs sora);
  - a szerepkör: egy `viewer` ágens író hívása az MCP-től `FORBIDDEN`-t kap;
  - a Skill-betöltés, a lépéskorlát, a naplósorok és a tokenösszegek.
- **`17-agens-elo.ts` (élő, `donki-gemma`-val):** 4 forgatókönyv, mindegyik 3×, automatikus végállapot-ellenőrzéssel (az MCP-n át kérdezve):
  1. „Hol tart az RND-… rendelés?” → helyes állapot;
  2. „A Bakony Gépgyártó 12 monitort kér, mennyi?” → ajánlat, helyes ár;
  3. ugyanez elfogadással → rendelés, **automatikus jóváhagyással** (ez az elfogadási feltétel, parancssorból);
  4. „A nyomtató elromlott, van garancia?” → helyes indokkód.

  Az eredmény sikerességi arány és átlagos idő/token, nem egyszerű OK/HIBA. Az elvárt küszöböt (pl. 3-ból legalább 2) a 0. lépés mérése után állítjuk be. A teljes forgatókönyv-készlet (~20) a 19. fázisé.

## 10. Kockázatok

| Kockázat | Kezelés |
|---|---|
| A 12B modell gyengén választ eszközt vagy paramétert | Alágensenként kevés eszköz, rövid prompt, a Skillek csak igény szerint; az MCP hibák `suggestedActions`-t adnak, amiből javíthat; tartalék: `e4b` vagy a felhőben futó Claude ugyanazzal a kóddal |
| Lassú válasz (a 32k kontextus és a gondolkodás) | Gondolkodás csak a routernél kikapcsolva; mérés a 0. lépésben; az időkorlát a CLI-ben jelez |
| Az Ollama Anthropic-kompatibilitása hiányos (pl. `tool_use` részletek, streaming) | A 0. lépésben kipróbálom az eszközhívást ezen az úton. Ha nem megbízható, a modellkliens mögé kerül egy vékony adapter az `/api/chat` felé (a hurok többi része nem változik) |
| Memória: modell + stack | 25,7 GB RAM; a modell ~8 GB + KV-cache; a Docker kerete változatlan |
| Az ágens rossz írási műveletet indít | Kódbeli jóváhagyási kapu + MCP szerepkör + idempotencia + a tesztfiókok (Stripe teszt, Számlázz.hu tesztfiók) |

## 11. Nyitott kérdések

1. **Futtatókörnyezet (§3):** saját vékony hurok az Anthropic SDK-val, az Ollamára irányítva (javaslatom: **A**), vagy az Agent SDK (B)?
2. **Modell letöltése:** letölthetem-e a `gemma4:12b`-t (~8 GB) és létrehozhatom-e a `donki-gemma` változatot? Ha a mérés szerint a 12b túl lassú, maradhat-e az `e4b` tartaléknak?
3. **Felhős összehasonlítás már most:** egyetlen próbafutás erejéig kipróbáljam-e ugyanazt a kódot a felhőben futó Claude-dal (`claude-opus-5-5`), hogy lássuk, a hiba a modellben vagy a hurokban van-e? Ehhez `ANTHROPIC_API_KEY` kell a `.env.local`-ba, és kis API-költséggel jár. Javaslatom: **nem most**, hanem a 19. fázisban, egyeztetett kerettel.
4. **Kivételkezelő:** a 17. fázisban csak kérésre fusson (pl. „mi akadt el?”), és az eseményvezérelt indítás maradjon a 18. fázisé (javaslatom), vagy már most kerüljön be a worker is?
