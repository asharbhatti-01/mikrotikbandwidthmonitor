#!/bin/sh
set -e

cd /app/apps/web

# Install deps if node_modules is missing (happens after volume mount)
if [ ! -f node_modules/.package-lock.json ]; then
  echo "[web] Installing dependencies..."
  npm install next@15.5.14 react@19 react-dom@19 @trpc/client@11 @trpc/react-query@11 @tanstack/react-query@5 superjson@2 lucide-react clsx tailwind-merge typescript @types/react @types/react-dom @tailwindcss/postcss tailwindcss postcss --loglevel=warn 2>&1
  echo "[web] Dependencies installed"
fi

echo "[web] Starting Next.js dev server..."
exec ./node_modules/.bin/next dev --port 3000 --hostname 0.0.0.0
