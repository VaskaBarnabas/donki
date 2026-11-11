# A UCP-átjáró képe (21. fázis): egyetlen esbuild-csomag, a portáltól és az MCP-szerverektől külön folyamatban.
FROM node:24-alpine AS fuggosegek
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM fuggosegek AS build
COPY tsconfig.json ./
COPY lib/rendszer lib/rendszer
COPY mcp mcp
COPY agens agens
COPY ucp ucp
RUN npx esbuild ucp/szerver.ts --bundle --platform=node --format=esm --target=node24 --outfile=dist/ucp.mjs --log-level=warning \
      --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production UCP_HOST=0.0.0.0
COPY --from=build /app/dist/ ./
USER node
CMD ["node", "ucp.mjs"]
