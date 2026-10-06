// Zoomed-in views for comparing places (Studio → Display → Zoomed in). The dots read well from afar, but up close
// their size adapts to the view, so the eye compares ink, not votes. Past a zoom threshold one of these fades in
// over the dots, which recede to a faint texture:
// - Circles (as in Bostock's bubble maps): one per municipality at its centroid, area ∝ valid votes.
// - Margins (as in the New York Times' "Extremely Detailed Map"): each municipality filled.
// - Outlines: the dots stay, sized by zoom alone once zoomed in (so they keep one meaning), over a hairline outline
//   of each municipality.
// What the colour shows is a separate choice (Studio → Colour by, vc= in the view), one number per map, as in
// Bostock and Carter's "Counties Blue and Red, Moving Right and Left", which keeps the shift all the way through:
// - change: Lula's share 2026 minus 2022, diverging from a grey midpoint (red: he gained; blue: he lost);
// - margin: the leader's colour, stronger the bigger the lead; places where the leader changed are hatched;
// - share-<ballot number> or share-small: one candidate's (or the smaller candidates') share, one hue light→dark;
// - abst: abstention, amber light→dark.
// In compare mode each side shows its own year. A story step picks its view in its hash (viz=margins&vc=change); a
// trailing * (viz=margins*) shows it at every zoom, for steps framed on the whole country.
import * as d3 from "d3";
import { M, MG, YEARS } from "../data.js";
import { PASS } from "../filters/filter.js";
import { fmt, num } from "../format.js";
import { t as tr } from "../i18n/index.js";
import { CI, COLS, S, YS, css } from "../state.js";
import { lulaShift, tally } from "../stats.js";
import { layers } from "../dots.js";
import { path, svg } from "./base.js";

export const VIZS = ["dots", "outline", "circles", "margins"];
// what the colour shows; candidates' shares are added as share-<ballot number>
export const VCOLS = ["change", "margin", "abst"];
// the fade between dots and the comparison view, by zoom: it starts at S.VIZK (Studio → Display) and is
// fully in at 7/3 of it
// 0: dots only, 1: the comparison view fully in
export function blend(k) {
  if (S.VIZ === "dots") return 0;
  if (S.VIZALL || S.VIZK <= 1.01) return 1;
  const k0 = S.VIZK,
    k1 = (k0 * 7) / 3,
    u = Math.max(0, Math.min(1, (k - k0) / (k1 - k0)));
  return u * u * (3 - 2 * u);
}
// "Dots + winner" fixes the dot size once zoomed in
export const fixedDots = (k) => S.VIZ === "outline" && blend(k) > 0;

// per municipality and year: valid votes, the leader's category and its margin over the runner-up (points), each
// category's share of valid votes, abstention (%) and Lula's change in share (points, the same in both years).
// Cleared when the 80+ switch changes the abstention.
const RES = {};
let resInc = null;
function results(y) {
  if (resInc !== S.INC80) for (const k in RES) delete RES[k];
  resInc = S.INC80;
  if (RES[y]) return RES[y];
  const cands = YEARS[y].cands.filter((c) => c.k).map((c) => c.i),
    big = [CI("13"), CI("22")];
  return (RES[y] = MG.features.map((f) => {
    const m = M[f.properties.codarea],
      a = tally(y, m);
    if (!a || !a.valid) return null;
    const [p, q] = cands.map((i) => a.d.c[i]).sort((u, v) => v - u);
    const lead = cands.find((i) => a.d.c[i] === p),
      sh = YEARS[y].cands.map((c) => c.i).reduce((o, i) => ((o[i] = (100 * a.d.c[i]) / a.valid), o), {});
    return {
      valid: a.valid,
      lead,
      margin: (100 * (p - q)) / a.valid,
      sh,
      small: 100 - big.reduce((t, i) => t + (sh[i] || 0), 0),
      ab: a.all ? (100 * a.ab) / a.all : null,
      dl: lulaShift(m),
    };
  }));
}
// the leader changed between the years
const flipped = (i) => {
  const a = results(YS[0])[i],
    b = results(YS[1])[i];
  return !!(a && b && a.lead !== b.lead);
};

// projected shapes (Path2D at zoom 1), centroids, bounds and areas, refreshed on each layout
let GEO = null,
  geoGen = -1;
function geo() {
  if (geoGen === S.layoutGen) return GEO;
  geoGen = S.layoutGen;
  const shapes = MG.features.map((f) => new Path2D(path(f) || "")),
    cen = MG.features.map((f) => path.centroid(f)),
    bb = MG.features.map((f) => path.bounds(f)),
    area = MG.features.map((f) => path.area(f));
  return (GEO = { shapes, cen, bb, area });
}

// margin → how far the colour goes from the background towards the leader's (40+ points: all the way)
const MSAT = 40;
const tint = (col, margin, bg) => d3.interpolateRgb(bg, col)(0.18 + 0.82 * Math.min(1, margin / MSAT));
// change: a grey midpoint (no change) out to Lula's colour where he gained and the Bolsonaro camp's where he lost,
// full at ±CSAT points; a sequential ramp from near the background to one hue for shares and abstention
const CSAT = 15,
  MID = "#6b7079";
