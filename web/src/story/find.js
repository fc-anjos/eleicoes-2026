// "Find your place": a step where the reader types a municipality; the map flies there in compare mode and the
// card charts how every candidate and abstention moved there, against the country
import * as d3 from "d3";
import { CATS, M, YEARS } from "../data.js";
import { MAXK, path, proj, select } from "../map/base.js";
import { AB, COLS, OT, S, YS, nameOf } from "../state.js";
import { num, pctN, signed } from "../format.js";
import { t } from "../i18n/index.js";
import { find } from "../search.js";
import { changeArrows } from "./charts.js";
import { tally } from "../stats.js";
import { natFig } from "../totals.js";
import { applyState, restoring } from "../view/hash.js";

// Rows that mean the same in both years: the two camps (ballot numbers 22 and 13), everyone else merged, and
// abstention. Candidates' shares are of valid votes, abstention's of everyone on the roll, as TSE reports them.
// a: 2022, b: 2026, n: Brazil 2026, in %. Also returns who "everyone else" was in each year, for the line below.
const CAMPS = ["22", "13"];
function placeRows(m) {
  const [old, now] = [YS[1], YS[0]],
    t = { [old]: tally(old, m), [now]: tally(now, m) },
    N = natFig(now),
    ci = (k) => CATS.findIndex((c) => c.k === k),
    pct = (T, i) => (100 * T.c[i]) / T.valid,
    sh = (y, i) => (t[y] ? (100 * t[y].d.c[i]) / t[y].valid : null);
  const rows = CAMPS.map((k) => ({
    i: ci(k),
    label: t(k === "22" ? "cats.bolsonaroCamp" : "cats.lula"),
    a: sh(old, ci(k)),
    b: sh(now, ci(k)),
    n: pct(N, ci(k)),
  }));
  const rest = (y) => (t[y] ? 100 - rows[0][y === old ? "a" : "b"] - rows[1][y === old ? "a" : "b"] : null);
  rows.push({ i: OT, label: t("cats.everyoneElse"), a: rest(old), b: rest(now), n: 100 - rows[0].n - rows[1].n });
  const ab = (y) => (t[y] ? (100 * t[y].ab) / t[y].all : null);
  rows.push({ i: AB, label: t("cats.didntVote"), a: ab(old), b: ab(now), n: (100 * N.ab) / N.all });
  // everyone else, by name: the candidates with a colour of their own that year, then the rest as "others"
  const field = (y) => {
    if (!t[y]) return [];
    const named = YEARS[y].cands
      .filter((c) => c.k && !CAMPS.includes(c.k) && c.i < OT)
      .map((c) => ({ label: nameOf(y, c.k), v: sh(y, c.i) }))
      .sort((p, q) => q.v - p.v);
    return [...named, { label: t("find.others"), v: sh(y, OT) }];
  };
  return { rows, field: { [old]: field(old), [now]: field(now) } };
}

// one row per category: an arrow from 2022 to 2026, Brazil's 2026 as a tick; the change on the right
function placeChart(el, title, rows) {
  const W = 330,
    rh = 21,
    top = 34,
    H = top + rows.length * rh + 4,
    lx = 112;
  const x = d3
    .scaleLinear()
    .domain([0, Math.max(10, Math.ceil(d3.max(rows, (r) => Math.max(r.a ?? 0, r.b ?? 0, r.n)) / 10) * 10)])
    .range([lx, W - 44]);
  const s = d3
    .select(el)
    .append("svg")
    .attr("class", "dumb")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img")
    .attr("aria-label", title);
  s.append("text").attr("class", "ct").attr("x", 0).attr("y", 12).text(title);
  s.append("g")
    .selectAll("text")
    .data(x.ticks(4))
    .join("text")
    .attr("class", "tk")
    .attr("x", x)
    .attr("y", top - 8)
    .text((d) => pctN(d, 0));
  const r = s
    .append("g")
    .selectAll("g")
    .data(rows)
    .join("g")
    .attr("transform", (d, i) => `translate(0,${top + i * rh + rh / 2})`)
    .style("--c", (d) => COLS[d.i]);
  r.append("text")
    .attr("class", "rl")
    .attr("x", 0)
    .attr("y", 4)
    .text((d) => d.label);
  r.append("line")
    .attr("class", "nat")
    .attr("x1", (d) => x(d.n))
    .attr("x2", (d) => x(d.n))
    .attr("y1", -7)
    .attr("y2", 7);
  changeArrows(r, x, (d) => COLS[d.i]);
  r.append("text")
    .attr("class", "rv")
    .attr("x", W)
    .attr("text-anchor", "end")
    .attr("y", 4)
    .text((d) => (d.b == null ? "–" : d.a == null ? t("charts.new") : signed(d.b - d.a)));
  d3.select(el)
    .append("p")
    .attr("class", "ck all")
    .html(`<i class="was"></i>${t("charts.placeLegend", { from: YS[1], to: YS[0] })}`);
}

