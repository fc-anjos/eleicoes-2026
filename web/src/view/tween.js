// Numbers and bars that change with the view count from their old value to the new one instead of jumping. A
// redrawn element marks itself with data-tw (a stable key), data-v (the new value) and data-f (how to show it:
// "pct", "hum", or "w" for a bar's width in %); tween() remembers each key's last value and animates from it.
import * as d3 from "d3";
import { hum, pctN } from "../format.js";

const last = new Map(),
  FMT = { pct: (v) => pctN(v), hum: (v) => hum(v, 1) },
  DUR = 450,
  still = matchMedia("(prefers-reduced-motion: reduce)");

export function tween(root) {
  root.querySelectorAll("[data-tw]").forEach((el) => {
    const key = el.dataset.tw,
      to = +el.dataset.v,
      f = el.dataset.f,
      from = last.get(key);
    last.set(key, to);
    if (from == null || from === to || still.matches) return;
    if (f === "w") {
      el.style.width = from + "%";
      el.getBoundingClientRect(); // commit the old width so the CSS transition runs
      el.style.width = to + "%";
      return;
    }
    const i = d3.interpolateNumber(from, to);
    d3.select(el)
      .transition()
      .duration(DUR)
      .ease(d3.easeCubicOut)
      .tween("text", () => (t) => (el.textContent = FMT[f](i(t))));
  });
}
