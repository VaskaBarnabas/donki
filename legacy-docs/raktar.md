# RAKTARI RENDSZER – UZENETSOR INTERFESZ

> Muszaki leiras. A raktari rendszernek NINCS HTTP vegpontja. Kivulrol kizarolag uzenetsoron erheto el.

## 1. SOROK

| SOR | IRANY | TARTALOM |
|---|---|---|
| `inventory_commands` | be | parancsok a raktarnak |
| `inventory_replies` | ki | valaszok (a `corr` mezo alapjan parositva) |
| `inventory_alerts` | ki | minimumkeszlet-figyelmeztetesek |

A sorok Supabase Queues (pgmq) sorok.

**ELERES KIVULROL:** a Supabase PostgREST a `pgmq_public` semaban, service role kulccsal:
- kuldes: `POST /rest/v1/rpc/send` (`Content-Profile: pgmq_public`, `{"queue_name","message","sleep_seconds"}`);
- olvasas: `POST /rest/v1/rpc/read` (`{"queue_name","sleep_seconds","n"}`; a `sleep_seconds` itt a lathatosagi ido);
- torles: `POST /rest/v1/rpc/delete` (`{"queue_name","message_id"}`).

## 2. FELDOLGOZAS

- A feldolgozo (worker) 5 masodpercenkent fut, es egyszerre legfeljebb 20 uzenetet olvas, 30 mp lathatosagi idovel.
- **Uzleti hiba** (R-01..R-04): valasz megy, az uzenet torlodik.
- **Hibas uzenet** (pl. `"cikk":"abc"`): NINCS valasz, NINCS torles. 30 mp mulva ujra probalkozik.
- **Harom sikertelen probalkozas utan** (`read_ct > 3`): az uzenet az archivumba kerul (dead letter), es egy `R-99` valasz megy ki.
- Egy valasz atlagosan 5–10 mp alatt erkezik. A hivo `corr` alapjan pollozza a valaszsort, es CSAK A SAJAT valaszat torolheti.

## 3. PARANCSOK

Minden parancsban kotelezo a `cmd` es a `corr` (tetszoleges, egyedi korrelacios azonosito). Mezonevek magyarul.

### FOGLAL

```json
{"cmd":"FOGLAL","corr":"c-8f21","cikk":4711,"db":5,"ref":"RND-100045"}
```

A szabad keszletbol (`keszlet - foglalt`) foglal.

```json
{"corr":"c-8f21","status":"OK","uzenet":"FOGLALVA","foglalas":26,"cikk":4711,"db":5,"szabad":10,"ts":1790941348}
{"corr":"c-8f21","status":"NOK","hibakod":"R-03","uzenet":"NINCS ELEG KESZLET","cikk":4711,"szabad":2,"ts":1790845200}
```

### FELOLD

```json
{"cmd":"FELOLD","corr":"c-9a02","ref":"RND-100045"}
```

A `ref` OSSZES aktiv foglalasat feloldja.

```json
{"corr":"c-9a02","status":"OK","uzenet":"FELOLDVA","ref":"RND-100045","feloldott":2,"db":7,"ts":...}
{"corr":"c-9a02","status":"NOK","hibakod":"R-04","uzenet":"FOGLALAS NEM TALALHATO","ref":"RND-100045","ts":...}
```

### MOZGAS

```json
{"cmd":"MOZGAS","corr":"c-77b1","cikk":4711,"tipus":"KI","db":5,"ref":"RND-100045"}
```

| TIPUS | HATAS |
|---|---|
| `BE` | keszlet + db |
| `KI` | keszlet - db. A `ref`-hez tartozo aktiv foglalas `KIADVA` lesz. Mas foglalasat nem adhatja ki. |
| `VISSZARU` | keszlet + db |
| `KORREKCIO` | keszlet + db (a `db` elojeles lehet) |

```json
{"corr":"c-77b1","status":"OK","uzenet":"MOZGAS ROGZITVE","cikk":4711,"tipus":"KI","keszlet":10,"szabad":10,"ts":...}
```

Ha a keszlet 0 ala menne: `R-03`.

### LEKERDEZ

```json
{"cmd":"LEKERDEZ","corr":"c-1","cikk":4711}
{"cmd":"LEKERDEZ","corr":"c-2","cikkek":[4701,4702,9999]}
```

Egy cikkre:

```json
{"corr":"c-1","status":"OK","cikk":4711,"megnevezes":"...","keszlet":15,"foglalt":0,"szabad":15,"min":8,"ts":...}
```

Tobb cikkre:

```json
{"corr":"c-2","status":"OK","tetelek":[{"cikk":4701,"megnevezes":"...","keszlet":15,"foglalt":0,"szabad":15,"min":5}, ...],"ismeretlen":[9999],"ts":...}
```

Ismeretlen cikkszam egy cikkes lekerdezesnel: `R-01`. Tobb cikkes lekerdezesnel nem hiba, hanem az `ismeretlen` tombben jelenik meg.

### VISSZARU_BE

```json
{"cmd":"VISSZARU_BE","corr":"c-5","cikk":4708,"db":1,"ref":"RMA-2026-0013"}
```

Visszaru bevetelezese (pl. javitasra beerkezett termek).

```json
{"corr":"c-5","status":"OK","uzenet":"VISSZARU BEVETELEZVE","cikk":4708,"keszlet":26,"ts":...}
```

## 4. HIBAKODOK

| KOD | UZENET |
|---|---|
| `R-01` | `ISMERETLEN CIKK` |
| `R-02` | `HIBAS PARANCS: ...` / `ISMERETLEN PARANCS` (hianyzo kotelezo mezo, rossz tipus) |
| `R-03` | `NINCS ELEG KESZLET` (a valaszban: `szabad`) |
| `R-04` | `FOGLALAS NEM TALALHATO` |
| `R-99` | `BELSO HIBA` (a dead letterbe kerult uzenetrol) |

## 5. FIGYELMEZTETES (`inventory_alerts`)

Akkor keszul, amikor a FIZIKAI keszlet a minimumszint ALA CSOKKEN. Csak az atlepeskor, nem minden mozgasnal. A foglalas nem csokkenti a fizikai keszletet.

```json
{"tipus":"MIN_KESZLET_ALATT","cikk":4701,"keszlet":4,"min":5,"ts":1790941400}
```

## 6. ADATOK

- A cikkszam integer (pl. `4711`). Az ido Unix epoch (masodperc).
- A cikkszam es a katalogus TK-kodja kozotti megfeleltetes a KATALOGUSBAN van (`raktari_kod`). Nehany termeknek nincs raktari kodja.
