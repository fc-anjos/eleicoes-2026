// The page's copy, by locale. en.json holds every string the reader sees; another locale is a copy of it with the
// values translated (xx.json beside it), picked by ?lang=xx or <html lang>. Keys missing from a locale fall back to
// English. Other locales load lazily, so English costs nothing extra.
import en from "./en.json";

const LOCALES = import.meta.glob(["./*.json", "!./en.json"], { import: "default" });
const want = (new URLSearchParams(location.search).get("lang") || document.documentElement.lang || "en").toLowerCase();
export const LANG = LOCALES[`./${want}.json`] ? want : "en";
const cur = LANG === "en" ? en : await LOCALES[`./${LANG}.json`]();
document.documentElement.lang = LANG;

const get = (o, key) => key.split(".").reduce((x, p) => (x == null ? x : x[p]), o);

// t("panel.show", {name: "Lula"}): the string at that key with {name} filled in; objects and arrays come back as
// they are (story steps). An unknown key returns itself, so it shows up on the page.
export function t(key, params) {
  const s = get(cur, key) ?? get(en, key);
  if (s == null) return key;
  if (typeof s !== "string" || !params) return s;
  return s.replace(/\{(\w+)\}/g, (m, n) => (params[n] != null ? params[n] : m));
}
// the string at that key, or null when no locale has it (labels that fall back to the data's own)
export const tOr = (key, fallback) => get(cur, key) ?? get(en, key) ?? fallback;

// Fill the static page: data-i18n="key" sets the text, data-i18n-html="key" the markup, and
// data-i18n-attr="placeholder:key;aria-label:key2" attributes.
export function applyDom(root = document) {
  document.title = t("meta.title");
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll("[data-i18n-attr]").forEach((el) =>
    el.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":").map((x) => x.trim());
      el.setAttribute(attr, t(key));
    }),
  );
}
