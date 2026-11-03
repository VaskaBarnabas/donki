import { Badge } from "@/components/ui/badge";
import type { JelzesAllapot, Sulyossag } from "@/lib/portal/jelzesek";
import { ALLAPOT_NEV } from "@/lib/portal/jelzesek";
import { cn } from "@/lib/utils";

// A jelzések közös megjelenítő elemei (súlyosság és állapot).

const SULYOSSAG: Record<Sulyossag, { nev: string; osztaly: string }> = {
  magas: { nev: "magas", osztaly: "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-400" },
  kozepes: { nev: "közepes", osztaly: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  alacsony: { nev: "alacsony", osztaly: "border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-400" },
};

export function SulyossagJel({ s }: { s: Sulyossag }) {
  return (
    <Badge variant="outline" className={cn("text-[11px]", SULYOSSAG[s].osztaly)}>
      {SULYOSSAG[s].nev}
    </Badge>
  );
}

export function AllapotJel({ a }: { a: JelzesAllapot }) {
  return (
    <Badge variant={a === "MEGOLDVA" ? "default" : a === "ELVETVE" ? "outline" : "secondary"} className="text-[11px]">
      {ALLAPOT_NEV[a]}
    </Badge>
  );
}

export const ido = (iso: string) => new Date(iso).toLocaleString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
