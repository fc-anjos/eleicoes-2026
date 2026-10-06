// Filter variables: neighbourhood ones per polling place (PLACES), municipal ones (STUDIO, from build.py), and three
// computed here: the change in Lula's share, the abstention rate in the year shown and its change since the other.
import * as d3 from "d3";
import { M, MG, PLACES, STUDIO } from "../data.js";
import { onLang, tOr } from "../i18n/index.js";
import { S, YS } from "../state.js";
import { abRate, flipped, lulaShift } from "../stats.js";

// neighbourhood variables, per polling place (PLACES: one byte per place and variable, column by column; 255 = none)
const PB = (() => {
  const bin = atob(PLACES.b),
    a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
})();
const PVARS = PLACES.vars.map((v, j) => {
  const [lo, hi] = v.r,
    dec =
      v.enc === "log"
        ? (b) => Math.exp(Math.log(lo) + (b / 254) * (Math.log(hi) - Math.log(lo)))
        : (b) => lo + (b / 254) * (hi - lo);
  return {
    ...v,
    place: true,
    j,
    val: (row) => {
      if (row < 0) return null;
      const b = PB[j * PLACES.n + row];
      return b === 255 ? null : dec(b);
    },
  };
});

// names and sources come from the locale (i18n "vars"), falling back to the data's own English
// (n0/src0); relabelled when the language changes
const label = (v) => Object.assign(v, { n: tOr(`vars.${v.k}.n`, v.n0), src: tOr(`vars.${v.k}.src`, v.src0) });
const named = (v) => label({ ...v, n0: v.n, src0: v.src });
export const VARS = [
  ...PVARS,
  ...STUDIO.map((v, j) => ({ ...v, get: (m) => (m.x ? m.x[j] : null) })),
  { k: "dlula", u: "pp", get: (m) => lulaShift(m) },
  // a yes/no variable: a filter on it (flip@1~*) reads as its name alone
  { k: "flip", flag: true, get: (m) => flipped(m) },
  { k: "abst", u: "pct", get: (m) => abRate(S.YEAR, m), dyn: true },
  {
    k: "dabst",
    u: "pp",
    get: (m) => {
      const a = abRate(YS[0], m),
        b = abRate(YS[1], m);
      return a == null || b == null ? null : S.YEAR === YS[0] ? a - b : b - a;
    },
    dyn: true,
  },
].map(named);
onLang(() => VARS.forEach(label));

// sliders move by municipality count (0–100 = quantiles of the values): income and population are very skewed
export function quantiles(v) {
  const s = (v.place ? d3.range(PLACES.n).map(v.val) : MG.features.map((f) => v.get(M[f.properties.codarea] || {})))
    .filter((x) => x != null)
    .sort((a, b) => a - b);
  return d3.range(101).map((i) => s[Math.round((i * (s.length - 1)) / 100)]);
}
VARS.forEach((v) => {
  v.q = quantiles(v);
  v.lo = 0;
  v.hi = 100;
});

// bounds of a filter: by slider position (quantile), or exact values set by a story step (vlo/vhi)
export const lo_ = (v) => (v.vlo != null ? v.vlo : v.q[v.lo]),
  hi_ = (v) => (v.vhi != null ? v.vhi : v.q[v.hi]);
export const isOn = (v) => v.lo > 0 || v.hi < 100;
export function resetVar(v) {
  v.lo = 0;
  v.hi = 100;
  v.vlo = v.vhi = null;
}
