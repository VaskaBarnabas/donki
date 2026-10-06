import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, Allapot, Kod, Mezo, OldalFejlec, Panel, SzovegMezo, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ezres, isoIdo } from "@/lib/admin/format";
import { dealSzakasz, tevekenysegRogzit } from "../actions";

const SZAKASZOK: [string, string][] = [["erdeklodo", "erdeklodo"], ["ajanlat", "ajanlat"], ["megrendeles", "megrendeles"], ["lezart", "lezart"]];
const TIPUSOK: [string, string][] = [["megjegyzes", "megjegyzés"], ["hivas", "hívás"], ["email", "e-mail"], ["megbeszeles", "megbeszélés"]];

export default async function PartnerOldal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const crm = supabase.schema("crm");

  const { data: p } = await crm.from("partners").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: kapcsolatok }, { data: dealek }, { data: tevekenysegek }] = await Promise.all([
    crm.from("contacts").select("*").eq("partner_id", id).order("name"),
    crm.from("deals").select("*").eq("partner_id", id).order("created_at", { ascending: false }),
    crm.from("activities").select("*").eq("partner_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  return (
    <>
      <OldalFejlec cim={p.name} leiras="Partner részletek (crm séma)" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="Törzsadatok">
          <Adatok
            sorok={[
              ["Azonosító", <Kod key="id">{p.id}</Kod>],
              ["Adószám", <Kod key="tax">{p.tax_number}</Kod>],
              ["Ügyfélcsoport", <Allapot key="g" ertek={p.customer_group} />],
              ["Cím", p.address],
              ["Felelős", p.owner_name],
              ["Rögzítve", isoIdo(p.created_at)],
            ]}
          />
        </Panel>
        <Panel cim="Kapcsolattartók">
          {(kapcsolatok ?? []).length === 0 ? (
            <Ures />
          ) : (
            <Table>
              <TableBody>
                {(kapcsolatok ?? []).map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="text-muted-foreground">{k.role}</TableCell>
                    <TableCell>{k.email}</TableCell>
                    <TableCell>{k.phone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      <Panel cim="Értékesítési lehetőségek">
        {(dealek ?? []).length === 0 ? (
          <Ures />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Megnevezés</TableHead>
                <TableHead>Érték (Ft)</TableHead>
                <TableHead>Várható zárás</TableHead>
                <TableHead>Ajánlat / rendelés</TableHead>
                <TableHead>Szakasz</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(dealek ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell>{ezres(d.value)}</TableCell>
                  <TableCell>{isoIdo(d.expected_close)}</TableCell>
                  <TableCell className="text-xs">
                    {d.quote_ref && <Kod>{d.quote_ref}</Kod>} {d.order_ref && <Kod>{d.order_ref}</Kod>}
                  </TableCell>
                  <TableCell>
                    <AkcioUrlap action={dealSzakasz} gomb="Mentés" variant="outline">
                      <input type="hidden" name="partnerId" value={p.id} />
                      <input type="hidden" name="dealId" value={d.id} />
                      <input type="hidden" name="regi" value={d.stage} />
                      <Valaszto name="stage" defaultValue={d.stage} opciok={SZAKASZOK} />
                    </AkcioUrlap>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel cim="Tevékenységek">
        <AkcioUrlap action={tevekenysegRogzit} gomb="Rögzítés">
          <input type="hidden" name="partnerId" value={p.id} />
          <Mezo cimke="Típus">
            <Valaszto name="type" opciok={TIPUSOK} />
          </Mezo>
          <Mezo cimke="Megjegyzés">
            <SzovegMezo name="note" className="min-w-80" />
          </Mezo>
        </AkcioUrlap>
        <Table>
          <TableBody>
            {(tevekenysegek ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{isoIdo(t.created_at)}</TableCell>
                <TableCell>
                  <Allapot ertek={t.type} />
                </TableCell>
                <TableCell>{t.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
