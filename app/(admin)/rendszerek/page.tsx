import { OldalFejlec, Panel, Ures } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminEllenorzes, rendszerAllapotok, VezerlesHiba } from "@/lib/admin/vezerles";
import { createClient } from "@/lib/supabase/server";
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
