import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Mezo, OldalFejlec, Panel, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALLAPOT_NEV, JOVAHAGYAS_NEV, ucpLista } from "@/lib/portal/ucp";
import { elutasitas, jovahagyas } from "./actions";

// UCP-rendelések (21. fázis): a Universal Commerce Protocolon érkező, külső vásárló ágensek által leadott rendelések.
// Minden ilyen rendelés emberi jóváhagyással megy (docs/FAZIS21_TERV.md, D1); a jóváhagyás után az átjáró rögzíti.

const ft = (n: number | null) => (n === null ? "–" : `${Math.round(n).toLocaleString("hu-HU")} Ft`);
const ido = (s: string) => new Date(s).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });

export default async function UcpOldal({ searchParams }: { searchParams: Promise<{ nezet?: string }> }) {
  const p = await searchParams;
  const nezet = p.nezet === "mind" ? "mind" : "var";
  let lista: Awaited<ReturnType<typeof ucpLista>> = [];
  let hiba: string | null = null;
  try {
    lista = await ucpLista(nezet);
  } catch (e) {
    hiba = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <OldalFejlec
        cim="UCP-rendelések"
        leiras="Külső vásárló ágensek (Universal Commerce Protocol) által leadott rendelések. Az ágens önállóan összeállítja a vásárlást, de rendelés csak a jóváhagyásod után jön létre. Jóváhagyni az értékesítési vezető és a rendszergazda tud."
      />
      <SzuroUrlap alap="/ucp">
        <Mezo cimke="Nézet">
          <Valaszto name="nezet" defaultValue={nezet === "mind" ? "mind" : ""} opciok={[["", "Jóváhagyásra vár"], ["mind", "Mind"]]} />
        </Mezo>
      </SzuroUrlap>
      <Panel cim={nezet === "var" ? "Jóváhagyásra vár" : "Minden UCP-vásárlás"}>
        {hiba ? (
          <p className="text-sm text-destructive">A UCP-rendelések most nem érhetők el ({hiba}).</p>
        ) : lista.length === 0 ? (
          <Ures>{nezet === "var" ? "Nincs jóváhagyásra váró UCP-rendelés." : "Még nem érkezett UCP-vásárlás."}</Ures>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vevő</TableHead>
                <TableHead>Tételek</TableHead>
                <TableHead className="text-right">Nettó / bruttó</TableHead>
                <TableHead>Állapot</TableHead>
                <TableHead>Döntés</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="align-top">
                    <div className="font-medium">{u.ugyfel?.name ?? "nem azonosított vevő"}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.vevo?.email ?? "–"} · {u.ugyfel?.taxNumber ?? "adószám nélkül"}
                    </div>
                    {u.ugyfel?.azonositas && <div className="text-xs text-amber-700 dark:text-amber-400">azonosítás: {u.ugyfel.azonositas} – ellenőrizd a vevővel</div>}
                    <div className="text-xs text-muted-foreground break-all">platform: {u.platform}</div>
                    <div className="text-xs text-muted-foreground">{ido(u.letrejott)}</div>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {u.tetelek.map((t) => `${t.quantity} × ${t.sku}`).join(", ")}
                    {u.ajanlat && <div className="text-xs text-muted-foreground">ajánlat: {u.ajanlat}</div>}
                    {u.rendeles && <div className="text-xs text-muted-foreground">rendelés: {u.rendeles}</div>}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap text-right text-sm">
                    {ft(u.netto)}
                    <div className="text-xs text-muted-foreground">{ft(u.brutto)}</div>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {ALLAPOT_NEV[u.allapot] ?? u.allapot}
                    <div className="text-xs text-muted-foreground">{JOVAHAGYAS_NEV[u.jovahagyas] ?? u.jovahagyas}</div>
                    {u.hiba && <div className="text-xs text-destructive">{u.hiba}</div>}
                  </TableCell>
                  <TableCell className="align-top">
                    {u.allapot === "complete_in_progress" && u.jovahagyas === "var" ? (
                      <div className="flex flex-col gap-2">
                        <AkcioUrlap action={jovahagyas} gomb="Jóváhagyom">
                          <input type="hidden" name="id" value={u.id} />
                        </AkcioUrlap>
                        <AkcioUrlap action={elutasitas} gomb="Elutasítom" variant="outline">
                          <input type="hidden" name="id" value={u.id} />
                          <SzovegMezo name="indok" placeholder="indok (a vásárló ágens megkapja)" required minLength={3} maxLength={300} />
                        </AkcioUrlap>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {u.dontotte ? `${u.dontotte}${u.dontesIdo ? `, ${ido(u.dontesIdo)}` : ""}` : "–"}
                        {u.dontesOka && <div>{u.dontesOka}</div>}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
