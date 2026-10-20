# Legacy interfészdokumentáció

Modulonként egy leírás, mindegyik a modul saját stílusában és „korában” – ahogy egy évek alatt összenőtt
rendszerben a dokumentáció is összenő. A tartalom pontos (végpontok, üzenetformátumok, hibakódok, példák),
a stílus és a részletesség modulonként eltér.

| Modul | Fájl | Interfész |
|---|---|---|
| CRM és termékkatalógus | [crm-katalogus.md](crm-katalogus.md) | PostgREST |
| Ajánlatmotor | [ajanlat-jsonrpc.md](ajanlat-jsonrpc.md) | JSON-RPC 2.0 |
| Rendelések | [orders.md](orders.md) | régi stílusú HTTP homlokzat + Flowable REST |
| Raktár | [raktar.md](raktar.md) | üzenetsor (pgmq) |
| Számlázás | [szamlazo-protokoll.md](szamlazo-protokoll.md) | egyedi szöveges protokoll |
| Fizetés | [payments.md](payments.md) | REST + Stripe webhook |
| Ügyfélszolgálat | [helpdesk-soap.md](helpdesk-soap.md), [helpdesk.wsdl](helpdesk.wsdl) | SOAP 1.1 |

Közös alap nincs: minden rendszer **független**, saját konténerben, saját adatbázissal fut, és a többit csak a
hivatalos interfészén éri el. A gépről (fejlesztéskor) elérhető címek:

| Rendszer | Cím a gépről | Cím a rendszerek hálózatán |
|---|---|---|
| CRM és katalógus | `http://localhost:4100` | `http://crm-api:3000` |
| Ajánlatmotor | `http://localhost:4101` | `http://quote:4101` |
| Rendelések | `http://localhost:4102` (Flowable: `http://localhost:8080`) | `http://orders:4102` |
| Számlázás | `http://localhost:4103` | `http://billing:4103` |
| Fizetés | `http://localhost:4104` | `http://payments:4104` |
| Ügyfélszolgálat | `http://localhost:4105` | `http://support:4105` |
| Raktár (üzenetsor) | `http://localhost:54106` | `http://inventory-api:3000` |

Minden rendszernek van `GET /health` végpontja (a CRM-nél és a raktárnál a PostgREST maga az interfész).
A hozzáférési kulcsok a rendszerek környezeti változóiban vannak; mindegyik csak a sajátját és azokét kapja, akiket hív.
