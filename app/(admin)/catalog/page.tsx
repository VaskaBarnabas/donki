import { createClient } from "@/lib/supabase/server";
import { Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, ezres, type KeresesiParameterek } from "@/lib/admin/format";

type Termek = {
  code: string;
  name: string;
  category_id: string;
  list_price: number;
  unit: string;
  warranty_months: number;
  raktari_kod: number | null;
  active: boolean;
};

export default async function KatalogusOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const sp = await searchParams;
  const q = egyParam(sp.q);
  const kategoria = egyParam(sp.kategoria);
  const aktiv = egyParam(sp.aktiv);

  const supabase = await createClient();
  const catalog = supabase.schema("catalog");
  const { data: kategoriak } = await catalog.from("categories").select("id, name").order("id");
  let keres = catalog.from("products").select("*").order("code");
  if (q) keres = keres.ilike("name", `%${q}%`);
  if (kategoria) keres = keres.eq("category_id", kategoria);
  if (aktiv) keres = keres.eq("active", aktiv === "igen");
  const { data, error } = await keres;
  const termekek = (data ?? []) as Termek[];

  return (
    <>
      <OldalFejlec
        cim="Termékkatalógus"
        leiras="Termékek, kategóriák, garanciaidő és raktári kód. PostgREST (Accept-Profile: catalog); a csoportárakat a price_for függvény adja."
      />
      <SzuroUrlap alap="/catalog">
        <Mezo cimke="Név">
          <SzovegMezo name="q" defaultValue={q} />
        </Mezo>
        <Mezo cimke="Kategória">
          <Valaszto
            name="kategoria"
            defaultValue={kategoria}
            opciok={[["", "minden kategória"], ...((kategoriak ?? []).map((k) => [k.id, `${k.id} – ${k.name}`]) as [string, string][])]}
          />
        </Mezo>
        <Mezo cimke="Aktív">
          <Valaszto name="aktiv" defaultValue={aktiv} opciok={[["", "mind"], ["igen", "aktív"], ["nem", "inaktív"]]} />
        </Mezo>
      </SzuroUrlap>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {termekek.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kód</TableHead>
              <TableHead>Megnevezés</TableHead>
              <TableHead>Kategória</TableHead>
              <TableHead className="text-right">Listaár (Ft)</TableHead>
              <TableHead>Garancia</TableHead>
              <TableHead>Raktári kód</TableHead>
              <TableHead>Állapot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {termekek.map((t) => (
              <TableRow key={t.code}>
                <TableCell>
                  <Hivatkozas href={`/catalog/${t.code}`}>{t.code}</Hivatkozas>
                </TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>
                  <Kod>{t.category_id}</Kod>
                </TableCell>
                <TableCell className="text-right tabular-nums">{ezres(t.list_price)}</TableCell>
                <TableCell>{t.warranty_months} hó</TableCell>
                <TableCell>{t.raktari_kod ?? <span className="text-destructive">nincs</span>}</TableCell>
                <TableCell>
                  <Allapot ertek={t.active ? "aktív" : "inaktív"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
