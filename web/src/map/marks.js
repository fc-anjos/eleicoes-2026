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
// - abst: abstention, amber light→dark;
// - mix: every group at once, as hairline hatching in one direction, the lines' colours alternating in proportion to
//   each group's share of the roll and their spacing set by voters per km². Where every place has the same leader (the Northeast),
//   "who won" paints one colour on both sides of the divider; the stripes show how much of each there was.
// In compare mode each side shows its own year. A story step picks its view in its hash (viz=margins&vc=change); a
// trailing * (viz=margins*) shows it at every zoom, for steps framed on the whole country.
import * as d3 from "d3";
import { CATS, M, MG, ORDER, VPD, YEARS } from "../data.js";
import { PASS, fsig } from "../filters/filter.js";
import { hum, num, pctN } from "../format.js";
import { onLang, t as tr } from "../i18n/index.js";
import { A8, AB, AO, CI, COLS, K, S, YS, css } from "../state.js";
import { CAPITALS, abRate, lulaShift, tally } from "../stats.js";
import { DOT, layers } from "../dots.js";
import { path, svg } from "./base.js";
import { cellK, flat, panelVar, phoneBand } from "./panels.js";

// scatter and multiples leave the map for a chart (see panels.js); hex pools polling places into hexagons
export const VIZS = ["dots", "outline", "circles", "margins", "hex", "scatter", "multiples"];
// what the colour shows; candidates' shares are added as share-<ballot number>
export const VCOLS = ["moved", "change", "margin", "mix", "abst", "dabst"];
// the fade between dots and the comparison view, by zoom: it starts at S.VIZK (Studio → Display) and is
// fully in at 7/3 of it
// 0: dots only, 1: the comparison view fully in
export function blend(k) {
  if (S.VIZ === "dots") return 0;
  if (flat() || S.VIZALL || S.VIZK <= 1.01) return 1;
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
export function results(y) {
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
      roll: a.all,
      da: dAbst(m),
      grp: groups(y, a),
    };
  }));
}
// the change in the abstention rate, 2026 minus 2022, in points
const dAbst = (m) => {
  const a = abRate(YS[0], m),
    b = abRate(YS[1], m);
  return a == null || b == null ? null : a - b;
};
// proportional hatching: hairlines in one direction (45°), their colours alternating in proportion to each group's
// share of the roll (abstention included), as in Ondrejka's proportional striping (Journal of Maps, 2016) and Gaffuri's striped circles
// (2022), and their spacing by voters per km², Bertin's "grain": the number of marks per area at a constant colour.
// So the colour mix says who, the line density says how many. N lines per repeat (5% each) are shared out by
// largest remainder and interleaved, each line going to the group furthest behind its share. Spacing is in screen
// pixels on a sqrt scale of density (as circle radius is of votes), clamped to [GMIN, GMAX]
const HAIR = 0.55, // css px
  N = 20,
  GMIN = 1.4,
  GMAX = 22,
  GLEVELS = 24, // log-spaced spacings, which also bounds the pattern cache
  GREF = 3; // the spacing at the median place's density
export const HATCHES = [
  ["l", "13"],
  ["b", "22"],
  ["o", ""],
  ["a", "A"],
];
// the votes of each group: Lula, the Bolsonaro camp, the other candidates folded together (their 1–3% shares would
// vanish among N lines), and those who did not vote
function groups(y, a) {
  const [l, b] = [CI("13"), CI("22")],
    v = YEARS[y].cands.reduce((t, c) => t + a.d.c[c.i], 0);
  return { l: a.d.c[l], b: a.d.c[b], o: v - a.d.c[l] - a.d.c[b], a: a.ab };
}
let DMED = 0,
  dmedGen = -1;
