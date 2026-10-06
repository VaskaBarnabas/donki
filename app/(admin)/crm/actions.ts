"use server";

// CRM: a bejelentkezett felhasználó munkamenetével, a PostgREST interfészen (RLS: authenticated).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";

export async function tevekenysegRogzit(fd: FormData): Promise<AkcioEredmeny> {
  const partnerId = mezo(fd, "partnerId");
  const note = mezo(fd, "note");
  if (!note) return kudarc("A megjegyzés kötelező.");
  const supabase = await createClient();
  const { error } = await supabase.schema("crm").from("activities").insert({
    partner_id: partnerId,
    deal_id: mezo(fd, "dealId") || null,
    type: mezo(fd, "type") || "megjegyzes",
    note,
  });
  if (error) return kudarc(error.message);
  revalidatePath(`/crm/${partnerId}`);
  return siker("Tevékenység rögzítve.");
}

export async function dealSzakasz(fd: FormData): Promise<AkcioEredmeny> {
  const partnerId = mezo(fd, "partnerId");
  const dealId = mezo(fd, "dealId");
  const regi = mezo(fd, "regi");
  const uj = mezo(fd, "stage");
  if (uj === regi) return kudarc("A szakasz nem változott.");
  const supabase = await createClient();
  const { error } = await supabase.schema("crm").from("deals").update({ stage: uj }).eq("id", dealId);
  if (error) return kudarc(error.message);
  await supabase.schema("crm").from("activities").insert({
    partner_id: partnerId,
    deal_id: dealId,
    type: "statusz_valtas",
    note: `Szakasz: ${regi} -> ${uj}`,
  });
  revalidatePath(`/crm/${partnerId}`);
  return siker(`Szakasz: ${uj}`);
}
