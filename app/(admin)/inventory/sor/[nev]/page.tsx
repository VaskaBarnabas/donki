import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { OldalFejlec, Ures } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, isoIdo, type KeresesiParameterek } from "@/lib/admin/format";

const SOROK = ["inventory_commands", "inventory_replies", "inventory_alerts", "order_events", "payment_events"];

type Uzenet = { msg_id: number; read_ct: number; enqueued_at: string; vt: string; message: unknown };

// Betekintés a sorba: csak olvassa a sortáblát (nem pgmq.read), így nem növeli a read_ct-t.
export default async function SorOldal({ params, searchParams }: { params: Promise<{ nev: string }>; searchParams: KeresesiParameterek }) {
  const { nev } = await params;
  if (!SOROK.includes(nev)) notFound();
  const archiv = egyParam((await searchParams).archiv) === "1";
  const { data, error } = await createServiceClient()
    .schema("inventory")
    .rpc("sor_tartalom", { p_sor: nev, p_archiv: archiv, p_n: 50 });
  const uzenetek = (data ?? []) as Uzenet[];

  return (
    <>
      <OldalFejlec cim={`${nev}${archiv ? " – archívum (DLQ)" : ""}`} leiras="A legutóbbi 50 üzenet. A betekintés nem olvassa ki az üzeneteket a sorból.">
        <Link href={archiv ? `/inventory/sor/${nev}` : `/inventory/sor/${nev}?archiv=1`} className="text-sm text-primary hover:underline">
          {archiv ? "Aktív üzenetek" : "Archívum (DLQ)"}
        </Link>
      </OldalFejlec>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {uzenetek.length === 0 ? (
        <Ures>A sor üres.</Ures>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>msg_id</TableHead>
              <TableHead>read_ct</TableHead>
              <TableHead>Sorba került</TableHead>
              <TableHead>Üzenet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uzenetek.map((u) => (
              <TableRow key={u.msg_id}>
                <TableCell className="tabular-nums">{u.msg_id}</TableCell>
                <TableCell className="tabular-nums">{u.read_ct}</TableCell>
                <TableCell className="whitespace-nowrap">{isoIdo(u.enqueued_at)}</TableCell>
                <TableCell>
                  <code className="block max-w-3xl text-xs break-all whitespace-pre-wrap">{JSON.stringify(u.message)}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
