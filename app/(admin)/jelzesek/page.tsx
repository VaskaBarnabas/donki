import Link from "next/link";
import { Mezo, OldalFejlec, Panel, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SZABALY_NEV } from "@/agens/figyelo/szabalyok";
import { jelzesLista } from "@/lib/portal/jelzesek";
import { AllapotJel, ido, SulyossagJel } from "./elemek";

// Jelzések (18. fázis): a háttérfigyelő által magától észlelt kivételek (készlethiány, késő csomag, lejárt tartozás, …),
// az ágens elemzésével és javaslatával. Mindenki a saját szerepkörének jelzéseit látja, a rendszergazda mindet.

export default async function JelzesekOldal({ searchParams }: { searchParams: Promise<{ nezet?: string; szabaly?: string; sulyossag?: string }> }) {
  const p = await searchParams;
  const lezart = p.nezet === "lezart";
  const szabaly = p.szabaly && /^J\d$/.test(p.szabaly) ? p.szabaly : "";
  const sulyossag = ["magas", "kozepes", "alacsony"].includes(p.sulyossag ?? "") ? p.sulyossag! : "";
  let lista: Awaited<ReturnType<typeof jelzesLista>> = [];
  let hiba: string | null = null;
  try {
    lista = await jelzesLista({ lezart, szabaly, sulyossag });
  } catch (e) {
    hiba = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <OldalFejlec
        cim="Jelzések"
        leiras="A háttérfigyelő magától észleli a kivételeket – készlethiány, késő csomag, lejárt fizetés vagy tartozás, régóta váró ajánlat, elakadt rendelés, régóta nyitott hibajegy –, és mindegyikhez az asszisztens elemzést és javaslatot ír. A figyelő semmit nem módosít: a javaslatot te indítod el az asszisztensben, jóváhagyással."
      />
      <SzuroUrlap alap="/jelzesek">
        <Mezo cimke="Nézet">
          <Valaszto name="nezet" defaultValue={lezart ? "lezart" : ""} opciok={[["", "Nyitott"], ["lezart", "Lezárt"]]} />
        </Mezo>
        <Mezo cimke="Szabály">
          <Valaszto name="szabaly" defaultValue={szabaly} opciok={[["", "Mind"], ...Object.entries(SZABALY_NEV).map(([k, v]) => [k, `${k} · ${v}`] as [string, string])]} />
        </Mezo>
        <Mezo cimke="Súlyosság">
          <Valaszto name="sulyossag" defaultValue={sulyossag} opciok={[["", "Mind"], ["magas", "magas"], ["kozepes", "közepes"], ["alacsony", "alacsony"]]} />
        </Mezo>
      </SzuroUrlap>
      <Panel cim={lezart ? "Lezárt jelzések" : "Nyitott jelzések"}>
        {hiba ? (
          <p className="text-sm text-destructive">A jelzések most nem érhetők el (az ágens adatbázisa: {hiba}).</p>
        ) : lista.length === 0 ? (
          <Ures>{lezart ? "Nincs lezárt jelzés." : "Nincs nyitott jelzés – minden rendben."}</Ures>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Súlyosság</TableHead>
                <TableHead>Jelzés</TableHead>
                <TableHead>Szabály</TableHead>
                <TableHead>Állapot</TableHead>
                <TableHead className="text-right">Észlelve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>
                    <SulyossagJel s={j.sulyossag} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/jelzesek/${j.id}`} className="font-medium text-primary hover:underline">
                      {j.cim}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {j.szabaly} · {j.szabalyNev}
                  </TableCell>
                  <TableCell>
                    <AllapotJel a={j.allapot} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                    {ido(j.letrejott)}
                    {j.eszlelesek > 1 && ` · ${j.eszlelesek}×, utoljára ${ido(j.utoljaraEszlelve)}`}
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
