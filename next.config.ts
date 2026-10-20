import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// A portál (15. fázis óta csak felület – a legacy végpontok a független rendszerek konténereiben futnak).
// output: 'standalone' – a portál konténerképe a minimális server.js-sel fut (portal/Dockerfile).
// A cacheComponents ki van kapcsolva (a starter alapbeállítása volt; a meglévő oldalak dinamikus adatelérésre épülnek).

// Natív fejlesztéskor (npm run dev) a rendszerek kulcsai a generált .env.stack-ben vannak; a Next.js magától csak a
// .env.local-t olvassa. Konténerben ez a fájl nincs (.dockerignore) – ott a compose adja a változókat.
if (existsSync(".env.stack")) process.loadEnvFile(".env.stack");

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
