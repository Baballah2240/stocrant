import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  base: "/",
  build: { outDir: "dist", assetsDir: "shop-assets" },
  server: { port: 5175, proxy: { "/api": "http://127.0.0.1:3000" } },
});
