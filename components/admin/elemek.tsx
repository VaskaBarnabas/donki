// Az admin oldalak egyszerű, közös megjelenítő elemei (csak UI).

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function OldalFejlec({ cim, leiras, children }: { cim: string; leiras?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{cim}</h1>
        {leiras && <p className="text-sm text-muted-foreground max-w-3xl">{leiras}</p>}
      </div>
      {children}
    </div>
  );
}

export function Panel({ cim, children, className }: { cim: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{cim}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

/** Kulcs–érték lista a részletnézetekhez. */
export function Adatok({ sorok }: { sorok: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
      {sorok.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-all">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Kod({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{children}</code>;
}

const KIEMELT = new Set(["OK", "AKTIV", "JOVAHAGYOTT", "ELFOGADVA", "SUCCEEDED", "LEZART", "KEZBESITVE", "SZALLITVA", "true", "FIZETVE"]);
const HIBAS = new Set(["LEMONDOTT", "ELUTASITVA", "LEJART", "FAILED", "EXPIRED", "KESIK", "false"]);

export function Allapot({ ertek }: { ertek: string | boolean | null | undefined }) {
  if (ertek === null || ertek === undefined || ertek === "") return <span className="text-muted-foreground">—</span>;
  const s = String(ertek);
  return (
    <Badge variant={HIBAS.has(s) ? "destructive" : KIEMELT.has(s) ? "default" : "secondary"} className="font-mono text-[11px]">
      {s}
    </Badge>
  );
}

export function Hivatkozas({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- szűrő űrlap (GET)

const mezoOsztaly =
  "h-8 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function SzuroUrlap({ children, alap }: { children: React.ReactNode; alap: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      {children}
      <button type="submit" className={cn(mezoOsztaly, "bg-secondary font-medium hover:bg-secondary/80")}>
        Szűrés
      </button>
      <Link href={alap} className="text-sm text-muted-foreground hover:underline px-1 pb-1.5">
        törlés
      </Link>
    </form>
  );
}

export function Mezo({ cimke, children }: { cimke: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {cimke}
      {children}
    </label>
  );
}

export function SzovegMezo(props: React.ComponentProps<"input">) {
  return <input {...props} className={cn(mezoOsztaly, "min-w-36", props.className)} />;
}

export function Valaszto({ opciok, ...props }: React.ComponentProps<"select"> & { opciok: [string, string][] }) {
  return (
    <select {...props} className={cn(mezoOsztaly, "min-w-36", props.className)}>
      {opciok.map(([ertek, felirat]) => (
        <option key={ertek} value={ertek}>
          {felirat}
        </option>
      ))}
    </select>
  );
}

export function Ures({ children = "Nincs találat." }: { children?: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
