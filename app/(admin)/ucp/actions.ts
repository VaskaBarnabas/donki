"use server";

// A UCP-rendelések oldal szerver-függvényei: jóváhagyás vagy elutasítás. A jogosultságot a lib/portal/ucp.ts ellenőrzi.

import { revalidatePath } from "next/cache";
import { hibaSzoveg, kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { dontes } from "@/lib/portal/ucp";

const azon = (fd: FormData) => {
  const id = mezo(fd, "id");
  return /^chk_[0-9a-f-]{36}$/.test(id) ? id : null;
};

async function dont(fd: FormData, jovahagy: boolean): Promise<AkcioEredmeny> {
  const id = azon(fd);
  if (!id) return kudarc("Érvénytelen azonosító.");
  const ok = mezo(fd, "indok");
  if (!jovahagy && (ok.length < 3 || ok.length > 300)) return kudarc("Add meg röviden az elutasítás okát (3–300 karakter) – a vásárló ágens megkapja.");
  try {
    const r = await dontes(id, jovahagy, ok || null);
    if (r === "nincs-jog") return kudarc("UCP-rendelést az értékesítési vezető vagy a rendszergazda hagyhat jóvá.");
    if (r === "nem-var") return kudarc("Ez a rendelés már nem vár döntésre.");
    revalidatePath("/ucp", "layout");
    return siker(jovahagy ? "Jóváhagyva – az átjáró néhány másodpercen belül rögzíti a rendelést." : "Elutasítva – a vásárló ágens értesítést kap.");
  } catch (e) {
    return kudarc(hibaSzoveg(e));
  }
}

export async function jovahagyas(fd: FormData) {
  return dont(fd, true);
}
export async function elutasitas(fd: FormData) {
  return dont(fd, false);
}
