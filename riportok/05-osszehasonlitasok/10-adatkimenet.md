# Adatkimenet: mi hagyja el a gépet működés közben?

*20. fázis · 2026-11-10 · mérési ablak: 08:09–11:20 CET · munkaterhelés: `halozat-2026-11-10` mérés (66 futás), közben a figyelő J9-mérése és a változástűrés-mérés*

## 1. Mit vizsgáltunk

A helyi modell legfőbb érve az adatvédelem: az ügyféladat nem megy ki egy külső LLM-szolgáltatóhoz. Ezt nem elég a kódból állítani, ezért a rendszer teljes terhelés melletti tényleges hálózati forgalmát is rögzítettük, három rétegben:

| Réteg | Mit lát | Eszköz |
|---|---|---|
| Docker-konténerek | minden kifelé menő kapcsolat cél-IP-je és portja, konténerenként | a Docker-VM `nf_conntrack` táblája, 3–4 másodpercenként mintavételezve |
| Gépen futó Node-folyamatok (ágens, portál, mérő) | minden socket-kapcsolat célja | `net.Socket.connect` naplózó előtöltő |
| Ollama (helyi LLM-kiszolgáló) | kapcsolatok és bájtszámok | macOS `nettop`, 3 másodpercenként |

A forgalom tartalmát nem néztük, és TLS miatt nem is látható. A cél az volt, hogy **kihez** és **mennyi** adat megy ki.

**Eredmény egy mondatban: a CRM-rendszer kizárólag a Számlázz.hu-val és a Stripe-pal kommunikált, de a „0 bájt az LLM-szolgáltató felé” állítás szó szerint nem igaz, mert maga az Ollama alkalmazás felvette a kapcsolatot az ollama.com-mal és a GitHubbal, három óra alatt összesen 14,8 KB kimenő forgalommal.** A mérés szerint ez nem a beszélgetések tartalma.

## 2. Docker-konténerek

A mért ablakban a konténerek **192 kifelé menő kapcsolatot** nyitottak, mindössze két szervezet felé:

| Forrás konténer | Cél | Azonosítás | Kapcsolat |
|---|---|---|---:|
| `donki-billing-1` | 104.18.24.23, 104.18.25.23 :443 | a `www.szamlazz.hu` DNS-válaszával egyezik | 140 |
| `donki-stripe-cli-1` | 54.187.x, 54.186.x, 34.241.x, 34.250.x :443 | a fordított DNS `stripe.com` | 50 |
| `donki-payments-1` | 34.241.54.72 :443 | a fordított DNS `stripe.com` | 2 |

**A többi 28 konténer egyetlen kifelé menő kapcsolatot sem nyitott.** Köztük van mind az öt MCP-szerver, az összes adatbázis, a legacy homlokzatok és a Flowable. A NAV felé egyetlen kapcsolat sem indult. A Számlázz.hu-t a rendszer tesztfiókkal használja, és a `NEM_TESZTFIOK` védelem nem enged számlát kiállítani, ha a fiók nem tesztfiók.

**Mi megy ki a két szolgáltatóhoz** (a kódból):

- **Számlázz.hu:** vevő neve, adószáma, címe, a tételek. Ez a számlázás működéséhez szükséges.
- **Stripe:** a fizetés adatai, metaadatként a belső fizetésazonosító és az adószám.

Ez ugyanaz az adatkör, amit a régi rendszer is kiküldene. Az ágensréteg **nem bővítette** a külső címzettek körét.

## 3. Gépen futó Node-folyamatok

Az ágens, a mérőszkriptek és a portál indítása összesen **576 kapcsolatot** nyitott, mind helyi célra (`127.0.0.1` vagy unix socket). Külső cím egy sem szerepelt, tehát sem telemetria, sem felhős LLM-hívás nem indult ezekből a folyamatokból.

A portált csak rövid ideig, néhány oldal lekérésével indítottuk el, és a böngésző saját forgalmát nem mértük (például külső betűkészlet, kliensoldali szkript).

## 4. Az Ollama: az eredmény, ami nem nulla

A három órában az Ollama hét külső kapcsolatot nyitott:

