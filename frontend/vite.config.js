import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const isGhPages = process.env.DEPLOY_TARGET === "gh-pages";

  return {
    plugins: [react()],
    base: isGhPages ? "/buddy-moving/" : "/",
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
