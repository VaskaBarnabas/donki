# Az MCP integrációs réteg képe (15. fázis): mind az öt domain szerver egy képben, külön csomagolva;
# a compose szolgáltatásonként más szervert indít (command: node <szerver>.mjs).
FROM node:24-alpine AS fuggosegek
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM fuggosegek AS build
COPY tsconfig.json ./
COPY lib/rendszer lib/rendszer
COPY mcp mcp
RUN for s in orders sales inventory finance support; do \
      npx esbuild "mcp/servers/$s/index.ts" --bundle --platform=node --format=esm --target=node24 --outfile="dist/$s.mjs" --log-level=warning \
        --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" || exit 1; \
    done

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production MCP_HOST=0.0.0.0
COPY --from=build /app/dist/ ./
USER node
