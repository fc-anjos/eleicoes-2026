// The dot canvas.
// Every dot exists at every zoom (as in Cable's Racial Dot Map).
// Zoomed out, many dots share a pixel: its opacity shows their coverage, its colour one of them (see paint()).
// Zoomed in, the dots grow past a pixel and are drawn as discs.
// Two sizing strategies (Studio → Display → Dot size):
// - By zoom: dots are fixed objects on the map and just magnify with it, radius R0·k (up to RMAX px), so zooming
//   in on a city turns it into a solid sheet. Nothing adapts.
// - Adaptive: the radius is fitted to the dots in view (as in Datashader's dynspread) on every frame, so it changes
//   as you pan and zoom: dense close-ups get fine dots, so blocks and streets show; sparse ones get large dots, so
//   a few hundred votes stay visible. See radius().
import * as d3 from "d3";
import { layers } from "../dots.js";
import { A8, DC, HID, PX, S, hidden } from "../state.js";
import { saveSoon } from "../view/hash.js";
import { drawArrows } from "./arrows.js";
import { svg } from "./base.js";

const cv = document.getElementById("cv"),
  cx = cv.getContext("2d"),
  ghost = document.getElementById("cvg"),
  gx = ghost.getContext("2d");
export const dpr = devicePixelRatio || 1;
// canvas size in device px, its pixels, coverage (T: in focus, O: the grey trace), the colour on top, density cells
let W, H, img, px, T, O, TI, TOP, cnt;

const ALO = 0.4, // opacity of the sparsest pixels
  CELL = 16, // density fit: cell size (css px) and the share of a cell the dots should cover
  COVER = 0.6;
// Adaptive is bounded to ×AMIN–×AMAX of R0·√k (the old zoom rule, CartoDB-like), a soft guard against extremes.
const R0 = 0.32,
  RMAX = 16,
  DENSE_W = 0.75,
  ADAPT_W = 1,
  AMIN = 0.15,
  AMAX = 10;

// reallocate the pixel buffers for the map's size (S.w × S.h css px)
export function resizeCanvas() {
  W = Math.round(S.w * dpr);
  H = Math.round(S.h * dpr);
  cv.width = ghost.width = W;
  cv.height = ghost.height = H;
  img = cx.createImageData(W, H);
  px = new Uint32Array(img.data.buffer);
  [T, O] = [0, 0].map(() => new Float32Array(W * H));
  TOP = new Uint8Array(W * H);
  cnt = new Uint32Array(Math.ceil(S.w / CELL) * Math.ceil(S.h / CELL));
}

// dots are drawn group by group (so filtered-out ones can be skipped or dimmed); every STEP-th dot
// overall: first(s) is the first such index at or after s
const first = (s) => Math.ceil(s / S.STEP) * S.STEP;

function radius(t) {
  // in css px
  const k = t.k,
    rz = R0 * Math.sqrt(k),
    { w, h, STEP, SIZE } = S;
  if (!S.ADAPT) return Math.min(RMAX, R0 * k) * SIZE;
  const gw = Math.ceil(w / CELL);
  cnt.fill(0);
  for (const { P, C, S: GS, GP, x0, x1 } of layers())
    for (let g = 0; g < GP.length; g++) {
      if (!GP[g]) continue;
      for (let i = first(GS[g]), e = GS[g + 1]; i < e; i += STEP) {
        if (hidden(C[i]) || (!S.INC80 && C[i] === A8)) continue;
        const x = P[2 * i] * k + t.x,
          y = P[2 * i + 1] * k + t.y;
        if (x >= x0 && x < x1 && y >= 0 && y < h) cnt[((y / CELL) | 0) * gw + ((x / CELL) | 0)]++;
      }
    }
  // Two views of the density: as seen by the average dot (Σc²/Σc over cells, dominated by crowded town cells) and
  // of a typical occupied cell (geometric mean of counts, dominated by sparse rural cells). Sizing by the first
  // leaves the countryside as faint specks; by the second, cities and zoomed-out views clutter. The radius uses
  // their geometric mean (DENSE_W sets the balance). Neither uses a percentile, so both move smoothly while panning.
  let s1 = 0,
    s2 = 0,
    occ = 0,
    sl = 0;
  for (let j = 0; j < cnt.length; j++) {
    const v = cnt[j];
    if (v) {
      s1 += v;
      s2 += v * v;
      occ++;
      sl += Math.log(v);
    }
  }
  if (!s1) return rz * AMAX * SIZE;
  const c = Math.exp(DENSE_W * Math.log(s2 / s1) + ((1 - DENSE_W) * sl) / occ);
  // n discs of radius r scattered in a cell of area g² cover 1-exp(-nπr²/g²) of it
  const r = CELL * Math.sqrt(-Math.log(1 - COVER) / (Math.PI * c));
  // The fit is applied as a correction to the zoom rule: the radius moves ADAPT_W of the way (geometrically) from
  // R0·√k towards it, within ×AMIN–×AMAX of the zoom rule, so dense views get much finer dots and sparse ones much
  // larger. Soft limits (tanh) avoid a kink where the correction tops out.
  const z = Math.log(r / rz) * ADAPT_W,
    lo = Math.log(AMIN),
    hi = Math.log(AMAX),
    mid = (lo + hi) / 2,
    hh = (hi - lo) / 2;
  return rz * Math.exp(mid + hh * Math.tanh((z - mid) / hh)) * SIZE;
}

