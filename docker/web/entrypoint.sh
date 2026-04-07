#!/bin/sh
set -e

cd /app/apps/web

# Remove workspace: references that npm can't handle
sed -i 's/"workspace:\*"/"*"/g' package.json 2>/dev/null || true
# Pin next to 15.x
sed -i 's/"next": "[^"]*"/"next": "15.5.14"/g' package.json 2>/dev/null || true

# Install deps if node_modules is missing
if [ ! -d node_modules/next ]; then
  echo "[web] Installing dependencies..."
  npm install --loglevel=warn 2>&1
  echo "[web] Dependencies installed"
fi

echo "[web] Next.js version: $(./node_modules/.bin/next --version)"
echo "[web] Starting Next.js dev server..."
exec ./node_modules/.bin/next dev --port 3000 --hostname 0.0.0.0
