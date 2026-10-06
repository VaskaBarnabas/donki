"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  FileText,
  LayoutGrid,
  LifeBuoy,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const MODULOK = [
  { href: "/crm", cim: "CRM", ikon: Users, protokoll: "PostgREST" },
  { href: "/catalog", cim: "Katalógus", ikon: Package, protokoll: "PostgREST" },
  { href: "/quotes", cim: "Ajánlatok", ikon: FileText, protokoll: "JSON-RPC" },
  { href: "/orders", cim: "Rendelések", ikon: ShoppingCart, protokoll: "HTTP + BPMN" },
  { href: "/inventory", cim: "Raktár", ikon: Warehouse, protokoll: "pgmq" },
  { href: "/billing", cim: "Számlázás", ikon: Receipt, protokoll: "szöveges" },
  { href: "/payments", cim: "Fizetés", ikon: Wallet, protokoll: "REST" },
  { href: "/support", cim: "Ügyfélszolgálat", ikon: LifeBuoy, protokoll: "SOAP" },
];

export function Oldalmenu() {
  const ut = usePathname();
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/protected" className="flex items-center gap-2 px-2 py-1.5 font-semibold">
          <Boxes className="size-5" />
          Legacy CRM
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={ut === "/protected"}>
                  <Link href="/protected">
                    <LayoutGrid />
                    <span>Áttekintés</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Modulok</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MODULOK.map((m) => (
                <SidebarMenuItem key={m.href}>
                  <SidebarMenuButton asChild isActive={ut === m.href || ut.startsWith(`${m.href}/`)}>
                    <Link href={m.href}>
                      <m.ikon />
                      <span>{m.cim}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{m.protokoll}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
