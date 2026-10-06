import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, Allapot, Kod, Mezo, OldalFejlec, Panel, SzovegMezo } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ezres, isoIdo } from "@/lib/admin/format";
import { aktivValtas, listaarModositas } from "../actions";

const CSOPORTOK = ["NORMAL", "TORZS", "VISZONTELADO", "KIEMELT"];

type Ar = { customer_group: string; discount_pct: number; price: number };

export default async function TermekOldal({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const catalog = supabase.schema("catalog");

  const { data: t } = await catalog.from("products").select("*, categories(name)").eq("code", code).maybeSingle();
  if (!t) notFound();
  const arak = await Promise.all(
    CSOPORTOK.map(async (g) => (await catalog.rpc("price_for", { product_code: code, customer_group: g })).data as Ar | null)
  );

  return (
    <>
      <OldalFejlec cim={`${t.code} – ${t.name}`} leiras="Termék részletek (catalog séma)" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="Termékadatok">
          <Adatok
            sorok={[
              ["Kód", <Kod key="c">{t.code}</Kod>],
              ["Kategória", `${t.category_id} – ${t.categories?.name ?? ""}`],
              ["Listaár", `${ezres(t.list_price)} Ft / ${t.unit}`],
              ["Garancia", `${t.warranty_months} hónap`],
              ["Raktári kód", t.raktari_kod ?? <span className="text-destructive">nincs (nem foglalható)</span>],
              ["Állapot", <Allapot key="a" ertek={t.active ? "aktív" : "inaktív"} />],
              ["Rögzítve", isoIdo(t.created_at)],
            ]}
          />
          <div className="flex flex-wrap gap-4 pt-2">
            <AkcioUrlap action={aktivValtas} gomb={t.active ? "Inaktiválás" : "Aktiválás"} variant="outline">
              <input type="hidden" name="code" value={t.code} />
              <input type="hidden" name="aktiv" value={String(t.active)} />
            </AkcioUrlap>
            <AkcioUrlap action={listaarModositas} gomb="Listaár mentése">
              <input type="hidden" name="code" value={t.code} />
              <Mezo cimke="Új listaár (Ft)">
                <SzovegMezo name="list_price" defaultValue={String(t.list_price)} />
              </Mezo>
            </AkcioUrlap>
          </div>
        </Panel>
        <Panel cim="Ár ügyfélcsoportonként (price_for)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ügyfélcsoport</TableHead>
                <TableHead className="text-right">Kedvezmény</TableHead>
                <TableHead className="text-right">Ár (Ft)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {arak.map((a, i) => (
                <TableRow key={CSOPORTOK[i]}>
                  <TableCell>
                    <Allapot ertek={CSOPORTOK[i]} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a ? `${a.discount_pct}%` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{a ? ezres(a.price) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </>
  );
}
