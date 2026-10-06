// Per-municipality figures from the data: shares, abstention, shifts between the two years
import * as d3 from "d3";
import { A8, AB, AO, CI, S, YS } from "./state.js";

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
export const marginShift = (m) => {
  const a = share(YS[0], m, "22"),
    b = share(YS[1], m, "22"),
    c = share(YS[0], m, "13"),
    d = share(YS[1], m, "13");
  return a == null || b == null ? null : a - c - (b - d);
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