function gapFor(d) {
  if (dmedGen !== S.layoutGen) {
    dmedGen = S.layoutGen;
    const { area } = geo(),
      R = results(YS[0]);
    DMED = d3.median(R.map((r, i) => (r && area[i] > 0 ? r.valid / area[i] : null)).filter((x) => x)) || 1;
  }
  const g = Math.min(GMAX, Math.max(GMIN, GREF * Math.sqrt(DMED / d))),
    lv = Math.round((Math.log(g / GMIN) / Math.log(GMAX / GMIN)) * (GLEVELS - 1));
  return GMIN * (GMAX / GMIN) ** (lv / (GLEVELS - 1));
}
const HP = new Map();
// fixed: circles, whose size already says how many (Gaffuri's striped circles)
function hatchMix(cx, r, i, dpr, fixed) {
  const ar = geo().area[i],
    tot = d3.sum(HATCHES, ([k]) => r.grp[k]);
  if (!(ar > 0) || !tot) return [];
  const want = HATCHES.map(([k]) => (r.grp[k] / tot) * N),
    cnt = want.map(Math.floor);
  want
    .map((w, g) => [w - cnt[g], g])
    .sort((a, b) => b[0] - a[0])
    .slice(0, N - d3.sum(cnt))
    .forEach(([, g]) => cnt[g]++);
  const seq = [],
    put = cnt.map(() => 0);
  for (let j = 0; j < N; j++) {
    let best = -1,
      lag = -Infinity;
    cnt.forEach((c, g) => {
      const l = (c * (j + 1)) / N - put[g];
      if (c > put[g] && l > lag) ((lag = l), (best = g));
    });
    put[best]++;
    seq.push(best);
  }
  const gap = Math.max(2, Math.round((fixed ? GREF : gapFor(tot / ar)) * dpr)),
    n = N * gap,
    key = `${n}|${seq.join("")}`;
  let p = HP.get(key);
  if (!p) {
    const c = new OffscreenCanvas(n, n),
      g = c.getContext("2d"),
      img = g.createImageData(n, n),
      rgb = HATCHES.map(([, cat]) => d3.rgb(COLS[CI(cat)])),
      w = HAIR * dpr * Math.SQRT2; // the line's width measured along x + y
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const u = (x + y) % n,
          o = u % gap;
        if (o >= w) continue;
        const q = rgb[seq[Math.floor(u / gap)]],
          a = 4 * (y * n + x);
        img.data[a] = q.r;
        img.data[a + 1] = q.g;
        img.data[a + 2] = q.b;
        img.data[a + 3] = 255 * Math.min(1, w - o);
      }
    g.putImageData(img, 0, 0);
    HP.set(key, (p = cx.createPattern(c, "repeat")));
  }
  p.setTransform(cx.getTransform().inverse());
  return [p];
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
export function geo() {
  if (geoGen === S.layoutGen) return GEO;
  geoGen = S.layoutGen;
  const shapes = MG.features.map((f) => new Path2D(path(f) || "")),
    cen = MG.features.map((f) => path.centroid(f)),
    bb = MG.features.map((f) => path.bounds(f)),
    area = MG.features.map((f) => path.area(f)),
    perim = MG.features.map((f) => path.measure(f));
  return (GEO = { shapes, cen, bb, area, perim });
}

// Diverging scales: two hues either side of a neutral grey midpoint, in classes with equal colour steps per arm
// (Brewer's rule), so a close race or a small change reads as grey, not as a faint tint of a side. The grey keeps
// a 2:1 contrast on the night background. Steps are in Lab, so each is as far from the last as the eye sees it.
const MID = "#5a5d66";
const arm = (col, u) => d3.interpolateLab(MID, col)(u);
// the leader's margin: within MCUTS[0] points is grey, then three classes of each side
const MCUTS = [5, 15, 30],
  MSTEP = [0, 0.42, 0.72, 1];
const mclass = (m) => MCUTS.filter((c) => m >= c).length;
const marginCol = (lead, m) => (mclass(m) ? arm(COLS[lead], MSTEP[mclass(m)]) : MID);
// change in Lula's share: grey out to Lula's colour where he gained and the Bolsonaro camp's where he lost, full at
// ±CSAT points (continuous, for the dots' companion views)
const CSAT = 12;
const diverge = (v) => arm(COLS[v >= 0 ? CI("13") : CI("22")], Math.min(1, Math.abs(v) / CSAT));
// a sequential ramp from near the background to one hue, for shares and abstention
const seq = (col, u, bg) => d3.interpolateRgb(bg, col)(0.15 + 0.85 * Math.max(0, Math.min(1, u)));
// the change in the abstention rate: within ±DCUTS[0] points grey, then two classes each way, amber where more
// stayed home and green where fewer did
const DCUTS = [1, 3],
  DSTEP = [0, 0.55, 1];
const dclass = (d) => DCUTS.filter((c) => Math.abs(d) >= c).length;
const dabstCol = (d) => (dclass(d) ? arm(d > 0 ? COLS[CI("A")] : SHARE, DSTEP[dclass(d)]) : MID);
const ABR = [10, 35]; // abstention range, %
export const SHARE = "#3fbf8f";
// a candidate in focus (hovered or clicked in the panel) colours the comparison views by their share, as it
// singles out their dots: the leaders' and the smaller candidates' shares, or the abstention rate
export function focusCol() {
  if (S.focus < 0 || S.VIZ === "dots" || S.VIZ === "outline") return null;
  const c = CATS[S.focus];
  if (!c) return null;
  if (S.focus === AB || S.focus === AO || S.focus === A8) return "abst";
  return c.k ? "share-" + c.k : "share-small";
}
// the colour measure in force: the focus, or the chosen one
export const vcol = () => focusCol() || S.VCOL;
// the measure behind the colour: {col(r) → colour or null, hatch(i)}
export function measure(y, bg) {
  const v = vcol();
  if (v === "change" || v === "moved") return { col: (r) => (r.dl == null ? null : diverge(r.dl)) };
  if (v === "dabst") return { col: (r) => (r.da == null ? null : dabstCol(r.da)) };
  if (v === "abst")
    return { col: (r) => (r.ab == null ? null : seq(COLS[CI("A")], (r.ab - ABR[0]) / (ABR[1] - ABR[0]), bg)) };
  if (v.startsWith("share-")) {
    const { get, col, cls } = shareOf(v.slice(6));
    return { col: (r) => (get(r) == null ? null : seq(col, SSTEP[cls(get(r))], bg)) };
  }
  if (v === "mix") return { col: (r) => COLS[r.lead], layers: hatchMix };
  return { col: (r) => marginCol(r.lead, r.margin), hatch: flipped };
}
// a candidate's (or the smaller candidates') share: its getter, colour and the top of its scale (the highest value
// over both years, so the two sides of the divider share one scale). One hue for every candidate, since some
// candidates' own colours are greys that make no ramp on the dark map
// drawn in six classes set by the candidate's own national share (half of it, the share itself, 1.5×, 2× and 3×,
// rounded): one fixed scale left the candidates with 2–4% of the vote in one class across the whole country, and
// steps are easier to tell apart than a continuous shade. The middle break is the national share, named in the key
const SMULT = [0.5, 1, 1.5, 2, 3],
  SSTEP = [0, 0.24, 0.44, 0.63, 0.82, 1];
