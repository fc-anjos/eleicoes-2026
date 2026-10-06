// Totals for the panel and the story cards. Unfiltered, the figures are the official national ones (including votes
// cast abroad); filtered, they are the totals of the municipalities that pass.
import * as d3 from "d3";
import { M, MG, ORDER, VPD, YEARS } from "./data.js";
import { DOT } from "./dots.js";
import { PASS, codeOf } from "./filters/filter.js";
import { A8, AB, AO, K, S } from "./state.js";

// With neighbourhood filters on, totals come from the dots of the passing groups (each dot is VPD people);
// blank/null votes and 80+ eligible voters are added in each municipality's own proportion.
function dotTotals(y) {
  const D = DOT[y],
    c = new Array(K).fill(0);
  let bn = 0,
    e80 = 0;
  for (let r = 0; r < ORDER.length; r++) {
    const m = M[codeOf[ORDER[r]]],
      d = m && m.y[y];
    const cm = new Array(K).fill(0);
    let any = 0;
    for (let g = D.GM[r]; g < D.GM[r + 1]; g++) {
      if (!D.GP[g]) continue;
      any = 1;
      for (let i = D.S[g]; i < D.S[g + 1]; i++) cm[D.C[i]] += VPD;
    }
    if (!any) continue;
    cm.forEach((v, i) => (c[i] += v));
    if (d) {
      const val = d3.sum(d.c) - d.c[AB] - d.c[AO] - d.c[A8],
        vv = d3.sum(cm) - cm[AB] - cm[AO] - cm[A8];
      bn += val ? (d.bn * vv) / val : 0;
      e80 += d.c[A8] ? (Math.max(d.e80, d.c[A8]) * cm[A8]) / d.c[A8] : 0;
    }
  }
  return { c, bn, e80 };
}

function totals(y) {
  if (S.PLACEF) return dotTotals(y);
  const c = new Array(K).fill(0);
  let bn = 0,
    e80 = 0;
  MG.features.forEach((f, fi) => {
    if (!PASS[fi]) return;
    const d = (M[f.properties.codarea] || { y: {} }).y[y];
    if (!d) return;
    d.c.forEach((v, i) => (c[i] += v));
    bn += d.bn;
    e80 += Math.max(d.e80, d.c[A8]);
  });
  return { c, bn, e80 };
}

// counts by category (c), abstention (ab), valid votes, everyone on the roll (all), blank/null (bn), 80+ voters (e80)
export function figures(y) {
  const Y = YEARS[y],
    t = totals(y);
  if (!S.FILTERED) {
    // official national figures; abroad, abstention is split by age like at home
    t.c = t.c.slice();
    const dom = t.c[AB] + t.c[AO] + t.c[A8] || 1,
      o = t.c[AO] / dom,
      e = t.c[A8] / dom;
    Y.cands.forEach((c) => (t.c[c.i] = c.v));
    t.c[AO] = Math.round(Y.a * o);
    t.c[A8] = Math.round(Y.a * e);
    t.c[AB] = Y.a - t.c[AO] - t.c[A8];
    t.bn = Y.bn;
  }
  let ab = t.c[AB] + t.c[AO] + t.c[A8];
  const valid = d3.sum(t.c) - ab;
  let all = valid + ab + t.bn;
  if (!S.INC80) {
    ab -= t.c[A8];
    all -= t.e80;
  }
  return { ...t, ab, valid, all };
}

// the national figures, for "x% of all": computed with no filter, without touching what the map shows
export function natFig(y) {
  const f = S.FILTERED,
    pf = S.PLACEF,
    ps = PASS.slice();
  S.FILTERED = S.PLACEF = false;
  PASS.fill(1);
  const t = figures(y);
  S.FILTERED = f;
  S.PLACEF = pf;
  PASS.set(ps);
  return t;
}
