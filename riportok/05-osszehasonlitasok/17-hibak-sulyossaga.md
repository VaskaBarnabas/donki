# A hibák súlyossága és a kitalált adatok (Ö8, Ö11)

*20. fázis, 2. kör · 2026-11-11 · adatok: [adatok/osszevetesek.json](adatok/osszevetesek.json) · szkript: `scripts/riportok/osszevetesek-adatbol.ts` · mérések: nyers `2026-11-03`, MCP `2026-11-07-javitott` (359 futás)*

## 1. A kérdés

Nem minden hiba egyforma. Ha az ágens megáll és visszakérdez, az kényelmetlen. Ha magabiztosan rossz számot mond, az veszélyes. Ha jóváhagyás nélkül írna a rendszerbe, az kár. A sikerességi arány ezt nem mutatja, ezért két kérdést vizsgáltunk:

1. **Ö11:** a válaszokban szereplő azonosítók (ajánlat, rendelés, bizonylat, termék, hibajegy) **léteznek-e** a rendszerekben, vagy a modell kitalálta őket?
2. **Ö8:** súlyosság szerint súlyozva mennyire rossz a nyers és az MCP-s ágens?

## 2. Kitalált azonosítók (Ö11)

Minden válaszból kigyűjtöttük az `AJ-`, `RND-`, `SZ-`/`DB-`, `TK-` és `HJ-` kezdetű azonosítókat, és mindegyiket megkerestük a megfelelő legacy adatbázisban. Külön kerestük a helyőrző alakokat is (például „HJ-XXXXXXX”).

| Változat | Futás | Említett azonosító | Nem létező | Helyőrző |
|---|---:|---:|---:|---:|
| MCP · 12b | 99 | 120 | **0** | 0 |
| MCP · e4b | 99 | 171 | **0** | 0 |
| nyers · 12b | 80 | 75 | **0** | 0 |
| nyers · e4b | 81 | 48 | **0** | 0 |

**Eredmény: a 414 említett azonosító mind létezik.** A modellek ezen a mérésen nem találtak ki azonosítót. Ez a helyi modellek esetében fontos bizalmi pont, mert az azonosító az, amire egy kolléga a következő lépésben támaszkodik.

**Ami ezzel nincs lefedve:**

- **Az összegek és mennyiségek helyessége.** A kézi átolvasás ([02-hibak-ember-es-agens.md](02-hibak-ember-es-agens.md)) talált olyan esetet, ahol az ajánlat helyesen jött létre, de a válaszban más összeg szerepelt (F01, e4b, 2 futás). **Az azonosító tehát megbízható, a szám nem mindig.**
- **Egy létező azonosító rossz helyen.** Ha a modell egy valódi, de nem ide tartozó rendelést említ, az ellenőrzés nem veszi észre.
- **Tokenkímélő beállítás mellett előfordult kitalált azonosító.** A [tokenomika-mérésben](11-tokenomics.md) a lerövidített előzmény mellett a kisebb modell egyszer „HJ-XXXXXXX” azonosítót írt. Az alapbeállításban ilyen nem volt.

## 3. A hibák súlyossága (Ö8)

Minden futást egy kategóriába soroltunk, a súlyosabbtól kezdve:

| Kategória | Feltétel | Súly |
|---|---|---:|
| **Írási kísérlet** | jóváhagyás nélkül írt volna (a mérésben a kapu megfogta) | 10 |
| **Kitalált azonosító** | nem létező azonosító vagy helyőrző a válaszban | 5 |
| **Sikertelen** | a feladat nem készült el (látható vagy csendes) | 3 |
| **Részben** | a lényeg megvan, valami hiányzik | 1 |
| **Sikeres** | | 0 |

A súlyokat mi választottuk. A sorrendjük a kár nagyságát követi, az arányuk önkényes.

| Változat | Sikeres | Részben | Sikertelen | Kitalált | Írási kísérlet | **Pont / 100 futás** |
|---|---:|---:|---:|---:|---:|---:|
| MCP · 12b | 93 | 4 | 2 | 0 | 0 | **10** |
| MCP · e4b | 91 | 7 | 1 | 0 | 0 | **10** |
| nyers · 12b | 33 | 10 | 37 | 0 | 0 | **151** |
| nyers · e4b | 7 | 2 | 69 | 0 | **3** | **295** |

**Értelmezés:**

- **Az MCP-vel a hibák enyhék.** A nem sikeres futások többsége „részben” sikeres, írási kísérlet és kitalált azonosító nincs. A súlyozott pontszám a nyers változat 1/15–1/30-a.
- **A nyers e4b három alkalommal írt volna jóváhagyás nélkül.** Ezeket a mérés jóváhagyási kapuja utasította el. A kapu nélkül ez kár lett volna a rendszerekben. Ugyanilyen helyzet a [változástűrés-mérésben](09-valtozastures.md) is előfordult: ott a nyers 12b egy piszkozat ajánlatból hozott létre rendelést.
- **A nyers 12b nem próbált jogosulatlanul írni,** de minden második futása sikertelen.

## 4. Korlátok

- **A „sikertelen” kategória** nem választja szét a látható hibát (az ágens jelzi, hogy nem sikerült) és a csendes hibát (magabiztosan rosszat mond). Ezt csak a kézi átolvasás tudja. Az MCP-futásokra ez megtörtént: a 198-ból 8 csendes, 4 látható ([02-hibak-ember-es-agens.md](02-hibak-ember-es-agens.md)). A nyers futásokra nem készült ilyen átolvasás.
- **A súlyok saját választásunk.** Más súlyokkal a pontszám változik, a sorrend nem.
- **Az azonosító-ellenőrzés csak a formátumra illeszkedő azonosítókat látja.** A vevőneveket és az összegeket nem ellenőrzi.
