import * as d3 from "d3";
import { LANG, t } from "./i18n/index.js";

// numbers in the page's locale: num(1234.5, 1) is "1,234.5" in English, "1.234,5" in Portuguese
const NF = new Map();
export const num = (v, d = 0) => {
  if (!NF.has(d)) NF.set(d, new Intl.NumberFormat(LANG, { minimumFractionDigits: d, maximumFractionDigits: d }));
  return NF.get(d).format(v);
};
// a number with its unit, as the locale writes it ("12.3%", "4 pp")
export const unit = (u, v) => t("units." + u, { v });
export const pctN = (v, d = 1) => unit("pct", num(v, d));

export const pct = (v, tot) => pctN((100 * v) / tot);
export const fmt = (v) => num(v);
// counts, humanized: 1.2M, 340k
export const hum = (x) =>
  x >= 1e6
    ? unit("million", num(x / 1e6, x >= 1e7 ? 0 : 1))
    : x >= 1e3
      ? unit("thousand", num(Math.round(x / 1e3)))
      : num(Math.round(x));
// a change in points, signed: "+1.2", "−0.4"
export const signed = (v) => (v >= 0 ? "+" : "−") + num(Math.abs(v), 1);

// Brazil's income classes, in minimum wages (R$ 1,212 at the 2022 Census): E up to 2, D 2–4, C 4–10, B 10–20, A above
const SM = 1212;
export const klass = (x) => (x > 20 * SM ? "A" : x > 10 * SM ? "B" : x > 4 * SM ? "C" : x > 2 * SM ? "D" : "E");

// a filter variable's value, in its unit
export const showVal = (v, x) =>
  x == null
    ? "–"
    : v.k === "setor_renda_resp_media"
      ? `${unit("brl", num(Math.round(x / 10) * 10))} (${klass(x)})`
      : v.u === "dens"
        ? unit("perKm2", num(x))
        : v.u === "brl"
          ? unit("brl", num(x < 1000 ? Math.round(x / 10) * 10 : Math.round(x / 100) * 100))
          : v.u === "pct"
            ? pctN(x, x < 10 ? 1 : 0)
            : v.u === "pp"
              ? unit("pp", (x > 0 ? "+" : "") + num(x, 1))
              : d3.format(".2~s")(x).replace("k", " k").replace("M", " M");

// accent- and case-insensitive search key
export const fold = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
