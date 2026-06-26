#!/usr/bin/env bash
set -euo pipefail

echo "╔══════════════════════════════════════════╗"
echo "║  WorkerBase — Local Environment Setup    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")/.."

# 1. Local D1 migrations
echo "▸ Applying D1 migrations (local)…"
npm run migrate:local --workspace backend

echo ""

# 2. Check for .dev.vars
if [ ! -f backend/.dev.vars ]; then
  echo "▸ Creating backend/.dev.vars from template…"
  cp backend/.dev.vars.example backend/.dev.vars
  SECRET=$(openssl rand -hex 32 2>/dev/null || echo "local-dev-fallback-secret")
  # Replace the placeholder secret on macOS and Linux
  sed -i.bak "s/local-dev-secret-replace-me/$SECRET/" backend/.dev.vars 2>/dev/null \
    || sed -i '' "s/local-dev-secret-replace-me/$SECRET/" backend/.dev.vars
  rm -f backend/.dev.vars.bak
  echo "  Generated AUTH_SECRET."
fi

echo ""
echo "✓ Local environment ready."
echo ""
echo "Next steps:"
echo "  npm run dev           # start backend (:8787) + dashboard (:5173)"
echo "  npm run build         # build dashboard into backend/public"
echo ""
echo "Preprod / Prod setup:"
echo "  npm run db:create:preprod   # creates remote D1 (copy the ID into backend/wrangler.jsonc)"
echo "  npm run bucket:create:preprod"
echo "  npm run secret:preprod      # set AUTH_SECRET"
echo "  npm run migrate:preprod     # apply migrations to remote D1"
echo "  npm run deploy:preprod      # build + deploy"
echo ""
