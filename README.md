# WorkerBase

Self-hosted, Cloudflare-native Backend-as-a-Service. Hono + D1 + R2 +
Durable Objects on the backend; React + Vite + Tailwind + Shadcn UI on
the dashboard. Deploys as one Worker (simplest) or two Workers (split
dashboard / backend).

## Quick start (local)

```bash
# 1. Install deps
npm install

# 2. Configure secrets for the backend
cp backend/.dev.vars.example backend/.dev.vars   # then edit AUTH_SECRET
cd backend && npx wrangler d1 create workerbase-system-local   # one-time
npm run dev                                      # backend on :8787

# 3. In another shell — start the dashboard
npm -w dashboard run dev                         # dashboard on :5173
```

Open http://localhost:5173, complete first-run install, sign in.

Local dev credentials: `admin@workerbase.dev` / `Password123`.

---

## Deployment modes

WorkerBase supports two topologies. Pick one before you deploy.

### Mode A — Single Worker (simplest)

The dashboard builds into `backend/public` and is served by the same
Worker as the API. One URL, one deploy, no CORS configuration needed.

```bash
# Build dashboard assets into backend/public
npm -w dashboard run build

# Deploy the backend (which now serves the dashboard too)
cd backend
npx wrangler deploy --env prod
```

Set secrets once:

```bash
npx wrangler secret put AUTH_SECRET --env prod   # ≥ 32 chars
```

That's it — the app lives at `https://workerbase-prod.<account>.workers.dev`.

### Mode B — Split Workers (dashboard + backend on different URLs)

Use this when you want the dashboard on a custom domain or a different
host (e.g. `app.yourapp.com` + `api.yourapp.com`). The dashboard talks
to the backend cross-origin; CORS is handled automatically.

**1. Build the dashboard** with the backend URL baked in as a fallback
(optional — users can also enter it at `/setup` on first run):

```bash
VITE_API_BASE_URL=https://api.yourapp.com npm -w dashboard run build
```

Deploy the built dashboard to your preferred static host (Cloudflare
Pages, another Worker, etc.).

**2. Deploy the backend:**

```bash
cd backend
npx wrangler secret put AUTH_SECRET --env prod
npx wrangler deploy --env prod
```

**3. Configure the cross-origin wiring** — two options:

**Option 1 — from the dashboard UI (recommended):**
- Open the dashboard at its URL. If `VITE_API_BASE_URL` wasn't baked in,
  the sign-in page has a **"Configure backend URL"** link — click it,
  enter `https://api.yourapp.com`, test, save.
- Sign in → **Settings → Application → Split-Worker deployment**. Set
  **Dashboard URL** to `https://app.yourapp.com` and **Allowed CORS
  origins** to the same value (comma-separated if you have more than
  one). Save.

**Option 2 — via wrangler env vars** (deploy-time only):
Edit `backend/wrangler.jsonc` under `prod.vars`:

```jsonc
"vars": {
  "ENVIRONMENT": "prod",
  "DASHBOARD_URL": "https://app.yourapp.com",
  "CORS_ORIGINS": "https://app.yourapp.com"
}
```

Redeploy the backend.

UI values take precedence over env vars when both are set, so you can
always change origins later without a redeploy.

---

## Configuration reference

### Backend env vars

| Var | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | **yes** (secret) | HMAC secret for JWT signing. ≥ 32 chars. Set via `wrangler secret put`. |
| `ENVIRONMENT` | no | `local` / `preprod` / `prod`. Controls dev-only logging. |
| `DASHBOARD_URL` | no | Where the dashboard lives. Used for email-link redirects and as the default CORS origin. Falls back to `_settings.deploy.dashboardUrl`. |
| `CORS_ORIGINS` | no | Comma-separated browser origins allowed to call the API. Falls back to `DASHBOARD_URL`, then to `_settings.deploy.corsOrigins`. |
| `SYSTEM_DB` | binding | D1 database (auto-wired via wrangler.jsonc). |
| `STORAGE` | binding | R2 bucket for file uploads. |
| `REALTIME` | binding | Durable Object namespace for realtime broadcasts. |
| `RATE_LIMITER` | binding | Durable Object namespace for rate-limit counters. |
| `EMAIL` | binding | Cloudflare Email Service binding for outbound mail. |

### Dashboard build-time env

| Var | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | no | Backend URL. Empty = same-origin (Mode A). Absolute URL = split-Worker (Mode B). Can be overridden per-browser via `/setup`. |

---

## First-run setup

1. Visit the dashboard URL.
2. If on a split-Worker deploy and no backend URL is configured, click
   **"Configure backend URL"** on the sign-in page → enter the backend
   URL → **Test connection** → **Save & continue**.
3. The install wizard creates the first admin superuser.
4. Sign in with those credentials.

## Project layout

```
backend/      Hono + D1 + R2 + DOs (Cloudflare Worker)
  src/
    core/         feature routers (auth, collections, storage, ...)
    middleware/   CORS, rate-limit, request-logging
    auth/         JWT + password hashing + tokens
  migrations/  D1 SQL migrations
  public/      built dashboard assets (Mode A)
dashboard/    React + Vite + Tailwind (separate origin in Mode B)
docs/API.md   canonical endpoint reference
```

## Documentation

- **[docs/API.md](docs/API.md)** — every endpoint, with auth / body / response shapes.
- **[CLAUDE.md](CLAUDE.md)** — tech-stack rules and conventions.
