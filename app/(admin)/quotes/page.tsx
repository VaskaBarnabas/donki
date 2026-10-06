import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, type KeresesiParameterek } from "@/lib/admin/format";
import { ajanlatRpc, rpcHibaSzoveg } from "@/lib/admin/interfeszek";
import { ajanlatLetrehozas } from "./actions";

const ALLAPOTOK: [string, string][] = [
  ["", "minden állapot"],
  ...["PISZKOZAT", "JOVAHAGYASRA_VAR", "JOVAHAGYOTT", "ELFOGADVA", "LEJART", "ELUTASITVA"].map((s) => [s, s] as [string, string]),
];

type Ajanlat = {
  id: string;
  partnerId: string;
  createdOn: string;
  validUntil: string;
  status: string;
  totalNet: number;
  totalDiscountPct: number;
  orderRef: string | null;
};

export default async function AjanlatokOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const sp = await searchParams;
  const status = egyParam(sp.status);
  const partnerId = egyParam(sp.partnerId);
  const v = await ajanlatRpc<Ajanlat[]>("quote.list", { status: status || undefined, partnerId: partnerId || undefined });
  const ajanlatok = v.result ?? [];

  return (
    <>
      <OldalFejlec
        cim="Ajánlatok"
        leiras="Ajánlatmotor – JSON-RPC 2.0 (POST /api/legacy/quote-rpc). Dátum YYYY-MM-DD, összeg egész forint. A partnert UUID-val kell megadni (a CRM oldalon látható)."
      />
      <Panel cim="Új ajánlat (quote.create)">
        <AkcioUrlap action={ajanlatLetrehozas} gomb="Létrehozás">
          <Mezo cimke="Partner UUID">
            <SzovegMezo name="partnerId" className="min-w-80 font-mono" placeholder="10000000-0000-4000-8000-000000000003" />
          </Mezo>
          <Mezo cimke="Sablon">
            <Valaszto name="templateId" opciok={[["1", "1 – Általános"], ["2", "2 – Viszonteladói"]]} />
          </Mezo>
        </AkcioUrlap>
      </Panel>
      <SzuroUrlap alap="/quotes">
        <Mezo cimke="Állapot">
          <Valaszto name="status" defaultValue={status} opciok={ALLAPOTOK} />
        </Mezo>
        <Mezo cimke="Partner UUID">
          <SzovegMezo name="partnerId" defaultValue={partnerId} className="min-w-80 font-mono" />
        </Mezo>
      </SzuroUrlap>
      {v.error && <p className="text-sm text-destructive">{rpcHibaSzoveg(v.error)}</p>}
      {ajanlatok.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Azonosító</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Kelt</TableHead>
              <TableHead>Érvényes</TableHead>
              <TableHead className="text-right">Nettó (Ft)</TableHead>
              <TableHead className="text-right">Kedv.</TableHead>
              <TableHead>Rendelés</TableHead>
              <TableHead>Állapot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ajanlatok.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Hivatkozas href={`/quotes/${a.id}`}>{a.id}</Hivatkozas>
                </TableCell>
                <TableCell>
                  <Kod>{a.partnerId}</Kod>
                </TableCell>
                <TableCell>{a.createdOn}</TableCell>
                <TableCell>{a.validUntil}</TableCell>
                <TableCell className="text-right tabular-nums">{a.totalNet}</TableCell>
                <TableCell className="text-right tabular-nums">{a.totalDiscountPct}%</TableCell>
                <TableCell>{a.orderRef && <Kod>{a.orderRef}</Kod>}</TableCell>
                <TableCell>
                  <Allapot ertek={a.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
