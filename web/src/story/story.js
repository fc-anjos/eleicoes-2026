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
import { applyState, restoring, saveSoon, setFiltersFrom } from "../view/hash.js";
import { hintDone } from "../view/hints.js";
import { chart } from "./charts.js";
import { findStep } from "./find.js";

const viewOf = (i) => STORY[i].view;
// a step's copy (i18n story.steps.<id>): headline h, text t, note labels in order, chart title and labels
const copyOf = (d) => t(`story.steps.${d.id}`);
const notesOf = (i) => (STORY[i].notes || []).map((n, j) => ({ ...n, t: copyOf(STORY[i]).notes[j] }));
let steps, prog;
let stepNow = -1;

function goStep(i) {
  if (i > 0) hintDone("maphint");
  if (i === stepNow) return;
  stepNow = i;
  steps.classed("on", (d, j) => j === i);
  prog.attr("aria-current", (d, j) => (j === i ? "step" : null));
  // the card lights at once; the map's work waits for the next frame so the highlight paints first
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (stepNow !== i) return;
      restoring(() => applyState(viewOf(i), true));
      setNotes(notesOf(i));
      saveSoon();
    }),
  );
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
  const lead = F.c[c22] >= F.c[c13] ? c22 : c13;
  const row = (i, n, v, sh, pv, nv) => {
    const ofAll = N ? ` <s>${t("story.ofAll", { v: Math.round((100 * v) / nv) })}</s>` : "",
      note = i === AB ? `<small>${t("story.ofRoll")}</small>` : "";
    return (
      `<div class="sr${i === AB ? " a" : ""}${i === lead ? " lead" : ""}" style="--c:${COLS[i]}"><i></i>` +
      `<span>${n}${note}<em class="bar"><em style="width:${(100 * sh).toFixed(1)}%"></em></em></span>` +
      `<b>${pctN(100 * sh)}</b><u>${hum(v, 1)}${ofAll}</u><q>${change((sh - pv) * 100)}</q></div>`
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
}

function setTab(story) {
  const page = d3.select("#page");
  d3.select("#tab-story").attr("aria-selected", String(story));
  d3.select("#tab-explore").attr("aria-selected", String(!story));
  d3.select("#story").property("hidden", !story);
  d3.select("#explore").property("hidden", story);
  page.classed("storymode", story);
  // the story gets the studio's width for the map; Explore brings the studio back
  if (!page.classed("embed")) {
    page.classed("nostudio", story);
    d3.select("#studiox").attr("aria-expanded", String(!story));
    layout();
    panLimits(story);
  }
  if (story) {
    stepNow = -1;
    document.querySelector("aside").scrollTop = 0;
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
    .html((d) => `<h2>${copyOf(d).h}</h2>${copyOf(d).t}`)
    .each(function (d) {
      if (d.chart) chart(this, { ...d.chart, ...copyOf(d).chart });
      if (d.find) findStep(this);
    });
  steps
    .filter((d, i) => i === 0)
    .append("p")
    .attr("class", "cue")
    .html('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>' + t("story.cue"));
  prog.attr("aria-label", (d) => copyOf(d).h).attr("title", (d) => copyOf(d).h);
  d3.select("#toexplore").on("click", () => setTab(false));
}

export function initStory() {
  steps = d3.select("#steps").selectAll(".step").data(STORY).join("section").attr("class", "step");
  const aside = document.querySelector("aside");
  prog = d3
    .select("#prog")
    .selectAll("button")
    .data(STORY)
    .join("button")
    .on("click", (e, d) => {
      const i = STORY.indexOf(d);
      aside.scrollTo({ top: steps.nodes()[i].offsetTop - aside.clientHeight * 0.4, behavior: "smooth" });
    });
  fillSteps();
  onLang(() => {
    fillSteps();
    if (stepNow >= 0) setNotes(notesOf(stepNow));
  });
  const io = new IntersectionObserver(
    (es) => {
      const vis = es.filter((e) => e.isIntersecting);
      if (vis.length) goStep(steps.nodes().indexOf(vis[0].target));
    },
    { root: aside, rootMargin: "-45% 0px -50% 0px" },
  );
  steps.each(function () {
    io.observe(this);
  });
  d3.select("#tab-story").on("click", () => setTab(true));
  d3.select("#tab-explore").on("click", () => setTab(false));
  setTab(location.hash.length <= 1); // a shared view opens in Explore (initHash then applies it)
  setTimeout(precompute, 1500);
}
