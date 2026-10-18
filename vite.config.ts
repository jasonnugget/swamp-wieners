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
        console.info("Waiting for PlanIT API before starting Vite…");
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
      "/api": apiTarget,
      "/uploads": apiTarget,
    },
  },
  build: { chunkSizeWarningLimit: 1700 },
});
