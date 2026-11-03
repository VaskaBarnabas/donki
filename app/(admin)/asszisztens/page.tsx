import { AGENS_NEV, beszelgetes, beszelgetesek, MODELL } from "@/lib/portal/asszisztens";
import { beszelgetesJelzese, jelzes as jelzesBetoltes } from "@/lib/portal/jelzesek";
import { sajatSzerep } from "@/lib/portal/szerep";
import { SZEREPKOR_NEV } from "@/lib/szerepkorok";
import { AsszisztensChat } from "./chat";

// Asszisztens (17. fázis): az ágens chatben, a bejelentkezett felhasználó szerepkörével. Az író műveletek előtt
// megáll, és jóváhagyást kér (jóváhagyási kártya). A modell helyben fut (Ollama), a rendszereket az MCP rétegen éri el.
// 18. fázis: ?jelzes=<id> – új beszélgetés egy jelzésből, az ágens ajánlott kérésével előre kitöltve (csak a jelzés
// azonosítója kerül az URL-be, a tartalma a szerveren töltődik be, a láthatóság ellenőrzésével).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AsszisztensOldal({ searchParams }: { searchParams: Promise<{ t?: string; jelzes?: string }> }) {
  const { t, jelzes: jelzesParam } = await searchParams;
  const threadId = t && UUID.test(t) ? t : null;
  const jelzesId = !threadId && jelzesParam && /^\d{1,12}$/.test(jelzesParam) ? Number(jelzesParam) : null;
  const [szerep, lista, kezdo, ujJelzes, kotottJelzes] = await Promise.all([
    sajatSzerep(),
    beszelgetesek().catch(() => []),
    threadId ? beszelgetes(threadId).catch(() => null) : Promise.resolve(null),
    jelzesId ? jelzesBetoltes(jelzesId).catch(() => null) : Promise.resolve(null),
    threadId ? beszelgetesJelzese(threadId).catch(() => null) : Promise.resolve(null),
  ]);
  const jelzes = ujJelzes
    ? { id: ujJelzes.id, cim: ujJelzes.cim, ajanlottKeres: ujJelzes.ajanlottKeres, uj: true }
    : kotottJelzes
      ? { id: kotottJelzes.id, cim: kotottJelzes.cim, ajanlottKeres: null, uj: false }
      : null;
  return (
    <AsszisztensChat
      kezdo={kezdo}
      kezdoLista={lista}
      agensNev={AGENS_NEV}
      szerepNev={szerep ? SZEREPKOR_NEV[szerep] : "–"}
      modell={MODELL()}
      jelzes={jelzes}
    />
  );
}