const nice = (x) => (x < 5 ? Math.round(x * 2) / 2 : Math.round(x));
export function shareOf(k) {
  const get = k === "small" ? (r) => r.small : ((i) => (r) => (i in r.sh ? r.sh[i] : null))(CI(k));
  const c = YEARS[YS[0]].cands,
    valid = d3.sum(c, (x) => x.v),
    v =
      k === "small"
        ? valid -
          d3.sum(
            c.filter((x) => x.k === "13" || x.k === "22"),
            (x) => x.v,
          )
        : c.find((x) => x.k === k)?.v,
    nat = (100 * (v || 0)) / valid,
    cuts = SMULT.map((m) => nice(nat * m));
  return { get, col: SHARE, nat, cuts, cls: (x) => cuts.filter((q) => x >= q).length };
}
// circle radius in css px: area ∝ votes (a sqrt scale, as in Bostock's bubble maps), following the zoom gently so a
// city doesn't swallow the screen. One national scale whatever the municipal filter, so a small town always looks small: the
// circles of all municipalities together cover about a fifth of the country's land at zoom 1.
const COVER = { votes: 0.2, moved: 0.14 };
// the scale: css px per √vote at zoom K0 (1 for the country; for one municipality's polling places, the zoom at which
// it fills the window, so its circles cover the same share of it as the country's do of the country)
let RC = 0.012,
  K0 = 1,
  rcKey = "";
// what a circle's area counts: the valid votes or, for "votes that moved", the net votes the change in Lula's share
// is worth (the points it moved times the votes cast), in two flat colours by direction, as in the Times' "size of
// lead": colour answers which way, size how many
// The same form serves abstention ("dabst"): the area is the change in the number who did not vote (the points the
// rate moved times the roll), amber where more stayed home and green where fewer did.
const NET = {
  moved: { val: (r) => (Math.abs(r.dl || 0) / 100) * r.valid, col: (r) => COLS[CI(r.dl < 0 ? "22" : "13")] },
  dabst: { val: (r) => (Math.abs(r.da || 0) / 100) * r.roll, col: (r) => (r.da > 0 ? COLS[CI("A")] : SHARE) },
};
export const moved = () => (focusCol() ? null : NET[S.VCOL]);
const sizeOf = (r) => (moved() ? moved().val(r) : r.valid);
export function fitScale(y) {
  const one = byPlace(),
    lit = S.PLACEF && !one,
    key = [S.layoutGen, S.VCOL, !!focusCol(), one ? [...S.INSET][0] : "", lit ? fsig() : "", S.w, S.h].join("|");
  if (rcKey === key) return RC;
  rcKey = key;
  const { area, bb } = geo(),
    cover = COVER[moved() ? "moved" : "votes"];
  let a = 0,
    v = 0;
  K0 = 1;
  if (one) {
    const fi = insetFeature(),
      [[x0, y0], [x1, y1]] = bb[fi];
    K0 = Math.min(S.w / (x1 - x0), S.h / (y1 - y0));
    a = area[fi] * K0 * K0;
    v = d3.sum(places(y), sizeOf);
  } else {
    // under a polling-place filter the circles count only the passing places, so the scale is fitted to those
    // votes: the lit tenth reads at a size a reader can see, and the key says what the sizes mean
    const R = lit ? placeResults(y) : results(y);
    for (let i = 0; i < R.length; i++) if (R[i]) ((a += area[i]), (v += sizeOf(R[i])));
  }
  return (RC = v ? Math.sqrt((cover * a) / (Math.PI * v)) : RC);
}
export const rad = (v, k) => RC * Math.sqrt(k / K0) * Math.sqrt(v);

