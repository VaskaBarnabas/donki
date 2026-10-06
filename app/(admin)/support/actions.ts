"use server";

// Ügyfélszolgálat: minden művelet SOAP 1.1-en (Header: <hd:ApiKey>). A hibák SOAP Faultként: HD-xxx.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { kudarc, mezo, siker, type AkcioEredmeny } from "@/lib/admin/akcio";
import { helpdeskSoap } from "@/lib/admin/interfeszek";

async function soap(muvelet: string, p: Record<string, string>, ticketId: string, uzenet: string): Promise<AkcioEredmeny> {
  const v = await helpdeskSoap(muvelet, p);
  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  if (v.fault) return kudarc(`SOAP Fault: ${v.fault}`);
  return siker(uzenet, { reszlet: JSON.stringify(v.ok, null, 2) });
}

export async function jegyLetrehozas(fd: FormData): Promise<AkcioEredmeny> {
  const v = await helpdeskSoap("CreateTicket", {
    PartnerTaxNumber: mezo(fd, "PartnerTaxNumber"),
    OrderNo: mezo(fd, "OrderNo"),
    ProductCode: mezo(fd, "ProductCode"),
    Description: mezo(fd, "Description"),
  });
  if (v.fault) return kudarc(`SOAP Fault: ${v.fault}`);
  const jegy = (v.ok?.Ticket as Record<string, unknown>[] | undefined)?.[0];
  redirect(`/support/${jegy?.TicketId}`);
}

export async function allapotValtas(fd: FormData): Promise<AkcioEredmeny> {
  const id = mezo(fd, "TicketId");
  return soap("UpdateTicketStatus", { TicketId: id, Status: mezo(fd, "Status") }, id, `Új állapot: ${mezo(fd, "Status")}`);
}

export async function garancia(fd: FormData): Promise<AkcioEredmeny> {
  const v = await helpdeskSoap("CheckWarranty", { OrderNo: mezo(fd, "OrderNo"), ProductCode: mezo(fd, "ProductCode") });
  if (v.fault) return kudarc(`SOAP Fault: ${v.fault}`);
  const ok = v.ok?.Valid === "true";
  const msg = `${v.ok?.ReasonCode}${v.ok?.ExpiresAt ? ` – lejár: ${String(v.ok.ExpiresAt).slice(0, 10)}` : ""}`;
  return ok ? siker(msg, { reszlet: JSON.stringify(v.ok, null, 2) }) : kudarc(msg, { reszlet: JSON.stringify(v.ok, null, 2) });
}

export async function rmaInditas(fd: FormData): Promise<AkcioEredmeny> {
  const id = mezo(fd, "TicketId");
  return soap("StartRMA", { TicketId: id, Type: mezo(fd, "Type") }, id, `RMA elindítva (${mezo(fd, "Type")})`);
}

export async function rmaBeerkezes(fd: FormData): Promise<AkcioEredmeny> {
  return soap("ReceiveRMA", { RmaId: mezo(fd, "RmaId") }, mezo(fd, "TicketId"), "Beérkezett – VISSZARU_BE elküldve a raktárnak");
}
