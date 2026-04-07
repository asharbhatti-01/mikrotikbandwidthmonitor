# ---- Base ----
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- Development ----
FROM base AS dev
# Copy full monorepo
COPY . .
# Install with npm in apps/web (override next version)
WORKDIR /app/apps/web
RUN npm init -y > /dev/null 2>&1 || true
RUN npm install next@15.5.14 react@19 react-dom@19 @trpc/client@11 @trpc/react-query@11 @tanstack/react-query@5 superjson@2 lucide-react clsx tailwind-merge typescript @types/react @types/react-dom @tailwindcss/postcss tailwindcss postcss 2>&1 | tail -3
EXPOSE 3000
CMD ["./node_modules/.bin/next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]

# ---- Production / Staging ----
FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
