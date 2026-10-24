import { AkcioUrlap } from "@/components/admin/akcio-urlap";
import { OldalFejlec, Valaszto } from "@/components/admin/elemek";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sajatSzerep } from "@/lib/portal/szerep";
import { JOGOK, SZEREPKOR_NEV, SZEREPKOROK, type Szerepkor } from "@/lib/szerepkorok";
import { createClient } from "@/lib/supabase/server";
import { szerepkorMentes } from "./actions";

// Felhasználók és szerepkörök (16. fázis, csak admin). A bejelentkezés és a felhasználók a Supabase-ben vannak;
// a szerepkör dönti el, ki milyen műveletet végezhet a portálon (és a 17. fázisban az ágensek mit tehetnek).

type Felhasznalo = { id: string; email: string; display_name: string | null; role: Szerepkor; created_at: string; last_sign_in_at: string | null };

export default async function FelhasznalokOldal() {
  if ((await sajatSzerep()) !== "admin") {
    return <OldalFejlec cim="Felhasználók" leiras="A felhasználók kezelése a rendszergazda feladata (admin szerepkör kell)." />;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("felhasznalok_lista");
  const felhasznalok = (data ?? []) as Felhasznalo[];
  const opciok = SZEREPKOROK.map((r) => [r, SZEREPKOR_NEV[r]] as [string, string]);

  return (
    <>
      <OldalFejlec cim="Felhasználók" leiras="Új felhasználó a regisztrációval jön létre, megtekintő szerepkörrel; itt lehet szerepkört adni neki." />
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Felhasználó</TableHead>
            <TableHead>Regisztrált</TableHead>
            <TableHead>Utolsó belépés</TableHead>
            <TableHead>Szerepkör</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {felhasznalok.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <div className="font-medium">{f.display_name ?? f.email}</div>
                <div className="text-xs text-muted-foreground">{f.email}</div>
              </TableCell>
              <TableCell className="text-xs">{new Date(f.created_at).toLocaleDateString("hu-HU")}</TableCell>
              <TableCell className="text-xs">{f.last_sign_in_at ? new Date(f.last_sign_in_at).toLocaleString("hu-HU") : "–"}</TableCell>
              <TableCell>
                <AkcioUrlap action={szerepkorMentes} gomb="Mentés" variant="outline">
                  <input type="hidden" name="user" value={f.id} />
                  <Valaszto name="role" defaultValue={f.role} opciok={opciok} />
                </AkcioUrlap>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="text-xs text-muted-foreground">
        <p className="mb-1 font-medium">Mit enged a szerepkör (az olvasás mindenkinek szabad, az admin mindent megtehet):</p>
        <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {Object.entries(JOGOK)
            .filter(([k]) => k !== "portal.admin")
            .map(([k, r]) => (
              <li key={k}>
                <span className="font-mono">{k}</span>: {(r as readonly Szerepkor[]).map((x) => SZEREPKOR_NEV[x]).join(", ")}
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}
