import { redirect } from "next/navigation";

import { ModuleCard } from "@/components/module-card";
import { createClient } from "@/lib/supabase/server";
import { COMPLETED_PHASE, MODULES, PHASES } from "@/lib/site-content";
import { CheckCircle2, Circle, InfoIcon } from "lucide-react";
import { Suspense } from "react";

async function UserEmail() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <>{data.claims.email}</>;
}

export default function ProtectedPage() {
  return (
    <>
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Admin felület</h1>
        <p className="text-sm text-muted-foreground">
          Bejelentkezve:{" "}
          <Suspense fallback="…">
            <UserEmail />
          </Suspense>
        </p>
      </section>

      <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-start">
        <InfoIcon size="16" strokeWidth={2} className="mt-0.5 shrink-0" />
        <p>
          A modulonkénti admin oldalak (lista, részletnézet, műveletek) a 10. fázisban készülnek.
          Szándékosan nem lesz egységes ügyfélnézet, globális keresés vagy modulokat összekötő
          dashboard – ez a „régi” munkamód, ehhez mérjük majd az ágenseket.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Modulok és interfészek</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <ModuleCard key={m.name} module={m} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">
          Fejlesztési fázisok{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({COMPLETED_PHASE}/{PHASES.length} kész)
          </span>
        </h2>
        <ol className="flex flex-col gap-2 text-sm">
          {PHASES.map((p) => {
            const done = p.n <= COMPLETED_PHASE;
            const next = p.n === COMPLETED_PHASE + 1;
            return (
              <li key={p.n} className="flex items-center gap-3">
                {done ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={done ? "" : "text-muted-foreground"}>
                  {p.n}. {p.title}
                </span>
                {next && (
                  <span className="text-xs rounded-md border px-1.5 py-0.5">következő</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
