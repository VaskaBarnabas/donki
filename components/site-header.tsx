import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { hasEnvVars } from "@/lib/utils";
import { Boxes } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export function SiteHeader() {
  return (
    <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
      <div className="w-full max-w-5xl flex justify-between items-center gap-4 p-3 px-5 text-sm">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Boxes className="size-5" />
          <span>Legacy CRM</span>
          <span className="hidden sm:inline font-normal text-muted-foreground">
            · szakdolgozati prototípus
          </span>
        </Link>
        {!hasEnvVars ? (
          <EnvVarWarning />
        ) : (
          <Suspense>
            <AuthButton />
          </Suspense>
        )}
      </div>
    </nav>
  );
}
