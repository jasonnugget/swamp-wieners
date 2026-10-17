import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  optimizeDeps: {
    include: ["three", "three/addons/controls/OrbitControls.js"],
  },
  plugins: [
    react(),
    {
      name: "offline-asset-manifest",
      generateBundle(_options, bundle) {
        this.emitFile({
          type: "asset",
          fileName: "asset-manifest.json",
          source: JSON.stringify(Object.keys(bundle).map((name) => `/${name}`)),
        });
      },
    },
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/uploads": "http://127.0.0.1:3001",
    },
  },
  build: { chunkSizeWarningLimit: 1700 },
});
