import Link from "next/link";
import { AlertTriangle, PlugZap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NincsBekotve, type RendszerAzon } from "@/lib/portal/integraciok";

// Egy irányítópult-kártya: a saját rendszerét kérdezi; ha nincs bekötve vagy nem érhető el, csak ez a kártya jelez.

export async function Kartya<T>({
  cim,
  rendszer,
  href,
  adat,
  children,
}: {
  cim: string;
  rendszer: string;
  href: string;
  adat: () => Promise<T>;
  children: (d: T) => React.ReactNode;
}) {
  let tartalom: React.ReactNode;
  try {
    tartalom = children(await adat());
  } catch (e) {
    const nincs = e instanceof NincsBekotve;
    tartalom = (
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        {nincs ? <PlugZap className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
        <span>
          {nincs ? (
            <>
              A(z) {rendszer} nincs bekötve – <Link href="/integraciok" className="text-primary underline">Integrációk</Link>
            </>
          ) : (
            <>
              A(z) {rendszer} most nem érhető el. <Link href="/rendszerek" className="text-primary underline">Rendszerek</Link>
            </>
          )}
        </span>
      </div>
    );
  }
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span>{cim}</span>
          <Link href={href} className="text-xs font-normal text-primary hover:underline">
            megnyitás
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">{tartalom}</CardContent>
    </Card>
  );
}

export function KartyaToltes({ cim }: { cim: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{cim}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-16 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

export const Szam = ({ children, alcim }: { children: React.ReactNode; alcim?: React.ReactNode }) => (
  <div>
    <div className="text-3xl font-semibold tabular-nums">{children}</div>
    {alcim && <div className="text-xs text-muted-foreground">{alcim}</div>}
  </div>
);

export const forint = (n: number) => `${Math.round(n).toLocaleString("hu-HU")} Ft`;
export type { RendszerAzon };
