// Year switch: same view, same colours per camp, the other year's dots. "Compare" splits the map: the older year
// left of a draggable divider, the newer right; the side panel keeps showing the year last picked.
import * as d3 from "d3";
import { YEARS } from "../data.js";
import { refilter } from "../filters/filter.js";
import { VARS } from "../filters/vars.js";
import { panelIfShown, setFocus } from "../panel/results.js";
import { requantile } from "../panel/studio.js";
import { onLang, t } from "../i18n/index.js";
import { S, YS } from "../state.js";
import { repaint } from "./render.js";

const swipe = d3.select("#swipe");

export function setMode(y) {
  const cmp = y === "cmp";
  S.COMPARE = cmp;
  if (!cmp) S.YEAR = y;
  d3.selectAll("#years button").attr("aria-pressed", (v) => String(cmp ? v === "cmp" : v === S.YEAR));
  swipe.property("hidden", !cmp);
  if (cmp) placeSwipe();
  if (S.focus >= 0 && !YEARS[S.YEAR].cands.some((c) => c.i === S.focus)) setFocus(-1);
  requantile();
  if (VARS.some((v) => v.dyn && (v.lo > 0 || v.hi < 100))) refilter();
  else {
    panelIfShown();
    repaint();
  }
}

export function placeSwipe() {
  swipe.style("left", S.SPLIT * 100 + "%");
  swipe.select(".grip").attr("aria-valuenow", Math.round(S.SPLIT * 100));
}

// dragging the divider (pointer or arrow keys); it never starts a pan
let swRaf = 0;
const moveSplit = (v) => {
  swipe.classed("used", true);
  S.SPLIT = Math.max(0.02, Math.min(0.98, v));
  placeSwipe();
  if (!swRaf)
    swRaf = requestAnimationFrame(() => {
      swRaf = 0;
      repaint();
    });
};

export function initCompare() {
  onLang(() =>
    d3
      .select("#years")
      .selectAll("button")
      .text((y) => (y === "cmp" ? t("map.compare") : y)),
  );
  d3.select("#years")
    .selectAll("button")
    .data([...YS, "cmp"])
    .join("button")
    .text((y) => (y === "cmp" ? t("map.compare") : y))
    .attr("aria-pressed", (y) => String(y === S.YEAR))
    .on("click", (e, y) => setMode(y));
  d3.select("#swl").text(YS[1]);
  d3.select("#swr").text(YS[0]);
  swipe
    .select(".grip")
    .on("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const r = document.getElementById("wrap").getBoundingClientRect();
      const mv = (ev) => moveSplit((ev.clientX - r.left) / r.width),
        up = () => {
          el.removeEventListener("pointermove", mv);
          el.removeEventListener("pointerup", up);
        };
      el.addEventListener("pointermove", mv);
      el.addEventListener("pointerup", up);
    })
    .on("keydown", (e) => {
      const d = { ArrowLeft: -0.02, ArrowRight: 0.02 }[e.key];
      if (d) {
        e.preventDefault();
        moveSplit(S.SPLIT + d);
      }
    });
}