// the card's sentence: the two camps, everyone else and abstention, here against the country
function summary(label, rows) {
  const ch = (r) => (r.a == null ? "" : ` (${signed(r.b - r.a)})`),
    vs = (r) =>
      t(Math.abs(r.b - r.n) < 0.5 ? "find.aboutNational" : r.b > r.n ? "find.aboveNational" : "find.belowNational"),
    f = (v) => num(v, 1);
  const [bol, lula, rest, ab] = rows;
  const [first, second] = bol.b > lula.b ? [bol, lula] : [lula, bol],
    name = (r) => t(r === bol ? "find.bolsonaroCamp" : "find.lula");
  return t("find.summary", {
    place: label,
    year: YS[0],
    first: name(first),
    second: name(second),
    a: f(first.b),
    ca: ch(first),
    b: f(second.b),
    cb: ch(second),
    rest: f(rest.b),
    cr: ch(rest),
    vsRest: vs(rest),
    restN: f(rest.n),
    ab: f(ab.b),
    cab: ch(ab),
    vsAb: vs(ab),
    abN: f(ab.n),
  });
}

// who "everyone else" was: different candidates each year, so listed, not compared
function fieldLine(el, field) {
  const list = (y) =>
    field[y]
      .filter((c) => c.v >= 0.05)
      .map((c) => `${c.label} ${pctN(c.v)}`)
      .join(", ");
  d3.select(el)
    .append("p")
    .attr("class", "ck")
    .html(t("find.fieldLine", { y0: YS[0], l0: list(YS[0]), y1: YS[1], l1: list(YS[1]) }));
}

export function findStep(el) {
  const box = d3.select(el).append("div").attr("class", "find");
  const inp = box
    .append("input")
    .attr("type", "text")
    .attr("placeholder", t("find.placeholder"))
    .attr("aria-label", t("find.aria"));
  const ul = box.append("ul").attr("class", "fl"),
    res = box.append("div").attr("class", "fres").attr("aria-live", "polite");
  inp.on("input", () => {
    ul.selectAll("li")
      .data(find(inp.property("value"), 6))
      .join("li")
      .html((d) => `${d.label}<span>${d.uf}</span>`)
      .on("mousedown", (e, d) => {
        e.preventDefault();
        pick(d);
      });
  });
  inp.on("keydown", (e) => {
    if (e.key === "Enter") {
      const [d] = find(inp.property("value"), 1);
      if (d) pick(d);
    }
  });
  function pick(d) {
    ul.selectAll("li").remove();
    inp.property("value", `${d.label}, ${d.uf}`);
    const m = M[d.f.properties.codarea];
    const [[x0, y0], [x1, y1]] = path.bounds(d.f),
      k = Math.min(MAXK, 0.55 / Math.max((x1 - x0) / S.w, (y1 - y0) / S.h)),
      c = proj.invert([(x0 + x1) / 2, (y0 + y1) / 2]);
    restoring(() => applyState(`y=cmp&at=${c[0]},${c[1]},${k}`, true));
    select(d.f);
    const { rows, field } = placeRows(m);
    res.html(summary(d.label, rows));
    placeChart(res.node(), t("find.title", { place: d.label, from: YS[1], to: YS[0] }), rows);
    fieldLine(res.node(), field);
  }
}
