"use server";

// Rendszerek ki/be kapcsolása (15. fázis, ideiglenes felület – a teljes irányítópult a 16. fázisban).

import { revalidatePath } from "next/cache";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { adminEllenorzes, rendszerMuvelet, VezerlesHiba, type Muvelet } from "@/lib/admin/vezerles";

export async function muvelet(fd: FormData): Promise<AkcioEredmeny> {
  const rendszer = mezo(fd, "rendszer");
  const m = mezo(fd, "muvelet") as Muvelet;
  try {
    const ki = await adminEllenorzes();
    const r = await rendszerMuvelet(rendszer, m);
    console.log(`[vezerles] ${new Date().toISOString()} ${ki.email ?? ki.id}: ${rendszer} ${m} (${r.kontenerek.join(", ")})`);
    revalidatePath("/rendszerek");
    const ige = { start: "elindítva", stop: "leállítva", restart: "újraindítva" }[m];
    return siker(`${rendszer}: ${ige} (${r.kontenerek.length} konténer)`);
  } catch (e) {
    return kudarc(e instanceof VezerlesHiba ? e.message : String(e));
  }
}
