// Results panel (Explore): same dot language as the map, one dot per million. Abstention is ranked among the
// candidates by head count; its share is of everyone on the roll, the candidates' of valid votes, as TSE reports
// them. "Others" stays last. Each row also shows its change since the other year.
import * as d3 from "d3";
import { YEARS } from "../data.js";
import { fmt, hum } from "../format.js";
import { repaint } from "../map/render.js";
import { A8, AB, AO, COLS, HID, S, otherYear, packCols, store } from "../state.js";
import { storyTotals } from "../story/story.js";
import { figures, natFig } from "../totals.js";

// the panel that is showing: Explore's, or the story's small totals
export function panelIfShown() {
  if (!d3.select("#explore").property("hidden")) panel();
  else storyTotals();
}

export function setFocus(i) {
  S.focus = i;
  d3.select("#cands")
    .selectAll(".cand .body")
    .attr("aria-pressed", (d) => String(d.i === S.focus));
  d3.select("#page").classed("focus", S.focus >= 0);
}

export function panel() {
  drawRows();
  storyTotals();
  // in Explore, the filter count also says how much of Brazil is lit
  const fc = d3.select("#fcount");
  fc.select(".scope").remove();
  if (S.FILTERED) {
    const F = figures(S.YEAR),
      N = natFig(S.YEAR);
    fc.append("span")
      .attr("class", "scope")
      .text(` · ${hum(F.all)} on the roll, ${Math.round((100 * F.all) / N.all)}% of Brazil`);
  }
}

function drawRows() {
  const { YEAR, SPLITA, INC80 } = S,
    list = d3.select("#cands"),
    Y = YEARS[YEAR],
    oy = otherYear(YEAR),
    F = figures(YEAR),
    G = figures(oy);
  d3.select("#date").text(Y.date);
  list.selectAll(".cand").remove();
  const has = (y, i) => YEARS[y].cands.some((c) => c.i === i);
  const ar = (v, i, n, unit, extra) => ({
    n,
    v,
    i,
    abst: true,
    share: v / F.all,
    prev: i === AB && !SPLITA ? G.ab / G.all : SPLITA ? G.c[i] / G.all : null,
    unit,
    extra,
  });
  const abRows = SPLITA
    ? [
        ar(F.c[AB], AB, "Didn't vote, had to", "people aged 18–69 on the roll didn't vote"),
        ar(
          F.c[AO],
          AO,
          "Didn't vote, optional",
          "people aged 70–79 or 16–17 didn't vote",
          YEAR === "2026" ? "Age split estimated for 2026" : "",
        ),
        ...(INC80
          ? [
              ar(
                F.c[A8],
                A8,
                "Didn't vote, 80+",
                "people aged 80+ didn't vote",
                "Includes people likely no longer living who are still on the roll" +
                  (YEAR === "2026" ? "; estimated for 2026" : ""),
              ),
            ]
          : []),
      ]
    : [
        ar(
          F.ab,
          AB,
          "Didn't vote",
          INC80 ? "people on the roll didn't vote" : "people on the roll under 80 didn't vote",
        ),
      ];
  const rows = [
    ...abRows,
    ...Y.cands.map((c) => ({
      ...c,
      v: F.c[c.i],
      share: F.c[c.i] / F.valid,
      prev: has(oy, c.i) ? G.c[c.i] / G.valid : null,
      unit: "votes",
    })),
  ].sort((a, b) => (a.k === "") - (b.k === "") || b.v - a.v);
  rows.forEach((c) => {
    const i = c.i;
    const r = list
      .append("div")
      .datum(c)
      .attr("class", "cand")
      .classed("ab", !!c.abst)
      .classed("off", !!HID[i])
      .style("--c", COLS[i]);
    // visibility switch | the row itself (hover or click: show only this category) | colour
    r.append("input")
      .attr("type", "checkbox")
      .attr("class", "vis")
      .property("checked", !HID[i])
      .attr("aria-label", `Show ${c.n}`)
      .on("change", (e) => {
        HID[i] = e.target.checked ? 0 : 1;
        r.classed("off", !!HID[i]);
        store.set("hid", [...HID]);
        repaint();
      });
    const b = r
      .append("button")
      .attr("class", "body")
      .attr("aria-pressed", String(S.focus === i));
    const d = c.prev == null ? "" : (c.share - c.prev) * 100,
      ds = d === "" ? "" : `<span class="dl">${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pp vs ${oy}</span>`;
    b.append("div")
      .attr("class", "row")
      .html(`<span class="nm">${c.n}</span><span class="pc">${(100 * c.share).toFixed(1)}%</span>`);
    b.append("div")
      .attr("class", "vt")
      .html(`${fmt(c.v)} ${c.unit}${ds}`);
    if (c.extra) b.append("div").attr("class", "who").text(c.extra);
    if (c.who) b.append("div").attr("class", "who").text(c.who.join(", "));
    const m = c.v / 1e6,
      gr = b.append("div").attr("class", "grains");
    for (let j = 0; j < Math.ceil(m); j++) gr.append("i").classed("part", j >= Math.floor(m) && m % 1 < 0.5);
    r.append("input")
      .attr("type", "color")
      .attr("class", "col")
      .property("value", COLS[i])
      .attr("aria-label", `Colour for ${c.n}`)
      .on("input", (e) => {
        COLS[i] = e.target.value;
        r.style("--c", COLS[i]);
        packCols();
        store.set("cols", COLS);
        repaint();
      });
    const set = (on) => {
      setFocus(on ? i : -1);
      repaint();
    };
    b.on("mouseenter", () => set(true))
      .on("mouseleave", () => set(false))
      .on("click", () => set(S.focus !== i));
  });
}
