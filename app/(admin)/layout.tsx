import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { Oldalmenu } from "@/components/admin/oldalmenu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sajatSzerep } from "@/lib/portal/szerep";
import { SZEREPKOR_NEV } from "@/lib/szerepkorok";

// A portál elrendezése (16. fázis): „Portál” (irányítópult, rendszerek, integrációk, felhasználók) és
// „Rendszerek felületei” – a modulonkénti oldalak a régi munkamód: szándékosan egységes ügyfélnézet és
// összekötés nélkül (ehhez mérjük az ágenseket); az összekötő nézet a portál irányítópultja.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const szerep = await sajatSzerep().catch(() => null);
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Oldalmenu admin={szerep === "admin"} szerepNev={szerep ? SZEREPKOR_NEV[szerep] : ""} />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-3 text-sm">
              <ThemeSwitcher />
              <Suspense>
                <AuthButton />
              </Suspense>
            </div>
          </header>
          <div className="flex flex-col gap-6 p-4 md:p-6">{children}</div>
        </SidebarInset>
        <Toaster richColors />
      </SidebarProvider>
    </TooltipProvider>
  );
}
