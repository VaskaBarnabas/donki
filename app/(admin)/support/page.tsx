import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, isoIdo, type KeresesiParameterek } from "@/lib/admin/format";
import { helpdeskSoap } from "@/lib/admin/interfeszek";
import { jegyLetrehozas } from "./actions";

type Jegy = { TicketId: string; PartnerTaxNumber: string; OrderNo?: string; ProductCode?: string; Description: string; Status: string; CreatedAt: string; Rma?: unknown[] };

export default async function SupportOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const sp = await searchParams;
  const status = egyParam(sp.status);
  const adoszam = egyParam(sp.adoszam);
  const v = await helpdeskSoap("ListTickets", { Status: status, PartnerTaxNumber: adoszam });
  const jegyek = ((v.ok?.Ticket as Jegy[] | undefined) ?? []) as Jegy[];

  return (
    <>
      <OldalFejlec
        cim="Ügyfélszolgálat"
        leiras="SOAP 1.1 (POST /api/legacy/support/soap, WSDL: ?wsdl), namespace urn:helpdesk:v1. Hibák szűkszavú SOAP Faultként (HD-401/404/409/422/500), idő xsd:dateTime."
      >
        <a href="/api/legacy/support/soap?wsdl" target="_blank" className="text-sm text-primary hover:underline">
          WSDL
        </a>
      </OldalFejlec>
      <Panel cim="Új hibajegy (CreateTicket)">
        <AkcioUrlap action={jegyLetrehozas} gomb="Létrehozás">
          <Mezo cimke="Partner adószáma">
            <SzovegMezo name="PartnerTaxNumber" placeholder="12345678-2-41" className="font-mono" />
          </Mezo>
          <Mezo cimke="Rendelésszám">
            <SzovegMezo name="OrderNo" placeholder="100035" className="min-w-24 w-28" />
          </Mezo>
          <Mezo cimke="Termékkód">
            <SzovegMezo name="ProductCode" placeholder="TK-00008" className="min-w-24 w-28 font-mono" />
          </Mezo>
          <Mezo cimke="Leírás">
            <SzovegMezo name="Description" className="min-w-72" />
          </Mezo>
        </AkcioUrlap>
      </Panel>
      <SzuroUrlap alap="/support">
        <Mezo cimke="Állapot">
          <Valaszto name="status" defaultValue={status} opciok={[["", "mind"], ["UJ", "UJ"], ["FOLYAMATBAN", "FOLYAMATBAN"], ["VARAKOZIK", "VARAKOZIK"], ["LEZART", "LEZART"]]} />
        </Mezo>
        <Mezo cimke="Partner adószáma">
          <SzovegMezo name="adoszam" defaultValue={adoszam} className="font-mono" />
        </Mezo>
      </SzuroUrlap>
      {v.fault && <p className="text-sm text-destructive">SOAP Fault: {v.fault}</p>}
      {jegyek.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jegy</TableHead>
              <TableHead>Adószám</TableHead>
              <TableHead>Rendelés</TableHead>
              <TableHead>Termék</TableHead>
              <TableHead>Leírás</TableHead>
              <TableHead>RMA</TableHead>
              <TableHead>Létrehozva</TableHead>
              <TableHead>Állapot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jegyek.map((j) => (
              <TableRow key={j.TicketId}>
                <TableCell>
                  <Hivatkozas href={`/support/${j.TicketId}`}>{j.TicketId}</Hivatkozas>
                </TableCell>
                <TableCell>
                  <Kod>{j.PartnerTaxNumber}</Kod>
                </TableCell>
                <TableCell>{j.OrderNo}</TableCell>
                <TableCell>{j.ProductCode && <Kod>{j.ProductCode}</Kod>}</TableCell>
                <TableCell className="max-w-80 truncate">{j.Description}</TableCell>
                <TableCell>{j.Rma?.length ?? 0}</TableCell>
                <TableCell className="whitespace-nowrap">{isoIdo(j.CreatedAt)}</TableCell>
                <TableCell>
                  <Allapot ertek={j.Status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
