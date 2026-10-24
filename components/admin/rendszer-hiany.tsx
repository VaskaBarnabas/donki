import Link from "next/link";
import { PlugZap, ServerOff } from "lucide-react";
import { INTEGRALHATO, integraciok, kapcsolat, RAKTAR_OPS_CIM, type RendszerAzon } from "@/lib/portal/integraciok";

// Egy modul-oldal tetején: ha a rendszer nincs bekötve a portálhoz, vagy nem érhető el (pl. a Rendszerek oldalon
// leállították), egy magyarázó panelt ad vissza – az oldal ilyenkor ezt mutatja hibaoldal helyett. null = minden rendben.
// Használat: const hiany = await RendszerHiany({ rendszer: "billing" }); if (hiany) return hiany;

export async function RendszerHiany({ rendszer }: { rendszer: RendszerAzon }) {
  const nev = INTEGRALHATO.find((r) => r.id === rendszer)?.nev ?? rendszer;
  const bekotott = (await integraciok()).some((i) => i.system === rendszer);
  if (!bekotott) {
    return (
      <Uzenet ikon={<PlugZap className="size-5" />} cim={`${nev}: nincs bekötve`}>
        Ez a rendszer még nincs bekötve a portálhoz. Az{" "}
        <Link href="/integraciok" className="text-primary underline">
          Integrációk
        </Link>{" "}
        oldalon lehet megadni a címét és a hozzáférési kulcsát.
      </Uzenet>
    );
  }
  const { url } = await kapcsolat(rendszer);
  const proba = rendszer === "crm" ? `${url}/` : rendszer === "inventory" ? `${RAKTAR_OPS_CIM()}/health` : `${url}/health`;
  try {
    const r = await fetch(proba, { method: rendszer === "crm" ? "HEAD" : "GET", cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (r.status < 500) return null;
  } catch {
    // nem érhető el
  }
  return (
    <Uzenet ikon={<ServerOff className="size-5" />} cim={`${nev}: nem érhető el`}>
      A rendszer most nem válaszol – lehet, hogy le van állítva. Az állapotát és az indítást a{" "}
      <Link href="/rendszerek" className="text-primary underline">
        Rendszerek
      </Link>{" "}
      oldalon találod.
    </Uzenet>
  );
}

function Uzenet({ ikon, cim, children }: { ikon: React.ReactNode; cim: string; children: React.ReactNode }) {
  return (
    <div className="flex max-w-2xl items-start gap-3 rounded-lg border bg-muted/40 p-4">
      <div className="mt-0.5 text-muted-foreground">{ikon}</div>
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold">{cim}</h1>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
