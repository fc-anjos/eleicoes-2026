// Views in the URL. Everything that shapes the view lives in the hash, so any view can be shared or embedded:
// year or compare (and the divider), centre and zoom, the area, the abstention split and the 80+ switch, filters
// (by slider position, so by quantile, or by value), hidden rows, the isolated row, changed colours, the display
// settings, and whether the studio is open. "embed" hides both side panels. The hash is rewritten as the view
// changes.
import * as d3 from "d3";
import { CATS, M, SG, VPD } from "../data.js";
import { computeFilter } from "../filters/filter.js";
import { VARS, isOn, resetVar } from "../filters/vars.js";
import { setArrows } from "../map/arrows.js";
import { MAXK, getView, layout, mapH, panLimits, path, proj, svg, zoom } from "../map/base.js";
import { placeSwipe, setMode } from "../map/compare.js";
import { DEF_VX, mapFrame, panelled } from "../map/panels.js";
import { repaint } from "../map/render.js";
import { panelIfShown, setFocus } from "../panel/results.js";
import { STEPS, drawArea, drawRange, setVcol, setViz } from "../panel/studio.js";
import { COLS, DEF_COLS, HID, S, YS, catOf, packCols } from "../state.js";

export function stateHash(embed) {
  const q = new URLSearchParams(),
    v = getView();
  q.set("y", S.COMPARE ? "cmp" : S.YEAR);
  if (S.COMPARE) q.set("split", S.SPLIT.toFixed(3));
  q.set("at", `${v.c[0].toFixed(4)},${v.c[1].toFixed(4)},${+v.k.toFixed(2)}`);
  if (S.INSET) {
    const u = M[[...S.INSET][0]].uf,
      whole = S.INSET.size > 1 && Object.keys(M).every((k) => (M[k].uf === u) === S.INSET.has(k));
    q.set("in", whole ? "uf:" + u : [...S.INSET].join(","));
  }
  if (S.SPLITA) q.set("ages", "1");
  if (S.ARROWS) q.set("arrows", "1");
  if (S.BIG) q.set("big", "1");
  if (!S.INC80) q.set("80plus", "0");
  const f = VARS.filter(isOn).map((x) =>
    x.vlo != null || x.vhi != null ? `${x.k}@${x.vlo ?? "*"}~${x.vhi ?? "*"}` : `${x.k}:${x.lo}-${x.hi}`,
  );
  if (f.length) q.set("f", f.join(","));
  const hid = [...HID].map((x, i) => (x ? CATS[i].k || "others" : null)).filter((x) => x != null);
  if (hid.length) q.set("hide", hid.join(","));
  if (S.focus >= 0) q.set("only", CATS[S.focus].k || "others");
  const col = COLS.map((c, i) =>
    c.toLowerCase() !== DEF_COLS[i].toLowerCase() ? `${CATS[i].k || "others"}:${c.slice(1)}` : null,
  ).filter(Boolean);
  if (col.length) q.set("col", col.join(","));
  if (!S.ADAPT) q.set("size", "zoom");
  if (S.VIZ !== "dots") q.set("viz", S.VIZ + (S.VIZALL ? "*" : ""));
  if (S.VCOL !== "change") q.set("vc", S.VCOL);
  if (S.VX !== DEF_VX) q.set("vx", S.VX);
  if (S.VCUTS.length) q.set("vcuts", S.VCUTS.join(","));
  if (S.VY !== "dlula") q.set("vy", S.VY);
  if (S.PANEL) q.set("panel", S.PANEL);
  if (Math.abs(S.VIZK - 3) > 0.01) q.set("vizk", +S.VIZK.toFixed(2));
  if (S.STEP !== 1) q.set("vpd", S.STEP * VPD);
  if (S.SIZE !== 1) q.set("scale", (+d3.select("#rad").property("value")).toFixed(2));
  if (d3.select("#page").classed("nostudio")) q.set("studio", "0");
  if (embed) q.set("embed", "1");
  return q.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
}

const isEmbed = () => new URLSearchParams(location.hash.slice(1)).get("embed") === "1";

let saveT = 0;
export function saveSoon() {
  if (S.restoring) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    // the story drives the map itself, so its URL stays clean (a view in the hash means Explore)
    const story = d3.select("#page").classed("storymode");
    try {
      history.replaceState(null, "", story ? location.pathname + location.search : "#" + stateHash(isEmbed()));
    } catch {
      /* some embedding contexts refuse history changes */
    }
  }, 250);
}

// run fn without writing the hash back meanwhile
export function restoring(fn) {
  S.restoring = true;
  try {
    fn();
  } finally {
    S.restoring = false;
  }
}

