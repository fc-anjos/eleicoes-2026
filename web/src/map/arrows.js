// Swing arrows (as in the New York Times' election maps): one per municipality, from its centroid, leaning right
// and blue where the margin moved towards the Bolsonaro camp between 2022 and 2026, left and red where it moved
// towards Lula; length is the size of the shift in points of the margin. Filters apply.
import * as d3 from "d3";
import { M, MG } from "../data.js";
import { PASS } from "../filters/filter.js";
import { CI, COLS, S } from "../state.js";
import { marginShift } from "../stats.js";
import { path, svg } from "./base.js";
import { dpr, repaint } from "./render.js";

const SHIFT = MG.features.map((f) => {
  const m = M[f.properties.codarea];
  return m ? marginShift(m) : null;
});
// small shifts are left out; big ones are drawn last, on top
const AORD = d3
  .range(SHIFT.length)
  .filter((i) => SHIFT[i] != null && Math.abs(SHIFT[i]) >= 0.5)
  .sort((a, b) => Math.abs(SHIFT[a]) - Math.abs(SHIFT[b]));
// px per point of margin shift: grows gently as you zoom in
const ARROW_PX = (k) => 0.5 * Math.pow(k, 0.5);

let CEN = null,
  cenGen = -1;
export function drawArrows(cx, t, W, H) {
  if (cenGen !== S.layoutGen) {
    CEN = MG.features.map((f) => path.centroid(f));
    cenGen = S.layoutGen;
  }
  const Ls = ARROW_PX(t.k) * dpr,
    ca = Math.cos(Math.PI / 6),
    sa = Math.sin(Math.PI / 6),
    cb = COLS[CI("22")],
    cr = COLS[CI("13")];
  cx.lineCap = "round";
  cx.lineJoin = "round";
  cx.lineWidth = Math.min(1.4, 0.8 + 0.15 * Math.log2(t.k)) * dpr;
  cx.globalAlpha = 0.8;
  for (const i of AORD) {
    if (!PASS[i]) continue;
    const c = CEN[i];
    if (!c || !isFinite(c[0])) continue;
    const x = (c[0] * t.k + t.x) * dpr,
      y = (c[1] * t.k + t.y) * dpr,
      d = SHIFT[i],
      L = Math.abs(d) * Ls,
      dir = d > 0 ? 1 : -1;
    if (x < -L || x > W + L || y < -L || y > H + L) continue;
    const x2 = x + dir * L * ca,
      y2 = y - L * sa,
      hx = dir * ca,
      hy = -sa,
      h = Math.min(5 * dpr, L * 0.45);
    cx.strokeStyle = d > 0 ? cb : cr;
    cx.beginPath();
    cx.moveTo(x, y);
    cx.lineTo(x2, y2);
    cx.moveTo(x2 - h * (hx * 0.8 - hy * 0.6), y2 - h * (hy * 0.8 + hx * 0.6));
    cx.lineTo(x2, y2);
    cx.lineTo(x2 - h * (hx * 0.8 + hy * 0.6), y2 - h * (hy * 0.8 - hx * 0.6));
    cx.stroke();
  }
  cx.globalAlpha = 1;
}

// the key's 10-point arrow follows the zoom
const sizeKey = () => d3.select("#akl").style("width", 10 * ARROW_PX(d3.zoomTransform(svg.node()).k) + "px");

export function setArrows(on) {
  S.ARROWS = on;
  d3.select("#arrows").property("checked", on);
  d3.select("#akey").property("hidden", !on);
  sizeKey();
}

export function initArrows() {
  d3.select("#arrows").on("change", (e) => {
    setArrows(e.target.checked);
    repaint();
  });
  svg.on("wheel.akey", () => {
    if (S.ARROWS) requestAnimationFrame(sizeKey);
  });
}
