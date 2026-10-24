"use server";

// Katalógus: a CRM és katalógus rendszer PostgREST interfészén, a portál hozzáférésével – csak bejelentkezett felhasználónak (15. fázis).

import { jogHiany } from "@/lib/portal/szerep";
import { revalidatePath } from "next/cache";
import { crm as crmRendszer } from "@/lib/admin/rendszerek";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";

export async function aktivValtas(fd: FormData): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("katalogus.iras");
  if (tilos) return tilos;
  const code = mezo(fd, "code");
  const uj = mezo(fd, "aktiv") !== "true";
  const supabase = await crmRendszer();
  const { error } = await supabase.schema("catalog").from("products").update({ active: uj }).eq("code", code);
  if (error) return kudarc(error.message);
  revalidatePath(`/catalog/${code}`);
  revalidatePath("/catalog");
  return siker(uj ? "Termék aktiválva." : "Termék inaktiválva.");
}

export async function listaarModositas(fd: FormData): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("katalogus.iras");
  if (tilos) return tilos;
  const code = mezo(fd, "code");
  const ar = Number(mezo(fd, "list_price").replace(",", "."));
  if (!Number.isFinite(ar) || ar < 0) return kudarc("Érvénytelen listaár.");
  const supabase = await crmRendszer();
  const { error } = await supabase.schema("catalog").from("products").update({ list_price: ar }).eq("code", code);
  if (error) return kudarc(error.message);
  revalidatePath(`/catalog/${code}`);
  return siker(`Új listaár: ${ar}`);
}
