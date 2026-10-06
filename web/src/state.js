import * as d3 from "d3";
import { CATS, YEARS } from "./data.js";

export const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// colour categories are shared by both years (see categories() in build.py): candidates keyed by ballot number, so
// a camp keeps its colour from one year to the other, then "Others", then abstentions by age: AB for people who had
// to vote (18–69), AO for those for whom voting is optional (16–17, 70–79), A8 for 80+
export const K = CATS.length,
  OT = K - 4,
  AB = K - 3,
  AO = K - 2,
  A8 = K - 1,
  YS = Object.keys(YEARS).sort().reverse();
export const nameOf = (y, k) => YEARS[y].names[k] || k;
export const CI = (k) => CATS.findIndex((c) => c.k === k);
export const catOf = (k) => CATS.findIndex((c) => (c.k || "others") === k);
export const otherYear = (y) => YS.find((v) => v !== y);

// What the view shows, shared by every module. Each field is set by the controls, the story or the URL.
export const S = {
  YEAR: YS[0], // the year shown (the side panel's year in compare mode)
  COMPARE: false, // compare mode: the older year left of the divider, the newer right
  SPLIT: 0.5, // the divider's position (0–1)
  focus: -1, // the category shown alone, or -1
  SPLITA: false, // abstention split by age
  INC80: true, // 80+ abstainers and voters counted
  FILTERED: false, // some filter or area is on
  PLACEF: false, // some neighbourhood (polling-place) filter is on
  INSET: null, // the area: a Set of IBGE codes the map and totals are limited to, or null
  ARROWS: false, // swing arrows shown
  SIZE: 1, // dot radius multiplier
  STEP: 1, // draw every STEP-th dot
  ADAPT: true, // adaptive dot size (else by zoom)
  sel: null, // the selected municipality (a feature of MG)
  NOTES: [], // map notes of the current story step
  restoring: true, // applying a view: don't write the hash back meanwhile
  w: 0, // the map's size in css px
  h: 0,
  layoutGen: 0, // bumped on every layout, so cached screen positions know to refresh
};

// localStorage, failing quietly (private windows, blocked storage)
export const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* not stored */
    }
  },
};

// Display state, per category: visible or hidden, and its colour (the controls in each panel row). Colours start
// from the CSS tokens; changes and hidden rows are remembered in this browser. Unless abstention is split by age,
// its two categories draw as one (DC maps each category to the one it draws as).
export const DEF_COLS = CATS.map((c) => css("--" + c.col));
export const COLS = DEF_COLS.slice();
export const HID = new Uint8Array(K),
  DC = Uint8Array.from({ length: K }, (_, i) => i);
{
  const c = store.get("cols"),
    hd = store.get("hid");
  if (c && c.length === K)
    c.forEach((v, i) => {
      if (/^#[0-9a-f]{6}$/i.test(v)) COLS[i] = v;
    });
  if (hd && hd.length === K) HID.set(hd);
}
// colours packed for the canvas, little-endian RGB
export const PX = new Uint32Array(K);
export function packCols() {
  DC[AO] = S.SPLITA ? AO : AB;
  DC[A8] = S.SPLITA ? A8 : AB;
  COLS.forEach((h, i) => {
    const c = d3.rgb(h);
    PX[i] = ((c.b << 16) | (c.g << 8) | c.r) >>> 0;
  });
}
packCols();
export const hidden = (c) => HID[DC[c]];
