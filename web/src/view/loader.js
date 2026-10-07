// The loader: the data is a 20 MB download, so while it arrives the page shows a centred spinner, a progress bar
// and a few lines about what is being prepared. Removed once the page is drawn (done()).
import { t } from "../i18n/index.js";
import { num } from "../format.js";

const el = document.getElementById("loader"),
  msg = document.getElementById("ldmsg"),
  bar = document.getElementById("ldbar"),
  n = document.getElementById("ldn"),
  LINES = t("loader.lines");
let line = 0,
  timer = 0;

function say(s) {
  msg.classList.remove("in");
  void msg.offsetWidth; // restart the fade-in
  msg.textContent = s;
  msg.classList.add("in");
}

export function start() {
  say(LINES[0]);
  timer = setInterval(() => say(LINES[(line = (line + 1) % LINES.length)]), 2600);
}

// bytes received of the expected total
export function progress(got, total) {
  const f = total ? Math.min(1, got / total) : 0;
  bar.style.width = (100 * f).toFixed(1) + "%";
  n.textContent = total ? t("loader.mb", { got: num(got / 1e6, 1), total: num(total / 1e6, 0) }) : "";
}

// downloaded: the map is now being drawn
export function drawing() {
  clearInterval(timer);
  progress(1, 1);
  n.textContent = "";
  say(t("loader.drawing"));
}

export function done() {
  clearInterval(timer);
  el.classList.add("out");
  setTimeout(() => el.remove(), 500);
}
