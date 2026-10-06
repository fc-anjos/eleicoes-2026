import * as d3 from "d3";

export const pct = (v, t) => ((100 * v) / t).toFixed(1) + "%";
export const fmt = d3.format(",");
// counts, humanized: 1.2M, 340k
export const hum = (x) =>
  x >= 1e6 ? (x / 1e6).toFixed(x >= 1e7 ? 0 : 1) + "M" : x >= 1e3 ? Math.round(x / 1e3) + "k" : String(Math.round(x));
// a change in points, signed: "+1.2", "−0.4"
export const signed = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);

// Brazil's income classes, in minimum wages (R$ 1,212 at the 2022 Census): E up to 2, D 2–4, C 4–10, B 10–20, A above
const SM = 1212;
export const klass = (x) => (x > 20 * SM ? "A" : x > 10 * SM ? "B" : x > 4 * SM ? "C" : x > 2 * SM ? "D" : "E");

// a filter variable's value, in its unit
export const showVal = (v, x) =>
  x == null
    ? "–"
    : v.k === "setor_renda_resp_media"
      ? `R$ ${d3.format(",.0f")(Math.round(x / 10) * 10)} (${klass(x)})`
      : v.u === "dens"
        ? d3.format(",.0f")(x) + "/km²"
        : v.u === "brl"
          ? "R$ " + d3.format(",.0f")(x < 1000 ? Math.round(x / 10) * 10 : Math.round(x / 100) * 100)
          : v.u === "pct"
            ? x.toFixed(x < 10 ? 1 : 0) + "%"
            : v.u === "pp"
              ? (x > 0 ? "+" : "") + x.toFixed(1) + " pp"
              : d3.format(".2~s")(x).replace("k", " k").replace("M", " M");

// accent- and case-insensitive search key
export const fold = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
