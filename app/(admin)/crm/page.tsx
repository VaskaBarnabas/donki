import { createClient } from "@/lib/supabase/server";
import { Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, type KeresesiParameterek } from "@/lib/admin/format";

const CSOPORTOK: [string, string][] = [["", "minden csoport"], ["NORMAL", "NORMAL"], ["TORZS", "TORZS"], ["VISZONTELADO", "VISZONTELADO"], ["KIEMELT", "KIEMELT"]];

type Partner = { id: string; name: string; tax_number: string; customer_group: string; owner_name: string | null; address: string | null };

export default async function CrmOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const sp = await searchParams;
  const q = egyParam(sp.q);
  const csoport = egyParam(sp.csoport);

  const supabase = await createClient();
  let keres = supabase.schema("crm").from("partners").select("id, name, tax_number, customer_group, owner_name, address").order("name");
  if (q) keres = keres.ilike("name", `%${q}%`);
  if (csoport) keres = keres.eq("customer_group", csoport);
  const { data, error } = await keres;
  const partnerek = (data ?? []) as Partner[];

  return (
    <>
      <OldalFejlec
        cim="CRM – partnerek"
        leiras="Partnertörzs, kapcsolattartók, értékesítési lehetőségek. A Supabase PostgREST interfészén (Accept-Profile: crm), a bejelentkezett felhasználó jogosultságával."
      />
      <SzuroUrlap alap="/crm">
        <Mezo cimke="Név">
          <SzovegMezo name="q" defaultValue={q} placeholder="pl. Kft" />
        </Mezo>
        <Mezo cimke="Ügyfélcsoport">
          <Valaszto name="csoport" defaultValue={csoport} opciok={CSOPORTOK} />
        </Mezo>
      </SzuroUrlap>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {partnerek.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Név</TableHead>
              <TableHead>Adószám</TableHead>
              <TableHead>Csoport</TableHead>
              <TableHead>Cím</TableHead>
              <TableHead>Felelős</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partnerek.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Hivatkozas href={`/crm/${p.id}`}>{p.name}</Hivatkozas>
                </TableCell>
                <TableCell>
                  <Kod>{p.tax_number}</Kod>
                </TableCell>
                <TableCell>
                  <Allapot ertek={p.customer_group} />
                </TableCell>
                <TableCell className="text-muted-foreground">{p.address}</TableCell>
                <TableCell>{p.owner_name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
