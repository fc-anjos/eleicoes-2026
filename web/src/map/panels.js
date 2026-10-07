// Two views that leave the map, for a step whose argument is a trend across a variable (town size, income, the
// Catholic share) rather than a place. Both keep the circles' language (one per municipality, area ∝ votes, the
// same two colours), and both are set by the view: viz=scatter* or viz=multiples*, vx=<variable> and vcuts=<the
// values that divide its bands>.
// - scatter: a chart in place of the map, x the variable and y the change in Lula's share, as in the Times'
//   county scatters: the cloud's slope is the argument. A line through the vote-weighted mean of each band carries
//   the trend, and the biggest places are named.
// - multiples: one small country per band (Tufte's small multiples), each with the votes-that-moved circles of its
//   band only and its totals, so the eye compares like with like.
import * as d3 from "d3";
import { M, MG, SG } from "../data.js";
import { PASS } from "../filters/filter.js";
import { VARS } from "../filters/vars.js";
import { hum, num, pctN, showVal, signed } from "../format.js";
import { t as tr } from "../i18n/index.js";
import { CI, COLS, S, YS, css } from "../state.js";
import { PANEL, phoneTop } from "../view/hash.js";
import { path, showTip, svg, tip } from "./base.js";
import { GHOST, RMIN, SHARE, disc, fitScale, geo, measure, moved, rad, results } from "./marks.js";

export const FLAT = ["scatter", "multiples"];
export const flat = () => FLAT.includes(S.VIZ);
// panel=scatter: the scatter beside the map (which keeps its own view), in the right PANELW of the frame; vy= what
// its y shows: the change in Lula's share (dlula) or in the abstention rate (dabst)
const PANELW = 0.44;
export const panelled = () => !!S.PANEL && !flat() && !phoneStory();
// phones: the map's visible band, between the totals and the key strip above the card
export const phoneBand = () => (phoneStory() ? [phoneTop() + 8, S.h * (1 - PANEL.f) - 52] : null);
const phoneStory = () => d3.select("#page").classed("storymode") && innerWidth <= 900;
// the y measure: its value, the weight of a place (the circles' area and the trend's weights), its colours by sign
// and its title
const VY = {
  dlula: {
    get: (r) => r.dl,
    w: (r) => r.valid,
    col: (r) => COLS[CI(r.dl < 0 ? "22" : "13")],
    chips: () => [
      ["22", "viz.movedAway"],
      ["13", "viz.movedTo"],
    ],
    title: "viz.scatterY",
    size: "viz.keyCircles",
  },
  dabst: {
    get: (r) => r.da,
    w: (r) => r.roll,
    col: (r) => (r.da > 0 ? COLS[CI("A")] : SHARE),
    chips: () => [
      ["A", "viz.abstUp"],
      [SHARE, "viz.abstDown"],
    ],
    title: "viz.scatterYAbst",
    size: "viz.keyRoll",
  },
};
const vy = () => VY[S.VY] || VY.dlula;
export const DEF_VX = "pop_2022",
  DEF_CUTS = [1e4, 5e4, 2e5, 1e6];

const vx = () => VARS.find((v) => v.k === S.VX) || VARS.find((v) => v.k === DEF_VX);
// the bands: the view's cuts, or the population's by default; for another variable without cuts, its quartiles
const cuts = () => {
  if (S.VCUTS.length) return S.VCUTS;
  const v = vx();
  return v.k === DEF_VX || !v.q ? DEF_CUTS : [25, 50, 75].map((i) => v.q[i]);
};
// the band of a value: 0 below the first cut, up to cuts.length at or above the last
const bandOf = (x) => {
  const c = cuts(),
    i = c.findIndex((k) => x < k);
  return i < 0 ? c.length : i;
};
// a band's name: "under 10k", "10k–50k", "1M and over", in the variable's unit
const show = (v, x) => (v.u === "int" ? hum(x, 0) : showVal(v, x));
export function bandName(v, i) {
  const c = cuts();
  if (i === 0) return tr("viz.under", { n: show(v, c[0]) });
  if (i === c.length) return tr("viz.over", { n: show(v, c[c.length - 1]) });
  return `${show(v, c[i - 1])}–${show(v, c[i])}`;
}

