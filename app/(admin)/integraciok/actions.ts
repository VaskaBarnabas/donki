"use server";

// Integrációk (16. fázis): egy rendszer bekötése = cím + hozzáférési kulcs. Mentés előtt a portál kipróbálja a
// kapcsolatot a rendszer saját protokollján; a kulcs AES-256-GCM-mel titkosítva kerül a Supabase-be. Csak admin.

import { revalidatePath } from "next/cache";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { INTEGRALHATO, kapcsolat, kapcsolatTeszt, titkosit, type RendszerAzon } from "@/lib/portal/integraciok";
import { jogHiany } from "@/lib/portal/szerep";
import { createClient } from "@/lib/supabase/server";

function rendszerBol(fd: FormData): RendszerAzon | null {
  const r = mezo(fd, "rendszer") as RendszerAzon;
  return INTEGRALHATO.some((x) => x.id === r) ? r : null;
}

export async function integracioMentes(fd: FormData): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("portal.admin");
  if (tilos) return tilos;
  const rendszer = rendszerBol(fd);
  if (!rendszer) return kudarc("Ismeretlen rendszer.");
  const url = mezo(fd, "url").replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+/.test(url)) return kudarc("A cím formátuma: http://host:port");
  let kulcs = mezo(fd, "kulcs");
  if (!kulcs) {
    // üres kulcsmező: a meglévő (titkosított) kulcs marad – csak a cím változik / újrateszt
    try {
      kulcs = (await kapcsolat(rendszer)).kulcs;
    } catch {
      return kudarc("Add meg a hozzáférési kulcsot.");
    }
  }
  const t = await kapcsolatTeszt(rendszer, url, kulcs);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase.from("integrations").upsert({
    system: rendszer,
    base_url: url,
    secret_enc: titkosit(kulcs),
    status: t.elerheto && t.kulcsOk ? "ok" : "hiba",
    last_test_at: new Date().toISOString(),
    last_test_msg: t.uzenet,
    configured_by: claims?.claims.sub ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) return kudarc(`Mentés sikertelen: ${error.message}`);
  revalidatePath("/integraciok");
  return t.elerheto && t.kulcsOk ? siker(`Bekötve. ${t.uzenet}`) : kudarc(`Elmentve, de a kapcsolat nem működik: ${t.uzenet}`);
}

export async function integracioTorles(fd: FormData): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("portal.admin");
  if (tilos) return tilos;
  const rendszer = rendszerBol(fd);
  if (!rendszer) return kudarc("Ismeretlen rendszer.");
  const supabase = await createClient();
  const { error } = await supabase.from("integrations").delete().eq("system", rendszer);
  if (error) return kudarc(error.message);
  revalidatePath("/integraciok");
  return siker("Az integráció törölve – a rendszer felülete a portálon „nincs bekötve” állapotú.");
}
