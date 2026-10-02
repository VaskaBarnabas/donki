import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <SiteHeader />
      <div className="flex-1 w-full max-w-5xl flex flex-col gap-12 px-5 py-10">
        {children}
      </div>
      <SiteFooter />
    </main>
  );
}
