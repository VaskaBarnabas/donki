"use server";

// Szerepkör módosítása (16. fázis): a Supabase public.szerepkor_beallitas függvénye maga is ellenőrzi, hogy a hívó
// admin-e, és hogy a saját admin szerepkörét nem veszi-e el – a portálnak nem kell hozzá a Supabase service kulcsa.

import { revalidatePath } from "next/cache";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { jogHiany } from "@/lib/portal/szerep";
import { SZEREPKOR_NEV, SZEREPKOROK, type Szerepkor } from "@/lib/szerepkorok";
import { createClient } from "@/lib/supabase/server";

export async function szerepkorMentes(fd: FormData): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("portal.admin");
  if (tilos) return tilos;
  const role = mezo(fd, "role") as Szerepkor;
  if (!SZEREPKOROK.includes(role)) return kudarc("Ismeretlen szerepkör.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("szerepkor_beallitas", { p_user: mezo(fd, "user"), p_role: role });
  if (error) return kudarc(error.message.includes("sajat admin") ? "A saját admin szerepkörödet nem veheted el." : error.message);
  revalidatePath("/felhasznalok");
  return siker(`Szerepkör beállítva: ${SZEREPKOR_NEV[role]}.`);
}