// filters and area from a view
export function setFiltersFrom(q) {
  VARS.forEach(resetVar);
  S.INSET = q.get("in")
    ? new Set(
        q
          .get("in")
          .split(",")
          .flatMap((c) => (c.startsWith("uf:") ? Object.keys(M).filter((k) => M[k].uf === c.slice(3)) : [c])),
      )
    : null;
  // f: "key:lo-hi" by slider position (quantile), or "key@a~b" by value (story steps), either end open with "*"
  (q.get("f") || "")
    .split(",")
    .filter(Boolean)
    .forEach((x) => {
      let m = x.match(/^(.+):(\d+)-(\d+)$/);
      let v = m && VARS.find((z) => z.k === m[1]);
      if (v) {
        v.lo = Math.min(100, +m[2]);
        v.hi = Math.max(v.lo, Math.min(100, +m[3]));
        return;
      }
      m = x.match(/^(.+)@(-?[\d.]+|\*)~(-?[\d.]+|\*)$/);
      v = m && VARS.find((z) => z.k === m[1]);
      if (!v) return;
      v.lo =
        m[2] === "*"
          ? 0
          : Math.max(
              0,
              v.q.findIndex((z) => z >= +m[2]),
            );
      v.hi = m[3] === "*" ? 100 : Math.max(v.lo, 100 - [...v.q].reverse().findIndex((z) => z <= +m[3]));
      if (m[2] !== "*") v.vlo = +m[2];
      if (m[3] !== "*") v.vhi = +m[3];
    });
}

// in the story, the cards cover the map's left side: views centre on the visible part to their right
// on phones the cards scroll up from the bottom: views centre in the band above them (a negative y offset) and the
// whole country is drawn smaller to fit there
const phoneStory = () => d3.select("#page").classed("storymode") && innerWidth <= 900;
// phones: the band between the totals and the step panel (its height a share of the screen's, which the
// reader can drag), with the dots above the panel
export const phoneTop = () => {
  const e = document.querySelector(".stot");
  return e ? e.getBoundingClientRect().bottom + 4 : 80;
};
export const PANEL = { f: 0.44 };
const band = () => [phoneTop(), S.h * (1 - PANEL.f) - 50]; // 50: the key's strip above the card
export const storyOffsetY = () => (phoneStory() ? (band()[0] + band()[1]) / 2 - S.h / 2 : 0);
// the country fills the screen's width unless the band is too short for it
const phoneK = () => Math.min(1, (0.96 * (band()[1] - band()[0])) / mapH());
export function storyOffset() {
  const a = document.querySelector("aside");
  return d3.select("#page").classed("storymode") && innerWidth > 900 ? a.getBoundingClientRect().width / 2 : 0;
}

