import { createServiceClient } from "@/lib/supabase/server";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, isoIdo, type KeresesiParameterek } from "@/lib/admin/format";
import { fizetesiLink } from "./actions";

type Fizetes = { id: string; invoice_ref: string; status: string; amount_minor: number; currency: string; created_at: string; updated_at: string };

export default async function FizetesOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const sp = await searchParams;
  const status = egyParam(sp.status);
  const szamla = egyParam(sp.szamla);

  let keres = createServiceClient().schema("payment").from("payments").select("*").order("created_at", { ascending: false }).limit(200);
  if (status) keres = keres.eq("status", status);
  if (szamla) keres = keres.ilike("invoice_ref", `%${szamla}%`);
  const { data, error } = await keres;
  const fizetesek = (data ?? []) as Fizetes[];

  return (
    <>
      <OldalFejlec
        cim="Fizetés"
        leiras="REST + Stripe webhook (teszt mód, HUF). Összeg fillérben (Stripe minor unit), idő ISO. A státuszt a webhook frissíti – fejlesztéskor kell a futó stripe listen."
      />
      <Panel cim="Fizetési link számlához (POST /api/legacy/payments)">
        <AkcioUrlap action={fizetesiLink} gomb="Link létrehozása">
          <Mezo cimke="Számlaszám">
            <SzovegMezo name="invoiceRef" placeholder="SZ-2026-000188" className="font-mono" />
          </Mezo>
        </AkcioUrlap>
      </Panel>
      <SzuroUrlap alap="/payments">
        <Mezo cimke="Státusz">
          <Valaszto name="status" defaultValue={status} opciok={[["", "mind"], ["CREATED", "CREATED"], ["SUCCEEDED", "SUCCEEDED"], ["FAILED", "FAILED"], ["EXPIRED", "EXPIRED"]]} />
        </Mezo>
        <Mezo cimke="Számla">
          <SzovegMezo name="szamla" defaultValue={szamla} />
        </Mezo>
      </SzuroUrlap>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {fizetesek.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Azonosító</TableHead>
              <TableHead>Számla</TableHead>
              <TableHead className="text-right">amount_minor</TableHead>
              <TableHead>Pénznem</TableHead>
              <TableHead>Létrehozva</TableHead>
              <TableHead>Frissítve</TableHead>
              <TableHead>Státusz</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fizetesek.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <Hivatkozas href={`/payments/${f.id}`}>{f.id.slice(0, 8)}…</Hivatkozas>
                </TableCell>
                <TableCell>
                  <Kod>{f.invoice_ref}</Kod>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{f.amount_minor}</TableCell>
                <TableCell className="uppercase">{f.currency}</TableCell>
                <TableCell className="whitespace-nowrap">{isoIdo(f.created_at)}</TableCell>
                <TableCell className="whitespace-nowrap">{isoIdo(f.updated_at)}</TableCell>
                <TableCell>
                  <Allapot ertek={f.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
