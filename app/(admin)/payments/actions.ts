"use server";

// Fizetés: a REST interfészen (Authorization: Bearer). A link Stripe Checkout (teszt mód).

import { jogHiany } from "@/lib/portal/szerep";
import { revalidatePath } from "next/cache";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { fizetesRest } from "@/lib/admin/interfeszek";

export async function fizetesiLink(fd: FormData): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("fizetes.link");
  if (tilos) return tilos;
  const r = await fizetesRest<{ id: string; url: string; status: string }>("POST", "", { invoiceRef: mezo(fd, "invoiceRef") });
  revalidatePath("/payments");
  if (r.body.error) return kudarc(`${r.status} ${r.body.error.type}: ${r.body.error.message}`);
  return siker(`Fizetés létrehozva (${r.body.status}). Teszt kártya: 4242 4242 4242 4242`, { link: r.body.url });
}
