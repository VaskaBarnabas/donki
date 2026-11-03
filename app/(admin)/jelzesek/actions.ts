"use server";

// A Jelzések oldal szerver-függvényei. A láthatóságot (szerepkör) a lib/portal/jelzesek.ts ellenőrzi; itt a bemenet formája.

import { revalidatePath } from "next/cache";
import { hibaSzoveg, kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { elvet, figyeloKapcsolo, ujraelemzes } from "@/lib/portal/jelzesek";

const azon = (fd: FormData) => {
  const id = mezo(fd, "id");
  return /^\d{1,12}$/.test(id) ? Number(id) : null;
};

export async function elvetes(fd: FormData): Promise<AkcioEredmeny> {
  const id = azon(fd);
  const indok = mezo(fd, "indok");
  if (!id) return kudarc("Érvénytelen jelzés.");
  if (indok.length < 3 || indok.length > 300) return kudarc("Add meg röviden, miért veted el (3–300 karakter).");
  try {
    if (!(await elvet(id, indok))) return kudarc("A jelzés már le van zárva, vagy nem látod.");
    revalidatePath("/jelzesek", "layout");
    return siker("A jelzést elvetetted.");
  } catch (e) {
    return kudarc(hibaSzoveg(e));
  }
}

export async function ujraelemzesKeres(fd: FormData): Promise<AkcioEredmeny> {
  const id = azon(fd);
  if (!id) return kudarc("Érvénytelen jelzés.");
  try {
    if (!(await ujraelemzes(id))) return kudarc("Ez a jelzés nem elemezhető újra (lezárt, vagy még az első elemzésre vár).");
    revalidatePath(`/jelzesek/${id}`);
    return siker("Az újraelemzés sorba állítva – fél percen belül frissül.");
  } catch (e) {
    return kudarc(hibaSzoveg(e));
  }
}

export async function figyeloAllitas(fd: FormData): Promise<AkcioEredmeny> {
  const be = mezo(fd, "be") === "1";
  try {
    await figyeloKapcsolo(be);
    revalidatePath("/rendszerek");
    return siker(be ? "A háttérfigyelő bekapcsolva." : "A háttérfigyelő kikapcsolva – nem olvas eseményt és nem elemez.");
  } catch (e) {
    return kudarc(hibaSzoveg(e));
  }
}