// the part of the window the view may use: in the story the cards cover the left side, and on phones the band
// above them
export function frame() {
  const story = d3.select("#page").classed("storymode"),
    phone = story && innerWidth <= 900,
    x0 = story && !phone ? document.querySelector("aside").getBoundingClientRect().width : 0;
  // the top clears the Share button, the bottom the credits
  return phone
    ? { x0: 8, x1: S.w - 8, y0: phoneTop() + 12, y1: S.h * (1 - PANEL.f) - (flat() ? 14 : 54) }
    : { x0, x1: S.w - 20, y0: 56, y1: S.h - 70 };
}
// with a side panel, the map's part of the frame and the panel's
export function mapFrame() {
  const f = frame();
  return { ...f, x1: f.x0 + (1 - PANELW) * (f.x1 - f.x0) };
}
const panelFrame = () => {
  const f = frame();
  return { ...f, x0: f.x0 + (1 - PANELW) * (f.x1 - f.x0) + 16 };
};

// one item per municipality with a value: its results, value, band and whether it passes the filters
function items(y) {
  const v = vx(),
    R = results(y),
    out = [];
  const { get } = vy();
  for (let i = 0; i < R.length; i++) {
    const r = R[i];
    if (!r || get(r) == null) continue;
    const x = v.get(M[MG.features[i].properties.codarea]);
    if (x == null || !(x > 0 || v.u === "pct" || v.u === "pp")) continue;
    out.push({ i, r, x, band: bandOf(x), pass: PASS[i] });
  }
  return out;
}
const font = (px, dpr, w = 400) => `${w} ${px * dpr}px ${css("--body") || "sans-serif"}`;
// text with a halo in the background colour, so it reads over circles
function label(cx, text, x, y, dpr, bg, align = "left", col = css("--ink")) {
  cx.textAlign = align;
  cx.lineWidth = 3 * dpr;
  cx.strokeStyle = bg;
  cx.lineJoin = "round";
  cx.strokeText(text, x * dpr, y * dpr);
  cx.fillStyle = col;
  cx.fillText(text, x * dpr, y * dpr);
}

// --- the scatter ---
// the plot: margins for the axes, the scales, and the circles' size scale (their areas together cover SCOVER of
// the plot, min RMIN)
const SCOVER = 0.16,
  // a narrow panel (a phone) sets the trend's name on its own line above the plot and keeps room for the last
  // band's label at the right
  pad = (f) => (f.x1 - f.x0 < 500 ? { l: 56, r: 44, t: 82, b: 56 } : { l: 64, r: 28, t: 64, b: 56 });
function plot(y, f) {
  const PAD = pad(f),
    v = vx(),
    { get, w } = vy(),
    its = items(y),
    xs = its.map((d) => d.x),
    log = v.u === "int" || v.u === "brl",
    x = (log ? d3.scaleLog() : d3.scaleLinear())
      .domain(log ? [d3.quantile(xs, 0.002), d3.quantile(xs, 0.999)] : d3.extent(xs))
      .range([f.x0 + PAD.l, f.x1 - PAD.r]),
    ys = its.map((d) => get(d.r)),
    yy = d3
      .scaleLinear()
      .domain([Math.min(-5, d3.quantile(ys, 0.001)), Math.max(5, d3.quantile(ys, 0.999))])
      .nice()
      .range([f.y1 - PAD.b, f.y0 + PAD.t]),
    area = (x.range()[1] - x.range()[0]) * (yy.range()[0] - yy.range()[1]),
    rs = Math.sqrt((SCOVER * area) / (Math.PI * d3.sum(its, (d) => w(d.r))));
  return { v, f, its, x, y: yy, log, get, w, r: (d) => Math.max(RMIN, rs * Math.sqrt(w(d.r))) };
}
// the vote-weighted mean of the change per band, at the band's weighted mean x (geometric when the scale is log)
function trend(p) {
  const n = cuts().length + 1,
    acc = d3.range(n).map(() => ({ w: 0, dy: 0, lx: 0 }));
  for (const d of p.its) {
    const a = acc[d.band],
      w = p.w(d.r);
    a.w += w;
    a.dy += w * p.get(d.r);
    a.lx += w * (p.log ? Math.log(d.x) : d.x);
  }
  return acc
    .map((a) => (a.w ? { x: p.log ? Math.exp(a.lx / a.w) : a.lx / a.w, dy: a.dy / a.w } : null))
    .filter(Boolean);
}
const NAMEV = 2.5e5, // named: the biggest places by votes, down to this many
  NAMES = 18,
  HITR = 3; // hovering a circle this big (css px) shows its municipality
