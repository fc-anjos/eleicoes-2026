// Studio controls: abstention split by age, the 80+ switch, a two-handled range per filter variable, the area
// (Brazil, a state or a municipality), the display settings and the colour reset.
import * as d3 from "d3";
import { CATS, M, VPD } from "../data.js";
import { refilter } from "../filters/filter.js";
import { VARS, hi_, isOn, lo_, quantiles, resetVar } from "../filters/vars.js";
import { fmt, num, showVal, unit } from "../format.js";
import { onLang, t } from "../i18n/index.js";
import { repaint } from "../map/render.js";
import { A8, AB, AO, COLS, HID, K, S, css, packCols, store } from "../state.js";
import { saveSoon } from "../view/hash.js";
import { panel } from "./results.js";

// votes-per-dot control: dots are shuffled, so keeping every STEP-th one is a random sample at STEP × VPD votes per dot
export const STEPS = [1, 2, 4, 10, 20, 40];

let fl = d3.select(null);
export function drawRange(v) {
  const f = fl.filter((d) => d === v);
  f.select(".fv").text(`${showVal(v, lo_(v))} – ${showVal(v, hi_(v))}`); // the full span when unfiltered
  f.select(".fill")
    .style("left", v.lo + "%")
    .style("right", 100 - v.hi + "%");
  f.select("input.lo").property("value", v.lo);
  f.select("input.hi").property("value", v.hi);
  f.classed("on", isOn(v));
}
// the abstention variables depend on the year and the 80+ switch: their quantiles move with them
export function requantile() {
  VARS.filter((v) => v.dyn).forEach((v) => {
    v.q = quantiles(v);
    drawRange(v);
  });
}

let fRaf = 0;
const refilterSoon = () => {
  if (!fRaf)
    fRaf = requestAnimationFrame(() => {
      fRaf = 0;
      refilter();
    });
};

function initFilters() {
  d3.select("#pfilters")
    .selectAll(".f")
    .data(VARS.filter((v) => v.place))
    .join("div")
    .attr("class", "f");
  d3.select("#filters")
    .selectAll(".f")
    .data(VARS.filter((v) => !v.place))
    .join("div")
    .attr("class", "f");
  fl = d3.selectAll("#pfilters .f, #filters .f");
  fl.append("div")
    .attr("class", "fh")
    .html((v) => `<span class="fn">${v.n}</span><span class="fv"></span>`);
  const rg = fl.append("div").attr("class", "rng");
  rg.append("div").attr("class", "track").append("div").attr("class", "fill");
  ["lo", "hi"].forEach((end) =>
    rg
      .append("input")
      .attr("type", "range")
      .attr("min", 0)
      .attr("max", 100)
      .attr("step", 1)
      .attr("class", end)
      .attr("aria-label", (v) => t(end === "lo" ? "studio.min" : "studio.max", { name: v.n }))
      .property("value", (v) => v[end])
      .on("input", function (e, v) {
        v.vlo = v.vhi = null;
        let x = +this.value;
        if (end === "lo") x = Math.min(x, v.hi);
        else x = Math.max(x, v.lo);
        this.value = x;
        v[end] = x;
        drawRange(v);
        refilterSoon();
      }),
  );
  fl.append("div")
    .attr("class", "fs")
    .text((v) => v.src);
  VARS.forEach(drawRange);
  d3.select("#fclear").on("click", () => {
    S.INSET = null;
    VARS.forEach((v) => {
      resetVar(v);
      drawRange(v);
    });
    refilter();
  });
  d3.select("#fcount").text(t("filters.all"));
}