const diverge = (v) => d3.interpolateRgb(MID, COLS[v >= 0 ? CI("13") : CI("22")])(Math.min(1, Math.abs(v) / CSAT));
const seq = (col, u, bg) => d3.interpolateRgb(bg, col)(0.15 + 0.85 * Math.max(0, Math.min(1, u)));
const ABR = [10, 35]; // abstention range, %
const SHARE = "#3fbf8f";
// the measure behind the colour: {col(r) → colour or null, hatch(i)}
function measure(y, bg) {
  const v = S.VCOL;
  if (v === "change") return { col: (r) => (r.dl == null ? null : diverge(r.dl)) };
  if (v === "abst")
    return { col: (r) => (r.ab == null ? null : seq(COLS[CI("A")], (r.ab - ABR[0]) / (ABR[1] - ABR[0]), bg)) };
  if (v.startsWith("share-")) {
    const { get, col, max } = shareOf(v.slice(6));
    return { col: (r) => (get(r) == null ? null : seq(col, get(r) / max, bg)) };
  }
  return { col: (r) => tint(COLS[r.lead], r.margin, bg), hatch: flipped };
}
// a candidate's (or the smaller candidates') share: its getter, colour and the top of its scale (the highest value
// over both years, so the two sides of the divider share one scale). One hue for every candidate, since some
// candidates' own colours are greys that make no ramp on the dark map
const SHM = {};
export function shareOf(k) {
  const get = k === "small" ? (r) => r.small : ((i) => (r) => (i in r.sh ? r.sh[i] : null))(CI(k));
  if (!(k in SHM)) {
    const vs = YS.flatMap((y) => results(y).filter(Boolean).map(get)).filter((x) => x != null);
    SHM[k] = Math.max(5, Math.ceil((d3.max(vs) || 5) / 5) * 5);
  }
  return { get, col: SHARE, max: SHM[k] };
}
// circle radius in css px: area ∝ votes (a sqrt scale, as in Bostock's bubble maps), following the zoom gently so a
// city doesn't swallow the screen. One national scale whatever the filter, so a small town always looks small: the
// circles of all municipalities together cover about a third of the country's land at zoom 1.
const COVER = 0.33;
let RC = 0.012,
  rcGen = -1;
function fitScale(y) {
  if (rcGen === S.layoutGen) return RC;
  rcGen = S.layoutGen;
  const { area } = geo(),
    R = results(y);
  let a = 0,
    v = 0;
  for (let i = 0; i < R.length; i++) if (R[i]) ((a += area[i]), (v += R[i].valid));
  return (RC = v ? Math.sqrt((COVER * a) / (Math.PI * v)) : RC);
}
const rad = (v, k) => RC * Math.sqrt(k) * Math.sqrt(v);

// diagonal hatching in a colour, fixed in screen pixels whatever the zoom
const HATCH = new Map();
function hatch(cx, col, dpr) {
  let p = HATCH.get(col + dpr);
  if (!p) {
    const n = Math.round(5 * dpr),
      c = new OffscreenCanvas(n, n),
      g = c.getContext("2d");
    g.strokeStyle = col;
    g.lineWidth = 1.4 * dpr;
    g.beginPath();
    for (const o of [-n, 0, n]) (g.moveTo(o, n), g.lineTo(o + n, 0));
    g.stroke();
    HATCH.set(col + dpr, (p = cx.createPattern(c, "repeat")));
  }
  p.setTransform(cx.getTransform().inverse());
  return p;
}

export function drawMarks(cx, t, W, H, dpr) {
  const b = blend(t.k);
  if (!b) return;
  const { shapes, cen, bb } = geo(),
    bg = css("--night") || "#0b0e14",
    vis = (i) => {
      const [[x0, y0], [x1, y1]] = bb[i];
      return x1 * t.k + t.x >= 0 && x0 * t.k + t.x <= S.w && y1 * t.k + t.y >= 0 && y0 * t.k + t.y <= S.h;
    };
  const ls = layers();
  if (S.VIZ === "circles") fitScale(ls[ls.length - 1].year);
  for (const { x0, x1, y } of ls.map((l) => ({ ...l, y: l.year }))) {
    const R = results(y),
      ms = measure(y, bg);
    cx.save();
    cx.beginPath();
    cx.rect(x0 * dpr, 0, (x1 - x0) * dpr, H);
    cx.clip();
    if (S.VIZ === "margins" || S.VIZ === "outline") {
      cx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
      cx.lineWidth = 1.2 / t.k;
      for (let i = 0; i < R.length; i++) {
        const r = R[i];
        if (!r || !PASS[i] || !vis(i)) continue;
        const col = ms.col(r);
        if (!col) continue;
        if (S.VIZ === "margins") {
          // one measure in the shade; hatching marks the places where the leader changed (margin only)
          cx.globalAlpha = b;
          cx.fillStyle = ms.hatch && ms.hatch(i) ? hatch(cx, col, dpr) : col;
          cx.fill(shapes[i]);
        } else {
          cx.globalAlpha = b * 0.9;
          cx.strokeStyle = col;
          cx.stroke(shapes[i]);
        }
      }
    } else {
      // circles, biggest first so small ones stay on top
      const ord = d3
        .range(R.length)
        .filter((i) => R[i] && PASS[i] && vis(i) && ms.col(R[i]))
        .sort((i, j) => R[j].valid - R[i].valid);
      cx.lineWidth = 0.75 * dpr;
      cx.strokeStyle = bg;
      for (const i of ord) {
        const r = R[i],
          c = cen[i];
        if (!isFinite(c[0])) continue;
        cx.globalAlpha = b * 0.85;
        cx.fillStyle = ms.col(r);
        cx.beginPath();
        cx.arc(
          (c[0] * t.k + t.x) * dpr,
          (c[1] * t.k + t.y) * dpr,
          Math.max(1, rad(r.valid, t.k)) * dpr,
          0,
          2 * Math.PI,
        );
        cx.fill();
        cx.stroke();
      }
    }
    cx.restore();
  }
  cx.globalAlpha = 1;
}

