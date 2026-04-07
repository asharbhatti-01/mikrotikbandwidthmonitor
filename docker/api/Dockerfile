# ---- Base ----
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json bun.lockb ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN bun install --frozen-lockfile

# ---- Development ----
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
# Source is bind-mounted in dev via docker-compose
EXPOSE 3001
CMD ["bun", "run", "--hot", "apps/api/src/index.ts"]

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
