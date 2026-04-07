# ---- Base ----
FROM node:22-alpine AS base
WORKDIR /app

# ---- Development ----
FROM base AS dev
COPY package.json ./
COPY apps/web ./apps/web
COPY packages/ui ./packages/ui
COPY packages/types ./packages/types
# Use npm to respect exact version pins
WORKDIR /app/apps/web
RUN npm install
EXPOSE 3000
CMD ["npx", "next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]

# ---- Dependencies (for build) ----
FROM base AS deps
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/types/package.json ./packages/types/
WORKDIR /app/apps/web
RUN npm install

# ---- Build ----
FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN npx next build

# ---- Production / Staging ----
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
