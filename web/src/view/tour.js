// A short guided tour on the first visit to the story: a few stops, each a spotlight on a part of the page and a
// card saying what to do with it. It waits a moment after the map is drawn and stands aside if the reader has
// already started (scrolled, swiped, clicked, pressed a key). The "?" button replays it. Seen once, it stays away
// (localStorage, best effort: a blocked store just means it may show again).
import * as d3 from "d3";
import { onLang, t } from "../i18n/index.js";
import { hintDone } from "./hints.js";

const KEY = "hbv-tour-seen";
const phone = matchMedia("(max-width: 900px)");
// on screen: laid out with a size (fixed elements have no offsetParent, so that can't be the test)
const shown = (el) => {
  const r = el?.getBoundingClientRect();
  return !!r && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};
const rectOf = (sel) => {
  const el = document.querySelector(sel);
  return shown(el) ? el.getBoundingClientRect() : null;
};

// each stop: the area lit (a rectangle, or null for none) and its copy, tour.<id> (a phone variant at <id>Phone)
const STOPS = [
  { id: "card", at: () => rectOf("#steps .step.on") || rectOf("#steps .step") },
  { id: "dots", at: () => rectOf("#prog") },
  {
    id: "map",
    // the map's open part: right of the story column, or above the card on phones
    at: () => {
      const w = document.getElementById("wrap").getBoundingClientRect(),
        a = document.querySelector("aside").getBoundingClientRect(),
        card = rectOf("#steps .step.on");
      if (phone.matches)
        return new DOMRect(w.left + 12, a.top + 90, w.width - 24, (card ? card.top : w.bottom) - a.top - 110);
      return new DOMRect(a.right + 16, w.top + 100, w.right - a.right - 32, w.height - 180);
    },
  },
  { id: "key", at: () => rectOf("#vkey:not([hidden])") || rectOf(".mapbar .key") },
  { id: "tabs", at: () => rectOf("#tab-explore") },
  { id: "replayHelp", at: () => rectOf("#tourbtn") },
];

let i = -1,
  box,
  spot,
  card;

function place() {
  const s = STOPS[i],
    r = s.at(),
    pad = 6,
    vw = innerWidth,
    vh = innerHeight;
  if (r) {
    spot.style.display = "";
    Object.assign(spot.style, {
      left: r.left - pad + "px",
      top: r.top - pad + "px",
      width: r.width + 2 * pad + "px",
      height: r.height + 2 * pad + "px",
    });
  } else spot.style.display = "none";
  const live = STOPS.filter((x) => x === s || x.at()),
    last = s === live[live.length - 1];
  const key = phone.matches && t(`tour.${s.id}Phone`) !== `tour.${s.id}Phone` ? `${s.id}Phone` : s.id;
  card.innerHTML =
    `<button class="tx" data-a="skip" aria-label="${t("tour.closeX")}">×</button>` +
    `<p class="tc" aria-label="${live.indexOf(s) + 1} / ${live.length}">` +
    live.map((x) => `<i${x === s ? ' class="on"' : ""}></i>`).join("") +
    `</p><p>${t("tour." + key)}</p>` +
    `<div class="tb">` +
    (last ? "" : `<button class="link" data-a="skip">${t("tour.skip")}</button>`) +
    (i > 0 ? `<button data-a="prev">${t("tour.prev")}</button>` : "") +
    `<button class="go" data-a="${last ? "skip" : "next"}">${t(last ? "tour.close" : "tour.next")}</button>` +
    `</div>`;
  // the card goes beside the lit area where there is room: right, below, above, left; else centred
  const cw = card.offsetWidth,
    ch = card.offsetHeight,
    g = 14,
    m = 12;
  let x = (vw - cw) / 2,
    y = (vh - ch) / 2;
  if (r) {
    if (r.right + g + cw < vw - m) [x, y] = [r.right + g, r.top];
    else if (r.bottom + g + ch < vh - m) [x, y] = [r.left, r.bottom + g];
    else if (r.top - g - ch > m) [x, y] = [r.left, r.top - g - ch];
    else if (r.left - g - cw > m) [x, y] = [r.left - g - cw, r.top];
    else [x, y] = [(vw - cw) / 2, r.top > vh / 2 ? m + 40 : vh - ch - m];
  }
  card.style.left = Math.max(m, Math.min(vw - cw - m, x)) + "px";
  card.style.top = Math.max(m, Math.min(vh - ch - m, y)) + "px";
  card.querySelector(".go").focus({ preventScroll: true });
}

// a stop whose part isn't on screen (the dot map's key on phones) is passed over, in the direction of travel
function go(j) {
  const d = j < i ? -1 : 1;
  while (j > 0 && j < STOPS.length && !STOPS[j].at()) j += d;
  if (j < 0 || j >= STOPS.length) return end();
  i = j;
  place();
}

function end() {
  i = -1;
  box.hidden = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // no storage: the tour may show again next time
  }
}

export function startTour() {
  if (!document.getElementById("page").classList.contains("storymode")) document.getElementById("tab-story").click();
  hintDone("maphint");
  box.hidden = false;
  go(0);
}

const seen = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export function initTour() {
  box = d3.select("body").append("div").attr("class", "tour").attr("hidden", true).node();
  spot = d3.select(box).append("div").attr("class", "tspot").node();
  card = d3
    .select(box)
    .append("div")
    .attr("class", "tcard")
    .attr("role", "dialog")
    .attr("aria-modal", "true")
    .attr("aria-label", t("tour.title"))
    .node();
  box.addEventListener("click", (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (a === "next") go(i + 1);
    else if (a === "prev") go(i - 1);
    else if (a === "skip") end();
  });
  addEventListener(
    "keydown",
    (e) => {
      if (i < 0) return;
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight" || e.key === "Enter") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  addEventListener("resize", () => i >= 0 && place());
  onLang(() => {
    card.setAttribute("aria-label", t("tour.title"));
    if (i >= 0) place();
  });
  d3.select("#tourbtn").on("click", startTour);

  // first visit: only on the story's opening, not a shared link to a step or a view, nor an embed
  const u = new URLSearchParams(location.search);
  if (seen() || u.has("step") || u.has("embed") || location.hash.length > 1) return;
  let acted = false;
  const act = () => (acted = true);
  const evs = ["wheel", "touchstart", "keydown", "pointerdown"];
  evs.forEach((ev) => addEventListener(ev, act, { once: true, passive: true, capture: true }));
  setTimeout(() => {
    evs.forEach((ev) => removeEventListener(ev, act, { capture: true }));
    if (!acted && document.getElementById("page").classList.contains("storymode")) startTour();
  }, 1800);
}
