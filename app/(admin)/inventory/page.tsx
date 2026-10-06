import { createServiceClient } from "@/lib/supabase/server";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Allapot, Hivatkozas, Mezo, OldalFejlec, Panel, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, epochIdo, type KeresesiParameterek } from "@/lib/admin/format";
import { lekerdezes, mozgas } from "./actions";

type Cikk = { cikk: number; megnevezes: string; keszlet: number; foglalt: number; min_keszlet: number; updated_epoch: number };
type Metrika = { sor: string; hossz: number; legregebbi_mp: number | null; legujabb_mp: number | null; osszes_uzenet: number; archivalt: number };

export default async function RaktarOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const sp = await searchParams;
  const szuro = egyParam(sp.szuro);
  const q = egyParam(sp.q);

  const inventory = createServiceClient().schema("inventory");
  const [{ data: cikkekData }, { data: metrikak }] = await Promise.all([
    inventory.from("items").select("*").order("cikk"),
    inventory.rpc("sor_metrikak"),
  ]);
  let cikkek = (cikkekData ?? []) as Cikk[];
  if (szuro === "min") cikkek = cikkek.filter((c) => c.keszlet < c.min_keszlet);
  if (szuro === "nulla") cikkek = cikkek.filter((c) => c.keszlet === 0);
  if (q) cikkek = cikkek.filter((c) => String(c.cikk).includes(q) || c.megnevezes.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <OldalFejlec
        cim="Raktár"
        leiras="Cikkszám integer, idő Unix epoch. A raktár kívülről csak a pgmq sorokon érhető el: parancs → inventory_commands, válasz ← inventory_replies; a worker 5 mp-enként fut."
      />

      <Panel cim="Üzenetsorok (pgmq)">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sor</TableHead>
              <TableHead className="text-right">Várakozó</TableHead>
              <TableHead className="text-right">Legrégebbi (mp)</TableHead>
              <TableHead className="text-right">Összes valaha</TableHead>
              <TableHead className="text-right">Archív (DLQ)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {((metrikak ?? []) as Metrika[]).map((m) => (
              <TableRow key={m.sor}>
                <TableCell>
                  <Hivatkozas href={`/inventory/sor/${m.sor}`}>{m.sor}</Hivatkozas>
                </TableCell>
                <TableCell className="text-right tabular-nums">{m.hossz}</TableCell>
                <TableCell className="text-right tabular-nums">{m.legregebbi_mp ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{m.osszes_uzenet}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.archivalt > 0 ? <Hivatkozas href={`/inventory/sor/${m.sor}?archiv=1`}>{m.archivalt}</Hivatkozas> : 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="LEKERDEZ">
          <AkcioUrlap action={lekerdezes} gomb="Küldés" valaszMutatasa>
            <Mezo cimke="Cikkszám(ok)">
              <SzovegMezo name="cikkek" placeholder="4711 vagy 4701, 4702" />
            </Mezo>
          </AkcioUrlap>
        </Panel>
        <Panel cim="MOZGAS">
          <AkcioUrlap action={mozgas} gomb="Küldés" valaszMutatasa>
            <Mezo cimke="Cikk">
              <SzovegMezo name="cikk" className="min-w-20 w-24" />
            </Mezo>
            <Mezo cimke="Típus">
              <Valaszto name="tipus" opciok={[["BE", "BE"], ["KI", "KI"], ["VISSZARU", "VISSZARU"], ["KORREKCIO", "KORREKCIO (±)"]]} />
            </Mezo>
            <Mezo cimke="Db">
              <SzovegMezo name="db" className="min-w-16 w-20" />
            </Mezo>
            <Mezo cimke="Hivatkozás">
              <SzovegMezo name="ref" placeholder="ADMIN" className="min-w-28 w-32" />
            </Mezo>
          </AkcioUrlap>
        </Panel>
      </div>

      <SzuroUrlap alap="/inventory">
        <Mezo cimke="Keresés">
          <SzovegMezo name="q" defaultValue={q} placeholder="cikkszám vagy név" />
        </Mezo>
        <Mezo cimke="Szűrő">
          <Valaszto name="szuro" defaultValue={szuro} opciok={[["", "minden cikk"], ["min", "minimum alatt"], ["nulla", "0 készlet"]]} />
        </Mezo>
      </SzuroUrlap>
      {cikkek.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cikk</TableHead>
              <TableHead>Megnevezés</TableHead>
              <TableHead className="text-right">Készlet</TableHead>
              <TableHead className="text-right">Foglalt</TableHead>
              <TableHead className="text-right">Szabad</TableHead>
              <TableHead className="text-right">Min.</TableHead>
              <TableHead>Frissítve (epoch)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cikkek.map((c) => (
              <TableRow key={c.cikk}>
                <TableCell>
                  <Hivatkozas href={`/inventory/${c.cikk}`}>{c.cikk}</Hivatkozas>
                </TableCell>
                <TableCell>{c.megnevezes}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.keszlet < c.min_keszlet ? <Allapot ertek={String(c.keszlet)} /> : c.keszlet}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.foglalt}</TableCell>
                <TableCell className="text-right tabular-nums">{c.keszlet - c.foglalt}</TableCell>
                <TableCell className="text-right tabular-nums">{c.min_keszlet}</TableCell>
                <TableCell className="text-xs text-muted-foreground" title={epochIdo(c.updated_epoch)}>
                  {c.updated_epoch}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
