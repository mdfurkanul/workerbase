#!/usr/bin/env bash
set -euo pipefail

echo "╔══════════════════════════════════════════════╗"
echo "║  WorkerBase — Local Environment Setup        ║"
echo╚══════════════════════════════════════════════╝"
echo ""

# 1. Local D1 migrations
echo "▸ Applying D1 migrations (local)…"
npx wrangler d1 migrations apply workerbase-db-local --local --env local

echo ""

# 2. Check for .dev.vars
if [ ! -f backend/.dev.vars ]; then
  echo "▸ Creating backend/.dev.vars from template…"
  cp backend/.dev.vars.example backend/.dev.vars
  echo "  Generated a local AUTH_SECRET."
  # Generate a random secret
  SECRET=$(openssl rand -hex 32 2>/dev/null || echo "local-dev-fallback-secret")
  sed -i.bak "s/local-dev-secret-replace-me/$SECRET/" backend/.dev.vars && rm -f backend/.dev.vars.bak
fi

echo ""
echo "✓ Local environment ready."
echo ""
echo "Next steps:"
echo "  npm run dev           # start backend (:8787) + dashboard (:5173)"
echo "  npm run build         # build dashboard into backend/public"
echo ""
echo "Preprod / Prod setup:"
echo "  npm run db:create:preprod   # creates remote D1 (copy the ID into wrangler.jsonc)"
echo "  npm run bucket:create:preprod"
echo "  npm run secret:preprod      # set AUTH_SECRET"
echo "  npm run migrate:preprod     # apply migrations to remote D1"
echo "  npm run deploy:preprod      # build + deploy"
echo ""
