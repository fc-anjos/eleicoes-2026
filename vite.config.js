import { defineConfig } from "vite";

// The page lives in web/; pipeline/build.py writes its data to web/public/data/map.json. Relative asset paths let
// dist/ be served from any subpath (e.g. GitHub Pages).
export default defineConfig({
  root: "web",
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
});
