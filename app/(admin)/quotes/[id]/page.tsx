import { notFound } from "next/navigation";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo, Ures } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ajanlatRpc } from "@/lib/admin/interfeszek";
import { elfogadas, jovahagyas, jovahagyasKeres, szamolas, tetelHozzaadas } from "../actions";

type Ajanlat = {
  id: string;
  partnerId: string;
  templateId: number | null;
  createdOn: string;
  validUntil: string;
  status: string;
  totalNet: number;
  totalDiscountPct: number;
  approvalReason: string | null;
  approvedBy: string | null;
  approvedOn: string | null;
  orderRef: string | null;
  lines: { lineId: number; productCode: string; qty: number; unitPrice: number; lineDiscountPct: number; lineNet: number | null }[];
};

export default async function AjanlatOldal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await ajanlatRpc<Ajanlat>("quote.get", { quoteId: id });
  if (!v.result) notFound();
  const a = v.result;
  const rejtett = <input type="hidden" name="quoteId" value={a.id} />;

  return (
    <>
      <OldalFejlec cim={`Ajánlat ${a.id}`} leiras="quote.get – a tételek nettó értéke a legutóbbi quote.calculate szerint." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="Ajánlat">
          <Adatok
            sorok={[
              ["Állapot", <Allapot key="s" ertek={a.status} />],
              ["Partner", <Kod key="p">{a.partnerId}</Kod>],
              ["Sablon", a.templateId],
              ["Kelt / érvényes", `${a.createdOn} / ${a.validUntil}`],
              ["Nettó összesen", `${a.totalNet} Ft`],
              ["Összesített kedvezmény", `${a.totalDiscountPct}%`],
              ["Jóváhagyás indoka", a.approvalReason],
              ["Jóváhagyta", a.approvedBy ? `${a.approvedBy} (${a.approvedOn})` : null],
              ["Rendelés", a.orderRef ? <Hivatkozas key="o" href={`/orders/${a.orderRef.replace("RND-", "")}`}>{a.orderRef}</Hivatkozas> : null],
            ]}
          />
        </Panel>
        <Panel cim="Műveletek">
          <div className="flex flex-wrap gap-3">
            <AkcioUrlap action={szamolas} gomb="Számolás (calculate)" variant="outline">
              {rejtett}
            </AkcioUrlap>
            <AkcioUrlap action={elfogadas} gomb="Elfogadás (accept)">
              {rejtett}
            </AkcioUrlap>
          </div>
          <AkcioUrlap action={jovahagyasKeres} gomb="Jóváhagyás kérése" variant="secondary">
            {rejtett}
            <Mezo cimke="Indoklás">
              <SzovegMezo name="reason" className="min-w-72" />
            </Mezo>
          </AkcioUrlap>
          <AkcioUrlap action={jovahagyas} gomb="Jóváhagyás" variant="secondary">
            {rejtett}
            <Mezo cimke="Jóváhagyó">
              <SzovegMezo name="approver" defaultValue="Horváth Zoltán" />
            </Mezo>
          </AkcioUrlap>
        </Panel>
      </div>

      <Panel cim="Tételek">
        {a.lines.length === 0 ? (
          <Ures>Még nincs tétel.</Ures>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Termék</TableHead>
                <TableHead className="text-right">Menny.</TableHead>
                <TableHead className="text-right">Listaár (Ft)</TableHead>
                <TableHead className="text-right">Tételkedv.</TableHead>
                <TableHead className="text-right">Nettó (Ft)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.lines.map((l) => (
                <TableRow key={l.lineId}>
                  <TableCell>
                    <Hivatkozas href={`/catalog/${l.productCode}`}>{l.productCode}</Hivatkozas>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.unitPrice}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.lineDiscountPct}%</TableCell>
                  <TableCell className="text-right tabular-nums">{l.lineNet ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <AkcioUrlap action={tetelHozzaadas} gomb="Tétel hozzáadása (addLine)" variant="outline">
          {rejtett}
          <Mezo cimke="Termékkód">
            <SzovegMezo name="productCode" placeholder="TK-00001" className="font-mono" />
          </Mezo>
          <Mezo cimke="Mennyiség">
            <SzovegMezo name="qty" defaultValue="1" className="min-w-20 w-20" />
          </Mezo>
          <Mezo cimke="Tételkedvezmény %">
            <SzovegMezo name="lineDiscountPct" defaultValue="0" className="min-w-20 w-24" />
          </Mezo>
        </AkcioUrlap>
      </Panel>
    </>
  );
}
