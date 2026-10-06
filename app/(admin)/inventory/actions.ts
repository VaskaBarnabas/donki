"use server";

// Raktár: kívülről csak üzenetsoron érhető el – a parancs az inventory_commands sorra megy,
// a választ az inventory_replies sorról várjuk (max. ~10 mp).

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { raktarHivas, type RaktarParancs } from "@/legacy/orders/raktar-hivas";

async function kuld(parancs: RaktarParancs): Promise<AkcioEredmeny> {
  const { corr, valasz } = await raktarHivas(createServiceClient(), parancs);
  revalidatePath("/inventory");
  if (!valasz) return kudarc(`Nem jött válasz ~10 mp alatt (corr: ${corr}).`);
  const reszlet = JSON.stringify(valasz, null, 2);
  return valasz.status === "OK" ? siker(`OK ${valasz.uzenet ?? ""}`.trim(), { reszlet }) : kudarc(`${valasz.hibakod} ${valasz.uzenet}`, { reszlet });
}

export async function lekerdezes(fd: FormData): Promise<AkcioEredmeny> {
  const cikkek = mezo(fd, "cikkek")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  if (cikkek.length === 0 || cikkek.some((c) => !Number.isInteger(c))) return kudarc("Adj meg egy vagy több cikkszámot.");
  return kuld(cikkek.length === 1 ? { cmd: "LEKERDEZ", cikk: cikkek[0] } : { cmd: "LEKERDEZ", cikkek });
}

export async function mozgas(fd: FormData): Promise<AkcioEredmeny> {
  const cikk = Number(mezo(fd, "cikk"));
  const db = Number(mezo(fd, "db"));
  const tipus = mezo(fd, "tipus") as "BE" | "KI" | "VISSZARU" | "KORREKCIO";
  if (!Number.isInteger(cikk) || !Number.isInteger(db)) return kudarc("A cikkszám és a darabszám egész szám legyen.");
  const r = await kuld({ cmd: "MOZGAS", cikk, tipus, db, ref: mezo(fd, "ref") || "ADMIN" });
  revalidatePath(`/inventory/${cikk}`);
  return r;
}
