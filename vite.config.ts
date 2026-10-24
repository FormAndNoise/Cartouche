import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
    hmr: {
      port: 1421,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/__comfy_proxy": {
        target: "http://127.0.0.1:8188",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__comfy_proxy/, ""),
      },
    },
  },
  base: "./",
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
});
