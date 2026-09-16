import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `/api` is proxied to a running `flashlearn start` so the app can load a real
 * deck in development without CORS. Override the target with FLASHLEARN_API
 * when the CLI is bound to a different host or port.
 */
const apiTarget = process.env.FLASHLEARN_API ?? "http://localhost:4173";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
  },
  preview: { port: 4174 },
});
