# Helpdesk szolgáltatás – integrációs specifikáció

| | |
|---|---|
| Szolgáltatás | `HelpdeskService` |
| Protokoll | SOAP 1.1, document/literal |
| Namespace | `urn:helpdesk:v1` |
| Végpont | `POST /api/legacy/support/soap` (`Content-Type: text/xml; charset=utf-8`) |
| Szolgáltatásleírás | `GET /api/legacy/support/soap?wsdl` – lásd [helpdesk.wsdl](helpdesk.wsdl) |
| SOAPAction | `urn:helpdesk:v1#<Művelet>` |

## 1. Hitelesítés

A hívó azonosítása a SOAP fejlécben történik:

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:hd="urn:helpdesk:v1">
  <soap:Header>
    <hd:ApiKey>…</hd:ApiKey>
  </soap:Header>
  <soap:Body>
    <hd:GetTicket>
      <hd:TicketId>HJ-000321</hd:TicketId>
    </hd:GetTicket>
  </soap:Body>
</soap:Envelope>
```

## 2. Hibakezelés

A hibák SOAP Faultként érkeznek, **HTTP 500** státusszal. A `faultstring` kizárólag a hibakódot tartalmazza.

```xml
<soap:Fault><faultcode>soap:Client</faultcode><faultstring>HD-404</faultstring></soap:Fault>
```

| Kód | faultcode | Jelentés |
|---|---|---|
| `HD-401` | `soap:Client` | hiányzó vagy érvénytelen `ApiKey` |
| `HD-404` | `soap:Client` | a hibajegy vagy az RMA nem található |
| `HD-409` | `soap:Client` | a művelet az aktuális állapotban nem engedélyezett |
| `HD-422` | `soap:Client` | érvénytelen bemenet (formátum, kötelező mező, ismeretlen művelet, hibás XML) |
| `HD-500` | `soap:Server` | belső hiba |

## 3. Adattípusok

**Ticket:**
- `TicketId` (`HJ-000321`), `PartnerTaxNumber` (`12345678-2-41`);
- `OrderNo`?, `ProductCode`? (`TK-00008`), `Description`;
- `Status` (`UJ` | `FOLYAMATBAN` | `VARAKOZIK` | `LEZART`);
- `CreatedAt`, `UpdatedAt` (`xsd:dateTime`);
- `Rma*`.

**Rma:**
- `RmaId` (`RMA-2026-0012`), `TicketId`;
- `Type` (`CSERE` | `JAVITAS`);
- `Status` (`NYITOTT` | `BEERKEZETT` | `LEZART`);
- `ReplacementItem`? (raktári cikkszám), `CreatedAt`.

## 4. Műveletek

### 4.1 CreateTicket

Bemenet: `PartnerTaxNumber`, `OrderNo`?, `ProductCode`?, `Description`. Kimenet: `Ticket` (`UJ` állapotban).
Hibás adószám- vagy termékkód-formátum, illetve hiányzó leírás: `HD-422`.

### 4.2 GetTicket

Bemenet: `TicketId`. Kimenet: `Ticket` a hozzá tartozó RMA-kkal.

### 4.3 ListTickets

Bemenet: `Status`?, `PartnerTaxNumber`?. Kimenet: `Ticket*` (legfeljebb 200, a legújabb elöl).

### 4.4 UpdateTicketStatus

Bemenet: `TicketId`, `Status`. Kimenet: a módosított `Ticket`. Lezárt (`LEZART`) jegy nem módosítható: `HD-409`.

### 4.5 CheckWarranty

Bemenet: `OrderNo`, `ProductCode`.

Kimenet:
- `Valid` (`xsd:boolean`);
- `ReasonCode`;
- ha a rendelés teljesült: `DeliveredAt`, `WarrantyMonths`, `ExpiresAt`.

A garancia kezdete a rendelés **teljesítése**, azaz a `SZALLITVA` állapotba lépés időpontja a rendeléskezelő folyamattörténete szerint. Hossza a termék garanciaideje (hónap) a termékkatalógus szerint.

| ReasonCode | Jelentés |
|---|---|
| `W-OK` | érvényes garancia |
| `W-EXP` | a garancia lejárt |
| `W-NOORDER` | a rendelés nem létezik, vagy a termék nem szerepel benne |
| `W-NOTDELIVERED` | a rendelés még nem teljesült |

```xml
<hd:CheckWarrantyResponse>
  <hd:Valid>true</hd:Valid><hd:ReasonCode>W-OK</hd:ReasonCode>
  <hd:DeliveredAt>2026-09-18T14:40:00.000Z</hd:DeliveredAt><hd:WarrantyMonths>12</hd:WarrantyMonths>
  <hd:ExpiresAt>2027-09-18T14:40:00.000Z</hd:ExpiresAt>
</hd:CheckWarrantyResponse>
```

### 4.6 StartRMA

Bemenet: `TicketId`, `Type` (`CSERE` | `JAVITAS`). Kimenet: `Rma` (`NYITOTT` állapotban).

**Feltételek:**
- a hibajegy nem lehet lezárva;
- a hibajegyhez nem tartozhat másik, még nem lezárt RMA;
- a hibajegyen kell termékkód.

Ha ezek nem teljesülnek: `HD-409`, illetve a termékkód hiánya esetén `HD-422`.

**Működés:**
- **CSERE:** a szolgáltatás azonnal 1 db csereterméket foglal a raktárban; a foglalás hivatkozása az RMA azonosítója. Ha nincs készlet: `HD-409`.
- **JAVITAS:** a raktárat a termék beérkezésekor kell értesíteni (4.7).
- **Állapotváltás:** az `UJ` állapotú jegy ilyenkor `FOLYAMATBAN` lesz.

A garanciát a szolgáltatás **nem** ellenőrzi; előtte a `CheckWarranty` hívható.

### 4.7 ReceiveRMA

Bemenet: `RmaId`. Kimenet: `Rma` (`BEERKEZETT` állapotban).

- Javításra beérkezett termék: a raktárban visszáruként bevételezésre kerül (1 db, hivatkozás: az RMA azonosítója).
- Csak `JAVITAS` típusú, `NYITOTT` RMA-ra hívható, egyébként `HD-409`.
