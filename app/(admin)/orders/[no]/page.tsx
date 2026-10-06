import { notFound } from "next/navigation";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, Allapot, Hivatkozas, Kod, OldalFejlec, Panel, Ures } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ezres, isoIdo } from "@/lib/admin/format";
import { rendelesHomlokzat } from "@/lib/admin/interfeszek";
import { rendelesMuvelet } from "../actions";

type Reszletek = {
  order_no: number;
  ref: string;
  quote_ref: string | null;
  partner_id: string;
  state: string;
  process_instance_id: string | null;
  invoice_ref: string | null;
  created_at: string;
  updated_at: string;
  lines: { productCode: string; qty: number; unitPrice: number }[];
  current_task: { key: string; name: string } | null;
};
type Tortenet = { from_state: string | null; to_state: string; action: string; ok: boolean; reason: string | null; detail: string | null; ts: string };
type Szallitas = { carrier: string; tracking_no: string | null; carrier_status: string; eta: string | null; updated_at: string };

// Melyik user taskot zárja le az adott homlokzat-művelet
const GOMBOK: { muvelet: string; felirat: string; task?: string; variant?: "default" | "outline" | "destructive" }[] = [
  { muvelet: "approve", felirat: "Jóváhagyás", task: "rendeles_jovahagyasa" },
  { muvelet: "fulfil", felirat: "Kiszállítás indítása", task: "kiszallitas_inditasa" },
  { muvelet: "invoice", felirat: "Számla kiállítása", task: "szamla_kiallitasa" },
  { muvelet: "cancel", felirat: "Lemondás", variant: "destructive" },
];

export default async function RendelesOldal({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const [r, t, sz] = await Promise.all([
    rendelesHomlokzat<Reszletek>("GET", no),
    rendelesHomlokzat<Tortenet[]>("GET", `${no}/history`),
    rendelesHomlokzat<Szallitas>("GET", `${no}/shipping`),
  ]);
  if (!r.success) notFound();
  const d = r.data;

  return (
    <>
      <OldalFejlec cim={`Rendelés ${d.ref}`} leiras="Törzsadat és aktív user task a homlokzat szerint; a műveletek a megfelelő user taskot zárják le, vagy üzenetet küldenek a folyamatnak." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="Rendelés">
          <Adatok
            sorok={[
              ["Állapot", <Allapot key="s" ertek={d.state} />],
              [
                "Aktív user task",
                d.current_task ? (
                  <span key="t" className="font-medium">
                    {d.current_task.name} <Kod>{d.current_task.key}</Kod>
                  </span>
                ) : (
                  <span key="t" className="text-muted-foreground">nincs (a folyamat vár vagy véget ért)</span>
                ),
              ],
              ["Ajánlat", d.quote_ref ? <Hivatkozas key="q" href={`/quotes/${d.quote_ref}`}>{d.quote_ref}</Hivatkozas> : null],
              ["Partner", <Kod key="p">{d.partner_id}</Kod>],
              ["Számla", d.invoice_ref ? <Hivatkozas key="i" href={`/billing/${d.invoice_ref}`}>{d.invoice_ref}</Hivatkozas> : null],
              ["Folyamatpéldány", d.process_instance_id ? <Kod key="pi">{d.process_instance_id}</Kod> : "nincs (seedelt rendelés)"],
              ["Rögzítve / módosítva", `${isoIdo(d.created_at)} / ${isoIdo(d.updated_at)}`],
            ]}
          />
        </Panel>
        <Panel cim="Műveletek">
          <div className="flex flex-wrap gap-3">
            {GOMBOK.map((g) => (
              <AkcioUrlap
                key={g.muvelet}
                action={rendelesMuvelet}
                gomb={g.felirat}
                variant={g.variant ?? (g.task && g.task === d.current_task?.key ? "default" : "outline")}
              >
                <input type="hidden" name="orderNo" value={d.order_no} />
                <input type="hidden" name="muvelet" value={g.muvelet} />
              </AkcioUrlap>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A kiemelt gomb az aktív user taskhoz tartozik. A homlokzat mindig HTTP 200-at ad; a nem engedélyezett műveletre
            „Muvelet nem engedelyezett ebben az allapotban” a válasz. A jóváhagyás a raktári foglalás miatt ~10 mp.
          </p>
          <div className="pt-2">
            <h3 className="mb-2 text-sm font-medium">Szállítás</h3>
            {sz.success ? (
              <Adatok
                sorok={[
                  ["Fuvarozó", `${sz.data.carrier} ${sz.data.tracking_no ?? ""}`],
                  ["Állapot", <Allapot key="c" ertek={sz.data.carrier_status} />],
                  ["Várható érkezés", isoIdo(sz.data.eta)],
                  ["Frissítve", isoIdo(sz.data.updated_at)],
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{sz.msg}</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel cim="Tételek">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Termék</TableHead>
              <TableHead className="text-right">Menny.</TableHead>
              <TableHead className="text-right">Egységár (nettó)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.lines.map((l) => (
              <TableRow key={l.productCode}>
                <TableCell>
                  <Hivatkozas href={`/catalog/${l.productCode}`}>{l.productCode}</Hivatkozas>
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{ezres(l.unitPrice)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel cim="Folyamattörténet">
        {!t.success || t.data.length === 0 ? (
          <Ures>Nincs bejegyzés.</Ures>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Időpont</TableHead>
                <TableHead>Átmenet</TableHead>
                <TableHead>Művelet</TableHead>
                <TableHead>Eredmény</TableHead>
                <TableHead>Ok</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.data.map((h, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap">{isoIdo(h.ts)}</TableCell>
                  <TableCell className="text-xs">
                    {h.from_state ?? "—"} → <span className="font-medium">{h.to_state}</span>
                  </TableCell>
                  <TableCell>
                    <Kod>{h.action}</Kod>
                  </TableCell>
                  <TableCell>
                    <Allapot ertek={h.ok ? "OK" : "HIBA"} />
                  </TableCell>
                  <TableCell className="text-xs">{[h.reason, h.detail].filter(Boolean).join(": ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
