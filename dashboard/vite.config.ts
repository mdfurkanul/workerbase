import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Dashboard build config.
 *
 * Critically, `build.outDir` is set to `../backend/public` so that the
 * compiled SPA is shipped inside the Worker bundle (single-package
 * distribution strategy). The backend Hono app serves it via serveStatic.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../backend/public",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        // Content-hash everything; assets go into backend/public/assets.
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the local Wrangler dev server.
      "/api": "http://localhost:8787",
    },
  },
});
