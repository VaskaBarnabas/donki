import Link from "next/link";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, OldalFejlec, Panel, Ures } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminEllenorzes, rendszerAllapotok, VezerlesHiba } from "@/lib/admin/vezerles";
import { figyeloNezet } from "@/lib/portal/jelzesek";
import { createClient } from "@/lib/supabase/server";
import { figyeloAllitas } from "../jelzesek/actions";
import { RendszerFigyelo } from "./figyelo";

// Rendszerek (16. fázis, teljes változat): a független vállalati rendszerek élő állapota, kapcsolati térképe,
// ki/be kapcsolása és naplója. Egy rendszer leállítása a valódi kiesést szimulálja. Csak admin.

export default async function RendszerekOldal() {
  try {
    await adminEllenorzes();
  } catch (e) {
    return <OldalFejlec cim="Rendszerek" leiras={e instanceof VezerlesHiba ? e.message : String(e)} />;
  }
  let kezdo: Awaited<ReturnType<typeof rendszerAllapotok>> = [];
  let hiba: string | null = null;
  try {
    kezdo = await rendszerAllapotok();
  } catch (e) {
    hiba = e instanceof Error ? e.message : String(e);
  }
  const supabase = await createClient();
  const { data: naplo } = await supabase.from("control_log").select("at, email, system, action, result").order("at", { ascending: false }).limit(20);

  return (
    <>
      <OldalFejlec
        cim="Rendszerek"
        leiras="A független vállalati rendszerek: mindegyik saját konténercsoport (adatbázis + interfész + szolgáltatás). Egy rendszer leállítása a valódi kiesést szimulálja – a tőle függő rendszerek és a portál kártyái hibát jeleznek."
      />
      {hiba && <p className="text-sm text-destructive">{hiba}</p>}
      <RendszerFigyelo kezdo={kezdo} />
      <HatterFigyelo />
      <Panel cim="Műveleti napló">
        {(naplo ?? []).length === 0 ? (
          <Ures>Még nem volt ki/be kapcsolás.</Ures>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Idő</TableHead>
                <TableHead>Ki</TableHead>
                <TableHead>Rendszer</TableHead>
                <TableHead>Művelet</TableHead>
                <TableHead>Eredmény</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(naplo ?? []).map((n, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(n.at).toLocaleString("hu-HU")}</TableCell>
                  <TableCell className="text-xs">{n.email}</TableCell>
                  <TableCell className="text-xs">{n.system}</TableCell>
                  <TableCell className="text-xs">{{ start: "indítás", stop: "leállítás", restart: "újraindítás" }[n.action as "start"] ?? n.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{n.result}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}

/** A háttérfigyelő (18. fázis) állapota és kapcsolója: az ágens réteg része, a portál folyamatában fut. */
async function HatterFigyelo() {
  let f: Awaited<ReturnType<typeof figyeloNezet>>;
  try {
    f = await figyeloNezet();
  } catch (e) {
    return (
      <Panel cim="Háttérfigyelő (jelzések)">
        <p className="text-sm text-muted-foreground">Az ágens adatbázisa nem érhető el: {e instanceof Error ? e.message : String(e)}</p>
      </Panel>
    );
  }
  const regota = f.utolsoKor ? Math.round((Date.now() - new Date(f.utolsoKor).getTime()) / 1000) : null;
  return (
    <Panel cim="Háttérfigyelő (jelzések)">
      <p className="text-sm text-muted-foreground">
        A portál folyamatában fut: a rendszerek eseménysorait 15 másodpercenként, az időzített ellenőrzéseket (készlet, tartozás, ajánlat, elakadt rendelés, hibajegy) 10 percenként nézi, és a kivételekről{" "}
        <Link href="/jelzesek" className="text-primary underline">
          jelzést
        </Link>{" "}
        készít. Csak olvas – az MCP-n a csak olvasó <code>monitor</code> szerepkörrel.
      </p>
      <Adatok
        sorok={[
          ["Állapot", f.bekapcsolva ? (regota !== null && regota < 120 ? "fut" : "bekapcsolva, de nem fut (fut a portál? npm run dev)") : "kikapcsolva"],
          ["Utolsó kör", f.utolsoKor ? `${new Date(f.utolsoKor).toLocaleString("hu-HU")} (${regota} s-a)` : "még nem futott"],
          ["Körök / feldolgozott esemény", `${f.korok} / ${f.feldolgozottEsemeny}`],
          ["Nyitott jelzés (ebből elemzésre vár)", `${f.nyitott} (${f.elemzesre})`],
          ["Utolsó hiba", f.utolsoHiba ?? "—"],
        ]}
      />
      <AkcioUrlap action={figyeloAllitas} gomb={f.bekapcsolva ? "Kikapcsolás" : "Bekapcsolás"} variant={f.bekapcsolva ? "outline" : "default"}>
        <input type="hidden" name="be" value={f.bekapcsolva ? "0" : "1"} />
      </AkcioUrlap>
    </Panel>
  );
}
