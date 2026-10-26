"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Check, ChevronDown, ChevronRight, History, Loader2, MessageSquarePlus, Send, ShieldAlert, User, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { Beszelgetes, BeszelgetesFej, JovahagyasKeres, Kor } from "@/lib/portal/asszisztens";
import { cn } from "@/lib/utils";
import { beszelgetesBetoltes, dontesKuldes, uzenetKuldes, type Eredmeny } from "./actions";

// Az asszisztens chatfelülete: a teljes hely a menü mellett, középre igazított beszélgetéssel; a korábbi
// beszélgetések jobb felül, legördülő menüben. Az ágens válasza alatt
// lenyitható a lépések idővonala (melyik szakágens, milyen eszköz, token, idő). Ha az ágens író műveletet
// kezdeményez, a gráf megáll, és egy jóváhagyási kártya jelenik meg – a döntés után ugyanonnan folytatódik.

const PELDAK = [
  "Mutasd a legutóbbi rendeléseket és hogy hol tartanak.",
  "A Bakony Gépgyártó 12 darab TK-00010-es monitort kér. Mennyi lenne?",
  "Milyen lejárt számláink vannak, és mennyi az összesen?",
  "Mi akadt el most a rendeléseknél és a raktárban?",
];

const KOCKAZAT: Record<string, { nev: string; szin: string }> = {
  write: { nev: "módosítás", szin: "border-amber-500/60 text-amber-700 dark:text-amber-400" },
  financial: { nev: "pénzügyi", szin: "border-orange-500/60 text-orange-700 dark:text-orange-400" },
  irreversible: { nev: "nem visszavonható", szin: "border-red-500/60 text-red-700 dark:text-red-400" },
};

/** Egyszerű kiemelés: **félkövér** és sortörések (a modell válasza Markdown-szerű). */
function Szoveg({ children }: { children: string }) {
  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed">
      {children.split(/(\*\*[^*]+\*\*)/g).map((d, i) => (d.startsWith("**") && d.endsWith("**") ? <strong key={i}>{d.slice(2, -2)}</strong> : d))}
    </div>
  );
}

function ertek(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x ? Object.entries(x).map(([k, y]) => `${k}: ${y}`).join(", ") : String(x))).join(" · ");
  if (typeof v === "object" && v) return JSON.stringify(v);
  return String(v);
}

