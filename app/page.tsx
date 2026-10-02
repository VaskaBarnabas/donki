import { ModuleCard } from "@/components/module-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { HETEROGENEITY, MODULES, ORDER_TO_CASH } from "@/lib/site-content";
import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <SiteHeader />

      <div className="flex-1 w-full max-w-5xl flex flex-col gap-16 px-5 py-14">
        <section className="flex flex-col gap-6">
          <p className="text-sm font-medium text-muted-foreground">
            B2B irodatechnikai és ipari eszközkereskedő · ~40 fős KKV
          </p>
          <h1 className="text-3xl lg:text-4xl font-semibold leading-tight max-w-3xl">
            Egy szándékosan heterogén, legacy vállalatirányítási rendszer – AI ágensek számára
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Nyolc modul, mindegyik a saját „korának” interfészével: PostgREST, JSON-RPC, egyedi
            szöveges protokoll, SOAP, REST + webhook, üzenetsor és BPMN folyamatmotor. A rendszert a
            következő projektfázisban MCP szerveren keresztül ágensek fogják vezérelni.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/protected">
                Admin felület <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Order-to-cash folyamat</h2>
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {ORDER_TO_CASH.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-md border px-3 py-1.5">{step}</span>
                {i < ORDER_TO_CASH.length - 1 && (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Egy rendelés négy-öt modulon halad át. Közöttük nincs közös API réteg: mindegyik csak a
            másik modul saját interfészén vagy üzenetsorán keresztül szól át.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Modulok</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((m) => (
              <ModuleCard key={m.name} module={m} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">A heterogenitás a feladat része</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Az azonosítók, dátum- és pénzformátumok, valamint a hibaüzenetek modulonként
            eltérnek – ahogy egy évek alatt összenőtt valódi rendszerben. Ezt kell majd az
            ágenseknek és az MCP rétegnek áthidalnia.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {HETEROGENEITY.map((h) => (
              <div key={h.title} className="rounded-lg border p-4 flex flex-col gap-3">
                <h3 className="text-sm font-medium">{h.title}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {h.examples.map((e) => (
                    <code key={e} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {e}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
