import Link from "next/link";
import { Bot, Loader2, MessageSquare } from "lucide-react";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { Adatok, OldalFejlec, Panel, SzovegMezo } from "@/components/admin/elemek";
import { Button } from "@/components/ui/button";
import { AGENS_NEV } from "@/lib/portal/asszisztens";
import { jelzes as jelzesBetoltes } from "@/lib/portal/jelzesek";
import { SZEREPKOR_NEV, type Szerepkor } from "@/lib/szerepkorok";
import { elvetes, ujraelemzesKeres } from "../actions";
import { AllapotJel, ido, SulyossagJel } from "../elemek";

// Egy jelzés: mi történt (az ágens elemzése vagy a sablonszöveg), mit javasol, és innen indítható a megoldás az
// asszisztensben (előre kitöltött kéréssel – a módosítás ott is jóváhagyással történik). A nyers esemény lenyitható.

export default async function JelzesOldal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const j = /^\d{1,12}$/.test(id) ? await jelzesBetoltes(Number(id)).catch(() => null) : null;
  if (!j) return <OldalFejlec cim="Jelzés" leiras="Nincs ilyen jelzés, vagy nem a te szerepkörödé." />;
  const nyitott = j.allapot === "UJ" || j.allapot === "NYITOTT" || j.allapot === "FOLYAMATBAN";

  return (
    <>
      <OldalFejlec cim={j.cim} leiras={`${j.szabaly} · ${j.szabalyNev}`}>
        <Link href="/jelzesek" className="text-sm text-muted-foreground hover:underline">
          ← Jelzések
        </Link>
      </OldalFejlec>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel cim="Mi történt, és mit érdemes tenni">
          {j.allapot === "UJ" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Az asszisztens még elemzi – addig a figyelő saját összefoglalója látszik.
            </p>
          )}
          <div className="flex flex-col gap-1">
            <div className="text-xs font-medium text-muted-foreground">Elemzés</div>
            <p className="text-sm">{j.elemzes}</p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs font-medium text-muted-foreground">Javaslat</div>
            <p className="text-sm">{j.javaslat}</p>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Bot className="size-3.5" />
            {j.elemzesModell ? "Az asszisztens elemzése (csak olvasott, semmit nem módosított)." : "A figyelő sablonszövege – az asszisztens elemzése még nem készült el."}
          </p>
          {nyitott && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Az asszisztensnek küldhető kérés (küldés előtt módosíthatod):</div>
              <p className="text-sm italic">„{j.ajanlottKeres}”</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/asszisztens?jelzes=${j.id}`}>
                    <MessageSquare className="size-4" /> Megoldás az asszisztensben
                  </Link>
                </Button>
                {j.threadId && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/asszisztens?t=${j.threadId}`}>A korábbi beszélgetés megnyitása</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">A nyers esemény (a rendszer adata)</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 whitespace-pre-wrap break-all">{JSON.stringify(j.forras, null, 2)}</pre>
          </details>
          {j.lepesek.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Az elemzés lépései ({j.lepesek.length})</summary>
              <ol className="mt-2 flex flex-col gap-1">
                {j.lepesek.map((l, i) => (
                  <li key={i} className={l.ok ? "" : "text-destructive"}>
                    {AGENS_NEV[l.agens] ?? l.agens} · {l.tipus}
                    {l.eszkoz ? `: ${l.eszkoz}` : ""} {l.hibakod ? `(${l.hibakod})` : ""} · {(l.idoMs / 1000).toFixed(1)} s
                  </li>
                ))}
              </ol>
            </details>
          )}
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel cim="Adatok">
            <Adatok
              sorok={[
                ["Súlyosság", <SulyossagJel key="s" s={j.sulyossag} />],
                ["Állapot", <AllapotJel key="a" a={j.allapot} />],
                ["Kinek szól", j.szerepek.map((s) => SZEREPKOR_NEV[s as Szerepkor] ?? s).join(", ")],
                ["Észlelve", `${ido(j.letrejott)}${j.eszlelesek > 1 ? ` (${j.eszlelesek}×, utoljára ${ido(j.utoljaraEszlelve)})` : ""}`],
                ...(j.lezarva
                  ? ([
                      ["Lezárva", ido(j.lezarva)],
                      ["Lezárta", j.lezarta === "figyelo" ? "magától (a figyelő)" : "kézzel"],
                      ["Oka", j.lezarasOka],
                    ] as [string, React.ReactNode][])
                  : []),
              ]}
            />
          </Panel>
          {nyitott && (
            <Panel cim="Lezárás vagy újraelemzés">
              <p className="text-xs text-muted-foreground">
                A jelzés magától lezárul, ha a helyzet megoldódik (pl. a rendelés továbblép, a vevő fizet). Ha tudsz róla, és nincs teendő, vesd el indoklással.
              </p>
              <AkcioUrlap action={elvetes} gomb="Elvetem" variant="outline">
                <input type="hidden" name="id" value={j.id} />
                <SzovegMezo name="indok" placeholder="pl. a vevővel megbeszéltük" required minLength={3} maxLength={300} className="flex-1" />
              </AkcioUrlap>
              {j.allapot !== "UJ" && (
                <AkcioUrlap action={ujraelemzesKeres} gomb="Újraelemzés" variant="ghost">
                  <input type="hidden" name="id" value={j.id} />
                </AkcioUrlap>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
