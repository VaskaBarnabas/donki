"use server";

// Rendelések: minden művelet a régi stílusú HTTP homlokzaton (X-Legacy-Key). Az átmenetről a BPMN dönt.

import { revalidatePath } from "next/cache";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { rendelesHomlokzat } from "@/lib/admin/interfeszek";

const MUVELETEK: Record<string, string> = {
  approve: "Jóváhagyva",
  fulfil: "Kiszállítás elindítva",
  invoice: "Számla kiállítva",
  cancel: "Lemondva",
};

export async function rendelesMuvelet(fd: FormData): Promise<AkcioEredmeny> {
  const no = mezo(fd, "orderNo");
  const muvelet = mezo(fd, "muvelet");
  const v = await rendelesHomlokzat("POST", `${no}/${muvelet}`);
  revalidatePath(`/orders/${no}`);
  if (!v.success) return kudarc(v.msg, { reszlet: JSON.stringify(v, null, 2) });
  return siker(`${MUVELETEK[muvelet] ?? muvelet} – állapot: ${(v.data as { state?: string }).state ?? "?"}`);
}
