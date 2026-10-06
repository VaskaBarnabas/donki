"use server";

// Ajánlatmotor: minden művelet a JSON-RPC 2.0 interfészen (params.apiKey a szerveren kerül bele).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { ajanlatRpc, rpcHibaSzoveg } from "@/lib/admin/interfeszek";

async function rpc(method: string, params: Record<string, unknown>, sikerUzenet: (r: Record<string, unknown>) => string) {
  const v = await ajanlatRpc(method, params);
  if (v.error) return kudarc(rpcHibaSzoveg(v.error), { reszlet: JSON.stringify(v.error, null, 2) });
  if (typeof params.quoteId === "string") revalidatePath(`/quotes/${params.quoteId}`);
  return siker(sikerUzenet(v.result as Record<string, unknown>), { reszlet: JSON.stringify(v.result, null, 2) });
}

export async function ajanlatLetrehozas(fd: FormData): Promise<AkcioEredmeny> {
  const v = await ajanlatRpc<{ id: string }>("quote.create", {
    partnerId: mezo(fd, "partnerId"),
    templateId: mezo(fd, "templateId") ? Number(mezo(fd, "templateId")) : undefined,
  });
  if (v.error) return kudarc(rpcHibaSzoveg(v.error));
  redirect(`/quotes/${v.result!.id}`);
}

export async function tetelHozzaadas(fd: FormData): Promise<AkcioEredmeny> {
  return rpc(
    "quote.addLine",
    {
      quoteId: mezo(fd, "quoteId"),
      productCode: mezo(fd, "productCode"),
      qty: Number(mezo(fd, "qty")),
      lineDiscountPct: mezo(fd, "lineDiscountPct") ? Number(mezo(fd, "lineDiscountPct").replace(",", ".")) : undefined,
    },
    () => "Tétel hozzáadva."
  );
}

export async function szamolas(fd: FormData): Promise<AkcioEredmeny> {
  return rpc("quote.calculate", { quoteId: mezo(fd, "quoteId") }, (r) =>
    `Nettó: ${r.totalNet} Ft, kedvezmény: ${r.totalDiscountPct}%${r.approvalRequired ? " – jóváhagyás szükséges" : ""}`
  );
}

export async function jovahagyasKeres(fd: FormData): Promise<AkcioEredmeny> {
  return rpc("quote.requestApproval", { quoteId: mezo(fd, "quoteId"), reason: mezo(fd, "reason") }, () => "Jóváhagyásra elküldve.");
}

export async function jovahagyas(fd: FormData): Promise<AkcioEredmeny> {
  return rpc("quote.approve", { quoteId: mezo(fd, "quoteId"), approver: mezo(fd, "approver") }, () => "Jóváhagyva.");
}

export async function elfogadas(fd: FormData): Promise<AkcioEredmeny> {
  return rpc("quote.accept", { quoteId: mezo(fd, "quoteId") }, (r) => `Elfogadva, rendelés: ${r.orderRef}`);
}
