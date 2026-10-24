"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AkcioEredmeny } from "@/lib/admin/akcio";
import { integracioMentes, integracioTorles } from "./actions";

type Props = {
  id: string;
  sorszam: number;
  nev: string;
  interfesz: string;
  javasoltCim: string;
  kulcsLeiras: string;
  bekotve: { url: string; status: string; uzenet: string | null; ido: string | null } | null;
};

// Egy rendszer bekötése a varázslóban: cím + kulcs → „Kapcsolat tesztelése és mentés”.
export function RendszerKartya({ id, sorszam, nev, interfesz, javasoltCim, kulcsLeiras, bekotve }: Props) {
  const futtat = (fn: (fd: FormData) => Promise<AkcioEredmeny>) => async (_e: AkcioEredmeny | null, fd: FormData) => {
    const r = await fn(fd);
    if (r.ok) toast.success(r.msg);
    else toast.error(r.msg);
    return r;
  };
  const [mentes, mentesAction, mentesFolyamat] = useActionState(futtat(integracioMentes), null);
  const [, torlesAction, torlesFolyamat] = useActionState(futtat(integracioTorles), null);
  const allapot = bekotve ? (bekotve.status === "ok" ? "bekötve" : bekotve.status === "hiba" ? "hibás" : "nem tesztelt") : "nincs bekötve";

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-medium">{sorszam}</span>
          <div>
            <h3 className="font-medium">{nev}</h3>
            <p className="text-xs text-muted-foreground">{interfesz}</p>
          </div>
        </div>
        <Badge variant={bekotve?.status === "ok" ? "default" : bekotve?.status === "hiba" ? "destructive" : "secondary"}>{allapot}</Badge>
      </div>
      <form action={mentesAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="rendszer" value={id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-url`}>Cím</Label>
          <Input id={`${id}-url`} name="url" defaultValue={bekotve?.url ?? javasoltCim} className="font-mono text-xs" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-kulcs`}>Hozzáférési kulcs</Label>
          <Input id={`${id}-kulcs`} name="kulcs" type="password" autoComplete="off" placeholder={bekotve ? "•••• beállítva (üresen hagyva marad)" : kulcsLeiras} />
        </div>
        <Button type="submit" size="sm" disabled={mentesFolyamat}>
          {mentesFolyamat ? "Tesztelés…" : bekotve ? "Újratesztelés és mentés" : "Tesztelés és mentés"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        {mentes?.msg ?? bekotve?.uzenet ?? `Javasolt cím a rendszerek hálózatán: ${javasoltCim}. A kulcs: ${kulcsLeiras}.`}
        {bekotve?.ido && !mentes && <span> · utolsó teszt: {new Date(bekotve.ido).toLocaleString("hu-HU")}</span>}
      </p>
      {bekotve && (
        <form action={torlesAction}>
          <input type="hidden" name="rendszer" value={id} />
          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" disabled={torlesFolyamat}>
            Integráció törlése
          </Button>
        </form>
      )}
    </div>
  );
}
