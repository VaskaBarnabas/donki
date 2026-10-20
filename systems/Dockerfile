# Egy független vállalati rendszer képe (15. fázis). Build: --build-arg RENDSZER=billing
# Az esbuild a rendszer belépési pontját EGY fájlba csomagolja; a futó kép csak ezt tartalmazza.
# A build elbukik, ha a csomagba más rendszer kódja kerülne (systems/kozos/kepellenorzes.mjs).

FROM node:24-alpine AS fuggosegek
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM fuggosegek AS build
ARG RENDSZER
COPY tsconfig.json ./
COPY lib/rendszer lib/rendszer
COPY lib/flowable lib/flowable
COPY legacy legacy
COPY systems systems
COPY flowable/processes flowable/processes
RUN npx esbuild "systems/${RENDSZER}/server.ts" --bundle --platform=node --format=esm --target=node24 \
      --outfile=dist/server.mjs --metafile=dist/meta.json --log-level=warning \
      --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
 && node systems/kozos/kepellenorzes.mjs "${RENDSZER}" dist/meta.json \
 && mkdir -p dist/fajlok && if [ -d "systems/${RENDSZER}/fajlok" ]; then cp -r "systems/${RENDSZER}/fajlok/." dist/fajlok/; fi \
 && if [ "${RENDSZER}" = orders ]; then cp flowable/processes/*.bpmn20.xml dist/fajlok/; fi

FROM node:24-alpine
ARG RENDSZER
WORKDIR /app
ENV NODE_ENV=production RENDSZER=${RENDSZER}
COPY --from=build /app/dist/server.mjs ./server.mjs
COPY --from=build /app/dist/fajlok ./fajlok
RUN mkdir -p /data/tarhely && chown node:node /data/tarhely
USER node
CMD ["node", "server.mjs"]
