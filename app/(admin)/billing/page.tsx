import { RendszerHiany } from "@/components/admin/rendszer-hiany";
import { Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo, SzuroUrlap, Ures, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { egyParam, type KeresesiParameterek } from "@/lib/admin/format";
import { szamlak as szamlaLista } from "@/lib/admin/rendszerek";
import { Terminal } from "./terminal";

// A számlázó a saját formátumában (SZAMLA|LISTA): dátum YYYY.MM.DD, összeg vesszős tizedes.
// 16. fázis: a bizonylatok gazdája a Számlázz.hu – a „Számlázz.hu” oszlop a szinkron állapotát mutatja.

export default async function SzamlazasOldal({ searchParams }: { searchParams: KeresesiParameterek }) {
  const hiany = await RendszerHiany({ rendszer: "billing" });
  if (hiany) return hiany;

  const sp = await searchParams;
  const tipus = egyParam(sp.tipus);
  const allapot = egyParam(sp.allapot);
  const vevo = egyParam(sp.vevo);

  const { sorok, hiba } = await szamlaLista();
  const szamlak = sorok
    .filter((s) => !tipus || s.tipus === tipus)
    .filter((s) => allapot !== "lejart" || (s.lejart && !s.fizetve))
    .filter((s) => allapot !== "nyitott" || (!s.fizetve && s.tipus !== "STORNO"))
    .filter((s) => allapot !== "fizetve" || s.fizetve)
    .filter((s) => !vevo || s.vevo.toUpperCase().includes(vevo.toUpperCase()));

  return (
    <>
      <OldalFejlec
        cim="Számlázás"
        leiras="Egyedi szöveges protokoll (POST /api/legacy/billing, text/plain): | mezőelválasztó, ékezet nélküli nagybetű, dátum YYYY.MM.DD, összeg 38100,00. ÁFA fix 27%. A bizonylatok gazdája a Számlázz.hu (tesztfiók): minden kiállítás, sztornó és kifizetés ott is megtörténik."
      />
      <Panel cim="Terminál">
        <Terminal />
      </Panel>
      <SzuroUrlap alap="/billing">
        <Mezo cimke="Típus">
          <Valaszto name="tipus" defaultValue={tipus} opciok={[["", "mind"], ["SZAMLA", "SZAMLA"], ["DIJBEKERO", "DIJBEKERO"], ["STORNO", "STORNO"]]} />
        </Mezo>
        <Mezo cimke="Állapot">
          <Valaszto name="allapot" defaultValue={allapot} opciok={[["", "mind"], ["nyitott", "nyitott"], ["lejart", "lejárt, nem fizetett"], ["fizetve", "fizetett"]]} />
        </Mezo>
        <Mezo cimke="Vevőkód">
          <SzovegMezo name="vevo" defaultValue={vevo} placeholder="VEVO-1001" />
        </Mezo>
      </SzuroUrlap>
      {hiba && <p className="text-sm text-destructive">{hiba}</p>}
      {szamlak.length === 0 ? (
        <Ures />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sorszám</TableHead>
              <TableHead>Típus</TableHead>
              <TableHead>Vevő</TableHead>
              <TableHead>Kelt</TableHead>
              <TableHead>Határidő</TableHead>
              <TableHead className="text-right">Bruttó</TableHead>
              <TableHead>Állapot</TableHead>
              <TableHead>Számlázz.hu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {szamlak.map((s) => (
              <TableRow key={s.szam}>
                <TableCell>
                  <Hivatkozas href={`/billing/${s.szam}`}>{s.szam}</Hivatkozas>
                </TableCell>
                <TableCell>
                  <Kod>{s.tipus}</Kod>
                </TableCell>
                <TableCell>
                  <Kod>{s.vevo}</Kod>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.kelt}</TableCell>
                <TableCell className="font-mono text-xs">{s.hatarido}</TableCell>
                <TableCell className="text-right font-mono text-xs">{s.brutto}</TableCell>
                <TableCell className="flex gap-1">
                  {s.fizetve && <Allapot ertek="FIZETVE" />}
                  {s.lejart && !s.fizetve && <Allapot ertek="LEJART" />}
                </TableCell>
                <TableCell>
                  <Allapot ertek={s.szinkron === "OK" ? "EGYEZIK" : s.szinkron} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
