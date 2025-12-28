import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/buddy-moving/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
