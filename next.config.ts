import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// A portál (15. fázis óta csak felület – a legacy végpontok a független rendszerek konténereiben futnak).
// output: 'standalone' – a portál konténerképe a minimális server.js-sel fut (portal/Dockerfile).
// A cacheComponents ki van kapcsolva (a starter alapbeállítása volt; a meglévő oldalak dinamikus adatelérésre épülnek).

// A portál natívan fut (npm run dev). A generált .env.stack-ből CSAK az integrációs titkosító kulcsot veszi át – a
// rendszerek titkait (JWT, adatbázis-jelszó, API-kulcs) nem: a rendszereket a bekötött integrációkon éri el.
// Konténerben ez a fájl nincs (.dockerignore) – ott a compose adja a változókat.
if (existsSync(".env.stack")) {
  const stack = parseEnv(readFileSync(".env.stack", "utf8"));
  process.env.PORTAL_INTEGRACIO_KEY ??= stack.PORTAL_INTEGRACIO_KEY;
}

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
