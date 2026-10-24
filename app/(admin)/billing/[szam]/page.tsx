import { notFound } from "next/navigation";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, Allapot, Hivatkozas, Kod, Mezo, OldalFejlec, Panel, SzovegMezo } from "@/components/admin/elemek";
import { RendszerHiany } from "@/components/admin/rendszer-hiany";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { protokollMezo, szamlazoParancs } from "@/lib/admin/interfeszek";
import { adatlap, tetelek as tetelLista } from "@/lib/admin/rendszerek";
import { fizetve, kulsoSzamla, pdf, storno } from "../actions";

// Egy bizonylat a számlázó saját protokollján (SZAMLA|ADATLAP, SZAMLA|TETELEK, PARTNER|ADAT) – a számlázó formátumában.

export default async function SzamlaOldal({ params }: { params: Promise<{ szam: string }> }) {
  const hiany = await RendszerHiany({ rendszer: "billing" });
  if (hiany) return hiany;
  const { szam } = await params;
  if (!/^[A-Z]{2}-\d{4}-\d{6}$/.test(szam)) notFound();
  const s = await adatlap(szam);
  if (!s) notFound();
  const [tetelek, vevoValasz] = await Promise.all([tetelLista(szam), szamlazoParancs(`PARTNER|ADAT|${protokollMezo(s.vevo)}`)]);
  const vevo = vevoValasz.startsWith("OK|") ? vevoValasz.split("|") : null; // OK|kod|NEV|adoszam|CIM
  const ma = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date()).replaceAll("-", ".");
  const rejtett = <input type="hidden" name="szam" value={s.szam} />;

  return (
    <>
      <OldalFejlec cim={`${s.tipus} ${s.szam}`} leiras="Bizonylat a számlázó szöveges protokollján. A gazda a Számlázz.hu: ott ugyanez a bizonylat látszik (a sorszámával)." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel cim="Bizonylat">
          <Adatok
            sorok={[
              ["Típus", <Kod key="t">{s.tipus}</Kod>],
              ["Vevő", vevo ? `${vevo[1]} – ${vevo[2]}` : s.vevo],
              ["Vevő adószám / cím", vevo ? `${vevo[3]} / ${vevo[4] ?? ""}` : null],
              ["Rendelés", s.rendeles ? <Hivatkozas key="r" href={`/orders/${s.rendeles.replace("RND-", "")}`}>{s.rendeles}</Hivatkozas> : null],
              ["Kelt / határidő", <span key="d" className="font-mono">{`${s.kelt} / ${s.hatarido}`}</span>],
              ["Nettó / ÁFA / bruttó", <span key="o" className="font-mono">{`${s.netto} / ${s.afa} / ${s.brutto}`}</span>],
              ["Fizetve", s.fizetve ? <Allapot key="f" ertek="FIZETVE" /> : "N"],
              ["Fizetés dátuma", s.fizetveDatum ?? "—"],
              ["Lejárt", s.lejart ? <Allapot key="l" ertek="LEJART" /> : "N"],
              ["Sztornózva", s.sztornozva ? "I" : "N"],
              ["Eredeti számla", s.eredeti ? <Hivatkozas key="e" href={`/billing/${s.eredeti}`}>{s.eredeti}</Hivatkozas> : null],
              ["Számlázz.hu sorszám", s.szamlazzSzam ? <Kod key="z">{s.szamlazzSzam}</Kod> : "— (még nincs átvezetve)"],
              ["Szinkron", <Allapot key="sz" ertek={s.szinkron === "OK" ? "EGYEZIK" : s.szinkron} />],
            ]}
          />
        </Panel>
        <Panel cim="Műveletek">
          <AkcioUrlap action={pdf} gomb="PDF a Számlázz.hu-ból (SZAMLA|PDF)" variant="outline">
            {rejtett}
          </AkcioUrlap>
          {s.tipus === "DIJBEKERO" && (
            <AkcioUrlap action={kulsoSzamla} gomb="Végszámla állapota (SZAMLA|KULSO)" variant="outline" valaszMutatasa>
              {rejtett}
            </AkcioUrlap>
          )}
          <AkcioUrlap action={fizetve} gomb="Fizetettnek jelöl (SZAMLA|FIZETVE)">
            {rejtett}
            <Mezo cimke="Fizetés dátuma (YYYY.MM.DD)">
              <SzovegMezo name="datum" defaultValue={ma} className="font-mono" />
            </Mezo>
          </AkcioUrlap>
          <AkcioUrlap action={storno} gomb="Sztornó (SZAMLA|STORNO)" variant="destructive" valaszMutatasa>
            {rejtett}
          </AkcioUrlap>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {tetelek.map((t, i) => (
              <TableRow key={i}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-mono text-xs">{t.megnevezes}</TableCell>
                <TableCell className="text-right font-mono text-xs">{t.mennyiseg}</TableCell>
                <TableCell className="text-right font-mono text-xs">{t.egysegar}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
