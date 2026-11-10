# Riportok

A dolgozat mérési és elemző riportjai, témánként. A számokat tartalmazó riportok a mérés adatbázisából (`ertekeles.futas`, agens-db) **generálódnak**: kézzel ne szerkeszd őket, hanem futtasd újra a generáló parancsot (`docs/CLAUDE.md`).

| Mappa | Tartalom | Állapot |
|---|---|---|
| [01-meres/](01-meres/) | A saját mérés: nyers legacy interfész vs. MCP, két helyi modellel | kész |
| | [ertekeles-2026-11-07-javitott.md](01-meres/ertekeles-2026-11-07-javitott.md): **az aktuális eredmény** (a javítás után, előtte–utána összevetéssel, kontrollfeladatokkal) | |
| | [javitasok.md](01-meres/javitasok.md): mit javítottunk a 11-03-i mérés után, miért, és miért nem torzít | |
| | [ertekeles-2026-11-03.md](01-meres/ertekeles-2026-11-03.md): az első mérés (a javítás előtt) | |
| | `adatok/*.csv`: a nyers adat futásonként, a dolgozat ábráihoz | |
| [02-szakirodalom/](02-szakirodalom/) | [gartner-forrasok.md](02-szakirodalom/gartner-forrasok.md): Gartner-források (felmérés / előrejelzés / benchmark), és hogy melyik szám mire megy | kész |
| [03-emberi-tenyezo/](03-emberi-tenyezo/) | [emberi-ido-pontositas.md](03-emberi-tenyezo/emberi-ido-pontositas.md): az emberi idő becslése szakirodalmi forrásokból (KLM), feladatonként és munkakörszinten | részben kész |
| [04-penzugy/](04-penzugy/) | [penzugyi-elemzes.md](04-penzugy/penzugyi-elemzes.md): pénzügyi terv szerverrel, setup díjjal és felhasználószám szerinti havidíjjal; a vevő és az eladó oldala, TCO, ROI, megtérülés, fedezeti pont, érzékenység (KSH-bérekkel); generált | kész |
| | [feltevesek.md](04-penzugy/feltevesek.md): minden feltevés forrással; a szerkeszthető bemenet a [feltevesek.json](04-penzugy/feltevesek.json) | |
| [05-osszehasonlitasok/](05-osszehasonlitasok/) | [02-hibak-ember-es-agens.md](05-osszehasonlitasok/02-hibak-ember-es-agens.md): emberi és ágens-hibaarány | részben kész |
| | [03-figyelo-haszna.md](05-osszehasonlitasok/03-figyelo-haszna.md): a háttérfigyelő észlelési ideje és téves riasztásai | |
| | [09-valtozastures.md](05-osszehasonlitasok/09-valtozastures.md): legacy interfész változása, MCP és nyers ágens | |
| | [10-adatkimenet.md](05-osszehasonlitasok/10-adatkimenet.md): mi hagyja el a gépet működés közben | |
| | [11-tokenomics.md](05-osszehasonlitasok/11-tokenomics.md): token-költség és válaszidő a végrehajtási ciklusok mentén, három optimalizáció mérése | |
| | A többi összevetés ([FAZIS20_TERV.md](../docs/FAZIS20_TERV.md) §7, §9) | következik |

**Módszertan és terv:** [FAZIS19_TERV.md](../docs/FAZIS19_TERV.md) (a mérés), [FAZIS20_TERV.md](../docs/FAZIS20_TERV.md) (a javítási ciklus és a riportok).