// Disc stamps: pixel offsets and anti-aliased weights for a disc of radius rd, precomputed for 8×8 sub-pixel
// phases of its centre, so drawing a dot is a table walk instead of a square root per pixel
const PH = 8;
let stamp = { rd: -1 };
function stamps(rd) {
  if (stamp.rd === rd) return stamp;
  // e: the radius at which coverage reaches 0. Full-size discs get half a pixel of anti-aliased edge (rd+.5); just
  // above the single-pixel threshold the edge grows in from almost nothing, so the footprint there (πe² ≈ 1 px)
  // matches a single-pixel dot and the size grows continuously through the switch
  const e = rd + 0.064 + 0.436 * Math.min(1, Math.max(0, rd - 0.5)),
    Rr = Math.ceil(e) + 1,
    off = [],
    wt = [],
    start = new Int32Array(PH * PH + 1);
  for (let p = 0; p < PH * PH; p++) {
    // dot centre within its pixel
    const cx = ((p % PH) + 0.5) / PH,
      cy = (((p / PH) | 0) + 0.5) / PH;
    start[p] = off.length / 2;
    for (let dy = -Rr; dy <= Rr; dy++)
      for (let dx = -Rr; dx <= Rr; dx++) {
        const a = e - Math.hypot(dx - cx, dy - cy);
        if (a > 0) {
          off.push(dx, dy);
          wt.push(a < 1 ? a : 1);
        }
      }
  }
  start[PH * PH] = off.length / 2;
  return (stamp = { rd, Rr, start, off: Int16Array.from(off), wt: Float32Array.from(wt) });
}

// the radius eases towards its target over a few frames instead of snapping to it
let rCur = 0,
  easing = false;
// paint during a gesture at most once per animation frame (zoom events can arrive faster than frames)
let pending = null;

