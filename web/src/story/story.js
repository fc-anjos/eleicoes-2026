// Story: steps (story.json) in the left column; the step nearest the column's middle drives the map, which flies to
// that step's view. A small live total sits at the top, so filtered steps show their numbers. Explore is the full
// panel. Opening with a view in the hash starts in Explore at that view.
import * as d3 from "d3";
import { CATS, M, STORY } from "../data.js";
import { computeFilter, describeFilter } from "../filters/filter.js";
import { VARS } from "../filters/vars.js";
import { change, hum, pctN } from "../format.js";
import { onLang, t } from "../i18n/index.js";
import { layout, panLimits, svg, zoom } from "../map/base.js";
import { setNotes } from "../map/notes.js";
import { repaint } from "../map/render.js";
import { panel } from "../panel/results.js";
import { AB, COLS, S, YS, nameOf, otherYear } from "../state.js";
import { figures, natFig } from "../totals.js";
import { PANEL, applyState, restoring, saveSoon, setFiltersFrom } from "../view/hash.js";
import { hintDone } from "../view/hints.js";
import { tween } from "../view/tween.js";
import { chart } from "./charts.js";
import { findStep } from "./find.js";

const viewOf = (i) => STORY[i].view;
// a step's copy (i18n story.steps.<id>): headline h, text t, note labels in order, chart title and labels
const copyOf = (d) => t(`story.steps.${d.id}`);
const notesOf = (i) => (STORY[i].notes || []).map((n, j) => ({ ...n, t: copyOf(STORY[i]).notes[j] }));
let steps, prog;
// phones step through the story sideways (see the end of story.css); wider screens scroll it
const phone = matchMedia("(max-width: 900px)");
// bring step i on screen, in the column or in the phone's panel
function showStep(i, smooth) {
  if (smooth && i !== stepNow) {
    aim = i;
    clearTimeout(aimT);
    aimT = setTimeout(() => (aim = null), 2000); // in case the scroll is cut short
  }
  const el = steps.nodes()[i],
    beh = smooth ? "smooth" : "instant";
  if (phone.matches) {
    el.parentNode.scrollTo({ left: el.offsetLeft, behavior: beh });
    goStep(i);
  } else {
    const aside = document.querySelector("aside");
    aside.scrollTo({ top: el.offsetTop - aside.clientHeight * 0.4, behavior: beh });
  }
}
let stepNow = -1;

// the first view (on opening the story, or a shared link to a step) is set in place, not flown to
let jump = false;

// phones: the panel takes the step's own height (up to the panel's set height); the map frames its view above
function fitPanel(i) {
  if (!phone.matches || i < 0) return;
  const h = steps.nodes()[i].offsetHeight;
  document.documentElement.style.setProperty("--card-h", h + "px");
  PANEL.f = h / innerHeight;
}

const SETTLE = 350;
let settleT = 0,
  // a step the reader jumped to (by a dot or ‹ ›): the steps scrolled past on the way there are skipped
  aim = null,
  aimT = 0;

function goStep(i) {
  if (aim != null) {
    if (i !== aim) return;
    aim = null;
  }
  if (i > 0) hintDone("maphint");
  if (i === stepNow) return;
  stepNow = i;
  steps.classed("on", (d, j) => j === i);
  prog.attr("aria-current", (d, j) => (j === i ? "step" : null));
  d3.select("#sprev").property("disabled", i === 0);
  d3.select("#snext").property("disabled", i === STORY.length - 1);
  fitPanel(i);
  if (jump) {
    jump = false;
    restoring(() => applyState(viewOf(i), false));
    setNotes(notesOf(i));
    saveSoon();
    return;
  }
  // the card lights at once; the map moves only once the reader stops on a step, so a fast scroll doesn't play
  // every step's animation on the way
  clearTimeout(settleT);
  settleT = setTimeout(() => {
    if (stepNow !== i) return;
    restoring(() => applyState(viewOf(i), true));
    setNotes(notesOf(i));
    saveSoon();
  }, SETTLE);
}

