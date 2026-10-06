// The map's SVG: municipality and state outlines, hover and selection, the tooltip, zoom, and fitting it all
// (with the dot canvas) to its container.
import * as d3 from "d3";
import { M, MG, SG, YEARS } from "../data.js";
import { project } from "../dots.js";
import { PASS } from "../filters/filter.js";
import { fmt, pct } from "../format.js";
import { t } from "../i18n/index.js";
import { A8, AO, S, candName, otherYear } from "../state.js";
import { tally } from "../stats.js";
import { hintDone } from "../view/hints.js";
import { saveSoon } from "../view/hash.js";
import { placeLabels } from "./labels.js";
import { drawNotes } from "./notes.js";
import { resizeCanvas, schedulePaint } from "./render.js";

export const proj = d3.geoMercator(),
  path = d3.geoPath(proj);
export const svg = d3.select("#map");
const tip = d3.select("#tip"),
  g = svg.append("g");
export const MAXK = 400; // deep enough for the smallest municipalities to fill the screen

let mu, uf, outer, mskIn, hl, sl;

// the tooltip: this year's top candidates, then the same camps in the other year, and abstention in both
function showTip(e, f) {
  const { YEAR } = S,
    m = M[f.properties.codarea],
    a = tally(YEAR, m);
  if (!a) return;
  const oy = otherYear(YEAR),
    o = tally(oy, m),
    has = (y, i) => YEARS[y].cands.some((c) => c.i === i);
  const top = YEARS[YEAR].cands
    .filter((c) => c.k)
    .map((c) => c.i)
    .sort((p, q) => a.d.c[q] - a.d.c[p])
    .slice(0, 4);
  tip
    .style("opacity", 1)
    .style("left", Math.min(e.clientX + 16, innerWidth - 260) + "px")
    .style("top", Math.min(e.clientY + 16, innerHeight - 240) + "px");
  // columns in time order (2022, then 2026); the year not shown on the map is muted
  const cells = (cur, oth) => {
    const c = `<span>${cur}</span>`,
      d = `<span class="oy">${oth}</span>`;
    return +YEAR < +oy ? c + d : d + c;
  };
  const line = (label, cur, oth, cls = "l") => `<div class="${cls}">${label}${cells(cur, oth)}</div>`;
  tip.html(
    `<b>${m.n}, ${m.uf}</b><div class="l h"><span></span>${cells(YEAR, oy)}</div>` +
      top
        .map((i) =>
          line(
            `<span>${candName(YEARS[YEAR].cands.find((c) => c.i === i))}</span>`,
            pct(a.d.c[i], a.valid),
            o && has(oy, i) ? pct(o.d.c[i], o.valid) : "–",
          ),
        )
        .join("") +
      line(`<span>${t("cats.didntVote")}</span>`, pct(a.ab, a.all), o ? pct(o.ab, o.all) : "–", "l a") +
      line(
        `<span class="sub">${t("tip.ofWhomOptional")}</span>`,
        pct(a.d.c[AO], a.ab),
        o ? pct(o.d.c[AO], o.ab) : "–",
      ) +
      line(`<span class="sub">${t("tip.ofWhom80")}</span>`, pct(a.d.c[A8], a.ab), o ? pct(o.d.c[A8], o.ab) : "–") +
      `<div class="t">${t("tip.validVotes", { n: fmt(a.valid), year: YEAR })}` +
      `${PASS[MG.features.indexOf(f)] ? "" : t("tip.outside")}</div>`,
  );
}

// selecting a municipality (by click or search) outlines it; zoomTo also flies to it
export function select(f, zoomTo) {
  S.sel = f;
  if (!f) d3.select("#q").property("value", "");
  sl.datum(f)
    .attr("d", f ? path : null)
    .style("display", f ? null : "none");
  if (f && zoomTo) {
    const [[x0, y0], [x1, y1]] = path.bounds(f),
      k = Math.min(MAXK, 0.9 / Math.max((x1 - x0) / S.w, (y1 - y0) / S.h));
    svg
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(S.w / 2, S.h / 2)
          .scale(k)
          .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
      );
  }
}

// unselected borders fade in to 0.1 by ~3x, then ease down to 0.06 by 20x: at mid zoom, sparse areas are mostly
// dark background and the lines would compete with the dots. From 20x they grow (to 0.4 opacity, 1.1px at 60x)
// so city limits read clearly up close.
const borderOpacity = (k) =>
  k < 3
    ? Math.max(0, Math.min(0.1, (k - 1.3) * 0.06))
    : k < 20
      ? Math.max(0.06, 0.1 - (0.04 * Math.log(k / 3)) / Math.log(20 / 3))
      : Math.min(0.4, 0.06 + (0.34 * Math.log(k / 20)) / Math.log(3));