let HIT = [],
  hovering = false;
// the map's tooltip, over a circle in the chart
function hover() {
  if (hovering) return;
  hovering = true;
  svg.on("mousemove.scatter", (e) => {
    if (S.VIZ !== "scatter" && !panelled()) return;
    const r = svg.node().getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top,
      h = HIT.find((q) => Math.hypot(q.at[0] - x, q.at[1] - y) <= q.r + 1);
    if (h) showTip(e, MG.features[h.d.i]);
    else tip.style("opacity", 0);
  });
}
function drawScatter(cx, y, dpr, f = frame()) {
  const p = plot(y, f),
    bg = css("--night") || "#0b0e14",
    haze = css("--haze") || "#a3a3a8",
    rule = css("--rule") || "#2c2c31",
    ink = css("--ink") || "#f2f2f3",
    { col, chips, title } = vy(),
    narrow = f.x1 - f.x0 < 500,
    [px0, px1] = p.x.range(),
    [py0, py1] = p.y.range();
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.textBaseline = "middle";
  // grid and axes
  cx.font = font(11, dpr);
  cx.lineWidth = dpr;
  for (const tick of p.y.ticks(6)) {
    const yv = p.y(tick);
    cx.globalAlpha = 1;
    cx.strokeStyle = tick === 0 ? haze : rule;
    cx.beginPath();
    cx.moveTo(px0 * dpr, yv * dpr);
    cx.lineTo(px1 * dpr, yv * dpr);
    cx.stroke();
    cx.fillStyle = haze;
    cx.textAlign = "right";
    cx.fillText(tick === 0 ? "0" : (tick > 0 ? "+" : "−") + num(Math.abs(tick)), (px0 - 10) * dpr, yv * dpr);
  }
  // log ticks at 1, 10, 100…, or 1-2-5 when the axis spans under two decades
  const wide = Math.log10(p.x.domain()[1] / p.x.domain()[0]) >= 2,
    xt = p.log ? p.x.ticks().filter((d) => (wide ? /^1/ : /^[125]/).test(d.toExponential())) : p.x.ticks(6);
  cx.textAlign = "center";
  for (const tick of xt) {
    const xv = p.x(tick);
    cx.strokeStyle = rule;
    cx.beginPath();
    cx.moveTo(xv * dpr, py0 * dpr);
    cx.lineTo(xv * dpr, (py0 + 5) * dpr);
    cx.stroke();
    cx.fillStyle = haze;
    cx.fillText(show(p.v, tick), xv * dpr, (py0 + 16) * dpr);
  }
  // titles: the variable along the bottom, the measure at the top left with the colours under it (the key card
  // would cover the plot's corner)
  cx.font = font(12, dpr, 600);
  cx.fillStyle = ink;
  cx.textAlign = "left";
  cx.fillText(tr(narrow ? "viz.scatterXShort" : "viz.scatterX", { name: p.v.n }), px0 * dpr, (py0 + 32) * dpr);
  const cy = narrow ? py1 - 32 : py1 - 13; // the chips' row
  cx.fillText(tr(title), (px0 - 50) * dpr, (cy - 17) * dpr);
  cx.font = font(11, dpr);
  let lx = px0 - 50;
  for (const [cat, key] of chips()) {
    disc(cx, (lx + 4) * dpr, cy * dpr, 4 * dpr, [cat.startsWith("#") ? cat : COLS[CI(cat)]]);
    cx.fillStyle = haze;
    cx.fillText(tr(key), (lx + 12) * dpr, cy * dpr);
    lx += 12 + cx.measureText(tr(key)).width / dpr + 16;
  }
  // circles, those outside the filters faint and first, then the lit ones biggest first
  const its = p.its.slice().sort((u, v) => u.pass - v.pass || v.r.valid - u.r.valid);
  cx.lineWidth = 0.6 * dpr;
  cx.strokeStyle = bg;
  const [dx0, dx1] = p.x.domain(),
    at = (d) => [p.x(Math.max(dx0, Math.min(dx1, d.x))), Math.max(py1, Math.min(py0, p.y(p.get(d.r))))];
  for (const d of its) {
    const [xx, yv] = at(d);
    cx.globalAlpha = d.pass ? 0.72 : 0.1;
    disc(cx, xx * dpr, yv * dpr, p.r(d) * dpr, [col(d.r)]);
    if (d.pass && p.r(d) > 3) cx.stroke();
  }
  // the trend: a line through each band's vote-weighted mean
  const tl = trend(p);
  cx.globalAlpha = 0.95;
  cx.strokeStyle = ink;
  cx.lineWidth = 1.6 * dpr;
  cx.setLineDash([]);
  cx.beginPath();
  tl.forEach((q, j) => cx[j ? "lineTo" : "moveTo"](p.x(q.x) * dpr, p.y(q.dy) * dpr));
  cx.stroke();
  cx.lineWidth = 1.6 * dpr;
  for (const q of tl) {
    disc(cx, p.x(q.x) * dpr, p.y(q.dy) * dpr, 4 * dpr, [bg]);
    cx.stroke();
  }
  cx.font = font(11, dpr, 600);
  for (const q of tl) label(cx, signed(q.dy), p.x(q.x) + 8, p.y(q.dy) - 11, dpr, bg, "left", ink);
  // the trend's name, at the right beside the colours (below them when the panel is narrow)
  cx.font = font(11, dpr);
  cx.globalAlpha = 1;
  cx.fillStyle = haze;
  cx.textAlign = "right";
  const ty = narrow ? py1 - 14 : py1 - 13,
    tw = cx.measureText(tr("viz.scatterTrend")).width / dpr;
  cx.fillText(tr("viz.scatterTrend"), px1 * dpr, ty * dpr);
  cx.strokeStyle = ink;
  cx.beginPath();
  cx.moveTo((px1 - tw - 22) * dpr, ty * dpr);
  cx.lineTo((px1 - tw - 6) * dpr, ty * dpr);
  cx.stroke();
  // the biggest places named, by votes, each where its name doesn't cross one already placed (to the right of
  // its circle, or the left near the edge)
  cx.font = font(11, dpr);
  const boxes = tl.map((q) => [p.x(q.x) + 6, p.y(q.dy) - 20, p.x(q.x) + 40, p.y(q.dy) - 2]),
    big = its.filter((d) => d.pass && d.r.valid >= NAMEV).sort((u, v) => v.r.valid - u.r.valid);
  let named = 0;
  for (const d of big) {
    if (named >= (narrow ? NAMES / 2 : NAMES)) break;
    const [xx, yv] = at(d),
      r = p.r(d),
      text = M[MG.features[d.i].properties.codarea].n,
      w = cx.measureText(text).width / dpr,
      right = xx + r + 4 + w <= px1,
      bx = right ? xx + r + 4 : xx - r - 4 - w,
      box = [bx, yv - 7, bx + w, yv + 7];
    if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
    boxes.push(box);
    named++;
    label(cx, text, right ? bx : bx + w, yv, dpr, bg, right ? "left" : "right", ink);
  }
  // where the circles are, for the hover
  HIT = its.filter((d) => p.r(d) >= HITR).map((d) => ({ d, at: at(d), r: p.r(d) }));
  hover();
  cx.globalAlpha = 1;
}

