import { LANG, t } from "./i18n/index.js";

// numbers in the page's locale: num(1234.5, 1) is "1,234.5" in English, "1.234,5" in Portuguese
const NF = new Map();
export const num = (v, d = 0) => {
  const k = LANG + d;
  if (!NF.has(k)) NF.set(k, new Intl.NumberFormat(LANG, { minimumFractionDigits: d, maximumFractionDigits: d }));
  return NF.get(k).format(v);
};
// large numbers, short, as the locale writes them: "5.2K"/"40K" in English, "5,2 mil" in Portuguese
const CF = new Map();
export const compact = (v) => {
  if (!CF.has(LANG)) CF.set(LANG, new Intl.NumberFormat(LANG, { notation: "compact", maximumSignificantDigits: 2 }));
  return CF.get(LANG).format(v);
};
// a number with its unit, as the locale writes it ("12.3%", "4 pp")
export const unit = (u, v) => t("units." + u, { v });
export const pctN = (v, d = 1) => unit("pct", num(v, d));

export const pct = (v, tot) => pctN((100 * v) / tot);
export const fmt = (v) => num(v);
// counts, humanized: 1.2M, 340k
export const hum = (x, d) =>
  x >= 1e6
    ? unit(x < 2e6 ? "million1" : "million", num(x / 1e6, d ?? (x >= 1e7 ? 0 : 1)))
    : x >= 1e3
      ? unit("thousand", num(Math.round(x / 1e3)))
      : num(Math.round(x));
// a change in points, signed: "+1.2", "−0.4"
export const signed = (v) => (v >= 0 ? "+" : "−") + num(Math.abs(v), 1);
// a change in points as an arrow and its size, for tables: "▲ 3.8", "▼ 3.3"
export const change = (v) =>
  v == null || isNaN(v)
    ? ""
    : `<span class="chg ${v >= 0 ? "up" : "dn"}" aria-label="${t(v >= 0 ? "units.up" : "units.down", { v: num(Math.abs(v), 1) })}">` +
      `${v >= 0 ? "▲" : "▼"}${num(Math.abs(v), 1)}</span>`;

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
              : compact(x);

// accent- and case-insensitive search key
export const fold = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
