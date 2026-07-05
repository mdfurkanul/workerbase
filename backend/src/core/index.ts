/**
 * Core API — barrel re-exports for all system route groups.
 *
 * Usage in index.ts:
 *   import { superuserAuthRouter, collectionsRouter, ... } from "./core/index.js";
 */

export { superuserAuthRouter, externalAuthRouter } from "./auth/index.js";
export { collectionsRouter } from "./collections/index.js";
export { sqlQueriesRouter } from "./sql/index.js";
export { realtimeRouter } from "./realtime/index.js";
export { installRouter } from "./install/index.js";
export { storageRouter } from "./storage/storageRouter.js";
export { recordsRouter } from "./records/index.js";
export { settingsRouter } from "./settings/index.js";
export { exportRouter } from "./export/index.js";
export { importRouter } from "./import/index.js";
export { backupsRouter } from "./backups/index.js";