// under Studio's view buttons: when the chosen view shows, since at the country's zoom it often doesn't yet
export function vizHint(k = d3.zoomTransform(svg.node()).k) {
  const n = num(S.VIZK, 1).replace(/[.,]?0+$/, "");
  d3.select("#vizhint")
    .property("hidden", S.VIZ === "dots")
    .text(
      S.VIZ === "dots"
        ? ""
        : S.VIZALL || S.VIZK <= 1.01
          ? tr("viz.hintAlways")
          : tr(k >= S.VIZK ? "viz.hintOn" : "viz.hintOff", { k: n }),
    );
}

// The key, fixed in meaning at every zoom: the colour's ramp for the measure shown, and for circles three reference
// sizes at this zoom
const sw = (c, cls = "sw") => `<i class="${cls}" style="background:${c}"></i>`;
export function drawKey(t = d3.zoomTransform(svg.node())) {
  vizHint(t.k);
  const key = d3.select("#vkey"),
    b = blend(t.k);
  key.property("hidden", !b || S.VIZ === "dots");
  if (!b) return;
  const bg = css("--night") || "#0b0e14",
    v = S.VCOL;
  let h;
  if (v === "change")
    h =
      `<div>${tr("viz.keyChange")}</div><div class="ramp">${[-15, -8, -3].map((x) => sw(diverge(x))).join("")}` +
      `${sw(MID)}${[3, 8, 15].map((x) => sw(diverge(x))).join("")}</div>` +
      `<div class="ends"><span>${tr("viz.lost", { n: CSAT })}</span><span>${tr("viz.gained", { n: CSAT })}</span></div>`;
  else if (v === "abst")
    h =
      `<div>${tr("viz.keyAbst")}</div><div class="ramp">${[0, 0.33, 0.66, 1].map((u) => sw(seq(COLS[CI("A")], u, bg))).join("")}` +
      `<span>${ABR[0]}–${ABR[1]}%</span></div>`;
  else if (v.startsWith("share-")) {
    const k = v.slice(6),
      { col, max } = shareOf(k);
    h =
      `<div>${tr("viz.keyShare", { name: vcolName(v) })}</div><div class="ramp">` +
      `${[0, 0.33, 0.66, 1].map((u) => sw(seq(col, u, bg))).join("")}<span>0–${max}%</span></div>`;
  } else {
    const ramp = (i) => [0, 10, 20, 40].map((m) => sw(tint(COLS[i], m, bg))).join("");
    h = `<div>${tr("viz.keyMargin")}</div><div class="ramp">${ramp(CI("13"))}<span>0 → 40+</span>${ramp(CI("22"))}</div>`;
    if (S.VIZ === "margins")
      h += `<div class="hk"><i class="sw hatch" style="color:${tint(COLS[CI("13")], 40, bg)}"></i>${tr("viz.keyFlip")}</div>`;
  }
  if (S.VIZ === "circles")
    h +=
      `<div class="sizes">` +
      [1e4, 1e5, 1e6]
        .map((n) => {
          const d = 2 * rad(n, t.k);
          return `<span><i class="cc" style="width:${d}px;height:${d}px"></i>${fmt(n)}</span>`;
        })
        .join("") +
      `</div><div>${tr("viz.keyCircles")}</div>`;
  key.html(h);
}

// a measure's name, for the Studio menu and the key
export function vcolName(v) {
  if (!v.startsWith("share-")) return tr("viz.vc." + v);
  const k = v.slice(6);
  if (k === "small") return tr("viz.small");
  const c = YS.map((y) => YEARS[y].cands.find((c) => c.k === k)).find(Boolean);
  return c ? c.n : k;
}
// the measures on offer: change, margin, abstention, then each named candidate but the two leaders, and the smaller
// candidates together
export const vcols = () => [
  ...VCOLS,
  ...[
    ...new Set(YS.flatMap((y) => YEARS[y].cands.filter((c) => c.k && c.k !== "13" && c.k !== "22").map((c) => c.k))),
  ].map((k) => "share-" + k),
  "share-small",
];
