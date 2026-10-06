# Legacy interfészdokumentáció

Modulonként egy leírás, mindegyik a modul saját stílusában és „korában” – ahogy egy évek alatt összenőtt
rendszerben a dokumentáció is összenő. A tartalom pontos (végpontok, üzenetformátumok, hibakódok, példák),
a stílus és a részletesség modulonként eltér.

| Modul | Fájl | Interfész |
|---|---|---|
| CRM és termékkatalógus | [crm-katalogus.md](crm-katalogus.md) | Supabase PostgREST |
| Ajánlatmotor | [ajanlat-jsonrpc.md](ajanlat-jsonrpc.md) | JSON-RPC 2.0 |
| Rendelések | [orders.md](orders.md) | régi stílusú HTTP homlokzat + Flowable REST |
| Raktár | [raktar.md](raktar.md) | üzenetsor (Supabase Queues / pgmq) |
| Számlázás | [szamlazo-protokoll.md](szamlazo-protokoll.md) | egyedi szöveges protokoll |
| Fizetés | [payments.md](payments.md) | REST + Stripe webhook |
| Ügyfélszolgálat | [helpdesk-soap.md](helpdesk-soap.md), [helpdesk.wsdl](helpdesk.wsdl) | SOAP 1.1 |

Közös alap: a szolgáltatások a Next.js alkalmazás alatt futnak (fejlesztéskor `http://localhost:3000`),
a hozzáférési kulcsok a szerver környezeti változóiban vannak (`.env.local`).
