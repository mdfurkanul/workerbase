# WorkerBase API Docs (Developer-Only)

This folder contains the local API reference viewer. It is intended **only for
developers working on the repo** — it is never deployed, never bundled into the
Cloudflare Worker, and never exposed to end users.

## Run locally

```bash
# from the repo root
npm run docs           # serves at http://localhost:6789
npm run docs:open      # serves + auto-opens browser
```

If port `6789` is busy, the server transparently picks the next free port and
prints which one it used.

## Files

| File              | Purpose                                                |
|-------------------|--------------------------------------------------------|
| `API.md`          | Source-of-truth endpoint reference (Markdown)          |
| `index.html`      | Standalone explorer UI (renders `API.md` via marked.js) |

## Production safety

- The Cloudflare Worker bundle is built only from `backend/src/index.ts`
  (see `backend/wrangler.jsonc` → `"main"`). Nothing under `docs/` or
  `scripts/` is imported by backend source, so it is never included in
  `npm run build` / `npm run deploy`.
- The `docs` npm script is dev-only — no `deploy:*` script invokes it.
- Safe to delete this entire folder without affecting production.

## Keeping it in sync

Whenever an API endpoint is added, removed, or its parameters / validation /
auth change, update `API.md` in the same commit. The browser view auto-reflects
the latest `API.md` on refresh — no rebuild needed.
