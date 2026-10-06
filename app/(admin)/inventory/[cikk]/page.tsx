import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { Adatok, Allapot, Kod, OldalFejlec, Panel, Ures } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { epochIdo } from "@/lib/admin/format";

export default async function CikkOldal({ params }: { params: Promise<{ cikk: string }> }) {
  const { cikk } = await params;
  if (!/^\d+$/.test(cikk)) notFound();
  const inventory = createServiceClient().schema("inventory");
  const { data: c } = await inventory.from("items").select("*").eq("cikk", Number(cikk)).maybeSingle();
  if (!c) notFound();
  const [{ data: foglalasok }, { data: mozgasok }] = await Promise.all([
    inventory.from("reservations").select("*").eq("cikk", c.cikk).order("id", { ascending: false }).limit(50),
    inventory.from("movements").select("*").eq("cikk", c.cikk).order("id", { ascending: false }).limit(50),
  ]);

  return (
    <>
      <OldalFejlec cim={`Cikk ${c.cikk}`} leiras={c.megnevezes} />
      <Panel cim="Készlet">
        <Adatok
          sorok={[
            ["Megnevezés", c.megnevezes],
            ["Készlet / foglalt / szabad", `${c.keszlet} / ${c.foglalt} / ${c.keszlet - c.foglalt}`],
            ["Minimumszint", c.keszlet < c.min_keszlet ? <Allapot key="m" ertek={`${c.min_keszlet} – ALATTA`} /> : c.min_keszlet],
            ["Frissítve", `${c.updated_epoch} (${epochIdo(c.updated_epoch)})`],
          ]}
        />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="Foglalások">
          {(foglalasok ?? []).length === 0 ? (
            <Ures />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hivatkozás</TableHead>
                  <TableHead className="text-right">Db</TableHead>
                  <TableHead>Állapot</TableHead>
                  <TableHead>Epoch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(foglalasok ?? []).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Kod>{f.ref}</Kod>
                    </TableCell>
                    <TableCell className="text-right">{f.db}</TableCell>
                    <TableCell>
                      <Allapot ertek={f.statusz} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" title={epochIdo(f.created_epoch)}>
                      {f.created_epoch}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        <Panel cim="Mozgások">
          {(mozgasok ?? []).length === 0 ? (
            <Ures />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Típus</TableHead>
                  <TableHead className="text-right">Db</TableHead>
                  <TableHead>Hivatkozás</TableHead>
                  <TableHead>Epoch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mozgasok ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Allapot ertek={m.tipus} />
                    </TableCell>
                    <TableCell className="text-right">{m.db}</TableCell>
                    <TableCell>
                      <Kod>{m.ref}</Kod>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" title={epochIdo(m.epoch)}>
                      {m.epoch}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