// Inside one municipality (a view limited to it, as the São Paulo steps are) the circles are its polling places: one
// per place at the middle of its dots, from each place's exact votes in both years (matched by the place's row), so
// a city reads in the same terms as the country. Places outside a polling-place filter stay as faint discs.
const byPlace = () => S.VIZ === "circles" && !!S.INSET && S.INSET.size === 1;
const insetFeature = () => MG.features.findIndex((f) => f.properties.codarea === [...S.INSET][0]);
const PL = {};
let plKey = "";
function places(y) {
  const key = [[...S.INSET][0], S.layoutGen, S.INC80].join("|");
  if (plKey !== key) for (const k in PL) delete PL[k];
  plKey = key;
  if (PL[y]) return PL[y];
  const row = ORDER.indexOf(insetFeature()),
    L = CI("13"),
    big = [L, CI("22")],
    cands = YEARS[y].cands.filter((c) => c.k).map((c) => c.i);
  // each place's Lula share and abstention rate, by year
  const lula = YS.map((yy) => {
    const D = DOT[yy],
      m = new Map();
    for (let g = D.GM[row]; g < D.GM[row + 1]; g++) {
      if (D.GR[g] < 0) continue;
      let valid = 0;
      for (let i = 0; i < K; i++) if (i !== AB && i !== AO && i !== A8) valid += D.GV[g * K + i];
      const ab = D.GV[g * K + AB] + D.GV[g * K + AO] + (S.INC80 ? D.GV[g * K + A8] : 0);
      if (valid) m.set(D.GR[g], [(100 * D.GV[g * K + L]) / valid, (100 * ab) / (valid + ab)]);
    }
    return m;
  });
  const D = DOT[y],
    out = [];
  for (let g = D.GM[row]; g < D.GM[row + 1]; g++) {
    const n = D.S[g + 1] - D.S[g],
      c = Array.from({ length: K }, (_, i) => D.GV[g * K + i]),
      ab = c[AB] + c[AO] + (S.INC80 ? c[A8] : 0),
      valid = d3.sum(c) - c[AB] - c[AO] - c[A8];
    if (!n || !valid || D.GR[g] < 0) continue;
    let x = 0,
      yy = 0;
    for (let i = D.S[g]; i < D.S[g + 1]; i++) ((x += D.P[2 * i]), (yy += D.P[2 * i + 1]));
    const [p, q] = cands.map((i) => c[i]).sort((u, v) => v - u),
      sh = YEARS[y].cands.map((k) => k.i).reduce((o, i) => ((o[i] = (100 * c[i]) / valid), o), {}),
      a = lula[0].get(D.GR[g]),
      b = lula[1].get(D.GR[g]),
      vv = d3.sum(YEARS[y].cands, (k) => c[k.i]);
    out.push({
      g,
      x: x / n,
      y: yy / n,
      valid,
      lead: cands.find((i) => c[i] === p),
      margin: (100 * (p - q)) / valid,
      sh,
      small: 100 - big.reduce((t, i) => t + (sh[i] || 0), 0),
      ab: (100 * ab) / (valid + ab),
      dl: a == null || b == null ? null : a[0] - b[0],
      roll: valid + ab,
      da: a == null || b == null ? null : a[1] - b[1],
      grp: { l: c[L], b: c[big[1]], o: vv - c[L] - c[big[1]], a: ab },
    });
  }
  return (PL[y] = out);
}

export // Under a polling-place filter (an income band, say) a municipality's circle counts only its places that pass, in
// both years, so the circle shows the votes the step is about and not the whole town's. Municipalities where no
// place passes stay as ghosts of their full results.
const ROWOF = new Int32Array(MG.features.length).fill(-1);
ORDER.forEach((fi, r) => (ROWOF[fi] = r));
const PR = {};
let prKey = "";
function placeResults(y) {
  const key = [fsig(), S.layoutGen, S.INC80].join("|");
  if (prKey !== key) for (const k in PR) delete PR[k];
  prKey = key;
  if (PR[y]) return PR[y];
  const L = CI("13"),
    Bc = CI("22");
  // per year and municipality: the passing places' Lula votes, camp votes, valid votes and abstentions
  const sums = YS.map((yy) => {
    const D = DOT[yy],
      out = new Float64Array(4 * ORDER.length);
    for (let r = 0; r < ORDER.length; r++)
      for (let g = D.GM[r]; g < D.GM[r + 1]; g++) {
        if (!D.GP[g]) continue;
        const o = g * K;
        let valid = 0;
        for (let i = 0; i < K; i++) if (i !== AB && i !== AO && i !== A8) valid += D.GV[o + i];
        out[4 * r] += D.GV[o + L];
        out[4 * r + 1] += D.GV[o + Bc];
        out[4 * r + 2] += valid;
        out[4 * r + 3] += D.GV[o + AB] + D.GV[o + AO] + (S.INC80 ? D.GV[o + A8] : 0);
      }
    return out;
  });
  const yi = YS.indexOf(y),
    a = sums[yi],
    b = sums[1 - yi],
    sign = yi === 0 ? 1 : -1; // changes are always 2026 minus 2022
  return (PR[y] = results(y).map((r, fi) => {
    const row = ROWOF[fi];
    if (!r || row < 0) return null;
    const o = 4 * row,
      va = a[o + 2],
      vb = b[o + 2];
    if (!va || !vb) return null;
    const shL = (100 * a[o]) / va,
      shB = (100 * a[o + 1]) / va,
      abA = (100 * a[o + 3]) / (va + a[o + 3]),
      abB = (100 * b[o + 3]) / (vb + b[o + 3]);
    return {
      ...r,
      valid: va,
      lead: a[o] >= a[o + 1] ? L : Bc,
      margin: Math.abs(shL - shB),
      sh: { ...r.sh, [L]: shL, [Bc]: shB },
      small: 100 - shL - shB,
      ab: abA,
      dl: sign * (shL - (100 * b[o]) / vb),
      roll: va + a[o + 3],
      da: sign * (abA - abB),
    };
  }));
}

