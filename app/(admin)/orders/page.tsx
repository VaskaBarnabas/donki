import { Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, isoIdo, type KeresesiParameterek } from "@/lib/admin/format";
import { rendelesHomlokzat } from "@/lib/admin/interfeszek";

const ALLAPOTOK: [string, string][] = [
  ["", "minden állapot"],
  ...["ROGZITETT", "JOVAHAGYOTT", "TELJESITES_ALATT", "SZALLITVA", "SZAMLAZVA", "LEZART", "LEMONDOTT"].map((s) => [s, s] as [string, string]),
];

type Rendeles = {
  order_no: number;
  quote_ref: string | null;
  partner_id: string;
  state: string;
  process_instance_id: string | null;
  invoice_ref: string | null;
  created_at: string;
};

export default async function RendelesekOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const sp = await searchParams;
  const state = egyParam(sp.state);
  const v = await rendelesHomlokzat<Rendeles[]>("GET", `list${state ? `?state=${state}` : ""}`);
  const rendelesek = v.success ? v.data : [];

  return (
    <>
      <OldalFejlec
        cim="Rendelések"
        leiras="Régi stílusú HTTP homlokzat a Flowable folyamatmotor előtt (GET/POST /api/legacy/orders/…). Az állapotátmenetekről a BPMN folyamat dönt."
      />
      <SzuroUrlap alap="/orders">
        <Mezo cimke="Állapot">
          <Valaszto name="state" defaultValue={state} opciok={ALLAPOTOK} />
        </Mezo>
      </SzuroUrlap>
      {!v.success && <p className="text-sm text-destructive">{v.msg}</p>}
      {rendelesek.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rendelés</TableHead>
              <TableHead>Ajánlat</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Számla</TableHead>
              <TableHead>Folyamat</TableHead>
              <TableHead>Rögzítve</TableHead>
              <TableHead>Állapot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rendelesek.map((r) => (
              <TableRow key={r.order_no}>
                <TableCell>
                  <Hivatkozas href={`/orders/${r.order_no}`}>RND-{r.order_no}</Hivatkozas>
                </TableCell>
                <TableCell>{r.quote_ref && <Kod>{r.quote_ref}</Kod>}</TableCell>
                <TableCell>
                  <Kod>{r.partner_id}</Kod>
                </TableCell>
                <TableCell>{r.invoice_ref && <Kod>{r.invoice_ref}</Kod>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.process_instance_id ? "fut / futott" : "nincs (seed)"}</TableCell>
                <TableCell className="whitespace-nowrap">{isoIdo(r.created_at)}</TableCell>
                <TableCell>
                  <Allapot ertek={r.state} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