function paint(t) {
  const target = radius(t);
  rCur = rCur && S.ADAPT ? rCur * Math.pow(target / rCur, 0.3) : target;
  if (Math.abs(Math.log(rCur / target)) > 0.01) {
    if (!easing) {
      easing = true;
      requestAnimationFrame(() => {
        easing = false;
        if (!pending) paint(d3.zoomTransform(svg.node()));
      });
    }
  } else rCur = target;
  const Wq = W,
    Hq = H,
    N = W * H,
    out = px,
    STEP = S.STEP;
  const sx = t.k * dpr,
    ox = t.x * dpr,
    oy = t.y * dpr,
    rd = rCur * dpr,
    f = S.focus;
  // Float32 coverage read as its bit pattern: for positive floats the bits grow monotonically with log2(value),
  // piecewise-linearly, which is close enough for binning and much cheaper than Math.log on every pixel
  if (!TI || TI.buffer !== T.buffer) TI = new Int32Array(T.buffer);
  const trace = f >= 0 || S.FILTERED,
    x80 = S.INC80 ? -1 : A8; // x80: 80+ abstainers, when left out
  T.fill(0, 0, N);
  if (trace) O.fill(0, 0, N);
  // T is total coverage per pixel (with a candidate in focus, only theirs; O holds everyone else's, drawn as
  // a faint grey trace). A pixel's colour is the last dot drawn on it, not the average: dots are shuffled, so
  // that is a random pick weighted by each candidate's share, and dense mixed places read as blue-and-orange
  // speckle (as in Cable's and CartoDB's maps) instead of averaging complementary hues into grey.
  // Sub-pixel dots add their area to the one pixel they fall in: crisp and saturated (sharing it across
  // neighbours looked washed out). Larger dots are anti-aliased discs at their exact sub-pixel centre, adding ~1
  // per covered pixel; fringe pixels add partial coverage but only take the colour when mostly inside.
  // Each layer (one year, or one per side when comparing) draws only within its own columns [xa, xb), into the
  // same buffers, so both sides share one opacity scale and stay comparable.
  // Municipalities outside the studio filters go to the grey trace (O), like the other candidates under focus.
  for (const { P, C, S: GS, GP, x0, x1 } of layers()) {
    const xa = Math.round(x0 * dpr),
      xb = Math.round(x1 * dpr);
    for (let g = 0; g < GP.length; g++) {
      const out_ = !GP[g],
        i0 = first(GS[g]),
        i1 = GS[g + 1];
      if (rd < 0.5) {
        const area = Math.PI * rd * rd; // below .5 px a disc covers about one pixel anyway: switching here keeps growth continuous
        for (let i = i0; i < i1; i += STEP) {
          const x = (P[2 * i] * sx + ox) | 0,
            y = (P[2 * i + 1] * sx + oy) | 0;
          if (x < xa || x >= xb || y < 0 || y >= Hq) continue;
          const j = y * Wq + x,
            c0 = C[i],
            c = DC[c0];
          if (HID[c] || c0 === x80) continue;
          if (!out_ && (f < 0 || c === f)) {
            T[j] += area;
            TOP[j] = c;
          } else O[j] += area;
        }
      } else {
        const { Rr, start, off, wt } = stamps(rd);
        for (let i = i0; i < i1; i += STEP) {
          const fx = P[2 * i] * sx + ox - 0.5,
            fy = P[2 * i + 1] * sx + oy - 0.5,
            X = Math.floor(fx),
            Y = Math.floor(fy);
          if (X < xa - Rr || X >= xb + Rr || Y < -Rr || Y >= Hq + Rr) continue;
          const c0 = C[i],
            c = DC[c0];
          if (HID[c] || c0 === x80) continue;
          const mine = !out_ && (f < 0 || c === f),
            p = (((fy - Y) * PH) | 0) * PH + (((fx - X) * PH) | 0);
          const inside = X >= xa + Rr && X < xb - Rr && Y >= Rr && Y < Hq - Rr;
          for (let q2 = start[p], e = start[p + 1]; q2 < e; q2++) {
            const x = X + off[2 * q2],
              y = Y + off[2 * q2 + 1];
            if (!inside && (x < xa || x >= xb || y < 0 || y >= Hq)) continue;
            const j = y * Wq + x,
              a = wt[q2];
            if (mine) {
              T[j] += a;
              if (a >= 0.5 || T[j] === a) TOP[j] = c;
            } else O[j] += a;
          }
        }
      }
    }
  }
  // histogram-equalised opacity (as in Datashader's eq_hist): pixels are ranked by coverage within the
  // current view, so a pixel with 50 overlapping dots reads denser than one with 5 instead of both saturating.
  // A sample of pixels is counted into 1024 log-coverage bins, and the running count gives each bin its rank.
  let ilo = 2147483647,
    ihi = 0,
    m = 0;
  for (let j = 0; j < N; j += 7) {
    const v = TI[j];
    if (v) {
      m++;
      if (v < ilo) ilo = v;
      if (v > ihi) ihi = v;
    }
  }
  const sc = 1023 / Math.max(1, ihi - ilo),
    hist = new Uint32Array(1024),
    LUT = new Uint8Array(1024);
  for (let j = 0; j < N; j += 7) {
    const v = TI[j];
    if (v) hist[((v - ilo) * sc) | 0]++;
  }
  const dim = S.ARROWS ? 0.3 : 1; // under swing arrows the dots recede
  for (let b = 0, below = 0; b < 1024; b++) {
    LUT[b] = 255 * dim * (ALO + ((1 - ALO) * below) / Math.max(1, m));
    below += hist[b];
  }
  const grey = ((22 << 24) | (150 << 16) | (150 << 8) | 150) >>> 0;
  for (let j = 0; j < N; j++) {
    const v = TI[j];
    if (!v) {
      out[j] = trace && O[j] ? grey : 0;
      continue;
    }
    let b = ((v - ilo) * sc) | 0;
    b = b < 0 ? 0 : b > 1023 ? 1023 : b;
    out[j] = ((LUT[b] << 24) | PX[TOP[j]]) >>> 0;
  }
  cx.putImageData(img, 0, 0);
  if (S.ARROWS) drawArrows(cx, t, W, H);
  drawn = t;
  cv.style.transform = "";
}

// Cross-fade: the old frame is copied to the ghost canvas on top, which fades out while the new one shows beneath.
// Changes in quick succession (a slider being dragged) skip it, so the map follows the hand without lag; a zoom
// cuts it short, since the old frame would sit still over a moving map.
const FADE = 450,
  still = matchMedia("(prefers-reduced-motion: reduce)");
let lastRepaint = 0,
  fade = null;
function crossfade() {
  const now = performance.now(),
    quick = now - lastRepaint < 150;
  lastRepaint = now;
  if (still.matches || quick || !W) return;
  gx.clearRect(0, 0, W, H);
  gx.drawImage(cv, 0, 0);
  fade?.cancel();
  fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, easing: "ease-out" });
}
function cutFade() {
  if (fade && fade.playState === "running") fade.playbackRate = Math.max(fade.playbackRate, 4);
}

// paint on the next frame (during zoom gestures)
// The view the canvas was last painted at. A paint can take longer than a frame, so between paints the canvas is
// moved and scaled by CSS to the current view: the dots then keep pace with the borders and names, drawn in SVG.
let drawn = null;
function follow(t) {
  if (!drawn) return;
  const r = t.k / drawn.k;
  cv.style.transformOrigin = "0 0";
  cv.style.transform = `translate(${t.x - drawn.x * r}px,${t.y - drawn.y * r}px) scale(${r})`;
}

export function schedulePaint(t) {
  cutFade();
  follow(t);
  if (!pending)
    requestAnimationFrame(() => {
      paint(pending);
      pending = null;
    });
  pending = t;
}

// paint now, at the current zoom, and record the view in the URL
// fade: false for direct manipulation (dragging the divider), which should follow the hand without a fade
export function repaint(fade = true) {
  if (!W) return; // before the first layout
  if (fade) crossfade();
  else cutFade();
  paint(d3.zoomTransform(svg.node()));
  saveSoon();
}
