import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { OldalFejlec } from "@/components/admin/elemek";
import { Badge } from "@/components/ui/badge";
import { egyeztetes, fizetesek, hibajegyek, jovahagyasok, keszlet, rendelesek, tartozasok } from "@/lib/portal/iranyitopult";
import { integraciok } from "@/lib/portal/integraciok";
import { sajatSzerep } from "@/lib/portal/szerep";
import { rendszerAllapotok } from "@/lib/admin/vezerles";
import { SZEREPKOR_NEV } from "@/lib/szerepkorok";
import { egyeztetesMost } from "./actions";
import { forint, Kartya, KartyaToltes, Szam } from "./kartya";

// Irányítópult (16. fázis): a bekötött független rendszerekből lekért adatok egy helyen – az integrációs portál.
// (A modul-oldalak a „régi munkamód”: rendszerenként külön, a saját formátumukban.)

const KARTYAK = {
  rendelesek: { cim: "Nyitott rendelések", rendszer: "rendeléskezelő", href: "/orders" },
  jovahagyas: { cim: "Jóváhagyásra vár", rendszer: "ajánlatkezelő / rendeléskezelő", href: "/quotes?status=JOVAHAGYASRA_VAR" },
  tartozas: { cim: "Lejárt tartozások", rendszer: "számlázó", href: "/billing?allapot=lejart" },
  keszlet: { cim: "Minimum alatti készlet", rendszer: "raktár", href: "/inventory?szuro=min" },
  jegyek: { cim: "Hibajegyek", rendszer: "helpdesk", href: "/support" },
  fizetes: { cim: "Mai fizetések", rendszer: "fizetési rendszer", href: "/payments" },
  egyeztetes: { cim: "Egyeztetés (Számlázz.hu, Stripe)", rendszer: "számlázó / fizetés", href: "/billing" },
} as const;

// a szerepkör szerint előre sorolt kártyák (a többi utánuk jön)
const ELOL: Record<string, (keyof typeof KARTYAK)[]> = {
  finance: ["tartozas", "fizetes", "egyeztetes"],
  logistics: ["keszlet", "rendelesek"],
  sales: ["jovahagyas", "rendelesek", "jegyek"],
  sales_manager: ["jovahagyas", "rendelesek", "tartozas"],
};

