import { ThemeSwitcher } from "@/components/theme-switcher";

export function SiteFooter() {
  return (
    <footer className="w-full flex flex-wrap items-center justify-center border-t mx-auto text-center text-xs text-muted-foreground gap-8 py-10 px-5">
      <p>Heterogén legacy vállalatirányítási rendszer – MCP és ágens-alapú integráció kísérleti terepe</p>
      <ThemeSwitcher />
    </footer>
  );
}
