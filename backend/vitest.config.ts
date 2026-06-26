import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node 20+ has globalThis.crypto.subtle — no Workers pool needed
    // for pure unit tests of the crypto / template modules.
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
