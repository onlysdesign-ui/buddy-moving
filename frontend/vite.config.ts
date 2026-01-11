import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const mergeNumber = process.env.MERGE_NUMBER;
const mergeTime = process.env.MERGE_TIME;
const appVersion =
  mergeNumber != null
    ? `0.1.${mergeNumber}`
    : process.env.npm_package_version ?? "dev";
const appBuild =
  mergeTime ||
  process.env.GITHUB_SHA ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  "dev";
let appBuildLabel = appBuild;
if (mergeTime == null && appBuild !== "dev") {
  appBuildLabel = appBuild.slice(0, 7);
}

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
    __APP_BUILD__: JSON.stringify(appBuildLabel),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
