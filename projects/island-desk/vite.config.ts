import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({ plugins: [react()], base: "./", server: { host: "127.0.0.1", port: 5178, strictPort: true }, build: { outDir: "dist", rollupOptions: { input: { main: resolve(import.meta.dirname, "index.html"), companion: resolve(import.meta.dirname, "companion.html") } } } });
