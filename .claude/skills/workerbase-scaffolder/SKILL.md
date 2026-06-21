---
name: workerbase-scaffolder
description: Multi-file scaffolding workflow for building WorkerBase. Trigger this when initializing files, creating folders, configuring wrangler, or building out the monorepo architecture.
---

# WorkerBase Orchestration Playbook

You are acting as a Principal Systems Architect. Execute the following macro-phases meticulously. Step into Plan Mode (`/plan`) first to map your actions, then output raw, complete configurations without omitting structural blocks.

## Phase 1: Workspace Structural Setup
1. Create a workspace-level `package.json` enabling npm workspaces for `./backend` and `./dashboard`.
2. Generate a root-level `wrangler.jsonc` file with the exact configuration blocks below:
   - D1 Database binding named `DB`
   - R2 Bucket binding named `STORAGE`
   - Durable Object Namespace named `REALTIME` referencing a `RealtimeHub` class.
3. Configure path aliasing in the root tsconfig to map core types smoothly across spaces.

## Phase 2: Core Backend Engine Framework
1. Navigate into `/backend` and create a standard modular TypeScript layout using Hono.
2. Structure a system control table configuration named `_collections` via Drizzle ORM. Columns: `id` (text/primary), `name` (text), `schema` (json), `list_rule` (text), `create_rule` (text).
3. Author a dynamic collection router (`POST /api/collections`) that grabs a dynamic JSON configuration array, strictly checks collection names for alphanumeric security, and runs a live `CREATE TABLE` execution onto D1.
4. Set up an isolated, stateful Durable Object class (`RealtimeHub`) implementing the WebSockets API. In your Hono endpoints, instantiate unique DO stubs dynamically via `env.REALTIME.idFromName(collectionName)` to establish isolated websocket topics per collection table.

## Phase 3: Dashboard Assembly Injection
1. Navigate into `/dashboard` and scaffold a standard React, Vite, and TypeScript app.
2. Edit `dashboard/vite.config.ts` to explicitly target `build.outDir: "../backend/public"`.
3. Inside your central Hono router (`backend/src/index.ts`), map static routing:
   - `app.use('/*', serveStatic({ root: './public' }))`
   - Ensure explicit API paths (`/api/*`) bypass this filter to guarantee the single-package distribution strategy operates seamlessly.
