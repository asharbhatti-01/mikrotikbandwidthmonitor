# ---- Base ----
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# ---- Development ----
FROM base AS dev
# Copy all package.json files for dependency installation
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN bun install
# Source is bind-mounted in dev via docker-compose
EXPOSE 3001
CMD ["bun", "run", "--hot", "apps/api/src/index.ts"]

# ---- Dependencies (for build) ----
FROM base AS deps
COPY package.json bun.lock* ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN bun install

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun build apps/api/src/index.ts \
      --target=bun \
      --outdir=dist \
      --minify

# ---- Production / Staging ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db ./packages/db
EXPOSE 3001
CMD ["bun", "run", "dist/index.js"]
