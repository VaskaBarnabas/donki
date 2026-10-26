import { AGENS_NEV, beszelgetes, beszelgetesek, MODELL } from "@/lib/portal/asszisztens";
import { sajatSzerep } from "@/lib/portal/szerep";
import { SZEREPKOR_NEV } from "@/lib/szerepkorok";
import { AsszisztensChat } from "./chat";

// Asszisztens (17. fázis): az ágens chatben, a bejelentkezett felhasználó szerepkörével. Az író műveletek előtt
// megáll, és jóváhagyást kér (jóváhagyási kártya). A modell helyben fut (Ollama), a rendszereket az MCP rétegen éri el.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AsszisztensOldal({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const [szerep, lista, kezdo] = await Promise.all([
    sajatSzerep(),
    beszelgetesek().catch(() => []),
    t && UUID.test(t) ? beszelgetes(t).catch(() => null) : Promise.resolve(null),
  ]);
  return <AsszisztensChat kezdo={kezdo} kezdoLista={lista} agensNev={AGENS_NEV} szerepNev={szerep ? SZEREPKOR_NEV[szerep] : "–"} modell={MODELL()} />;
}
