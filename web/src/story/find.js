// "Find your place": a step where the reader types a municipality; the map flies there in compare mode and the
// card charts how every candidate and abstention moved there, against the country
import * as d3 from "d3";
import { CATS, M, YEARS } from "../data.js";
import { MAXK, path, proj, select } from "../map/base.js";
import { AB, COLS, OT, S, YS, nameOf } from "../state.js";
import { find } from "../search.js";
import { tally } from "../stats.js";
import { natFig } from "../totals.js";
import { applyState, restoring } from "../view/hash.js";

// Rows: each candidate with a colour of their own (in either year), then Others, then abstention. Candidates'
// shares are of valid votes, abstention's of everyone on the roll, as TSE reports them. a: 2022, b: 2026, n: Brazil
// 2026, all in %; null where the candidate didn't run.
function placeRows(m) {
  const [old, now] = [YS[1], YS[0]],
    t = { [old]: tally(old, m), [now]: tally(now, m) },
    N = natFig(now),
    ran = (y, i) => YEARS[y].cands.some((c) => c.i === i);
  const sh = (y, i) => (t[y] && ran(y, i) ? (100 * t[y].d.c[i]) / t[y].valid : null);
  const rows = CATS.map((c, i) => ({ i, k: c.k }))
    .filter(({ i, k }) => k && i < OT && (ran(old, i) || ran(now, i)))
    .map(({ i, k }) => ({
      i,
      label: k === "22" ? "Bolsonaro camp" : nameOf(ran(now, i) ? now : old, k),
      a: sh(old, i),
      b: sh(now, i),
      n: (100 * N.c[i]) / N.valid,
    }))
    .sort((p, q) => (q.b ?? 0) - (p.b ?? 0));
  rows.push({ i: OT, label: "Others", a: sh(old, OT), b: sh(now, OT), n: (100 * N.c[OT]) / N.valid });
  const ab = (y) => (t[y] ? (100 * t[y].ab) / t[y].all : null);
  rows.push({ i: AB, label: "Didn't vote", a: ab(old), b: ab(now), n: (100 * N.ab) / N.all });
  return rows;
}

// one row per category: 2022 hollow, 2026 filled, Brazil's 2026 as a tick; the change on the right
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
    .text((d) => d + "%");
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
  r.filter((d) => d.a != null && d.b != null)
    .append("line")
    .attr("x1", (d) => x(d.a))
    .attr("x2", (d) => x(d.b))
    .attr("stroke", (d) => COLS[d.i])
    .attr("stroke-width", 2)
    .attr("opacity", 0.5);
  r.filter((d) => d.a != null)
    .append("circle")
    .attr("cx", (d) => x(d.a))
    .attr("r", 4)
    .attr("fill", "none")
    .attr("stroke", (d) => COLS[d.i])
    .attr("stroke-width", 1.5);
  r.filter((d) => d.b != null)
    .append("circle")
    .attr("cx", (d) => x(d.b))
    .attr("r", 4)
    .attr("fill", (d) => COLS[d.i]);
  r.append("text")
    .attr("class", "rv")
    .attr("x", W)
    .attr("text-anchor", "end")
    .attr("y", 4)
    .text((d) => (d.b == null ? "–" : d.a == null ? "new" : (d.b >= d.a ? "+" : "−") + Math.abs(d.b - d.a).toFixed(1)));
  d3.select(el)
    .append("p")
    .attr("class", "ck all")
    .html(
      `<i class="was"></i>${YS[1]} <i class="now"></i>${YS[0]} <i class="nat"></i>Brazil ${YS[0]} · ` +
        "share of valid votes; didn't vote: of the roll",
    );
}

// the card's sentence: the two camps and abstention, here against the country
function summary(label, rows) {
  const get = (i) => rows.find((r) => r.i === i),
    ch = (r) => (r.a == null ? "" : ` (${r.b >= r.a ? "+" : "−"}${Math.abs(r.b - r.a).toFixed(1)})`),
    vs = (r) =>
      Math.abs(r.b - r.n) < 0.5 ? "about the national" : r.b > r.n ? "above the national" : "below the national";
  const [bol, lula, ab] = [get(CATS.findIndex((c) => c.k === "22")), get(CATS.findIndex((c) => c.k === "13")), get(AB)];
  const [first, second] = bol.b > lula.b ? [bol, lula] : [lula, bol],
    name = (r) => (r === bol ? "the Bolsonaro camp" : "Lula");
  const third = rows.filter((r) => ![bol, lula, ab].includes(r) && r.b != null && r.i !== OT).slice(0, 1)[0];
  return (
    `<p><b>${label}</b> in ${YS[0]}: ${name(first)} led ${name(second)}, ${first.b.toFixed(1)}%${ch(first)} to ` +
    `${second.b.toFixed(1)}%${ch(second)}. ` +
    (third ? `${third.label} took ${third.b.toFixed(1)}%, ${vs(third)} ${third.n.toFixed(1)}%. ` : "") +
    `${ab.b.toFixed(1)}% of the roll didn't vote${ch(ab)}, ${vs(ab)} ${ab.n.toFixed(1)}%.</p>`
  );
}

export function findStep(el) {
  const box = d3.select(el).append("div").attr("class", "find");
  const inp = box
    .append("input")
    .attr("type", "text")
    .attr("placeholder", "Type a municipality")
    .attr("aria-label", "Find a municipality");
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
    const rows = placeRows(m);
    res.html(summary(d.label, rows));
    placeChart(res.node(), `${d.label}, ${YS[1]} → ${YS[0]}`, rows);
  }
}
