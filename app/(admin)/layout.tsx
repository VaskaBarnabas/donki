import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { Oldalmenu } from "@/components/admin/oldalmenu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Admin felület: modulonként külön oldal a bal oldali menüben. Szándékosan nincs egységes ügyfélnézet,
// globális keresés vagy modulokat összekötő dashboard – ez a „régi” munkamód.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Oldalmenu />
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
