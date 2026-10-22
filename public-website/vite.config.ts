import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({ root: fileURLToPath(new URL(".", import.meta.url)), base: "/", plugins: [react()], server: { port: 5174, proxy: { "/api": "http://127.0.0.1:3000" } }, build: { outDir: "dist", assetsDir: "site-assets" } });
