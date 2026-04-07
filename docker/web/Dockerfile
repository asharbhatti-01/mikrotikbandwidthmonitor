# ---- Base ----
FROM node:22-alpine AS base
RUN npm install -g bun
WORKDIR /app

# ---- Development ----
FROM base AS dev
# Copy all workspace package.jsons
COPY package.json ./
COPY apps/web ./apps/web
COPY packages/ui ./packages/ui
COPY packages/types ./packages/types
# Install deps at root (hoisted) AND in apps/web
RUN bun install && cd apps/web && bun install
EXPOSE 3000
WORKDIR /app/apps/web
ENV NEXT_TURBOPACK=0
CMD ["npx", "next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]

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
WORKDIR /app/apps/web
RUN npx next build

# ---- Production / Staging ----
FROM base AS production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
