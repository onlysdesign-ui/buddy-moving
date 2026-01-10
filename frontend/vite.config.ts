import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const appVersion = process.env.npm_package_version ?? "dev";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/buddy-moving/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
