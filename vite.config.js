import { statSync } from "node:fs";
import { defineConfig } from "vite";

const mapBytes = (() => {
  try {
    return statSync("web/public/data/map.json").size;
  } catch {
    return 0;
  }
})();

// The page lives in web/; pipeline/build.py writes its data to web/public/data/map.json. Relative asset paths let
// dist/ be served from any subpath (e.g. GitHub Pages).
export default defineConfig({
  root: "web",
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
  // the data's uncompressed size, for the loader's progress bar (servers send it gzipped, so Content-Length won't do)
  define: { __MAP_BYTES__: mapBytes },
});
