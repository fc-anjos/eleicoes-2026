// The link-preview image (dist/og.png, 1200×630): the 2026 dot map alone, with no text, so it serves both
// languages. Runs as the last step of npm run build, on the page just built.
import { chromium } from "playwright";
import { preview } from "vite";

const server = await preview({ preview: { port: 4175, strictPort: true }, logLevel: "warn" });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto("http://localhost:4175/#y=2026&at=-52,-14.5,1&embed=1");
  await page.waitForFunction(() => document.querySelectorAll("#cands .cand").length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.addStyleTag({ content: "body *:not(#cv):not(:has(#cv)) { visibility: hidden !important }" });
  await page.screenshot({ path: "dist/og.png" });
} finally {
  await browser.close();
  server.httpServer.close();
}
