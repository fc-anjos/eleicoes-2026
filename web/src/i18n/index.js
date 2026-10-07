// The page's copy, by locale. en.json holds every string the reader sees; another locale is a copy of it with the
// values translated (xx.json beside it). The language is in the path: the site's root is Portuguese, /en/ English
// (each has its own index.html, so link previews come out in its language). Older links carry ?lang=xx, which still
// works: it picks the language and the address is rewritten to the path. Keys missing from a locale fall back to
// English. Other locales load lazily.
import en from "./en.json";

const LOCALES = import.meta.glob(["./*.json", "!./en.json"], { import: "default" });
const have = (l) => l === "en" || !!LOCALES[`./${l}.json`];
const load = (l) => (l === "en" ? en : LOCALES[`./${l}.json`]());
// the site's root path, whichever language page this is
export const ROOT = location.pathname.replace(/(?:en\/?)?(?:index\.html)?$/, "");
// this address in language l: the root for Portuguese, root + "en/" for English, ?lang= dropped
export function langUrl(l, href = location.href) {
  const u = new URL(href);
  u.pathname = ROOT + (l === "en" ? "en/" : "");
  u.searchParams.delete("lang");
  return u;
}
const asked = (new URLSearchParams(location.search).get("lang") || "").toLowerCase();
export let LANG = have(asked) ? asked : location.pathname.slice(ROOT.length).startsWith("en") ? "en" : "pt";
if (asked || location.pathname !== langUrl(LANG).pathname) history.replaceState(history.state, "", langUrl(LANG));
let cur = await load(LANG);
document.documentElement.lang = LANG === "pt" ? "pt-BR" : LANG;

// Switching language in place: load the locale, refill the static page, then let each module redraw its own text
// (onLang). The address moves to that language's path, so a reload or a shared link keeps it.
const listeners = [];
export const onLang = (fn) => listeners.push(fn);
export async function setLang(l) {
  if (l === LANG || !have(l)) return;
  cur = await load(l);
  LANG = l;
  document.documentElement.lang = l === "pt" ? "pt-BR" : l;
  history.replaceState(history.state, "", langUrl(l));
  applyDom();
  listeners.forEach((fn) => fn(l));
}

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
  // the language switch: switches in place; the href is for opening in a new tab
  root.querySelectorAll("[data-lang]").forEach((a) => {
    const u = langUrl(a.dataset.lang);
    a.href = u.pathname + u.search + u.hash;
    a.onclick = (e) => {
      e.preventDefault();
      setLang(a.dataset.lang);
    };
    if (a.dataset.lang === LANG) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
}
