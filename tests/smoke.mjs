// Smoke test: serve the built page (dist/), open it in headless Chromium and check that each mode draws dots with
// no errors. Usage: npm run build && npm run test:smoke [-- screenshot-dir]
import { chromium } from "playwright";
import { preview } from "vite";

const shots = process.argv[2];
const server = await preview({ preview: { port: 4174, strictPort: true }, logLevel: "warn" });
const base = "http://localhost:4174/";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const errors = [];
let failed = 0;

// share of the canvas's pixels that have something drawn
const inked = (page) =>
  page.evaluate(() => {
    const c = document.getElementById("cv"),
      d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n / (d.length / 4);
  });

async function check(name, url, act) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(base + url);
  await page.waitForFunction(() => document.querySelectorAll("#cands .cand").length > 0, null, { timeout: 30000 });
  if (act) await act(page);
  await page.waitForTimeout(2500);
  const ink = await inked(page);
  const ok = ink > 0.01;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${(100 * ink).toFixed(1)}% of the canvas inked`);
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
  await page.close();
}

try {
  await check("story", "");
  await check("story-step", "", (p) => p.locator(".step").nth(4).scrollIntoViewIfNeeded());
  await check("explore", "", (p) => p.click("#tab-explore"));
  await check("compare", "#y=cmp&split=0.5&at=-47.9,-15.8,1");
  await check("filtered", "#y=2026&at=-46.6,-23.6,8&f=setor_renda_resp_media@*~2424");
  await check("state", "#y=2022&in=uf:BA&arrows=1");
  // the language is in the path (root Portuguese, en/ English); old ?lang= links still pick it and move to the path
  for (const [url, lang, path] of [
    ["", "pt-BR", "/"],
    ["en/", "en", "/en/"],
    ["?lang=en", "en", "/en/"],
    ["en/?lang=pt", "pt-BR", "/"],
  ]) {
    const page = await browser.newPage();
    await page.goto(base + url);
    const got = await page.evaluate(() => [document.documentElement.lang, location.pathname + location.search]);
    const ok = got[0] === lang && got[1] === path;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} lang ${url || "/"}: ${got.join(" ")}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
for (const e of errors) console.log("error", e);
process.exit(failed || errors.length ? 1 : 0);