function Lepesek({ kor, agensNev }: { kor: Kor; agensNev: Record<string, string> }) {
  const [nyitva, setNyitva] = useState(false);
  if (!kor.lepesek.length) return null;
  const eszkozok = kor.lepesek.filter((l) => l.tipus === "eszkoz").length;
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <button type="button" onClick={() => setNyitva(!nyitva)} className="inline-flex items-center gap-1 hover:text-foreground">
        <ChevronRight className={cn("size-3 transition-transform", nyitva && "rotate-90")} />
        {eszkozok} rendszerhívás · {kor.tokenek.toLocaleString("hu-HU")} token{kor.idoMs ? ` · ${(kor.idoMs / 1000).toFixed(1)} s` : ""}
      </button>
      {nyitva && (
        <ol className="mt-1 space-y-0.5 border-l pl-3">
          {kor.lepesek.map((l, i) => (
            <li key={i} className={cn(!l.ok && "text-destructive")}>
              <span className="text-foreground/70">{agensNev[l.agens] ?? l.agens}</span> ·{" "}
              {l.tipus === "modell" ? "gondolkodik" : l.tipus === "skill" ? `szabály betöltése: ${l.eszkoz}` : <code className="font-mono">{l.eszkoz}</code>}
              {l.jovahagyas === "jovahagyva" && " (jóváhagyva)"}
              {l.jovahagyas === "elutasitva" && " (elutasítva)"}
              {l.hibakod && ` – ${l.hibakod}`}
              <span className="ml-1 tabular-nums opacity-70">
                {l.tokenek ? `${l.tokenek} token, ` : ""}
                {l.idoMs} ms
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function JovahagyasKartya({ kerdesek, onDont, folyamatban }: { kerdesek: JovahagyasKeres[]; onDont: (d: Record<string, boolean>) => void; folyamatban: boolean }) {
  const [dontesek, setDontesek] = useState<Record<string, boolean>>({});
  const mind = kerdesek.length > 1;
  const kesz = kerdesek.every((k) => k.id in dontesek);
  return (
    <Card className="border-amber-500/60 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldAlert className="size-4 text-amber-600" />
          Jóváhagyásra vár – az asszisztens ezt szeretné:
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {kerdesek.map((k) => (
          <div key={k.id} className="rounded-md border bg-background p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{k.cim}</span>
              <code className="font-mono text-xs text-muted-foreground">{k.eszkoz}</code>
              <Badge variant="outline" className={KOCKAZAT[k.kockazat]?.szin}>
                {KOCKAZAT[k.kockazat]?.nev ?? k.kockazat}
              </Badge>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              {Object.entries(k.bemenet).map(([n, v]) => (
                <div key={n} className="contents">
                  <dt className="text-muted-foreground">{n}</dt>
                  <dd className="font-mono break-all">{ertek(v)}</dd>
                </div>
              ))}
            </dl>
            {mind && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant={dontesek[k.id] === true ? "default" : "outline"} onClick={() => setDontesek({ ...dontesek, [k.id]: true })}>
                  Igen
                </Button>
                <Button size="sm" variant={dontesek[k.id] === false ? "destructive" : "outline"} onClick={() => setDontesek({ ...dontesek, [k.id]: false })}>
                  Nem
                </Button>
              </div>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          {mind ? (
            <Button disabled={!kesz || folyamatban} onClick={() => onDont(dontesek)}>
              {folyamatban ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Döntések elküldése
            </Button>
          ) : (
            <>
              <Button disabled={folyamatban} onClick={() => onDont({ [kerdesek[0].id]: true })}>
                {folyamatban ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Jóváhagyom
              </Button>
              <Button variant="outline" disabled={folyamatban} onClick={() => onDont({ [kerdesek[0].id]: false })}>
                <X className="size-4" /> Elutasítom
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AsszisztensChat({
  kezdo,
  kezdoLista,
  agensNev,
  szerepNev,
  modell,
}: {
  kezdo: Beszelgetes | null;
  kezdoLista: BeszelgetesFej[];
  agensNev: Record<string, string>;
  szerepNev: string;
  modell: string;
}) {
  const router = useRouter();
  const ut = usePathname();
  const [b, setB] = useState<Beszelgetes | null>(kezdo);
  const [lista, setLista] = useState(kezdoLista);
  const [szoveg, setSzoveg] = useState("");
  const [fuggoKeres, setFuggoKeres] = useState<string | null>(null);
  const [folyamatban, inditas] = useTransition();
  const [eltelt, setEltelt] = useState(0);
  const alja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!folyamatban) return setEltelt(0);
    const kezdet = Date.now();
    const t = setInterval(() => setEltelt(Math.round((Date.now() - kezdet) / 1000)), 500);
    return () => clearInterval(t);
  }, [folyamatban]);

  useEffect(() => {
    alja.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [b, fuggoKeres]);

  function eredmeny(r: Eredmeny): void {
    if (!r.ok) {
      toast.error(r.hiba);
      return;
    }
    setB(r.b);
    setLista(r.lista);
    if (new URLSearchParams(window.location.search).get("t") !== r.b.threadId) router.replace(`${ut}?t=${r.b.threadId}`, { scroll: false });
  }

  function kuld(uzenet = szoveg) {
    const s = uzenet.trim();
    if (!s || folyamatban) return;
    setSzoveg("");
    setFuggoKeres(s);
    inditas(async () => {
      eredmeny(await uzenetKuldes(b?.threadId ?? null, s));
      setFuggoKeres(null);
    });
  }

  function dont(d: Record<string, boolean>) {
    if (!b) return;
    inditas(async () => eredmeny(await dontesKuldes(b.threadId, d)));
  }

  function megnyit(threadId: string) {
    if (folyamatban) return;
    inditas(async () => eredmeny(await beszelgetesBetoltes(threadId)));
  }

  function uj() {
    if (folyamatban) return;
    setB(null);
    router.replace(ut, { scroll: false });
  }

  const varJovahagyasra = !!b?.jovahagyas.length;

  const aktualis = lista.find((l) => l.threadId === b?.threadId);

  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] flex-col md:-m-6">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Bot className="size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{aktualis?.cim ?? (b ? "Beszélgetés" : "Asszisztens")}</div>
          <div className="truncate text-xs text-muted-foreground">
            A te nevedben ({szerepNev}) · módosítás előtt jóváhagyást kér · a modell helyben fut ({modell})
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={folyamatban}>
              <History className="size-4" /> Korábbi beszélgetések <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Korábbi beszélgetéseid</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {lista.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Még nincs beszélgetésed.</div>}
            {lista.map((l) => (
              <DropdownMenuItem key={l.threadId} onSelect={() => megnyit(l.threadId)} className={cn("flex flex-col items-start gap-0", b?.threadId === l.threadId && "bg-muted")}>
                <span className="w-full truncate">{l.cim}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(l.utolso).toLocaleString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" onClick={uj} disabled={folyamatban}>
          <MessageSquarePlus className="size-4" /> Új beszélgetés
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-4 py-6">
          {!b && !fuggoKeres && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <Bot className="size-10 text-muted-foreground" />
              <p className="max-w-md text-sm text-muted-foreground">
                Kérdezz a rendelésekről, ajánlatokról, készletről, számlákról vagy hibajegyekről – vagy kérd, hogy intézzen el valamit. Módosítás előtt mindig megkérdez.
              </p>
              <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                {PELDAK.map((p) => (
                  <button key={p} type="button" onClick={() => setSzoveg(p)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {b?.korok.map((k) => (
            <div key={k.futasId} className="flex flex-col gap-3">
              <div className="flex justify-end gap-2">
                <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                  <Szoveg>{k.keres}</Szoveg>
                </div>
                <User className="mt-1 size-5 shrink-0 text-muted-foreground" />
              </div>
              {(k.valasz || k.hiba) && (
                <div className="flex gap-2">
                  <Bot className="mt-1 size-5 shrink-0 text-muted-foreground" />
                  <div className="max-w-[85%]">
                    <div className="mb-1 text-[11px] text-muted-foreground">{k.agens ? (agensNev[k.agens] ?? k.agens) : "Asszisztens"}</div>
                    <div className={cn("rounded-lg bg-muted px-3 py-2 text-sm", k.allapot === "hiba" && "bg-destructive/10 text-destructive")}>
                      <Szoveg>{k.valasz ?? `Hiba történt: ${k.hiba}`}</Szoveg>
                    </div>
                    <Lepesek kor={k} agensNev={agensNev} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {fuggoKeres && (
            <div className="flex justify-end gap-2">
              <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground opacity-80">
                <Szoveg>{fuggoKeres}</Szoveg>
              </div>
              <User className="mt-1 size-5 shrink-0 text-muted-foreground" />
            </div>
          )}

          {varJovahagyasra && !folyamatban && <JovahagyasKartya kerdesek={b!.jovahagyas} onDont={dont} folyamatban={folyamatban} />}

          {folyamatban && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Az asszisztens dolgozik… {eltelt > 2 && <span className="tabular-nums">{eltelt} s</span>}
            </div>
          )}
          <div ref={alja} />
        </div>
      </div>

      <div className="border-t bg-background p-3">
        <form
          className="mx-auto flex w-full max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            kuld();
          }}
        >
          <Textarea
            value={szoveg}
            onChange={(e) => setSzoveg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                kuld();
              }
            }}
            placeholder={varJovahagyasra ? "Előbb döntsd el a jóváhagyásra váró műveletet." : "Írd le, mit szeretnél… (Enter: küldés, Shift+Enter: új sor)"}
            disabled={folyamatban || varJovahagyasra}
            rows={2}
            maxLength={2000}
            className="min-h-[2.5rem] resize-none"
          />
          <Button type="submit" disabled={folyamatban || varJovahagyasra || !szoveg.trim()}>
            <Send className="size-4" /> Küldés
          </Button>
        </form>
      </div>
    </div>
  );
}
