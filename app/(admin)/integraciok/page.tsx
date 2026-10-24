import { OldalFejlec } from "@/components/admin/elemek";
import { INTEGRALHATO, integraciok } from "@/lib/portal/integraciok";
import { sajatSzerep } from "@/lib/portal/szerep";
import { RendszerKartya } from "./rendszer-kartya";

// Integrációs varázsló (16. fázis): a független rendszerek bekötése a portálhoz. Első belépéskor egy rendszer
// sincs bekötve – az admin itt adja meg rendszerenként a címet és a hozzáférési kulcsot.

export default async function IntegraciokOldal() {
  if ((await sajatSzerep()) !== "admin") {
    return <OldalFejlec cim="Integrációk" leiras="A rendszerek bekötése a rendszergazda feladata (admin szerepkör kell)." />;
  }
  const meglevo = new Map((await integraciok()).map((i) => [i.system, i]));
  const kesz = [...meglevo.values()].filter((i) => i.status === "ok").length;

  return (
    <>
      <OldalFejlec
        cim="Integrációk"
        leiras="A portál a vállalati rendszereket csak a bekötött interfészeiken éri el – közvetlen adatbázis-hozzáférés nélkül. Rendszerenként add meg a címet és a hozzáférési kulcsot; mentés előtt a portál a rendszer saját protokollján kipróbálja a kapcsolatot. A kulcs titkosítva tárolódik."
      />
      <div className="flex items-center gap-3 text-sm">
        <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(kesz / INTEGRALHATO.length) * 100}%` }} />
        </div>
        <span className="text-muted-foreground">
          {kesz} / {INTEGRALHATO.length} rendszer bekötve
        </span>
      </div>
      {meglevo.size === 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Első lépések</p>
          <p className="text-muted-foreground">
            Még egy rendszer sincs bekötve. Haladj sorban: a CRM-mel kezdve minden rendszernél add meg a kulcsot, és nyomd meg a „Tesztelés és mentés” gombot. Egy rendszer kihagyható – a felülete addig „nincs bekötve” állapotú.
          </p>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {INTEGRALHATO.map((r, i) => {
          const b = meglevo.get(r.id);
          return (
            <RendszerKartya
              key={r.id}
              id={r.id}
              sorszam={i + 1}
              nev={r.nev}
              interfesz={r.interfesz}
              javasoltCim={r.javasoltCim}
              kulcsLeiras={r.kulcsLeiras}
              bekotve={b ? { url: b.base_url, status: b.status, uzenet: b.last_test_msg, ido: b.last_test_at } : null}
            />
          );
        })}
      </div>
    </>
  );
}
