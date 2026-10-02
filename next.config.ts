import type { NextConfig } from "next";

// A cacheComponents (a starter alapbeállítása) ki van kapcsolva: nem engedi a route szintű
// `export const runtime = 'nodejs'` beállítást, amit a spec minden legacy végpontra előír.
const nextConfig: NextConfig = {};

export default nextConfig;
