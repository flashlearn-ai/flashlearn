import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL("./ui", import.meta.url)),
  plugins: [react()],
  base: mode === "demo" ? "./" : "/",
  // Demo is an explicit build mode, not a user or repository environment switch.
  define: { __DEMO__: mode === "demo" },
  build: { outDir: mode === "demo" ? "../dist/demo" : "../dist/web", emptyOutDir: true },
  server: { host: "localhost", port: 5173, proxy: { "/api": "http://localhost:4173" } },
  preview: { host: "localhost", port: 4174 },
}));
