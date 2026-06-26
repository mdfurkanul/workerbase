/**
 * Core API — barrel re-exports for all system route groups.
 *
 * Usage in index.ts:
 *   import { authRouter, superuserAuthRouter, collectionsRouter, ... } from "./core/index.js";
 */

export { authRouter, superuserAuthRouter } from "./auth/index.js";
export { collectionsRouter } from "./collections/index.js";
export { sqlQueriesRouter } from "./sql/index.js";
export { realtimeRouter } from "./realtime/index.js";
