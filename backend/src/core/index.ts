/**
 * Core API — barrel re-exports for all system route groups.
 *
 * Usage in index.ts:
 *   import { superuserAuthRouter, collectionsRouter, ... } from "./core/index.js";
 */

export { superuserAuthRouter } from "./auth/index.js";
export { collectionsRouter } from "./collections/index.js";
export { sqlQueriesRouter } from "./sql/index.js";
export { realtimeRouter } from "./realtime/index.js";
