"use server";

import { revalidatePath } from "next/cache";
import { kudarc, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { szamlazoParancs } from "@/lib/admin/interfeszek";
import { jogHiany } from "@/lib/portal/szerep";

/** Azonnali egyeztetés a Számlázz.hu-val (SZAMLA|SZINKRON) – egyébként 15 percenként fut magától. */
export async function egyeztetesMost(): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("szamlazo.iras");
  if (tilos) return tilos;
  const v = await szamlazoParancs("SZAMLA|SZINKRON");
  revalidatePath("/iranyitopult");
  if (!v.startsWith("OK|")) return kudarc(v);
  const [, osszes, egyezik, elteres] = v.split("|");
  return Number(elteres) === 0 ? siker(`Minden egyezik: ${egyezik}/${osszes} bizonylat a Számlázz.hu-val.`) : kudarc(`${elteres} eltérés a Számlázz.hu-val (${egyezik}/${osszes} egyezik).`);
}