// Apply a view (a hash string, as in share links). The view-shaping parts are always set, to their defaults when
// absent (year, divider, place and zoom, abstention split, 80+, filters, hidden and isolated rows); the display
// settings, colours and panels only when given. animate: fly to the place and sweep the divider (story steps).
export function applyState(str, animate) {
  const q = new URLSearchParams(str),
    page = d3.select("#page");
  if (q.get("embed") === "1") page.classed("embed", true);
  if (q.has("studio") && !page.classed("embed")) {
    const open = q.get("studio") !== "0";
    page.classed("nostudio", !open);
    d3.select("#studiox").attr("aria-expanded", String(open));
  }
  S.SPLITA = q.has("ages");
  d3.selectAll("#asplit button").attr("aria-pressed", function () {
    return String((this.dataset.v === "age") === S.SPLITA);
  });
  S.INC80 = q.get("80plus") !== "0";
  d3.select("#inc80").property("checked", S.INC80);
  setArrows(q.has("arrows"));
  if (q.has("size")) {
    S.ADAPT = q.get("size") !== "zoom";
    d3.selectAll("#mode button").attr("aria-pressed", function () {
      return String((this.dataset.m === "a") === S.ADAPT);
    });
  }
  S.BIG = q.has("big");
  S.VX = VARS.some((v) => v.k === q.get("vx")) ? q.get("vx") : DEF_VX;
  S.VCUTS = (q.get("vcuts") || "")
    .split(",")
    .map(Number)
    .filter((x) => isFinite(x) && x > 0);
  S.VY = q.get("vy") === "dabst" ? "dabst" : "dlula";
  S.PANEL = q.get("panel") === "scatter" ? "scatter" : null;
  d3.select("#page").classed("panelled", panelled());
  setViz(q.get("viz"), false);
  setVcol(q.get("vc"), false);
  if (q.has("vizk") && +q.get("vizk") > 0)
    d3.select("#vizk")
      .property("value", Math.log2(+q.get("vizk")))
      .node()
      .dispatchEvent(new Event("input"));
  if (q.has("vpd")) {
    const i = STEPS.indexOf(Math.round(+q.get("vpd") / VPD));
    if (i >= 0) d3.select("#vpd").property("value", i).node().dispatchEvent(new Event("input"));
  }
  if (q.has("scale")) d3.select("#rad").property("value", +q.get("scale")).node().dispatchEvent(new Event("input"));
  (q.get("col") || "")
    .split(",")
    .filter(Boolean)
    .forEach((x) => {
      const [k, c] = x.split(":"),
        i = catOf(k);
      if (i >= 0 && /^[0-9a-f]{6}$/i.test(c)) COLS[i] = "#" + c;
    });
  HID.fill(0);
  (q.get("hide") || "")
    .split(",")
    .filter(Boolean)
    .forEach((k) => {
      const i = catOf(k);
      if (i >= 0) HID[i] = 1;
    });
  packCols();
  setFiltersFrom(q);
  const y = q.get("y") || YS[0];
  let sp = q.has("split") ? Math.max(0.02, Math.min(0.98, +q.get("split"))) : 0.5;
  if (animate && storyOffset()) {
    // story: within the visible map
    const r = document.getElementById("wrap").getBoundingClientRect(),
      o = (2 * storyOffset()) / r.width;
    sp = o + (1 - o) * sp;
  }
  if (animate && y === "cmp" && !S.COMPARE) {
    // sweep the divider in from the right
    S.SPLIT = 0.98;
    setMode("cmp");
    d3.transition()
      .duration(1200)
      .tween("split", () => {
        const i = d3.interpolate(0.98, sp);
        return (t) => {
          S.SPLIT = i(t);
          placeSwipe();
          repaint(false);
        };
      });
  } else {
    S.SPLIT = sp;
    setMode(y === "cmp" || YS.includes(y) ? y : YS[0]);
  }
  const o = q.get("only");
  setFocus(o ? catOf(o) : -1);
  VARS.forEach(drawRange);
  drawArea();
  computeFilter();
  panelIfShown();
  // refit only if the panels changed the map's size
  const r = document.getElementById("wrap").getBoundingClientRect();
  if (r.width !== S.w || r.height !== S.h) layout();
  panLimits(page.classed("storymode"));
  const at = q.get("at"),
    a3 = (at || "").split(",").map(Number);
  const off = storyOffset(),
    oy = storyOffsetY(),
    home = off
      ? d3.zoomIdentity.translate(off * 0.6, 0)
      : oy
        ? d3.zoomIdentity
            .translate(S.w / 2, S.h / 2 + oy)
            .scale(phoneK())
            .translate(-S.w / 2, -S.h / 2)
        : d3.zoomIdentity;
  let t = null;
  if (at === "home" && panelled()) {
    // beside a chart panel, the country fits the map's part of the frame
    const f = mapFrame(),
      [[x0, y0], [x1, y1]] = path.bounds(SG),
      k = Math.min(1, 0.92 * Math.min((f.x1 - f.x0) / (x1 - x0), (f.y1 - f.y0) / (y1 - y0)));
    t = d3.zoomIdentity
      .translate((f.x0 + f.x1) / 2 - (k * (x0 + x1)) / 2, (f.y0 + f.y1) / 2 - (k * (y0 + y1)) / 2)
      .scale(k);
  } else if (at === "home") t = home;
  else if (a3.length === 3 && a3.every(isFinite)) {
    const p = proj([a3[0], a3[1]]);
    t = d3.zoomIdentity
      .translate(S.w / 2 + off, S.h / 2 + oy)
      .scale(Math.max(oy ? phoneK() : 1, Math.min(MAXK, a3[2] * (oy ? 0.8 : 1))))
      .translate(-p[0], -p[1]);
  }
  if (t) {
    if (animate) svg.transition().duration(1600).call(zoom.transform, t);
    else svg.call(zoom.transform, t);
  }
  repaint();
}

export function initHash() {
  const applyHash = () => {
    const h = location.hash.slice(1);
    // in the story the steps set the map; a view in the hash applies to Explore
    if (h && !d3.select("#page").classed("storymode")) applyState(h, false);
  };
  // a reader editing the hash (or following a link within the page) gets that view
  addEventListener("hashchange", () => {
    if (location.hash.slice(1) !== stateHash(isEmbed())) restoring(applyHash);
  });
  restoring(applyHash);
}