export const RMIN = 1.3,
  GHOST = 0.06;
export function disc(cx, x, y, r, fills) {
  cx.beginPath();
  cx.arc(x, y, Math.max(0.5, r), 0, 2 * Math.PI);
  for (const f of fills) {
    cx.fillStyle = f;
    cx.fill();
  }
}

// "Capitals and big cities" (big=1 in a view): the circles kept are the state capitals and the cities with enough
// votes for the zoom, so zooming out drops what is only regional and brings in the country's other big cities. The
// biggest in view are named, with Lula's share in both years, on leader lines placed clear of one another.
const BIG0 = 4e5,
  NAMED = 8;
const CAP = MG.features.map((f) => CAPITALS.has(f.properties.codarea));
const isBig = (i, k) => !S.BIG || CAP[i] || results(YS[0])[i].valid >= BIG0 / k ** 0.75;
const SPOTS = [
  [40, -30],
  [40, 30],
  [-40, -30],
  [-40, 30],
  [55, 0],
  [-55, 0],
  [30, -55],
  [-30, 55],
  [30, 55],
  [-30, -55],
];
const kept = new Map(); // each name's last spot, tried first so labels don't jump about as the map moves
export function cityNotes(t) {
  if (!S.BIG || S.VIZ !== "circles" || !blend(t.k)) return null;
  const { cen } = geo(),
    R = results(YS[0]),
    P = results(YS[1]),
    L = CI("13"),
    B = CI("22"),
    story = d3.select("#page").classed("storymode") && innerWidth > 900,
    x0 = story ? document.querySelector("aside").getBoundingClientRect().width : 0,
    // phones: only the band between the totals and the card, and fewer names (the labels are long)
    band = phoneBand(),
    [y0, y1] = band || [0, S.h],
    n = band ? NAMED / 2 : NAMED,
    key = document.getElementById("vkey").getBoundingClientRect(),
    wrap = document.getElementById("wrap").getBoundingClientRect(),
    // taken: the key, then each label as it is placed
    boxes = [[key.left - wrap.left, key.top - wrap.top, key.right - wrap.left, key.bottom - wrap.top]],
    hits = (b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const at = (i) => [cen[i][0] * t.k + t.x, cen[i][1] * t.k + t.y];
  const top = d3
    .range(R.length)
    .filter((i) => {
      if (!R[i] || !P[i] || !PASS[i] || !isBig(i, t.k)) return false;
      const [x, y] = at(i);
      return x > x0 + 20 && x < S.w - 20 && y > y0 + 20 && y < y1 - 20;
    })
    .sort((i, j) => CAP[j] - CAP[i] || R[j].valid - R[i].valid)
    .slice(0, n);
  const out = [];
  for (const i of top) {
    // named with Lula's share in both years, or his margin when the colour is the margin, so a flip reads as
    // how close it was
    const name = M[MG.features[i].properties.codarea].n,
      mg = (r) => r.sh[L] - (r.sh[B] || 0),
      sg = (v) => (v >= 0 ? "+" : "−") + num(Math.abs(v), 0),
      text =
        vcol() === "margin"
          ? `${name} ${sg(mg(P[i]))} → ${sg(mg(R[i]))}`
          : `${name} ${pctN(P[i].sh[L])} → ${pctN(R[i].sh[L])}`,
      [x, y] = at(i),
      w = 7.4 * text.length;
    const box = ([dx, dy]) =>
      dx < 0 ? [x + dx - w, y + dy - 9, x + dx, y + dy + 9] : [x + dx, y + dy - 9, x + dx + w, y + dy + 9];
    const fits = (s) => {
      const b = box(s);
      return b[0] > x0 && b[2] < S.w && b[1] > y0 && b[3] < y1 && !hits(b);
    };
    const s = [kept.get(name), ...SPOTS].filter(Boolean).find(fits);
    if (!s) continue;
    kept.set(name, s);
    boxes.push(box(s));
    out.push({ p: cen[i], t: text, dx: s[0], dy: s[1] });
  }
  return out;
}

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

// Hexagons: polling places pooled into equal-area cells of a fixed geography (as in the Times' precinct maps), so a
// rate reads the same in a city block and in the sertão: neither a big city's votes nor a big municipality's land
// can take over the map. Cells are HR px across at zoom 1 and halve each time the zoom doubles, down to HMIN, so
// zooming in resolves finer places. Under a polling-place filter a cell pools only the places that pass; cells
// holding fewer than HVMIN valid votes are drawn hollow so a lone place can't paint one.
const HR = 7,
  HMIN = 2.5,
  HVMIN = 1000;
export const hexR = (k) => Math.max(HMIN, HR / 2 ** Math.floor(Math.log2(Math.max(1, k))));
const HX = {};
let hxKey = "";
function hexes(y, r) {
  const key = [fsig(), S.layoutGen, S.INC80, r].join("|");
  if (hxKey !== key) for (const k in HX) delete HX[k];
  hxKey = key;
  if (HX[y]) return HX[y];
  const dx = 2 * r * Math.sin(Math.PI / 3),
    dy = 1.5 * r;
  // the cell under a point (d3-hexbin's rounding, ISC licence)
  const cell = (px, py) => {
    let pj = Math.round((py = py / dy)),
      pi = Math.round((px = px / dx - (pj & 1) / 2));
    const py1 = py - pj;
    if (Math.abs(py1) * 3 > 1) {
      const px1 = px - pi,
        pi2 = pi + (px < pi ? -1 : 1) / 2,
        pj2 = pj + (py < pj ? -1 : 1),
        px2 = px - pi2,
        py2 = py - pj2;
      if (px1 * px1 + py1 * py1 > px2 * px2 + py2 * py2) ((pi = pi2 + (pj & 1 ? 1 : -1) / 2), (pj = pj2));
    }
    return [pi, pj];
  };
  // per year: each cell's exact votes by category, over its passing places
  const sums = YS.map((yy) => {
    const D = DOT[yy],
      m = new Map();
    for (let r_ = 0; r_ < ORDER.length; r_++)
      for (let g = D.GM[r_]; g < D.GM[r_ + 1]; g++) {
        const n = D.S[g + 1] - D.S[g];
        if (!n || !D.GP[g] || D.GR[g] < 0) continue;
        let x = 0,
          py = 0;
        for (let i = D.S[g]; i < D.S[g + 1]; i++) ((x += D.P[2 * i]), (py += D.P[2 * i + 1]));
        const [pi, pj] = cell(x / n, py / n),
          k = pi + "," + pj;
        let c = m.get(k);
        if (!c) m.set(k, (c = { x: (pi + (pj & 1) / 2) * dx, y: pj * dy, v: new Float64Array(K) }));
        for (let i = 0; i < K; i++) c.v[i] += D.GV[g * K + i];
      }
    return m;
  });
  const yi = YS.indexOf(y),
    sign = yi === 0 ? 1 : -1,
    L = CI("13"),
    Bc = CI("22"),
    cands = YEARS[y].cands.filter((c) => c.k).map((c) => c.i),
    stats = (c) => {
      let valid = 0;
      for (let i = 0; i < K; i++) if (i !== AB && i !== AO && i !== A8) valid += c[i];
      const ab = c[AB] + c[AO] + (S.INC80 ? c[A8] : 0);
      return { valid, ab, shL: (100 * c[L]) / valid, abr: (100 * ab) / (valid + ab) };
    },
    out = [];
  for (const [k, c] of sums[yi]) {
    const a = stats(c.v);
    if (!a.valid) continue;
    const o = sums[1 - yi].get(k),
      b = o && stats(o.v),
      [p, q] = cands.map((i) => c.v[i]).sort((u, v) => v - u),
      sh = cands.reduce((m, i) => ((m[i] = (100 * c.v[i]) / a.valid), m), {}),
      shB = (100 * c.v[Bc]) / a.valid;
    out.push({
      x: c.x,
      y: c.y,
      valid: a.valid,
      lead: cands.find((i) => c.v[i] === p),
      margin: (100 * (p - q)) / a.valid,
      sh,
      small: 100 - a.shL - shB,
      ab: a.abr,
      roll: a.valid + a.ab,
      dl: b && b.valid ? sign * (a.shL - b.shL) : null,
      da: b && b.valid ? sign * (a.abr - b.abr) : null,
    });
  }
  return (HX[y] = out);
}
// a pointy-top hexagon of radius r around (x, y)
function hexPath(cx, x, y, r) {
  cx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 6) * (2 * i + 1);
    cx[i ? "lineTo" : "moveTo"](x + r * Math.cos(a), y + r * Math.sin(a));
  }
  cx.closePath();
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
          for (const f of ms.layers
            ? ms.layers(cx, r, i, dpr)
            : [ms.hatch && ms.hatch(i) ? hatch(cx, col, dpr) : col]) {
            cx.fillStyle = f;
            cx.fill(shapes[i]);
          }
        } else {
          cx.globalAlpha = b * 0.9;
          cx.strokeStyle = col;
          cx.stroke(shapes[i]);
        }
      }
    } else if (S.VIZ === "hex") {
      const r = hexR(t.k),
        gap = 1 / t.k; // a one-pixel seam of the sea between cells, whatever the zoom
      cx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
      cx.lineWidth = 0.8 / t.k;
      for (const h of hexes(y, r)) {
        if (h.x * t.k + t.x < -r * t.k || h.x * t.k + t.x > S.w + r * t.k) continue;
        if (h.y * t.k + t.y < -r * t.k || h.y * t.k + t.y > S.h + r * t.k) continue;
        const col = ms.col(h);
        if (!col) continue;
        hexPath(cx, h.x, h.y, r - gap);
        if (h.valid >= HVMIN) {
          cx.globalAlpha = b;
          cx.fillStyle = col;
          cx.fill();
        } else {
          cx.globalAlpha = b * 0.7;
          cx.strokeStyle = col;
          cx.stroke();
        }
      }
    } else {
      // circles, biggest first so small ones stay on top; under a filter the places outside it stay as faint
      // discs, so the lit ones read against the rest
      // one item per municipality, or per polling place inside a single municipality
      const mv = moved(),
        GP = DOT[y].GP,
        PRR = S.PLACEF && !byPlace() ? placeResults(y) : null,
        items = (
          byPlace()
            ? places(y).map((r) => ({ r, x: r.x, y: r.y, pass: GP[r.g], i: -1 }))
            : d3
                .range(R.length)
                .filter((i) => R[i] && vis(i) && isFinite(cen[i][0]) && isBig(i, t.k))
                .map((i) => {
                  const lit = PASS[i] && (!PRR || !!PRR[i]);
                  return { r: lit && PRR ? PRR[i] : R[i], x: cen[i][0], y: cen[i][1], pass: lit, i };
                })
        )
          .filter((d) => ms.col(d.r) && sizeOf(d.r) > 0)
          .sort((u, v) => u.pass - v.pass || sizeOf(v.r) - sizeOf(u.r));
      cx.lineWidth = 0.75 * dpr;
      cx.strokeStyle = bg;
      for (const { r, x, y: py, pass, i } of items) {
        const fills = mv ? [mv.col(r)] : pass && ms.layers && i >= 0 ? ms.layers(cx, r, i, dpr, true) : [ms.col(r)];
        cx.globalAlpha = b * (pass ? 0.88 : GHOST);
        disc(cx, (x * t.k + t.x) * dpr, (py * t.k + t.y) * dpr, Math.max(RMIN, rad(sizeOf(r), t.k)) * dpr, fills);
        if (pass) cx.stroke();
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

// The key, fixed in meaning at every zoom: a title, the measure's colour bar with its ends labelled, and for circles
// three nested reference sizes at this zoom
const bar = (cols, ends) =>
  `<div class="kbar" style="background:linear-gradient(90deg,${cols.join(",")})"></div>` +
  `<div class="kax">${ends.map((e) => `<span>${e}</span>`).join("")}</div>`;
// a classed scale: one block per class, labelled by lab(value, index)
const steps = (cls, lab) =>
  `<div class="ksteps">${cls.map(([c, v], i) => `<span><i style="background:${c}"></i>${lab(v, i)}</span>`).join("")}</div>`;
const chip = (c, n, cls = "") => `<span><i class="${cls}" style="--c:${c}"></i>${n}</span>`;
// nested circles on one baseline: the biggest round number that fits the key, then about a fifth and a twentieth of it
const STEPS = [1e7, 5e6, 2e6, 1e6, 5e5, 2e5, 1e5, 5e4, 2e4, 1e4, 5e3, 2e3, 1e3, 500, 200, 100];
// rf: the radius of n votes (the circles' at zoom k unless given)
function sizes(k, rf = (n) => rad(n, k)) {
  const i = Math.max(
      0,
      STEPS.findIndex((n) => rf(n) <= 22),
    ),
    ns = [STEPS[i], STEPS[i + 2], STEPS[i + 4]].filter(Boolean),
    R = rf(ns[0]),
    pad = 7,
    w = 2 * R + 52,
    h = 2 * R + pad + 1;
  // labels sit at each circle's top, pushed down where two would touch
  let last = -Infinity;
  const rows = ns.map((n) => {
    const r = rf(n),
      y = h - 1 - 2 * r,
      ty = (last = Math.max(y, last + 11));
    return { n, r, y, ty };
  });
  const H = Math.max(h, last + 5);
  return (
    `<svg class="ksize" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}">` +
    rows
      .map(
        ({ n, r, y, ty }) =>
          `<circle cx="${R + 1}" cy="${h - 1 - r}" r="${r}"/>` +
          `<line x1="${R + 1}" y1="${y}" x2="${2 * R + 9}" y2="${ty}"/>` +
          `<text x="${2 * R + 12}" y="${ty}" dy="0.32em">${hum(n, 0)}</text>`,
      )
      .join("") +
    `</svg>`
  );
}
// Explore's opening line, for the view that shows
let deckKey = "";
onLang(() => (deckKey = ""));
function deck(view) {
  // the chosen measure's name, lower-cased in the sentence unless it is a candidate's
  const name =
    view === "scatter" || view === "multiples"
      ? panelVar().n
      : S.VCOL.startsWith("share-") && S.VCOL !== "share-small"
        ? vcolName(S.VCOL)
        : vcolName(S.VCOL).toLowerCase();
  const key = view + "|" + name;
  if (key === deckKey) return;
  deckKey = key;
  d3.select(".deck").html(tr("explore.deck." + view, { name }));
  d3.selectAll(".vpd").text(num(S.STEP * VPD, 0));
}
let keyHtml = "";
export function drawKey(t = d3.zoomTransform(svg.node())) {
  vizHint(t.k);
  const key = d3.select("#vkey"),
    b = blend(t.k),
    on = b > 0 && S.VIZ !== "dots" && S.VIZ !== "scatter"; // the scatter carries its own key
  key.property("hidden", !on);
  d3.select("#page").classed("flat", flat());
  // the dots' own key steps back once the view has fully replaced them; so do Explore's opening line and the
  // Studio's dot controls, which then describe the view that shows
  const nodots = flat() || (on && b >= 1 && S.VIZ !== "outline");
  d3.select(".mapbar .key").classed("nodots", nodots);
  d3.select("#page").classed("nodots", nodots);
  deck(nodots ? S.VIZ : S.VIZ === "outline" && on ? "outline" : "dots");
  if (!on) return;
  const bg = css("--night") || "#0b0e14",
    v = vcol(),
    lula = COLS[CI("13")],
    camp = COLS[CI("22")],
    name = { l: "Lula", b: tr("viz.camp"), o: tr("viz.others"), a: tr("viz.didnt") };
  let h;
  if (v === "change" || v === "moved") {
    h =
      `<div class="kt">${tr("viz.keyChange")}</div>` +
      bar(
        [-1, -0.5, 0, 0.5, 1].map((u) => diverge(u * CSAT)),
        [tr("viz.lost", { n: CSAT }), tr("viz.same"), tr("viz.gained", { n: CSAT })],
      );
  } else if (v === "mix")
    h =
      `<div class="kt">${tr("viz.keyMix")}</div><div class="kchips">` +
      HATCHES.map(([k, cat]) => chip(COLS[CI(cat)], name[k], "hatch")).join("") +
      `</div>` +
      (S.VIZ === "circles" ? "" : `<div class="kn">${tr("viz.keyGrain")}</div>`);
  else if (v === "dabst") {
    // classes either side of grey: fell 3+, fell 1–3, within 1, rose 1–3, rose 3+
    const cls = [-3, -1, 0, 1, 3].map((d) => [dabstCol(d), d]);
    h =
      `<div class="kt">${tr("viz.keyDabstRate")}</div>` +
      steps(cls, (d, i) =>
        i === 2
          ? `±${DCUTS[0]}`
          : (d > 0 ? "+" : "−") + DCUTS[Math.abs(d) === 1 ? 0 : 1] + (Math.abs(d) === 3 ? "+" : ""),
      ) +
      `<div class="kax"><span>${tr("viz.abstDown")}</span><span>${tr("viz.abstUp")}</span></div>`;
  } else if (v === "abst") {
    const cols = [0, 0.5, 1].map((u) => seq(COLS[CI("A")], u, bg));
    h = `<div class="kt">${tr("viz.keyAbst")}</div>` + bar(cols, [ABR[0] + "%", ABR[1] + "%"]);
  } else if (v.startsWith("share-")) {
    const { col, cuts, nat } = shareOf(v.slice(6));
    h =
      `<div class="kt">${tr("viz.keyShare", { name: vcolName(v) })}</div><div class="ksteps">` +
      SSTEP.map(
        (u, i) =>
          `<span><i style="background:${seq(col, u, bg)}"></i>${i ? num(cuts[i - 1], cuts[i - 1] % 1 ? 1 : 0) + (i === cuts.length ? "%+" : "") : "0"}</span>`,
      ).join("") +
      `</div><div class="kn">${tr("viz.keyShareNat", { v: pctN(nat) })}</div>`;
  } else {
    // Lula's classes left, grey in the middle, the camp's right
    const L = CI("13"),
      B = CI("22"),
      cls = [
        ...[30, 15, 5].map((m) => [marginCol(L, m), m]),
        [MID, 0],
        ...[5, 15, 30].map((m) => [marginCol(B, m), m]),
      ];
    h =
      `<div class="kt">${tr("viz.keyMargin")}</div>` +
      steps(cls, (m) => (m ? `${m}${m === 30 ? "+" : ""}` : `<${MCUTS[0]}`)) +
      `<div class="kax"><span>Lula</span><span>${name.b}</span></div>`;
    if (S.VIZ === "margins") h += `<div class="kchips">${chip(marginCol(L, 30), tr("viz.keyFlip"), "hatch")}</div>`;
    if (S.BIG && S.VIZ === "circles") h += `<div class="kn">${tr("viz.keyMarginNames")}</div>`;
  }
  if (S.VIZ === "hex") h += `<div class="kn">${tr("viz.keyHex")}</div>`;
  // the multiples: the circles' two colours and their sizes at the cells' zoom
  if (flat()) {
    h =
      `<div class="kt">${tr("viz.keyMultiples", { name: panelVar().n })}</div><div class="kchips">` +
      chip(camp, tr("viz.movedAway")) +
      chip(lula, tr("viz.movedTo")) +
      `</div><div class="kcirc"><div class="krow">${sizes(cellK())}<div class="kn">${tr("viz.keyMovedSize")}</div></div></div>`;
  } else if (S.VIZ === "circles") {
    const mv = moved();
    if (mv)
      h =
        `<div class="kt">${tr(v === "dabst" ? "viz.keyDabst" : "viz.keyMoved")}</div><div class="kchips">` +
        (v === "dabst"
          ? chip(COLS[CI("A")], tr("viz.abstUp")) + chip(SHARE, tr("viz.abstDown"))
          : chip(camp, tr("viz.movedAway")) + chip(lula, tr("viz.movedTo"))) +
        `</div>`;
    h += `<div class="kcirc"><div class="krow">${sizes(t.k)}<div class="kn">${tr(v === "dabst" ? "viz.keyDabstSize" : mv ? "viz.keyMovedSize" : "viz.keyCircles")}</div></div></div>`;
    // the change circles' explainer (readviz.js), opened from here
    if (mv && v !== "dabst") h += `<button type="button" class="rvopen">${tr("viz.howToRead")}</button>`;
  }
  if (h !== keyHtml) key.html((keyHtml = h));
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
