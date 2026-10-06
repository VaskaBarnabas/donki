import { createServiceClient } from "@/lib/supabase/server";
import { Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, type KeresesiParameterek } from "@/lib/admin/format";
import { Terminal } from "./terminal";

type Szamla = {
  szam: string;
  tipus: string;
  vevo_kod: string;
  rendeles_ref: string | null;
  kelt: string;
  hatarido: string;
  brutto: number;
  fizetve: boolean;
  lejart: boolean;
  sztornozva: boolean;
};

// A számlázó a saját formátumában: dátum YYYY.MM.DD, összeg vesszős tizedes
const datum = (d: string) => d.replaceAll("-", ".");
const osszeg = (n: number) => Number(n).toFixed(2).replace(".", ",");

export default async function SzamlazasOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const sp = await searchParams;
  const tipus = egyParam(sp.tipus);
  const allapot = egyParam(sp.allapot);
  const vevo = egyParam(sp.vevo);

  let keres = createServiceClient().schema("billing").from("szamlak").select("*").order("kelt", { ascending: false }).order("szam", { ascending: false });
  if (tipus) keres = keres.eq("tipus", tipus);
  if (allapot === "lejart") keres = keres.eq("lejart", true).eq("fizetve", false);
  if (allapot === "nyitott") keres = keres.eq("fizetve", false).eq("sztornozva", false).neq("tipus", "STORNO");
  if (allapot === "fizetve") keres = keres.eq("fizetve", true);
  if (vevo) keres = keres.ilike("vevo_kod", `%${vevo}%`);
  const { data, error } = await keres;
  const szamlak = (data ?? []) as Szamla[];

  return (
    <>
      <OldalFejlec
        cim="Számlázás"
        leiras="Egyedi szöveges protokoll (POST /api/legacy/billing, text/plain): | mezőelválasztó, ékezet nélküli nagybetű, dátum YYYY.MM.DD, összeg 38100,00. ÁFA fix 27%."
      />
      <Panel cim="Terminál">
        <Terminal />
      </Panel>
      <SzuroUrlap alap="/billing">
        <Mezo cimke="Típus">
          <Valaszto name="tipus" defaultValue={tipus} opciok={[["", "mind"], ["SZAMLA", "SZAMLA"], ["DIJBEKERO", "DIJBEKERO"], ["STORNO", "STORNO"]]} />
        </Mezo>
        <Mezo cimke="Állapot">
          <Valaszto name="allapot" defaultValue={allapot} opciok={[["", "mind"], ["nyitott", "nyitott"], ["lejart", "lejárt, nem fizetett"], ["fizetve", "fizetett"]]} />
        </Mezo>
        <Mezo cimke="Vevőkód">
          <SzovegMezo name="vevo" defaultValue={vevo} placeholder="VEVO-1001" />
        </Mezo>
      </SzuroUrlap>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {szamlak.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sorszám</TableHead>
              <TableHead>Típus</TableHead>
              <TableHead>Vevő</TableHead>
              <TableHead>Rendelés</TableHead>
              <TableHead>Kelt</TableHead>
              <TableHead>Határidő</TableHead>
              <TableHead className="text-right">Bruttó</TableHead>
              <TableHead>Állapot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {szamlak.map((s) => (
              <TableRow key={s.szam}>
                <TableCell>
                  <Hivatkozas href={`/billing/${s.szam}`}>{s.szam}</Hivatkozas>
                </TableCell>
                <TableCell>
                  <Kod>{s.tipus}</Kod>
                </TableCell>
                <TableCell>
                  <Kod>{s.vevo_kod}</Kod>
                </TableCell>
                <TableCell>{s.rendeles_ref && <Kod>{s.rendeles_ref}</Kod>}</TableCell>
                <TableCell className="font-mono text-xs">{datum(s.kelt)}</TableCell>
                <TableCell className="font-mono text-xs">{datum(s.hatarido)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{osszeg(s.brutto)}</TableCell>
                <TableCell className="flex gap-1">
                  {s.fizetve && <Allapot ertek="FIZETVE" />}
                  {s.lejart && !s.fizetve && <Allapot ertek="LEJART" />}
                  {s.sztornozva && <Allapot ertek="SZTORNOZVA" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
