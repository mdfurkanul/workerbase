/**
 * Dynamic collection router (composer).
 *
 * Mounts the metadata and records sub-routers at `/`. The composer is
 * mounted at `/api/core/collections` by the core barrel, so every route
 * path continues to resolve exactly as before the refactor.
 *
 *   POST   /                     create collection
 *   GET    /                     list collections
 *   GET    /:name                single collection
 *   DELETE /:name                delete collection
 *   PATCH  /:name                schema migration
 *   GET    /:name/records        paginated records
 *   POST   /:name/records        create record
 *   PATCH  /:name/records/:id    update record
 *   DELETE /:name/records/:id    delete record
 */
import { Hono } from "hono";
import type { Env } from "../../env.js";
import { metadataRouter } from "./metadataRouter.js";
import { recordsRouter } from "./recordsRouter.js";

export const collectionsRouter = new Hono<{ Bindings: Env }>();

collectionsRouter.route("/", metadataRouter);
collectionsRouter.route("/", recordsRouter);