// --- the multiples ---
// the cells: as many columns as needed for the bands, two rows when there are more than three
let MK = 1; // the cells' zoom, for the key
export const cellK = () => MK;
function cells() {
  const n = cuts().length + 1,
    f = frame(),
    cols = n <= 3 ? n : Math.ceil(n / 2),
    rows = Math.ceil(n / cols),
    w = (f.x1 - f.x0) / cols,
    h = (f.y1 - f.y0) / rows;
  // the country's bounds at zoom 1
  const [[bx0, by0], [bx1, by1]] = path.bounds(SG),
    head = 40,
    k = 0.86 * Math.min(w / (bx1 - bx0), (h - head) / (by1 - by0));
  MK = k;
  return d3.range(n).map((j) => {
    const cx0 = f.x0 + (j % cols) * w,
      cy0 = f.y0 + Math.floor(j / cols) * h;
    return {
      j,
      x0: cx0,
      y0: cy0,
      w,
      h,
      k,
      tx: cx0 + w / 2 - ((bx0 + bx1) / 2) * k,
      ty: cy0 + head + (h - head) / 2 - ((by0 + by1) / 2) * k,
    };
  });
}
let OUTLINE = null,
  outGen = -1;
const outline = () => {
  if (outGen !== S.layoutGen) {
    outGen = S.layoutGen;
    OUTLINE = new Path2D(path(SG) || "");
  }
  return OUTLINE;
};
function drawMultiples(cx, y, dpr) {
  const v = vx(),
    bg = css("--night") || "#0b0e14",
    haze = css("--haze") || "#a3a3a8",
    ink = css("--ink") || "#f2f2f3",
    { cen } = geo(),
    mv = moved(),
    ms = measure(y, bg),
    L = CI("13"),
    P = results(YS[1]),
    its = items(y).sort((u, w) => u.pass - w.pass || w.r.valid - u.r.valid);
  fitScale(y);
  for (const c of cells()) {
    // the country's outline
    cx.setTransform(dpr * c.k, 0, 0, dpr * c.k, dpr * c.tx, dpr * c.ty);
    cx.globalAlpha = 0.5;
    cx.strokeStyle = haze;
    cx.lineWidth = 0.7 / c.k;
    cx.stroke(outline());
    // the band's circles
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.lineWidth = 0.75 * dpr;
    cx.strokeStyle = bg;
    let n = 0,
      la = 0,
      lb = 0,
      va = 0,
      vb = 0;
    for (const d of its) {
      if (d.band !== c.j) continue;
      const col = mv ? mv.col(d.r) : ms.col(d.r);
      if (!col) continue;
      if (d.pass && P[d.i]) {
        n++;
        la += (d.r.sh[L] * d.r.valid) / 100;
        va += d.r.valid;
        lb += (P[d.i].sh[L] * P[d.i].valid) / 100;
        vb += P[d.i].valid;
      }
      const size = mv ? mv.val(d.r) : d.r.valid;
      if (!(size > 0)) continue;
      cx.globalAlpha = d.pass ? 0.88 : GHOST;
      disc(
        cx,
        (cen[d.i][0] * c.k + c.tx) * dpr,
        (cen[d.i][1] * c.k + c.ty) * dpr,
        Math.max(RMIN, rad(size, c.k)) * dpr,
        [col],
      );
      if (d.pass) cx.stroke();
    }
    // the band's name and Lula's share in both years
    cx.globalAlpha = 1;
    cx.textBaseline = "middle";
    cx.font = font(13, dpr, 600);
    label(cx, bandName(v, c.j), c.x0 + 14, c.y0 + 18, dpr, bg, "left", ink);
    if (va && vb) {
      const a = (100 * la) / va,
        b = (100 * lb) / vb;
      cx.font = font(11.5, dpr);
      label(
        cx,
        `${tr("viz.lulaShare")} ${pctN(b)} → ${pctN(a)} (${signed(a - b)}) · ${tr("viz.nMuni", { n: num(n) })}`,
        c.x0 + 14,
        c.y0 + 36,
        dpr,
        bg,
        "left",
        haze,
      );
    }
  }
  cx.globalAlpha = 1;
}

export function drawPanels(cx, y, dpr) {
  cx.save();
  if (S.VIZ === "scatter") drawScatter(cx, y, dpr);
  else if (S.VIZ === "multiples") drawMultiples(cx, y, dpr);
  else if (panelled()) drawScatter(cx, y, dpr, panelFrame());
  cx.restore();
}

// the variable shown, for the key
export const panelVar = () => vx();
