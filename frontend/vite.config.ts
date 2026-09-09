import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // In production Caddy serves the build at / and proxies /api to Django, so
    // both live on one origin. This mirrors that in development, which keeps
    // the session cookie working exactly the same way.
    proxy: {
      "/api": { target: "http://127.0.0.1:8811", changeOrigin: false },
      "/media": { target: "http://127.0.0.1:8811", changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    // Nothing consumes source maps yet, so shipping 1.5MB of them is just
    // public weight. Switch to "hidden" if an error reporter is ever added.
    sourcemap: false,
  },
});