// The story's order is fixed, so each step's filters are computed in idle time after load and cached: reaching a
// step then only swaps in the result.
function precompute() {
  const views = STORY.map((d, i) => viewOf(i)),
    idle = window.requestIdleCallback || setTimeout;
  let k = 0;
  const next = (dl) => {
    const save = VARS.map((v) => [v.lo, v.hi, v.vlo, v.vhi]),
      { INSET, YEAR, INC80 } = S;
    while (k < views.length && (!dl || dl.timeRemaining() > 8)) {
      const q = new URLSearchParams(views[k++]);
      const y = q.get("y");
      S.YEAR = YS.includes(y) ? y : YS[0];
      S.INC80 = q.get("80plus") !== "0";
      setFiltersFrom(q);
      computeFilter();
    }
    VARS.forEach((v, j) => ([v.lo, v.hi, v.vlo, v.vhi] = save[j]));
    Object.assign(S, { INSET, YEAR, INC80 });
    computeFilter(); // back to what's shown
    if (k < views.length) idle(next);
  };
  idle(next);
}

// the live totals at the top of the story column: the two camps and abstention, with counts, their share of all
// Brazil when filtered, and the change since the other year
export function storyTotals() {
  if (d3.select("#story").property("hidden")) return;
  const { YEAR, COMPARE, INSET, FILTERED, PLACEF } = S,
    F = figures(YEAR),
    oy = otherYear(YEAR),
    G = figures(oy),
    N = FILTERED ? natFig(YEAR) : null;
  const c22 = CATS.findIndex((c) => c.k === "22"),
    c13 = CATS.findIndex((c) => c.k === "13");
  // a small results table: share (with a bar), votes, change since the other year. The camps' shares are of valid
  // votes, abstention's of the roll, so it sits apart below a rule with its own note.
  const tw = (i, f, v) => `data-tw="st${i}${f}" data-f="${f}" data-v="${v}"`;
  const lead = F.c[c22] >= F.c[c13] ? c22 : c13;
  const row = (i, n, v, sh, pv, nv) => {
    const ofAll = N ? ` <s>${t("story.ofAll", { v: Math.round((100 * v) / nv) })}</s>` : "",
      note = i === AB ? `<small>${t("story.ofRoll")}</small>` : "";
    return (
      `<div class="sr${i === AB ? " a" : ""}${i === lead ? " lead" : ""}" style="--c:${COLS[i]}"><i></i>` +
      `<span>${n}${note}<em class="bar"><em ${tw(i, "w", 100 * sh)} style="width:${(100 * sh).toFixed(1)}%"></em></em></span>` +
      `<b ${tw(i, "pct", 100 * sh)}>${pctN(100 * sh)}</b><u><span ${tw(i, "hum", v)}>${hum(v, 1)}</span>${ofAll}</u><q>${change((sh - pv) * 100)}</q></div>`
    );
  };
  const head =
    `<div class="sr sh"><i></i><span>${t("story.ofValid")}</span><b>${t("story.colShare")}</b>` +
    `<u>${t("story.colVotes")}</u><q>${t("story.colChange", { year: oy })}</q></div>`;
  const one = INSET && INSET.size === 1 ? M[[...INSET][0]].n : null,
    where =
      " · " +
      (one
        ? PLACEF
          ? t("story.inLitPlaces", { place: one })
          : one
        : FILTERED
          ? t(PLACEF ? "story.litPlaces" : "story.litMunis")
          : t("story.brazil"));
  d3.select("#stot").html(
    `<div class="sl">${COMPARE ? t("story.totals", { year: YS[0] }) : YEAR}${where}</div>` +
      (N
        ? `<div class="scope">${t("story.scope", { n: hum(F.all), p: Math.round((100 * F.all) / N.all), all: hum(N.all) })}</div>`
        : "") +
      head +
      row(c22, nameOf(YEAR, "22"), F.c[c22], F.c[c22] / F.valid, G.c[c22] / G.valid, N && N.c[c22]) +
      row(c13, t("cats.lula"), F.c[c13], F.c[c13] / F.valid, G.c[c13] / G.valid, N && N.c[c13]) +
      row(AB, t("cats.didntVote"), F.ab, F.ab / F.all, G.ab / G.all, N && N.ab) +
      (N
        ? `<div class="fdesc">${describeFilter()
            .map((x) => `<span>${x}</span>`)
            .join("")}</div>`
        : ""),
  );
  tween(document.getElementById("stot"));
}

