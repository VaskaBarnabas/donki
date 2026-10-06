# SZAMLAZO RENDSZER – KOMMUNIKACIOS PROTOKOLL

```
================================================================================
 SZAMLAZO RENDSZER                                    KOMMUNIKACIOS PROTOKOLL
 Belso hasznalatra
================================================================================
```

## 1. ALTALANOS

A szamlazo rendszer egyetlen HTTP vegponton fogad parancsokat:

```
POST /api/legacy/billing
Content-Type: text/plain
```

A keres torzse KET SOR:

```
AUTH|<kulcs>
<PARANCS>|<ALPARANCS>|<mezo>|<mezo>|...
```

- A kulcs a `LEGACY_BILLING_KEY` kornyezeti valtozo erteke.
- Pontosan egy parancssor kuldheto. Ures sorok nem szamitanak.
- A sorvege lehet `\n` vagy `\r\n`.

A valasz EGY SOR (sorvegjellel), a HTTP statusz MINDIG 200:

```
OK|<mezo>|<mezo>|...
ERR|<hibakod>|<SZOVEG>
```

## 2. FORMATUMOK

| ELEM           | FORMATUM                     | PELDA            |
|----------------|------------------------------|------------------|
| mezoelvalaszto | `\|`                         |                  |
| almezo         | `;`                          | `TONER;2;24900`  |
| szoveg         | ekezet nelkul, NAGYBETUVEL   | `MINTA KFT`      |
| datum          | `YYYY.MM.DD`                 | `2026.10.09`     |
| osszeg         | vesszos tizedes, tagolas nelkul | `38100,00`    |
| mennyiseg      | egesz vagy vesszos tizedes   | `20` / `1,50`    |

- A bejovo ekezetes vagy kisbetus szoveget a rendszer automatikusan atalakitja (`Minta Kft` -> `MINTA KFT`).
- ESCAPE NINCS. A mezoben nem lehet `|` es `;` karakter, kulonben a parancs elcsuszik.
- AFA: fix 27%. Az egysegar NETTO.
- Brutto = netto + kerekitett (2 tizedes) AFA.

## 3. PARANCSOK

### 3.1 PARTNER|KERES – vevo keresese adoszam alapjan

```
> PARTNER|KERES|27346178-2-41
< OK|VEVO-1001|DUNA-IRODAHAZ KFT.|1133 BUDAPEST, VACI UT 118.
```

Nincs ilyen vevo: `ERR|E107|VEVO NEM TALALHATO`

### 3.2 PARTNER|UJ – uj vevo felvetele

```
> PARTNER|UJ|<adoszam>|<NEV>|<CIM>
< OK|VEVO-1029
```

Ha az adoszammal mar van vevo, a MEGLEVO vevokodot adja vissza (nem hiba).

### 3.3 SZAMLA|KESZIT es DIJBEKERO|KESZIT – kiallitas

```
SZAMLA|KESZIT|<vevokod>|<rendeles_ref>|<kelt>|<hatarido_nap>|<tetel>;<db>;<egysegar>|<tetel>;<db>;<egysegar>|...
```

- Legalabb egy tetel kotelezo.
- A `rendeles_ref` lehet ures.
- A `hatarido_nap` egesz szam (napok szama a kelttol).

```
> SZAMLA|KESZIT|VEVO-1004|RND-100046|2026.10.03|15|CIMKESZALAG CN-300I-HEZ;20;6990|MASOLOPAPIR A4;10;1890,50
< OK|SZ-2026-000189|201555,35|2026.10.18
```

Valasz: `OK|<szamlaszam>|<brutto>|<hatarido>`. A DIJBEKERO ugyanigy, de a sorszam `DB-ÉÉÉÉ-NNNNNN` alaku.

A kiallitassal egyutt:
- a szamlarol PDF bizonylat keszul (lasd 3.8);
- a szimulalt NAV naplo is kap egy sort.

### 3.4 SZAMLA|LEKER – szamla allapota

```
> SZAMLA|LEKER|SZ-2026-000187
< OK|SZ-2026-000187|VEVO-1001|3676954,80|2026.08.31|FIZETVE|N|LEJART|I
```

- A jelzok erteke `I` vagy `N`.
- DIJBEKERO-re is mukodik.
- Sztorno szamlanal a brutto negativ.

### 3.5 SZAMLA|LEJART – lejart, ki nem fizetett szamlak

```
> SZAMLA|LEJART
< OK|3|SZ-2026-000185;VEVO-1004;584410,82;2026.07.15|SZ-2026-000186;VEVO-1012;959373,24;2026.08.09|...
```

- Formatum: `OK|<darab>|<szam>;<vevo>;<brutto>;<hatarido>|...`, hatarido szerint rendezve.
- A „lejart” jelzot egy napi idozitett feladat allitja (UTC 02:15) minden ki nem fizetett, nem sztornozott, lejart hataridoju szamlara.

### 3.6 SZAMLA|FIZETVE – fizetes rogzitese

```
> SZAMLA|FIZETVE|SZ-2026-000188|2026.10.05
< OK
```

- Mar fizetett szamlara is `OK`, ilyenkor nem valtoztat semmit.
- A fizetes torli a „lejart” jelzot.

### 3.7 SZAMLA|STORNO – sztornozas

```
> SZAMLA|STORNO|SZ-2026-000183
< OK|SZ-2026-000184
```

- Uj, negativ osszegu `STORNO` tipusu szamla keletkezik a SZAMLA sorszamtartomanybol.
- Az eredeti szamla „sztornozott” lesz.
- Mar sztornozott szamlara a MEGLEVO sztorno szamat adja.
- DIJBEKERO nem sztornozhato: `ERR|E108`.

### 3.8 SZAMLA|PDF – bizonylat letoltese

```
> SZAMLA|PDF|SZ-2026-000180
< OK|https://<projekt>.supabase.co/storage/v1/object/sign/szamlak/2026/SZ-2026-000180.pdf?token=...
```

- A link 1 oraig ervenyes.
- A PDF a kiallitaskor keszul, es kesobb nem irodik felul.
- Ha valamiert nem keszult el (pl. regi szamlak), az elso lekereskor keszul el.

## 4. HIBAKODOK

```
E001  AUTH HIBA                          hianyzo vagy rossz AUTH sor
E100  ISMERETLEN PARANCS
E101  HIBAS MEZOSZAM VAGY MEZOFORMATUM   rossz mezoszam, tetel, szam, vagy nem egy parancssor
E107  VEVO NEM TALALHATO
E108  SZAMLA NEM TALALHATO               (sztornonal: nem SZAMLA tipusu)
E120  HIBAS DATUMFORMATUM                nem YYYY.MM.DD vagy nem letezo nap
E200  SZAMLAZO SZOLGALTATAS HIBA         a PDF bizonylat nem allithato elo / nem toltheto fel
E999  BELSO HIBA
```

## 5. MEGJEGYZESEK

- Az azonositok: vevo `VEVO-1023`, szamla `SZ-2026-000187`, dijbekero `DB-2026-000031`.
- A szamlazo rendszer nem tud a CRM-rol. A vevotorzs kulon van, a nevek elterhetnek (pl. `DUNA-IRODAHAZ KFT.`).
- A rendelesmodul es a fizetesi modul is ezen a protokollon szamlaz:
  - `PARTNER|KERES`, `PARTNER|UJ`, `SZAMLA|KESZIT`, `SZAMLA|STORNO`;
  - `SZAMLA|LEKER`, `SZAMLA|FIZETVE`.
