"use server";

// Számlázás: minden írás és a PDF a szöveges protokollon (POST /api/legacy/billing, text/plain).

import { jogHiany } from "@/lib/portal/szerep";
import { revalidatePath } from "next/cache";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { protokollMezo, szamlazoParancs } from "@/lib/admin/interfeszek";

async function parancs(sor: string, frissitendo?: string): Promise<AkcioEredmeny> {
  const valasz = await szamlazoParancs(sor);
  if (frissitendo) revalidatePath(frissitendo);
  revalidatePath("/billing");
  return valasz.startsWith("OK") ? siker(valasz, { reszlet: valasz }) : kudarc(valasz, { reszlet: valasz });
}

/** A terminál: nyers protokoll-parancs (az AUTH sort a szerver teszi elé). */
export async function terminal(sor: string): Promise<string> {
  const tilos = await jogHiany("szamlazo.iras");
  if (tilos) return tilos.msg;
  const tiszta = sor.trim().split(/\r?\n/)[0] ?? "";
  if (!tiszta) return "ERR|E100|URES PARANCS";
  if (/^AUTH\|/i.test(tiszta)) return "(az AUTH sort a szerver teszi hozzá – csak a parancssort írd be)";
  return szamlazoParancs(tiszta);
}

export async function fizetve(fd: FormData): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("szamlazo.iras");
  if (tilos) return tilos;
  const szam = mezo(fd, "szam");
  return parancs(`SZAMLA|FIZETVE|${protokollMezo(szam)}|${protokollMezo(mezo(fd, "datum"))}`, `/billing/${szam}`);
}

export async function storno(fd: FormData): Promise<AkcioEredmeny> {
  const tilos = await jogHiany("szamlazo.iras");
  if (tilos) return tilos;
  const szam = mezo(fd, "szam");
  return parancs(`SZAMLA|STORNO|${protokollMezo(szam)}`, `/billing/${szam}`);
}

export async function pdf(fd: FormData): Promise<AkcioEredmeny> {
  const valasz = await szamlazoParancs(`SZAMLA|PDF|${protokollMezo(mezo(fd, "szam"))}`);
  if (!valasz.startsWith("OK|")) return kudarc(valasz);
  return siker("PDF letöltési link (1 óráig érvényes)", { link: valasz.slice(3) });
}

export async function kulsoSzamla(fd: FormData): Promise<AkcioEredmeny> {
  const szam = mezo(fd, "szam");
  return parancs(`SZAMLA|KULSO|${protokollMezo(szam)}`, `/billing/${szam}`);
}
