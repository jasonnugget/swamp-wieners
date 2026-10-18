import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { waitForApi } from "./server/dev-readiness";
const apiTarget = "http://127.0.0.1:3001";
export default defineConfig({
  optimizeDeps: {
    include: [
      "three", "three/addons/controls/OrbitControls.js",
      "three/addons/geometries/RoundedBoxGeometry.js", "three/addons/utils/BufferGeometryUtils.js",
      "three/addons/postprocessing/EffectComposer.js", "three/addons/postprocessing/RenderPass.js",
      "three/addons/postprocessing/ShaderPass.js", "three/addons/postprocessing/OutputPass.js",
    ],
  },
  plugins: [
    react(),
    {
      name: "api-readiness",
      async configureServer() {
        console.info("Waiting for Threshold API before starting Vite…");
        await waitForApi(`${apiTarget}/api/health`);
      },
    },
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
    port: 5180,
    strictPort: true,
    proxy: {
      // Keep the browser's Host header: the API rejects writes whose Origin differs from Host.
      "/api": { target: apiTarget, changeOrigin: false },
      "/uploads": { target: apiTarget, changeOrigin: false },
    },
  },
  build: { chunkSizeWarningLimit: 1700 },
});
