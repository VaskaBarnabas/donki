"use server";

// Az asszisztens-oldal szerver-függvényei: üzenet küldése, jóváhagyások eldöntése, beszélgetés betöltése.
// A jogosultságot és a beszélgetés gazdáját a lib/portal/asszisztens.ts ellenőrzi; itt csak a bemenet formája.

import { beszelgetes, beszelgetesek, dontes, kerdes, type Beszelgetes, type BeszelgetesFej } from "@/lib/portal/asszisztens";

export type Eredmeny = { ok: true; b: Beszelgetes; lista: BeszelgetesFej[] } | { ok: false; hiba: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hiba = (e: unknown): Eredmeny => ({ ok: false, hiba: e instanceof Error ? e.message : String(e) });

export async function uzenetKuldes(threadId: string | null, szoveg: string): Promise<Eredmeny> {
  const s = szoveg.trim();
  if (!s) return { ok: false, hiba: "Üres üzenet." };
  if (s.length > 2000) return { ok: false, hiba: "Az üzenet legfeljebb 2000 karakter lehet." };
  if (threadId !== null && !UUID.test(threadId)) return { ok: false, hiba: "Érvénytelen beszélgetés." };
  try {
    const b = await kerdes(threadId, s);
    return { ok: true, b, lista: await beszelgetesek() };
  } catch (e) {
    return hiba(e);
  }
}

export async function dontesKuldes(threadId: string, dontesek: Record<string, boolean>): Promise<Eredmeny> {
  if (!UUID.test(threadId)) return { ok: false, hiba: "Érvénytelen beszélgetés." };
  try {
    const b = await dontes(threadId, Object.fromEntries(Object.entries(dontesek).map(([k, v]) => [String(k), v === true])));
    return { ok: true, b, lista: await beszelgetesek() };
  } catch (e) {
    return hiba(e);
  }
}

export async function beszelgetesBetoltes(threadId: string): Promise<Eredmeny> {
  if (!UUID.test(threadId)) return { ok: false, hiba: "Érvénytelen beszélgetés." };
  try {
    const b = await beszelgetes(threadId);
    return b ? { ok: true, b, lista: await beszelgetesek() } : { ok: false, hiba: "Nincs ilyen beszélgetés." };
  } catch (e) {
    return hiba(e);
  }
}