// zooming out by hand to near the whole-country view clears the selection
const CLEARK = 1.5;
let lastK = 1;
export const zoom = d3
  .zoom()
  .scaleExtent([1, MAXK])
  .on("end", () => saveSoon())
  .on("zoom", (e) => {
    const t = e.transform;
    if (S.sel && e.sourceEvent && t.k < lastK && t.k < CLEARK) select(null);
    if (e.sourceEvent) hintDone("maphint");
    lastK = t.k;
    g.attr("transform", t);
    placeLabels(t);
    svg
      .style("--mu-o", borderOpacity(t.k))
      .style("--mu-w", t.k < 20 ? 0.5 : Math.min(1.1, 0.5 + (0.6 * Math.log(t.k / 20)) / Math.log(3)));
    schedulePaint(t);
    drawNotes(t);
  });

// panning stays within the map; in the story it may also move left under the cards
export function panLimits(story) {
  zoom.translateExtent([
    [story ? -S.w * 0.4 : 0, 0],
    [S.w, S.h],
  ]);
}

// the map fills its container: on load and on resize, refit the projection and reallocate the pixel buffers
export function layout() {
  const r = document.getElementById("wrap").getBoundingClientRect();
  S.w = r.width;
  S.h = r.height;
  const { w, h } = S,
    pad = Math.min(w, h) * 0.05;
  proj.fitExtent(
    [
      [pad, pad],
      [w - pad, h - pad - 24],
    ],
    SG,
  );
  svg.attr("viewBox", `0 0 ${w} ${h}`);
  mu.attr("d", path);
  uf.attr("d", path);
  outer.attr("d", path(SG));
  mskIn.attr("d", path(SG));
  if (S.sel) sl.attr("d", path);
  S.layoutGen++;
  project(proj);
  resizeCanvas();
}

// the view as centre and zoom, independent of the window size
export function getView() {
  const t = d3.zoomTransform(svg.node());
  return { c: proj.invert([(S.w / 2 - t.x) / t.k, (S.h / 2 - t.y) / t.k]), k: t.k };
}
export function setView(v) {
  const p = proj(v.c);
  svg.call(
    zoom.transform,
    d3.zoomIdentity
      .translate(S.w / 2, S.h / 2)
      .scale(v.k)
      .translate(-p[0], -p[1]),
  );
}

export function initMap() {
  mu = g
    .append("g")
    .selectAll("path")
    .data(MG.features)
    .join("path")
    .attr("class", "mu")
    .on("mousemove", showTip)
    .on("mouseenter", (e, f) => hl.datum(f).attr("d", path).style("display", null))
    .on("mouseleave", () => {
      tip.style("opacity", 0);
      hl.style("display", "none");
    })
    .on("click", (e, f) => {
      e.stopPropagation();
      select(S.sel === f ? null : f);
    })
    .on("dblclick", (e, f) => {
      e.stopPropagation();
      select(f, true); // double click: select and zoom to it
    });
  uf = g.append("g").selectAll("path").data(SG.features).join("path").attr("class", "uf");
  // Brazil's outer border: every state outline stroked once, masked to outside the country so the internal
  // state borders vanish and only a light halo around the coast and frontier remains
  outer = g.append("path").attr("class", "outer").attr("mask", "url(#outside)");
  const msk = svg
    .append("defs")
    .append("mask")
    .attr("id", "outside")
    .attr("maskUnits", "userSpaceOnUse")
    .attr("x", -1e5)
    .attr("y", -1e5)
    .attr("width", 2e5)
    .attr("height", 2e5);
  msk.append("rect").attr("x", -1e5).attr("y", -1e5).attr("width", 2e5).attr("height", 2e5).attr("fill", "#fff");
  mskIn = msk.append("path").attr("fill", "#000");
  // hover and selection outlines live above every border so neighbours never paint over them; click selects
  // a municipality (click again to clear) and its outline stays at any zoom
  hl = g.append("path").attr("class", "hl").style("display", "none");
  sl = g.append("path").attr("class", "sel").style("display", "none");

  layout();
  svg.call(zoom);
  panLimits(false);
  // replace d3's double-click zoom-in: on a municipality it zooms to that municipality (handler above);
  // anywhere outside Brazil it zooms back out to the whole country
  svg.on("dblclick.zoom", null).on("dblclick", () => {
    select(null);
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
  });
  // a selection clears on a click outside Brazil or on Escape anywhere (clicking the same municipality also toggles it)
  svg.on("click", () => select(null));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && e.target.id !== "q") select(null);
  });
  // on resize the map refits, keeping the same centre and zoom
  let rz;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      const v = getView();
      layout();
      panLimits(d3.select("#page").classed("storymode"));
      setView(v);
    }, 150);
  });
}
