// Per-municipality figures from the data: shares, abstention, shifts between the two years
import * as d3 from "d3";
import { YEARS } from "./data.js";
import { A8, AB, AO, CI, S, YS } from "./state.js";

// state capitals, by IBGE code
export const CAPITALS = new Set(
  (
    "1100205 1200401 1302603 1400100 1501402 1600303 1721000 2111300 2211001 2304400 2408102 2507507 2611606 " +
    "2704302 2800308 2927408 3106200 3205309 3304557 3550308 4106902 4205407 4314902 5002704 5103403 5208707 5300108"
  ).split(" "),
);

// Without 80+ (the studio switch), their abstainers and their eligible voters (from TSE's voter profile, which can
// differ from election-day counts by up to ~2%) leave the rates
export const tally = (y, m) => {
  const d = m && m.y[y];
  if (!d) return null;
  let ab = d.c[AB] + d.c[AO] + d.c[A8],
    all = d3.sum(d.c) + d.bn;
  const valid = all - ab - d.bn;
  if (!S.INC80) {
    ab -= d.c[A8];
    all -= Math.max(d.e80, d.c[A8]);
  }
  return { d, ab, all, valid };
};
// a camp's share of valid votes, and its change 2022→2026 in points (ballot numbers 13 and 22 are the same camp in
// both years)
export const share = (y, m, k) => {
  const t = tally(y, m);
  return t && t.valid ? (100 * t.d.c[CI(k)]) / t.valid : null;
};
export const lulaShift = (m) => {
  const a = share(YS[0], m, "13"),
    b = share(YS[1], m, "13");
  return a == null || b == null ? null : a - b;
};
// the named candidate with the most votes (its category), and whether that changed between the years: 1 or 0
export const leader = (y, m) => {
  const t = tally(y, m);
  if (!t || !t.valid) return null;
  return d3.greatest(
    YEARS[y].cands.filter((c) => c.k),
    (c) => t.d.c[c.i],
  ).i;
};
export const flipped = (m) => {
  const a = leader(YS[0], m),
    b = leader(YS[1], m);
  return a == null || b == null ? null : +(a !== b);
};
export const abRate = (y, m) => {
  const t = tally(y, m);
  return t && t.all ? (100 * t.ab) / t.all : null;
};
// valid votes, in the newer year where there is one: sorts places by size
export const votesCast = (m) => {
  const d = m.y[YS[0]] || Object.values(m.y)[0];
  return d3.sum(d.c) - d.c[AB] - d.c[AO] - d.c[A8];
};
