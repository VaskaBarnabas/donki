import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { OldalFejlec, Panel } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminEllenorzes, rendszerAllapotok, VezerlesHiba } from "@/lib/admin/vezerles";
import { muvelet } from "./actions";

// Ideiglenes állapotoldal (15. fázis): a független rendszerek konténercsoportjai, egészség, memória, ki/be kapcsolás.
// A teljes irányítópult (kapcsolati térkép, napló, integrációk) a 16. fázisban készül.

const ALLAPOT = { fut: "fut", leallt: "leállítva", reszleges: "részben fut" } as const;

export default async function RendszerekOldal() {
  try {
    await adminEllenorzes();
  } catch (e) {
    return <OldalFejlec cim="Rendszerek" leiras={e instanceof VezerlesHiba ? e.message : String(e)} />;
  }
  let rendszerek: Awaited<ReturnType<typeof rendszerAllapotok>> = [];
  let hiba: string | null = null;
  try {
    rendszerek = await rendszerAllapotok();
  } catch (e) {
    hiba = e instanceof Error ? e.message : String(e);
  }
  const leallt = new Set(rendszerek.filter((r) => r.allapot !== "fut").map((r) => r.rendszer));

  return (
    <>
      <OldalFejlec
        cim="Rendszerek"
        leiras="A független vállalati rendszerek: mindegyik saját konténercsoport (adatbázis + interfész + szolgáltatás). Egy rendszer leállítása a valódi kiesést szimulálja – a tőle függő rendszerek hibát kapnak."
      />
      {hiba && <p className="text-sm text-destructive">{hiba}</p>}
      <Panel cim="Állapot">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rendszer</TableHead>
              <TableHead>Interfész</TableHead>
              <TableHead>Állapot</TableHead>
              <TableHead>Egészség</TableHead>
              <TableHead className="text-right">Memória</TableHead>
              <TableHead>Konténerek</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rendszerek.map((r) => {
              const erintett = r.allapot === "fut" && r.fuggosegek.some((f) => leallt.has(f));
              const mem = r.kontenerek.reduce((s, k) => s + (k.memoriaMb ?? 0), 0);
              return (
                <TableRow key={r.rendszer}>
                  <TableCell className="font-medium">
                    {r.nev}
                    <div className="text-xs text-muted-foreground">{r.rendszer}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.interfesz}</TableCell>
                  <TableCell>
                    <span className={r.allapot === "fut" ? "text-emerald-600" : "text-destructive"}>{ALLAPOT[r.allapot]}</span>
                    {erintett && <div className="text-xs text-amber-600">érintett: {r.fuggosegek.filter((f) => leallt.has(f)).join(", ")} nem fut</div>}
                  </TableCell>
                  <TableCell className="text-sm">{r.egeszseg ? (r.egeszseg.ok ? `ok (${r.egeszseg.ms} ms)` : "hibás") : "–"}</TableCell>
                  <TableCell className="text-right text-sm">{mem ? `${mem} MB` : "–"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.kontenerek.map((k) => (
                      <div key={k.nev}>
                        {k.nev}: {k.allapot}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.allapot !== "fut" && (
                        <AkcioUrlap action={muvelet} gomb="Indítás" variant="outline">
                          <input type="hidden" name="rendszer" value={r.rendszer} />
                          <input type="hidden" name="muvelet" value="start" />
                        </AkcioUrlap>
                      )}
                      {r.allapot !== "leallt" && (
                        <AkcioUrlap action={muvelet} gomb="Leállítás" variant="destructive">
                          <input type="hidden" name="rendszer" value={r.rendszer} />
                          <input type="hidden" name="muvelet" value="stop" />
                        </AkcioUrlap>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
