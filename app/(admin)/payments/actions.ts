"use server";

// Fizetés: a REST interfészen (Authorization: Bearer). A link Stripe Checkout (teszt mód).

import { revalidatePath } from "next/cache";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { fizetesRest } from "@/lib/admin/interfeszek";

export async function fizetesiLink(fd: FormData): Promise<AkcioEredmeny> {
  const r = await fizetesRest<{ id: string; url: string; status: string }>("POST", "", { invoiceRef: mezo(fd, "invoiceRef") });
  revalidatePath("/payments");
  if (r.body.error) return kudarc(`${r.status} ${r.body.error.type}: ${r.body.error.message}`);
  return siker(`Fizetés létrehozva (${r.body.status}). Teszt kártya: 4242 4242 4242 4242`, { link: r.body.url });
}
