"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AkcioEredmeny } from "@/lib/admin/akcio";
import { cn } from "@/lib/utils";

type Props = {
  action: (fd: FormData) => Promise<AkcioEredmeny>;
  children?: React.ReactNode;
  gomb: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  className?: string;
  /** a nyers válasz (reszlet) megjelenítése az űrlap alatt */
  valaszMutatasa?: boolean;
};

/** Egy modul-művelet űrlapja: elküldi a server actiont, toast-tal jelez, és opcionálisan mutatja a nyers választ. */
export function AkcioUrlap({ action, children, gomb, variant = "default", className, valaszMutatasa }: Props) {
  const [allapot, formAction, folyamatban] = useActionState(async (_elozo: AkcioEredmeny | null, fd: FormData) => {
    const r = await action(fd);
    if (r.ok) toast.success(r.msg);
    else toast.error(r.msg);
    return r;
  }, null);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className={cn("flex flex-wrap items-end gap-2", className)}>
        {children}
        <Button type="submit" size="sm" variant={variant} disabled={folyamatban}>
          {folyamatban ? "Folyamatban…" : gomb}
        </Button>
      </form>
      {allapot?.link && (
        <a href={allapot.link} target="_blank" rel="noreferrer" className="text-sm text-primary underline break-all">
          {allapot.link}
        </a>
      )}
      {valaszMutatasa && allapot?.reszlet && (
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">{allapot.reszlet}</pre>
      )}
    </div>
  );
}
