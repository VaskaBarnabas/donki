# Integrációs költség: MCP-réteg vagy pont-pont bekötés?

*2026-11-11 · adatok: [adatok/osszevetesek.json](adatok/osszevetesek.json) (`o6`) · szkript: `scripts/riportok/osszevetesek-adatbol.ts` · a kódsorok megjegyzés és üres sor nélkül*

## 1. A kérdés

Mennyi munka egy legacy rendszert bekötni, és mennyi egy újabb felhasználót (ágens, figyelő, külső csatorna) a rendszerekhez kapcsolni? Két megoldást hasonlítunk össze:

- **pont-pont:** minden felhasználó maga beszél minden rendszerrel, a saját fordításával;
- **MCP-réteg:** rendszerenként egy szerver fordít, és minden felhasználó ugyanazt az egységes felületet használja.

Az órákat nem mértük, a kód méretét igen. Ez gyenge, de ellenőrizhető mérőszám.

## 2. Az MCP-réteg mérete

| MCP-szerver | Rendszer(ek) | Adapter | Leképezés | Eszközök | **Összesen** |
|---|---|---:|---:|---:|---:|
| `sales` | CRM, katalógus, ajánlatkezelő | 55 | 224 | 392 | **671** |
| `orders` | rendeléskezelő, folyamatmotor | 53 | 216 | 350 | **619** |
| `support` | ügyfélszolgálat (SOAP) | 68 | 160 | 274 | **502** |
| `finance` | számlázó, fizetés | 80 | 168 | 223 | **471** |
| `inventory` | raktár (üzenetsor) | 42 | – | 149 | **191** |
| Közös rész (eszközkeret, hibák, idempotencia, napló, kanonikus típusok) | | | | | **533** |
| **Összesen** | | | | | **2 987** |

Összevetésként a nyers ágens eszközei 178 sort tesznek ki, és az ágens oldali MCP-kliens 119 sort. Ez kevés kód, de a nyers változat nem működik (9–41%, lásd [01-meres](../01-meres/ertekeles-2026-11-07-javitott.md)), mert a fordítás munkáját a modellre hagyja.

## 3. Mennyibe kerül egy új felhasználó?

A rendszerekhez négy felhasználó kapcsolódik az MCP-n át:

1. az asszisztens hat szakágense;
2. a háttérfigyelő;
3. a mérőfuttató;
4. a UCP-átjáró, a külső vásárló ágensek kereskedői felülete ([20-ucp.md](20-ucp.md)).

| | Pont-pont | MCP-réteg |
|---|---|---|
| Egy új **felhasználó** bekötése | mind a hét rendszer fordítását újra meg kell írnia: a meglévő adapterek és leképezések alapján **kb. 1100 sor** | csak az MCP-kliens, **kb. 120 sor**, és a jogosultsági szerepkör |
| Egy új **rendszer** bekötése | minden felhasználóban külön, a felhasználók számával szorozva | **egy szerver, 190–670 sor**, utána minden felhasználó eléri |
| Egy **interfészváltozás** javítása | minden felhasználóban | **egy helyen 1–3 sor** (a [változástűrés-mérés](09-valtozastures.md) szerint) |
| Jogosultság, naplózás, idempotencia | minden felhasználóban külön | egyszer, a közös részben (533 sor) |

**A fordulópont:** a közös rész egyszeri költség. A pont-pont megoldás már a második felhasználónál megismétli a fordítást, és a hiba vagy változás minden példányban külön javítandó. A mi négy felhasználónkkal a pont-pont fordítás kb. négyszer annyi kód lenne, mint az adapterek és leképezések ma.

## 4. Amit a mérések ehhez hozzátesznek

- **Változás:** a három szimulált interfészváltozást egy helyen, 1–3 sorral javítottuk, és a javítás minden felhasználóra azonnal érvényes lett ([09-valtozastures.md](09-valtozastures.md)).
- **Új csatorna:** a UCP-átjáró ugyanerre az MCP-rétegre ül. 809 sor (Express-szerver, a checkout logikája, aláírás, tároló, webhook-kézbesítés), és egyetlen sor legacy-kódot sem kellett hozzá módosítani. Az MCP-oldalon egy új, szűk szerepkör kellett (olvasás, ajánlat, elfogadás). Ez az állítás gyakorlati próbája.
- **Biztonság:** az MCP-rétegen egyszer megírt jogosultsági szabály (például a jóváhagyás nélküli írás tiltása, a szerepkörök) minden felhasználóra érvényes. A nyers ágensnél ezt az ágensre kellett bízni ([17-hibak-sulyossaga.md](17-hibak-sulyossaga.md)).

## 5. Korlátok

- **A kódsor nem óra.** A fejlesztési időt nem mértük, és a prototípust AI-asszisztenssel írtuk, ezért az órák amúgy sem lennének általánosíthatók.
- **A pont-pont becslés feltételezi,** hogy minden felhasználónak ugyanaz a fordítás kell. A valóságban egy felhasználónak lehet, hogy csak néhány rendszer kell.
- **A rendszerek szimuláltak,** a valós legacy rendszerek interfésze bonyolultabb lehet.
