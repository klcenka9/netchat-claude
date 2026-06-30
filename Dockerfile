# NetChat — single image that builds the client + server and serves both.
# Runtime layout mirrors the repo (/app/server + /app/client) so the server's
# `../../client/dist` path resolves. Works the same on Windows/macOS/Linux Docker.

# ---- build the React client ----
FROM node:20-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- build the server (compiles better-sqlite3 + TS) ----
FROM node:20-bookworm-slim AS server-build
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/package.json ./package.json
COPY --from=client /app/client/dist /app/client/dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
