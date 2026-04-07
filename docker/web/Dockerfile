# ---- Base ----
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# ---- Development ----
FROM base AS dev
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/types/package.json ./packages/types/
RUN bun install
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/web", "next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]

# ---- Dependencies (for build) ----
FROM base AS deps
COPY package.json bun.lock* ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/types/package.json ./packages/types/
RUN bun install

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd apps/web next build

# ---- Production / Staging ----
FROM base AS production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["bun", "run", "apps/web/server.js"]
