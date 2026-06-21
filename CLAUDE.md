# WorkerBase Project Rules

## Tech Stack Requirements
- Backend: TypeScript, Hono, Cloudflare D1 (SQLite), Cloudflare R2, 
Drizzle ORM, Zod, Durable Objects.
- Frontend: TypeScript, React, Vite, Tailwind CSS, Shadcn UI.
- Architecture: Monorepo singleton. The frontend must build static assets 
into the backend asset subdirectory, served seamlessly via Hono's 
`serve-static` middleware.

## Code Style & Conventions
- Prefer Drizzle ORM over Prisma (Zero Prisma engines allowed due to cold 
start bloat).
- Use dynamic, parameterized runtime SQL via Zod schema builders for 
custom multi-tenant dynamic tables.
- All backend files must handle context ceilings safely by leveraging 
`ctx.waitUntil()` for asynchronous background tasks (like Durable Object 
real-time broadcasts).
- Frontend components should remain tightly minified and tree-shaken to 
stay comfortably under Cloudflare's 1MB Worker size thresholds.
