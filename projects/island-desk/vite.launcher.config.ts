import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
// The Android launcher loads the phone page from inside the app, so it is built on its own.
export default defineConfig({ plugins: [react()], base: "./", publicDir: false, build: { outDir: "dist-launcher", emptyOutDir: true, rollupOptions: { input: { index: resolve(import.meta.dirname, "companion.html") } } } });