// Which tab opens: ?tab=story|explore (also reportagem|explorar). The story is the default; an older shared link
// that carries only a view in the hash, with no tab, opens in Explore as it used to.
const TABS = { story: true, reportagem: true, explore: false, explorar: false };
function tabFromUrl() {
  const q = (new URLSearchParams(location.search).get("tab") || "").toLowerCase();
  return q in TABS ? TABS[q] : location.hash.length <= 1;
}
// the open tab goes into the URL, so a reload or a shared link reopens it
function tabToUrl(story) {
  const u = new URL(location.href);
  if (story) u.searchParams.delete("tab");
  else u.searchParams.set("tab", "explore");
  history.replaceState(history.state, "", u);
}

// the step on screen, for sharing a link to it
export const currentStep = () => (stepNow >= 0 ? { id: STORY[stepNow].id, h: copyOf(STORY[stepNow]).h } : null);

// ?step=<id> (from a shared link) opens the story at that step; the argument is then dropped, so a later reload
// starts from the top like any other visit
function openAtStep() {
  const u = new URL(location.href),
    id = u.searchParams.get("step");
  if (!id) return;
  u.searchParams.delete("step");
  history.replaceState(history.state, "", u);
  const i = STORY.findIndex((d) => d.id === id);
  if (i < 0 || !d3.select("#page").classed("storymode")) return;
  stepNow = -1;
  jump = true;
  requestAnimationFrame(() => showStep(i, false));
}

function setTab(story) {
  tabToUrl(story);
  const page = d3.select("#page");
  d3.select("#tab-story").attr("aria-selected", String(story));
  d3.select("#tab-explore").attr("aria-selected", String(!story));
  d3.select("#story").property("hidden", !story);
  d3.select("#explore").property("hidden", story);
  page.classed("storymode", story);
  // the story gets the studio's width for the map; Explore brings the studio back (folded on phones)
  if (!page.classed("embed")) {
    // phones open Explore with the studio folded, so the years and the results come first
    const fold = story || phone.matches;
    page.classed("nostudio", fold);
    d3.select("#studiox").attr("aria-expanded", String(!fold));
    layout();
    panLimits(story);
  }
  if (story) {
    stepNow = -1;
    jump = true;
    document.querySelector("aside").scrollTop = 0;
    document.getElementById("steps").scrollLeft = 0;
    goStep(0);
  } else {
    setNotes([]);
    panel();
    svg.interrupt().call(zoom.transform, d3.zoomIdentity);
    repaint();
  }
}

// each step's copy, charts and the find box, and the progress dots' labels; redrawn when the language changes
function fillSteps() {
  steps
    .html(
      (d) =>
        (d.block ? `<div class="kick">${t("story.blocks." + d.block)}</div>` : "") +
        `<h2>${copyOf(d).h}</h2>${copyOf(d).t}`,
    )
    .each(function (d) {
      if (d.chart) chart(this, { ...d.chart, ...copyOf(d).chart });
      if (d.find) findStep(this);
    });
  steps
    .filter((d, i) => i === 0)
    .append("p")
    .attr("class", "cue")
    .html(
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>' +
        t(phone.matches ? "story.cueSwipe" : "story.cue"),
    );
  prog.attr("aria-label", (d) => copyOf(d).h).attr("title", (d) => copyOf(d).h);
  d3.select("#toexplore").on("click", () => setTab(false));
}

