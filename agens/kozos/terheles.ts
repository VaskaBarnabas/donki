// A helyi modell terhelése (18. fázis): az Ollama egyszerre egy kérést szolgál ki jól, ezért a chat (a felhasználó
// vár a válaszra) elsőbbséget kap a háttérfigyelő elemzéseivel szemben – amíg egy chat-kérés fut, a figyelő nem indít
// új elemzést. A számláló a globalThis-en van: a Next.js az instrumentation-t (ahonnan a figyelő indul) és az oldalakat
// külön modulpéldányként is betöltheti, de a folyamat közös.

const g = globalThis as { __donkiChatFut?: number }

/** Egy felhasználói (chat) kérés futtatása – közben a figyelő vár. */
export async function chatKeres<T>(f: () => Promise<T>): Promise<T> {
  g.__donkiChatFut = (g.__donkiChatFut ?? 0) + 1
  try {
    return await f()
  } finally {
    g.__donkiChatFut = (g.__donkiChatFut ?? 1) - 1
  }
}

export const chatFut = () => (g.__donkiChatFut ?? 0) > 0
