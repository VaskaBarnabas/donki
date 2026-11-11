# A hivatalos UCP-konformanciateszt futtatása (21. fázis)

A tesztcsomag (github.com/Universal-Commerce-Protocol/conformance, Apache-2.0) **nem része a repónak**: külön mappába töltjük le,
átnézzük, és saját Python-környezetből futtatjuk (`scripts/riportok/ucp-konformancia.sh`).

- `conformance_input.json`: a kereskedő adatai (verzió, képességek, HUF, érvényes / nem rendelhető / nem létező termék).
- `test_fixtures.json`: az ismert vevő (a tesztcsomag `john.doe@example.com` vevőjét a futás idejére a Bakony Gépgyártó
  kapcsolattartójaként vesszük fel, utána töröljük).

A tesztcsomag egy B2C mintabolthoz készült (kártyás tesztfizetés, kuponkódok, dinamikus szállítási díjak). Ezeket a képességeket
nem hirdetjük, ezért a hozzájuk tartozó tesztek kimaradnak; a lezárás pedig csak **konformancia-tesztmódban**
(`UCP_KONFORMANCIA=1`) szinkron, ahol egy szimulált jóváhagyó dönt. Az eredmény és az eltérések magyarázata:
`riportok/05-osszehasonlitasok/20-ucp.md`.