// Area: add up Brazil, one state or one municipality (the one selected on the map or by search). It limits the map
// and the totals (INSET) and travels in the view as "in" ("uf:XX" for a state).
const UFS = [...new Set(Object.values(M).map((m) => m.uf))].sort();
function setArea(kind, val) {
  S.INSET =
    kind === "uf"
      ? new Set(Object.keys(M).filter((k) => M[k].uf === val))
      : kind === "mu" && val
        ? new Set([val])
        : null;
  drawArea();
  refilter();
  saveSoon();
}
export function drawArea() {
  const { INSET } = S,
    k = INSET && INSET.size === 1 ? "mu" : INSET ? "uf" : "br";
  d3.selectAll("#area button").attr("aria-pressed", function () {
    return String(this.dataset.a === k);
  });
  d3.select("#areauf").property("hidden", k !== "uf");
  if (k === "uf") d3.select("#areauf").property("value", M[[...INSET][0]].uf);
  d3.select("#areamu")
    .property("hidden", k !== "mu")
    .text(k === "mu" ? `${M[[...INSET][0]].n}, ${M[[...INSET][0]].uf}` : "");
}
function initArea() {
  d3.select("#areauf")
    .selectAll("option")
    .data(UFS)
    .join("option")
    .attr("value", (d) => d)
    .text((d) => d);
  d3.selectAll("#area button").on("click", (e) => {
    const a = e.currentTarget.dataset.a,
      { sel } = S;
    if (a === "br") setArea("br");
    else if (a === "uf")
      setArea("uf", sel ? M[sel.properties.codarea].uf : d3.select("#areauf").property("value") || UFS[0]);
    else if (sel) setArea("mu", sel.properties.codarea);
    else d3.select("#areamu").property("hidden", false).text(t("studio.pickFirst"));
  });
  d3.select("#areauf").on("change", (e) => setArea("uf", e.target.value));
  drawArea();
}

function initDisplay() {
  d3.selectAll(".vpd").text(fmt(VPD));
  d3.selectAll("#mode button").on("click", (e) => {
    S.ADAPT = e.currentTarget.dataset.m === "a";
    d3.selectAll("#mode button").attr("aria-pressed", function () {
      return String(this === e.currentTarget);
    });
    repaint();
  });
  let vpdTimer;
  d3.select("#vpd").on("input", (e) => {
    S.STEP = STEPS[+e.target.value];
    const v = fmt(S.STEP * VPD);
    d3.selectAll(".vpd").text(v);
    d3.select("#vpdv").text(v);
    clearTimeout(vpdTimer);
    vpdTimer = setTimeout(repaint, 120); // repaint once the slider settles
  });
  d3.select("#rad").on("input", (e) => {
    const m = 2 ** +e.target.value;
    S.SIZE = m;
    d3.select("#radv").text(unit("times", num(m, m < 1 ? 2 : 1).replace(/[.,]?0+$/, "")));
    repaint();
  });
  d3.select("#reset").on("click", () => {
    COLS.splice(0, K, ...CATS.map((c) => css("--" + c.col)));
    HID.fill(0);
    packCols();
    store.set("cols", null);
    store.set("hid", null);
    panel();
    repaint();
  });
}

// a language change: the filter names, sources and values, and the numbers set by the display controls
function relabel() {
  fl.select(".fn").text((v) => v.n);
  fl.select(".fs").text((v) => v.src);
  fl.select("input.lo").attr("aria-label", (v) => t("studio.min", { name: v.n }));
  fl.select("input.hi").attr("aria-label", (v) => t("studio.max", { name: v.n }));
  VARS.forEach(drawRange);
  const v = fmt(S.STEP * VPD);
  d3.selectAll(".vpd").text(v);
  d3.select("#vpdv").text(v);
  d3.select("#rad").dispatch("input");
  const st = d3.select("#studiox");
  st.attr("title", t(st.attr("aria-expanded") === "true" ? "studio.hide" : "studio.show"));
  drawArea();
}

export function initStudio() {
  onLang(relabel);
  // the studio column collapses to a strip; the map refits to the space it frees
  d3.select("#studiox").on("click", (e) => {
    const o = e.currentTarget.getAttribute("aria-expanded") !== "true";
    e.currentTarget.setAttribute("aria-expanded", o);
    e.currentTarget.title = t(o ? "studio.hide" : "studio.show");
    d3.select("#page").classed("nostudio", !o);
    dispatchEvent(new Event("resize"));
  });
  d3.selectAll("#asplit button").on("click", (e) => {
    S.SPLITA = e.currentTarget.dataset.v === "age";
    d3.selectAll("#asplit button").attr("aria-pressed", function () {
      return String(this === e.currentTarget);
    });
    if (!S.SPLITA && (S.focus === AO || S.focus === A8)) S.focus = AB;
    packCols();
    panel();
    repaint();
  });
  d3.select("#inc80").on("change", (e) => {
    S.INC80 = e.target.checked;
    if (!S.INC80 && S.focus === A8) S.focus = -1;
    requantile();
    refilter();
  });
  initFilters();
  initArea();
  initDisplay();
}
