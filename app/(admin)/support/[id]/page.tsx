import { notFound } from "next/navigation";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isoIdo } from "@/lib/admin/format";
import { helpdeskSoap } from "@/lib/admin/interfeszek";
import { allapotValtas, garancia, rmaBeerkezes, rmaInditas } from "../actions";

type Rma = { RmaId: string; Type: string; Status: string; ReplacementItem?: string; CreatedAt: string };
type Jegy = {
  TicketId: string;
  PartnerTaxNumber: string;
  OrderNo?: string;
  ProductCode?: string;
  Description: string;
  Status: string;
  CreatedAt: string;
  UpdatedAt: string;
  Rma?: Rma[];
};

export default async function JegyOldal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await helpdeskSoap("GetTicket", { TicketId: id });
  if (v.fault === "HD-404") notFound();
  const j = (v.ok?.Ticket as Jegy[] | undefined)?.[0];
  if (!j) notFound();
  const rmak = j.Rma ?? [];
  const rejtett = <input type="hidden" name="TicketId" value={j.TicketId} />;

  return (
    <>
      <OldalFejlec cim={`Hibajegy ${j.TicketId}`} leiras="GetTicket – SOAP válasz" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="Jegy">
          <Adatok
            sorok={[
              ["Állapot", <Allapot key="s" ertek={j.Status} />],
              ["Partner adószáma", <Kod key="t">{j.PartnerTaxNumber}</Kod>],
              ["Rendelés", j.OrderNo ? <Hivatkozas key="o" href={`/orders/${j.OrderNo}`}>{j.OrderNo}</Hivatkozas> : null],
              ["Termék", j.ProductCode ? <Hivatkozas key="p" href={`/catalog/${j.ProductCode}`}>{j.ProductCode}</Hivatkozas> : null],
              ["Leírás", j.Description],
              ["Létrehozva / frissítve (xsd:dateTime)", <span key="d" className="font-mono text-xs">{`${j.CreatedAt} / ${j.UpdatedAt}`}</span>],
            ]}
          />
          <AkcioUrlap action={allapotValtas} gomb="Állapot mentése" variant="outline">
            {rejtett}
            <Mezo cimke="Új állapot">
              <Valaszto name="Status" defaultValue={j.Status} opciok={[["UJ", "UJ"], ["FOLYAMATBAN", "FOLYAMATBAN"], ["VARAKOZIK", "VARAKOZIK"], ["LEZART", "LEZART"]]} />
            </Mezo>
          </AkcioUrlap>
        </Panel>
        <Panel cim="Garancia (CheckWarranty)">
          <AkcioUrlap action={garancia} gomb="Ellenőrzés" valaszMutatasa>
            <Mezo cimke="Rendelésszám">
              <SzovegMezo name="OrderNo" defaultValue={j.OrderNo ?? ""} className="min-w-24 w-28" />
            </Mezo>
            <Mezo cimke="Termékkód">
              <SzovegMezo name="ProductCode" defaultValue={j.ProductCode ?? ""} className="min-w-24 w-28 font-mono" />
            </Mezo>
          </AkcioUrlap>
          <p className="text-xs text-muted-foreground">Indokkódok: W-OK, W-EXP, W-NOORDER, W-NOTDELIVERED.</p>
        </Panel>
      </div>

      <Panel cim="RMA">
        {rmak.length === 0 ? (
          <Ures>Nincs RMA ehhez a jegyhez.</Ures>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA</TableHead>
                <TableHead>Típus</TableHead>
                <TableHead>Csere cikk</TableHead>
                <TableHead>Létrehozva</TableHead>
                <TableHead>Állapot</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rmak.map((r) => (
                <TableRow key={r.RmaId}>
                  <TableCell>
                    <Kod>{r.RmaId}</Kod>
                  </TableCell>
                  <TableCell>{r.Type}</TableCell>
                  <TableCell>{r.ReplacementItem ? <Hivatkozas href={`/inventory/${r.ReplacementItem}`}>{r.ReplacementItem}</Hivatkozas> : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{isoIdo(r.CreatedAt)}</TableCell>
                  <TableCell>
                    <Allapot ertek={r.Status} />
                  </TableCell>
                  <TableCell>
                    {r.Type === "JAVITAS" && r.Status === "NYITOTT" && (
                      <AkcioUrlap action={rmaBeerkezes} gomb="Beérkezett (ReceiveRMA)" variant="outline">
                        {rejtett}
                        <input type="hidden" name="RmaId" value={r.RmaId} />
                      </AkcioUrlap>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <AkcioUrlap action={rmaInditas} gomb="RMA indítása (StartRMA)">
          {rejtett}
          <Mezo cimke="Típus">
            <Valaszto name="Type" opciok={[["CSERE", "CSERE – FOGLAL a raktárban"], ["JAVITAS", "JAVITAS – beérkezéskor VISSZARU_BE"]]} />
          </Mezo>
        </AkcioUrlap>
      </Panel>
    </>
  );
}
