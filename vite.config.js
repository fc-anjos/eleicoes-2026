import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite";

const mapBytes = (() => {
  try {
    return statSync("web/public/data/map.json").size;
  } catch {
    return 0;
  }
})();

// Link previews are read from the HTML without running the page, so each language gets its own index.html: the
// root in Portuguese, en/ in English, with the title, description and og: tags filled from that locale's meta.
const meta = (l) => JSON.parse(readFileSync(`web/src/i18n/${l}.json`, "utf8")).meta;
const fill = (html, m) => html.replaceAll("{{TITLE}}", m.title).replaceAll("{{DESC}}", m.description);
const langPages = {
  name: "lang-pages",
  transformIndexHtml: (html) => fill(html, meta("pt")),
  closeBundle() {
    const pt = meta("pt"),
      en = meta("en");
    let html = readFileSync("dist/index.html", "utf8");
    for (const k of ["title", "description"]) html = html.replaceAll(pt[k], en[k]);
    html = html
      .replace('lang="pt-BR"', 'lang="en"')
      .replace('content="pt_BR"', 'content="en_US"')
      .replace(/(og:url" content="[^"]*)/, "$1en/")
      .replaceAll('="./', '="../');
    mkdirSync("dist/en", { recursive: true });
    writeFileSync("dist/en/index.html", html);
  },
};

// The page lives in web/; pipeline/build.py writes its data to web/public/data/map.json. Relative asset paths let
// dist/ be served from any subpath (e.g. GitHub Pages).
export default defineConfig({
  root: "web",
  plugins: [langPages],
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
  // the data's uncompressed size, for the loader's progress bar (servers send it gzipped, so Content-Length won't do)
  define: { __MAP_BYTES__: mapBytes },
});