export default async function IranyitopultOldal() {
  const [szerep, bekotott] = await Promise.all([sajatSzerep(), integraciok()]);
  if (bekotott.length === 0) {
    if (szerep === "admin") redirect("/integraciok");
    return <OldalFejlec cim="Irányítópult" leiras="A rendszergazda még nem kötötte be a vállalati rendszereket a portálhoz. Amint megtörtént, itt jelennek meg az adataik." />;
  }
  const sorrend = [...(ELOL[szerep ?? ""] ?? []), ...(Object.keys(KARTYAK) as (keyof typeof KARTYAK)[])].filter((k, i, t) => t.indexOf(k) === i);

  const tartalom: Record<keyof typeof KARTYAK, React.ReactNode> = {
    rendelesek: (
      <Kartya {...KARTYAK.rendelesek} adat={rendelesek}>
        {(d) => (
          <>
            <Szam alcim={d.legregebbi ? `legrégebb óta vár: RND-${d.legregebbi.orderNo} (${d.legregebbi.allapot})` : undefined}>{d.nyitott}</Szam>
            <ul className="text-sm">
              {d.allapotok.map((a) => (
                <li key={a.allapot} className="flex justify-between">
                  <span className="text-muted-foreground">{a.allapot}</span>
                  <span className="tabular-nums">{a.db}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Kartya>
    ),
    jovahagyas: (
      <Kartya {...KARTYAK.jovahagyas} adat={jovahagyasok}>
        {(d) => (
          <>
            <Szam alcim={`${d.ajanlatok.length} ajánlat (kedvezmény > 15%) · ${d.rendelesek.length} rendelés`}>{d.ajanlatok.length + d.rendelesek.length}</Szam>
            <div className="flex flex-wrap gap-1">
              {d.ajanlatok.slice(0, 4).map((a) => (
                <Link key={a.id} href={`/quotes/${a.id}`}>
                  <Badge variant="secondary">{a.id}</Badge>
                </Link>
              ))}
              {d.rendelesek.slice(0, 4).map((n) => (
                <Link key={n} href={`/orders/${n}`}>
                  <Badge variant="secondary">RND-{n}</Badge>
                </Link>
              ))}
            </div>
          </>
        )}
      </Kartya>
    ),
    tartozas: (
      <Kartya {...KARTYAK.tartozas} adat={tartozasok}>
        {(d) => <Szam alcim={d.legregebbi ? `${d.db} bizonylat · a legrégebbi: ${d.legregebbi.szam}, határidő ${d.legregebbi.hatarido}` : "nincs lejárt tartozás"}>{forint(d.osszeg)}</Szam>}
      </Kartya>
    ),
    keszlet: (
      <Kartya {...KARTYAK.keszlet} adat={keszlet}>
        {(d) => (
          <>
            <Szam alcim={`${d.osszes} cikkből`}>{d.alatta.length}</Szam>
            <ul className="text-sm">
              {d.alatta.slice(0, 4).map((c) => (
                <li key={c.cikk} className="flex justify-between gap-2">
                  <Link href={`/inventory/${c.cikk}`} className="truncate text-muted-foreground hover:underline">
                    {c.nev}
                  </Link>
                  <span className="shrink-0 tabular-nums">
                    {c.keszlet} / {c.min}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Kartya>
    ),
    jegyek: (
      <Kartya {...KARTYAK.jegyek} adat={hibajegyek}>
        {(d) => <Szam alcim={`${d.ujak} új · ${d.nyitottRma} nyitott csere/javítás`}>{d.nyitott}</Szam>}
      </Kartya>
    ),
    fizetes: (
      <Kartya {...KARTYAK.fizetes} adat={fizetesek}>
        {(d) => <Szam alcim={`${d.sikeres} sikeres · ${d.sikertelen} sikertelen · ${d.nyitott} nyitott link (Stripe teszt)`}>{forint(d.osszeg)}</Szam>}
      </Kartya>
    ),
    egyeztetes: (
      <Kartya {...KARTYAK.egyeztetes} adat={egyeztetes}>
        {(d) => {
          const minden = d.szamlazo.elteresek.length === 0 && d.stripe.elteresek.length === 0;
          return (
            <>
              <Szam alcim={minden ? "minden egyezik" : "eltérés van – lásd lent"}>{minden ? "✓" : d.szamlazo.elteresek.length + d.stripe.elteresek.length}</Szam>
              <p className="text-sm text-muted-foreground">
                Számlázz.hu: {d.szamlazo.egyezik}/{d.szamlazo.osszes} bizonylat · Stripe: {d.stripe.egyezik}/{d.stripe.osszes} fizetés
                {d.stripe.korabbi ? ` (+${d.stripe.korabbi} korábbi, Stripe nélküli)` : ""}
              </p>
              {[...d.szamlazo.elteresek, ...d.stripe.elteresek].slice(0, 5).map((e) => (
                <p key={e} className="font-mono text-xs text-destructive">
                  {e}
                </p>
              ))}
              <AkcioUrlap action={egyeztetesMost} gomb="Egyeztetés most" variant="outline" />
            </>
          );
        }}
      </Kartya>
    ),
  };

  return (
    <>
      <OldalFejlec
        cim="Irányítópult"
        leiras={`A bekötött vállalati rendszerek adatai egy helyen (${bekotott.length}/7 rendszer bekötve). Szerepkör: ${szerep ? SZEREPKOR_NEV[szerep] : "–"}.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sorrend.map((k) => (
          <Suspense key={k} fallback={<KartyaToltes cim={KARTYAK[k].cim} />}>
            {tartalom[k]}
          </Suspense>
        ))}
      </div>
      {szerep === "admin" && (
        <Suspense fallback={null}>
          <RendszerSor />
        </Suspense>
      )}
    </>
  );
}

async function RendszerSor() {
  try {
    const r = await rendszerAllapotok();
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Rendszerek:</span>
        {r.map((x) => (
          <Link key={x.rendszer} href="/rendszerek">
            <Badge variant={x.allapot === "fut" ? "secondary" : "destructive"}>
              {x.nev}: {x.allapot === "fut" ? "fut" : x.allapot === "leallt" ? "leállítva" : "részben"}
            </Badge>
          </Link>
        ))}
      </div>
    );
  } catch {
    return null;
  }
}