// Phones: a sideways swipe on the panel moves to the next or previous step. The panel follows the finger, then
// settles on the step it was swiped to; a mostly vertical drag scrolls the step's text instead.
function swipe() {
  const box = document.getElementById("steps");
  let x0, y0, sl0, dir;
  box.addEventListener(
    "touchstart",
    (e) => {
      if (!phone.matches) return;
      ({ clientX: x0, clientY: y0 } = e.touches[0]);
      sl0 = box.scrollLeft;
      dir = null;
    },
    { passive: true },
  );
  box.addEventListener(
    "touchmove",
    (e) => {
      if (!phone.matches || x0 == null) return;
      const dx = e.touches[0].clientX - x0,
        dy = e.touches[0].clientY - y0;
      if (!dir && Math.hypot(dx, dy) > 8) dir = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (dir !== "x") return;
      e.preventDefault();
      box.scrollLeft = sl0 - dx;
    },
    { passive: false },
  );
  box.addEventListener("touchend", (e) => {
    if (!phone.matches || x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (dir !== "x") return;
    const w = box.clientWidth,
      from = Math.round(sl0 / w),
      to = Math.abs(dx) > w * 0.18 ? from - Math.sign(dx) : from;
    showStep(Math.max(0, Math.min(STORY.length - 1, to)), true);
  });
}

// Phones: dragging the panel's top edge sets the most it may take (a fifth to four fifths of the screen); the map
// then reframes the step's view in the space left above it
function resizer() {
  const grip = document.getElementById("pgrip"),
    root = document.documentElement.style;
  let on = false;
  const set = (y) => {
    root.setProperty("--panel-h", (100 * Math.max(0.2, Math.min(0.8, 1 - y / innerHeight))).toFixed(1) + "dvh");
    fitPanel(stepNow);
  };
  grip.addEventListener("pointerdown", (e) => {
    on = true;
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener("pointermove", (e) => on && set(e.clientY));
  const end = () => {
    if (!on) return;
    on = false;
    if (stepNow >= 0) restoring(() => applyState(viewOf(stepNow), true));
  };
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
}

export function initStory() {
  steps = d3.select("#steps").selectAll(".step").data(STORY).join("section").attr("class", "step");
  const aside = document.querySelector("aside");
  prog = d3
    .select("#prog")
    .selectAll("button")
    .data(STORY)
    .join("button")
    .on("click", (e, d) => showStep(STORY.indexOf(d), true));
  d3.select("#sprev").on("click", () => showStep(Math.max(0, stepNow - 1), true));
  d3.select("#snext").on("click", () => showStep(Math.min(STORY.length - 1, stepNow + 1), true));
  swipe();
  resizer();
  fillSteps();
  onLang(() => {
    fillSteps();
    fitPanel(stepNow);
    if (stepNow >= 0) setNotes(notesOf(stepNow));
  });
  const io = new IntersectionObserver(
    (es) => {
      if (phone.matches) return;
      const vis = es.filter((e) => e.isIntersecting);
      if (vis.length) goStep(steps.nodes().indexOf(vis[0].target));
    },
    { root: aside, rootMargin: "-45% 0px -50% 0px" },
  );
  // a card lights up as soon as most of it is on screen, before it reaches the middle and changes the map
  const lit = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("near", e.isIntersecting)), {
    root: aside,
    rootMargin: "-12% 0px -22% 0px",
  });
  steps.each(function () {
    io.observe(this);
    lit.observe(this);
  });
  d3.select("#tab-story").on("click", () => setTab(true));
  d3.select("#tab-explore").on("click", () => setTab(false));
  setTab(tabFromUrl()); // in Explore, initHash then applies a shared view
  openAtStep();
  setTimeout(precompute, 1500);
}