| Idő (CET) | Folyamat | Cél | Be (B) | Ki (B) |
|---|---|---|---:|---:|
| 08:18 | `ollama serve` | 34.36.133.15 (ollama.com) | 7 636 | 1 992 |
| 08:30 | Ollama alkalmazás | 34.36.133.15 (ollama.com) | 6 256 | 2 054 |
| 08:30 | Ollama alkalmazás | 140.82.121.3 (github.com) | 8 981 | 1 813 |
| 08:30 | Ollama alkalmazás | 185.199.111.133 (GitHub CDN) | 6 401 | 2 527 |
| 11:05 | Ollama alkalmazás | 34.36.133.15 (ollama.com) | 6 254 | 2 058 |
| 11:05 | Ollama alkalmazás | 140.82.121.4 (github.com) | 8 977 | 1 813 |
| 11:05 | Ollama alkalmazás | 185.199.111.133 (GitHub CDN) | 6 401 | 2 523 |
| **Összesen** | | | | **14 780** |

**Miért gondoljuk, hogy ez nem ügyféladat?**

1. **A méret nem követi a terhelést.** Csak a 66 futásos munkaterhelés 539 810 bemeneti tokent küldött a modellnek, ami nagyságrendileg 1,5–2 MB szöveg. Ugyanebben az ablakban az Ollama kifelé 6,4 KB-ot küldött, ami több mint 200-szor kevesebb. A teljes három óra kimenő forgalma 14,8 KB.
2. **A 08:30-as és a 11:05-ös csoport majdnem bájtra azonos** (2054/2058, 1813/1813, 2527/2523), holott a két időpontban más munka futott. Ez ismétlődő, rögzített tartalmú kérésre vall.
3. **A címzettek** az Ollama saját szolgáltatása és a GitHub, ami frissítés-ellenőrzésre illik. Ez utóbbi **következtetés**: a TLS miatt a tartalmat nem láttuk, és a dokumentációban nem találtunk megerősítést arra, hogy pontosan mi ez a forgalom.

**A tényleges következtetés:** a mért forgalom alapján a promptok nem hagyták el a gépet. Azt viszont nem lehet leírni, hogy az LLM-réteg felől nulla bájt ment ki.

**Az éles üzemhez** az Ollama dokumentációja helyi módot ír le (`OLLAMA_NO_CLOUD=1` vagy `"disable_ollama_cloud": true` a `~/.ollama/server.json`-ban, [Ollama FAQ](https://docs.ollama.com/faq)). Nem találtunk forrást arra, hogy ez a frissítés-ellenőrzést is kikapcsolja-e. Bizonyítható nullához az kell, hogy a modellt futtató szerver tűzfal mögött, kimenő forgalom nélkül fusson, ami egy szerveres telepítésnél egyszerű. A beállítást a mérés során nem változtattuk meg.

## 5. Korlátok

- **A konténerek bájtszámait nem mértük.** A Docker-VM-ben a kapcsolatonkénti számlálás ki van kapcsolva, ezért a 2. szakasz kapcsolatokat számol, nem adatmennyiséget.
- **Hézagok a mintavételben.** 08:38 és 10:17 között hat, egyenként körülbelül 15 perces szünet van (összesen 95 perc a 191-ből), amikor a Mac alvó állapotban volt, és feltehetően a Docker-VM is állt. 10:17 után, a J9-pótlás, a változástűrés-mérés és a 66 futásos munkaterhelés alatt a mintavétel folyamatos volt.
- **Rövid kapcsolatok.** A conntrack a lezárt TCP-kapcsolatot még körülbelül 120 másodpercig mutatja, ezért a TCP-t a 3–4 másodperces mintavétel lefedi. Az Ollama-oldali `nettop` 3 másodpercenként mintáz, egy ennél rövidebb kapcsolatot elveszíthet.
- **A `llama-server` folyamat** (az Ollama tényleges modellfuttatója) nem szerepelt a háromórás szűrésben, mert a szűrő csak az „ollama” névre illeszkedett. Utólag egy rövid ellenőrzés futott rá modellhívás közben: csak helyi figyelő portot mutatott, külső kapcsolatot nem. Ez 12 másodperces szúrópróba, nem teljes bizonyíték.
- **A DNS-kérések** a Docker belső feloldóján mennek át, így ezeket nem látjuk.
- **A célok azonosítása.** A 104.18.x IP-k a Cloudflare megosztott címei. A Számlázz.hu-t a DNS-egyezés, a forrás konténer és a kódban rögzített `www.szamlazz.hu` cím együtt azonosítja.
- **Csak a gép forgalmát mértük**, a Mac más alkalmazásainak forgalmát nem tulajdonítottuk a CRM-nek.
