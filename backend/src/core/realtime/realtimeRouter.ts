import { Hono } from "hono";
import type { Env } from "../../env.js";

/**
 * Realtime router — `GET /api/realtime/:collection` upgrades to a WebSocket
 * whose DO stub is selected by `env.REALTIME.idFromName(collectionName)`,
 * giving each collection its own isolated topic.
 */
export const realtimeRouter = new Hono<{ Bindings: Env }>();

realtimeRouter.get("/:collection", (c) => {
  const collection = c.req.param("collection");
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(collection)) {
    return c.json({ error: "invalid collection name" }, 400);
  }

  const upgrade = c.req.header("Upgrade");
  if (upgrade !== "websocket") {
    return c.json({ error: "Expected Upgrade: websocket" }, 426);
  }

  // Each collection name maps to exactly one DO instance → isolated topic.
  const id = c.env.REALTIME.idFromName(collection);
  const stub = c.env.REALTIME.get(id);

  // Forward the upgrade to the Durable Object.
  return stub.fetch(c.req.raw);
});
