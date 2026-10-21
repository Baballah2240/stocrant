import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend dev server for STOCRANT. Proxies /api to the Express backend
// launched by `npm run dev:api` (port 3000).
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/web" },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/website": { target: "http://localhost:3000", changeOrigin: true },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
