"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { RendszerAllapot } from "@/lib/rendszer/vezerles-mag";

// A Rendszerek oldal élő része: 5 mp-enként lekérdezi a vezérlő API-t; kártyák, kapcsolati térkép, ki/be
// kapcsolás megerősítéssel, napló oldalpanelen. (Csak admin – az API maga is ellenőrzi.)

type Allapot = "fut" | "leallt" | "reszleges";

// a kapcsolati térkép elrendezése (x, y a 0–100 tartományban)
const HELY: Record<string, [number, number]> = {
  quote: [12, 22],
  crm: [12, 78],
  orders: [42, 50],
  inventory: [72, 82],
  billing: [72, 18],
  payments: [92, 50],
  support: [42, 88],
  mcp: [42, 12],
};

function szin(r: RendszerAllapot, leallt: Set<string>): string {
  if (r.allapot !== "fut") return "#dc2626";
  if (r.fuggosegek.some((f) => leallt.has(f)) || (r.egeszseg && !r.egeszseg.ok)) return "#d97706";
  return "#16a34a";
}

export function RendszerFigyelo({ kezdo }: { kezdo: RendszerAllapot[] }) {
  const [rendszerek, setRendszerek] = useState(kezdo);
  const [frissitve, setFrissitve] = useState<Date>(new Date());
  const [folyamatban, setFolyamatban] = useState<string | null>(null);
  const [naplo, setNaplo] = useState<{ rendszer: string; nev: string; sorok: { kontener: string; sorok: string[] }[] } | null>(null);

  const frissit = useCallback(async () => {
    try {
      const r = await fetch("/api/rendszerek", { cache: "no-store" });
      if (!r.ok) return;
      setRendszerek(((await r.json()) as { rendszerek: RendszerAllapot[] }).rendszerek);
      setFrissitve(new Date());
    } catch {
      // a következő körben újra
    }
  }, []);

  useEffect(() => {
    const t = setInterval(frissit, 5000);
    return () => clearInterval(t);
  }, [frissit]);

  const leallt = useMemo(() => new Set(rendszerek.filter((r) => r.allapot !== "fut").map((r) => r.rendszer)), [rendszerek]);

  async function muvelet(r: RendszerAllapot, m: "start" | "stop" | "restart") {
    const ige = { start: "elindítod", stop: "leállítod", restart: "újraindítod" }[m];
    const erintett = rendszerek.filter((x) => x.fuggosegek.includes(r.rendszer)).map((x) => x.nev);
    if (m !== "start" && !window.confirm(`Biztosan ${ige}: ${r.nev}?${erintett.length ? `\n\nEz érinti: ${erintett.join(", ")}.` : ""}`)) return;
    setFolyamatban(r.rendszer);
    try {
      const v = await fetch(`/api/rendszerek/${r.rendszer}/${m}`, { method: "POST" });
      const t = (await v.json()) as { hiba?: string; kontenerek?: string[] };
      if (!v.ok) toast.error(t.hiba ?? `HTTP ${v.status}`);
      else toast.success(`${r.nev}: ${{ start: "elindítva", stop: "leállítva", restart: "újraindítva" }[m]} (${t.kontenerek?.length} konténer)`);
      await frissit();
    } finally {
      setFolyamatban(null);
    }
  }

  async function naploMegnyit(r: RendszerAllapot) {
    setNaplo({ rendszer: r.rendszer, nev: r.nev, sorok: [] });
    const v = await fetch(`/api/rendszerek/${r.rendszer}/naplo?sorok=150`, { cache: "no-store" });
    if (v.ok) setNaplo({ rendszer: r.rendszer, nev: r.nev, sorok: ((await v.json()) as { naplo: { kontener: string; sorok: string[] }[] }).naplo });
  }

  useEffect(() => {
    if (!naplo) return;
    const t = setInterval(async () => {
      const v = await fetch(`/api/rendszerek/${naplo.rendszer}/naplo?sorok=150`, { cache: "no-store" });
      if (v.ok) {
        const d = (await v.json()) as { naplo: { kontener: string; sorok: string[] }[] };
        setNaplo((n) => (n && n.rendszer === naplo.rendszer ? { ...n, sorok: d.naplo } : n));
      }
    }, 5000);
    return () => clearInterval(t);
  }, [naplo?.rendszer]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
            <span>Kapcsolati térkép</span>
            <span className="text-xs font-normal">frissítve: {frissitve.toLocaleTimeString("hu-HU")}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-64 w-full" role="img" aria-label="A rendszerek függőségei">
            {rendszerek.flatMap((r) =>
              r.fuggosegek
                .filter((f) => HELY[f] && HELY[r.rendszer])
                .map((f) => (
                  <line
                    key={`${r.rendszer}-${f}`}
                    x1={HELY[r.rendszer][0]}
                    y1={HELY[r.rendszer][1]}
                    x2={HELY[f][0]}
                    y2={HELY[f][1]}
                    stroke={leallt.has(f) ? "#dc2626" : "currentColor"}
                    strokeOpacity={leallt.has(f) ? 0.8 : 0.2}
                    strokeWidth={0.4}
                    strokeDasharray={leallt.has(f) ? "1.5 1" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                ))
            )}
          </svg>
          <div className="relative -mt-64 h-64">
            {rendszerek
              .filter((r) => HELY[r.rendszer])
              .map((r) => (
                <div
                  key={r.rendszer}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background px-2 py-1 text-xs shadow-sm"
                  style={{ left: `${HELY[r.rendszer][0]}%`, top: `${HELY[r.rendszer][1]}%`, borderColor: szin(r, leallt) }}
                >
                  <span className="mr-1 inline-block size-2 rounded-full" style={{ background: szin(r, leallt) }} />
                  {r.nev}
                </div>
              ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="text-emerald-600">●</span> fut · <span className="text-amber-600">●</span> fut, de egy függősége kiesett vagy nem egészséges · <span className="text-red-600">●</span> leállítva
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {rendszerek.map((r) => {
          const mem = r.kontenerek.reduce((s, k) => s + (k.memoriaMb ?? 0), 0);
          const erintett = r.fuggosegek.filter((f) => leallt.has(f));
          return (
            <Card key={r.rendszer}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                  <span>{r.nev}</span>
                  <Badge variant={r.allapot === "fut" ? (erintett.length ? "outline" : "default") : "destructive"}>
                    {({ fut: "fut", leallt: "leállítva", reszleges: "részben fut" } as Record<Allapot, string>)[r.allapot]}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs">
                <p className="text-muted-foreground">{r.interfesz}</p>
                {erintett.length > 0 && <p className="text-amber-600">érintett: {erintett.join(", ")} nem fut</p>}
                <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <dt className="text-muted-foreground">Egészség</dt>
                  <dd>{r.egeszseg ? (r.egeszseg.ok ? `ok · ${r.egeszseg.ms} ms` : "hibás") : "–"}</dd>
                  <dt className="text-muted-foreground">Memória</dt>
                  <dd>{mem ? `${mem} MB` : "–"}</dd>
                  <dt className="text-muted-foreground">Konténerek</dt>
                  <dd>
                    {r.kontenerek.filter((k) => k.allapot === "running").length} / {r.kontenerek.length}
                  </dd>
                </dl>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.allapot !== "fut" && (
                    <Button size="sm" variant="outline" disabled={folyamatban === r.rendszer} onClick={() => muvelet(r, "start")}>
                      Indítás
                    </Button>
                  )}
                  {r.allapot !== "leallt" && (
                    <>
                      <Button size="sm" variant="destructive" disabled={folyamatban === r.rendszer} onClick={() => muvelet(r, "stop")}>
                        Leállítás
                      </Button>
                      <Button size="sm" variant="outline" disabled={folyamatban === r.rendszer} onClick={() => muvelet(r, "restart")}>
                        Újraindítás
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => naploMegnyit(r)}>
                    Napló
                  </Button>
                </div>
                {folyamatban === r.rendszer && <p className="text-muted-foreground">folyamatban…</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Sheet open={!!naplo} onOpenChange={(o) => !o && setNaplo(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{naplo?.nev} – napló</SheetTitle>
            <SheetDescription>A konténerek utolsó naplósorai, 5 mp-enként frissül.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            {naplo?.sorok.map((k) => (
              <div key={k.kontener}>
                <h3 className="mb-1 font-mono text-xs font-medium">{k.kontener}</h3>
                <pre className="max-h-80 overflow-auto rounded bg-muted p-2 text-[11px] leading-tight whitespace-pre-wrap break-all">{k.sorok.slice(-80).join("\n") || "(üres)"}</pre>
              </div>
            ))}
            {naplo && naplo.sorok.length === 0 && <p className="text-sm text-muted-foreground">Betöltés…</p>}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
