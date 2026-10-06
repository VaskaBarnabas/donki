import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fizetve, pdf, storno } from "../actions";

const datum = (d: string | null) => (d ? d.replaceAll("-", ".") : "—");
const osszeg = (n: number) => Number(n).toFixed(2).replace(".", ",");

export default async function SzamlaOldal({ params }: { params: Promise<{ szam: string }> }) {
  const { szam } = await params;
  const billing = createServiceClient().schema("billing");
  const { data: s } = await billing.from("szamlak").select("*").eq("szam", szam).maybeSingle();
  if (!s) notFound();
  const [{ data: tetelek }, { data: vevo }, { data: nav }] = await Promise.all([
    billing.from("szamla_tetelek").select("*").eq("szam", szam).order("sor"),
    billing.from("vevok").select("*").eq("kod", s.vevo_kod).maybeSingle(),
    billing.from("nav_log").select("*").eq("szam", szam).order("ido"),
  ]);
  const ma = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date()).replaceAll("-", ".");
  const rejtett = <input type="hidden" name="szam" value={s.szam} />;

  return (
    <>
      <OldalFejlec cim={`${s.tipus} ${s.szam}`} leiras="Számla részletek (billing séma); a műveletek a szöveges protokollon mennek." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="Bizonylat">
          <Adatok
            sorok={[
              ["Típus", <Kod key="t">{s.tipus}</Kod>],
              ["Vevő", vevo ? `${vevo.kod} – ${vevo.nev}` : s.vevo_kod],
              ["Vevő adószám / cím", vevo ? `${vevo.adoszam} / ${vevo.cim ?? ""}` : null],
              ["Rendelés", s.rendeles_ref ? <Hivatkozas key="r" href={`/orders/${s.rendeles_ref.replace("RND-", "")}`}>{s.rendeles_ref}</Hivatkozas> : null],
              ["Kelt / határidő", <span key="d" className="font-mono">{`${datum(s.kelt)} / ${datum(s.hatarido)}`}</span>],
              ["Nettó / ÁFA / bruttó", <span key="o" className="font-mono">{`${osszeg(s.netto)} / ${osszeg(s.afa)} / ${osszeg(s.brutto)}`}</span>],
              ["Fizetve", s.fizetve ? <Allapot key="f" ertek="FIZETVE" /> : "N"],
              ["Fizetés dátuma", datum(s.fizetve_datum)],
              ["Lejárt", s.lejart ? <Allapot key="l" ertek="LEJART" /> : "N"],
              ["Sztornózva", s.sztornozva ? "I" : "N"],
              ["Eredeti számla", s.eredeti_szam ? <Hivatkozas key="e" href={`/billing/${s.eredeti_szam}`}>{s.eredeti_szam}</Hivatkozas> : null],
              ["PDF", s.pdf_utvonal ?? "még nem készült (első lekéréskor)"],
            ]}
          />
        </Panel>
        <Panel cim="Műveletek">
          <AkcioUrlap action={pdf} gomb="PDF (SZAMLA|PDF)" variant="outline">
            {rejtett}
          </AkcioUrlap>
          <AkcioUrlap action={fizetve} gomb="Fizetettnek jelöl (SZAMLA|FIZETVE)">
            {rejtett}
            <Mezo cimke="Fizetés dátuma (YYYY.MM.DD)">
              <SzovegMezo name="datum" defaultValue={ma} className="font-mono" />
            </Mezo>
          </AkcioUrlap>
          <AkcioUrlap action={storno} gomb="Sztornó (SZAMLA|STORNO)" variant="destructive" valaszMutatasa>
            {rejtett}
          </AkcioUrlap>
          <div className="pt-2">
            <h3 className="mb-1 text-sm font-medium">Szimulált NAV adatszolgáltatás</h3>
            {(nav ?? []).map((n) => (
              <p key={n.id} className="font-mono text-xs text-muted-foreground">
                {n.muvelet} · {n.statusz} · {n.uzenet}
              </p>
            ))}
          </div>
        </Panel>
      </div>
      <Panel cim="Tételek">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Megnevezés</TableHead>
              <TableHead className="text-right">Mennyiség</TableHead>
              <TableHead className="text-right">Egységár (nettó)</TableHead>
              <TableHead className="text-right">ÁFA %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tetelek ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.sor}</TableCell>
                <TableCell className="font-mono text-xs">{t.megnevezes}</TableCell>
                <TableCell className="text-right font-mono text-xs">{osszeg(t.mennyiseg)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{osszeg(t.egysegar)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{osszeg(t.afa_kulcs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
