"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { terminal } from "./actions";

const PELDAK = ["PARTNER|KERES|27346178-2-41", "SZAMLA|LEJART", "SZAMLA|LEKER|SZ-2026-000187", "SZAMLA|PDF|SZ-2026-000180"];

/** Nyers szöveges protokoll – a régi rendszer „terminálja”. */
export function Terminal() {
  const [parancs, setParancs] = useState("");
  const [naplo, setNaplo] = useState<{ be: string; ki: string }[]>([]);
  const [folyamatban, startTransition] = useTransition();

  function kuld(sor: string) {
    if (!sor.trim()) return;
    startTransition(async () => {
      const ki = await terminal(sor);
      setNaplo((n) => [{ be: sor, ki }, ...n].slice(0, 30));
      setParancs("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          kuld(parancs);
        }}
        className="flex gap-2"
      >
        <input
          value={parancs}
          onChange={(e) => setParancs(e.target.value)}
          placeholder="SZAMLA|LEKER|SZ-2026-000187"
          className="h-9 flex-1 rounded-md border border-input bg-zinc-950 px-3 font-mono text-sm text-green-400 placeholder:text-zinc-600 outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        <Button type="submit" size="sm" disabled={folyamatban}>
          {folyamatban ? "…" : "Küldés"}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {PELDAK.map((p) => (
          <button key={p} type="button" onClick={() => setParancs(p)} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted/70">
            {p}
          </button>
        ))}
      </div>
      <pre className="min-h-32 max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-xs text-green-400 whitespace-pre-wrap break-all">
        {naplo.length === 0
          ? "AUTH|****** (a szerver adja hozzá)\n> "
          : naplo.map((s) => `> ${s.be}\n${s.ki}`).join("\n\n")}
      </pre>
    </div>
  );
}
