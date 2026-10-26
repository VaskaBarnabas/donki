"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Boxes,
  FileText,
  LayoutGrid,
  PlugZap,
  UserCog,
  LifeBuoy,
  Package,
  Receipt,
  Server,
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

// 16. fázis: két réteg. „Portál” – az integrációs portál (irányítópult; adminnak rendszerek, integrációk,
// felhasználók). „Rendszerek felületei” – a régi munkamód: rendszerenként külön oldal, a saját formátumával.
const PORTAL = [
  { href: "/iranyitopult", cim: "Irányítópult", ikon: LayoutGrid, admin: false },
  { href: "/asszisztens", cim: "Asszisztens", ikon: Bot, admin: false },
  { href: "/rendszerek", cim: "Rendszerek", ikon: Server, admin: true },
  { href: "/integraciok", cim: "Integrációk", ikon: PlugZap, admin: true },
  { href: "/felhasznalok", cim: "Felhasználók", ikon: UserCog, admin: true },
];

export function Oldalmenu({ admin, szerepNev }: { admin: boolean; szerepNev: string }) {
  const ut = usePathname();
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/iranyitopult" className="flex items-center gap-2 px-2 py-1.5 font-semibold">
          <Boxes className="size-5" />
          Legacy CRM
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">{szerepNev}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Portál</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PORTAL.filter((m) => admin || !m.admin).map((m) => (
                <SidebarMenuItem key={m.href}>
                  <SidebarMenuButton asChild isActive={ut === m.href || ut.startsWith(`${m.href}/`)}>
                    <Link href={m.href}>
                      <m.ikon />
                      <span>{m.cim}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Rendszerek felületei</SidebarGroupLabel>
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
