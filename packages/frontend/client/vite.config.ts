import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `/api` is proxied to a running `flashlearn start` so the app can load a real
 * deck in development without CORS. Override the target with FLASHLEARN_API
 * when the CLI is bound to a different host or port.
 */
const apiTarget = process.env.FLASHLEARN_API ?? "http://localhost:4173";

// Run from the package root (`vite --config client/vite.config.ts`), so the browser
// tree stays in `client/` beside the server in `src/` that serves its build.
export default defineConfig(({ mode }) => {
  /**
   * The build `flashlearn start` serves must read the running project, not the
   * bundled fixture. Set here rather than in `.env.production`, which
   * `.gitignore` excludes via `.env.*`: that file cannot be committed, so the
   * default would silently revert to the fixture on every other checkout.
   *
   * `--mode demo` builds the standalone showcase instead. Selected by mode
   * rather than an inline environment variable, which is POSIX-only and would
   * fail on Windows. `deckSource` keeps its own `fixture` default, so the tests
   * and a bare `vite dev` are unaffected.
   */
  process.env.VITE_DECK_SOURCE ??= mode === "demo" ? "fixture" : "api";

  return {
    root: "client",
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": { target: apiTarget, changeOrigin: true } },
    },
    // Not 4173: that is where `flashlearn start` is expected, and a preview of
    // the client must not take the port the API it talks to is bound on.
    preview: { port: 4174 },
  };
});
