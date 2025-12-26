import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const isGhPages = process.env.DEPLOY_TARGET === "gh-pages";

  return {
    root: path.resolve(__dirname, "frontend"),
    plugins: [react()],
    base: isGhPages ? "/buddy-moving/" : "/",
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
  };
});
