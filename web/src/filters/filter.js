// Studio filters: municipalities outside every slider's range are dimmed on the map and left out of the totals.
// PASS is per feature of MG (municipality shapes). A group (one polling place's dots, or a municipality's unplaced
// ones) passes when its municipality passes the municipal filters and its place the neighbourhood ones.
import * as d3 from "d3";
import { M, MG, ORDER } from "../data.js";
import { DOT } from "../dots.js";
import { fmt, showVal } from "../format.js";
import { onLang, t } from "../i18n/index.js";
import { repaint } from "../map/render.js";
import { panelIfShown } from "../panel/results.js";
import { S, YS } from "../state.js";
import { VARS, hi_, isOn, lo_ } from "./vars.js";

export const PASS = new Uint8Array(MG.features.length).fill(1);
export const codeOf = MG.features.map((f) => f.properties.codarea);

// Filter results are cached by their signature (story steps reuse them, and are precomputed in idle time)
const FCACHE = new Map();
onLang(() => {
  FCACHE.clear();
  refilter();
});
const fsig = () =>
  VARS.filter(isOn)
    .map((v) => `${v.k}:${lo_(v)}:${hi_(v)}${v.dyn ? ":" + S.YEAR : ""}`)
    .join("|") +
  "|" +
  (S.INSET ? [...S.INSET].join(",") : "") +
  "|" +
  S.INC80;

export function refilter() {
  computeFilter();
  panelIfShown();
  repaint();
}

// what the current filter is, in words: the area, then each active filter with its bounds
export function describeFilter() {
  const out = [];
  if (S.INSET) {
    const ks = [...S.INSET],
      ufs = new Set(ks.map((k) => M[k] && M[k].uf));
    out.push(
      ks.length === 1
        ? M[ks[0]].n
        : ufs.size === 1 && ks.length === Object.keys(M).filter((k) => M[k].uf === [...ufs][0]).length
          ? t("filters.state", { uf: [...ufs][0] })
          : t("filters.nMunis", { n: fmt(ks.length) }),
    );
  }
  for (const v of VARS) {
    if (!isOn(v)) continue;
    const a = v.vlo != null || v.lo > 0,
      b = v.vhi != null || v.hi < 100,
      l = lo_(v),
      h = hi_(v);
    // income bounds sit on a class threshold: nudge them inside so the class label is the right one
    const nudge = v.k === "setor_renda_resp_media" ? 1 : 0;
    const range =
      a && b ? showVal(v, l) + " – " + showVal(v, h) : a ? "≥ " + showVal(v, l + nudge) : "≤ " + showVal(v, h - nudge);
    const where = !v.place ? "" : t(v.at ? "filters.atPlace" : "filters.aroundPlace");
    out.push(`${v.n}${where}: ${range}`);
  }
  return out;
}

function showFilter() {
  const d = describeFilter();
  d3.select("#fbadge")
    .property("hidden", !d.length)
    .html(d.length ? `<b>${t("filters.showingOnly")}</b> ${d.map((x) => `<span>${x}</span>`).join("")}` : "");
}

function showCount(label) {
  d3.select("#fcount").text(label);
  d3.select("#fclear").property("hidden", !S.FILTERED);
  showFilter();
}

export function computeFilter() {
  const act = VARS.filter(isOn),
    mact = act.filter((v) => !v.place),
    pact = act.filter((v) => v.place);
  S.FILTERED = act.length > 0 || !!S.INSET;
  S.PLACEF = pact.length > 0;
  const key = fsig(),
    hit = FCACHE.get(key);
  if (hit) {
    PASS.set(hit.pass);
    for (const y of YS) DOT[y].GP.set(hit.gp[y]);
    showCount(hit.label);
    return;
  }
  let n = 0;
  MG.features.forEach((f, fi) => {
    const m = M[f.properties.codarea];
    let ok = !!m && (!S.INSET || S.INSET.has(f.properties.codarea));
    for (const v of mact) {
      if (!ok) break;
      const x = v.get(m);
      ok = x != null && x >= lo_(v) && x <= hi_(v);
    }
    PASS[fi] = ok ? 1 : 0;
    if (ok) n++;
  });
  let np = 0,
    npt = 0;
  for (const y of YS) {
    const D = DOT[y];
    for (let r = 0; r < ORDER.length; r++) {
      const mp = PASS[ORDER[r]];
      for (let g = D.GM[r]; g < D.GM[r + 1]; g++) {
        let ok = mp;
        const row = D.GR[g];
        for (const v of pact) {
          if (!ok) break;
          const x = v.val(row);
          ok = x != null && x >= lo_(v) && x <= hi_(v);
        }
        D.GP[g] = ok ? 1 : 0;
        if (y === S.YEAR && row >= 0) {
          npt++;
          if (ok) np++;
        }
      }
    }
  }
  const label = !S.FILTERED
    ? t("filters.all")
    : S.PLACEF
      ? t("filters.places", { n: fmt(np), total: fmt(npt) })
      : t("filters.munis", { n: fmt(n), total: fmt(Object.keys(M).length) });
  showCount(label);
  FCACHE.set(key, {
    pass: PASS.slice(),
    gp: Object.fromEntries(YS.map((y) => [y, DOT[y].GP.slice()])),
    label,
  });
  if (FCACHE.size > 40) FCACHE.delete(FCACHE.keys().next().value);
}
