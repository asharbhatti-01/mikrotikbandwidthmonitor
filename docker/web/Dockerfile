# ---- Base ----
FROM node:22-alpine AS base
WORKDIR /app

# ---- Development ----
FROM base AS dev
WORKDIR /app/apps/web
# Copy only the web app package.json
COPY apps/web/package.json ./
# Force install next@15 and all deps
RUN npm install next@15.5.14 react@19 react-dom@19 && npm install
# Copy source (volume mount overrides at runtime)
COPY apps/web/. ./
EXPOSE 3000
CMD ["./node_modules/.bin/next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]

# ---- Dependencies (for build) ----
FROM base AS deps
WORKDIR /app/apps/web
COPY apps/web/package.json ./
RUN npm install next@15.5.14 react@19 react-dom@19 && npm install

# ---- Build ----
FROM deps AS build
COPY apps/web/. ./
COPY packages /app/packages
ENV NEXT_TELEMETRY_DISABLED=1
RUN ./node_modules/.bin/next build

# ---- Production / Staging ----
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
