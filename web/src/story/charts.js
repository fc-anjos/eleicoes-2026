// Small charts in story cards: dumbbells of Lula's share of valid votes in 2022 (hollow) and 2026 (filled) for
// groups of municipalities, summed over the group, computed from the same data as the map; and a column chart for
// a series given in the step.
import * as d3 from "d3";
import { M, MG } from "../data.js";
import { VARS } from "../filters/vars.js";
import { pctN, signed } from "../format.js";
import { t } from "../i18n/index.js";
import { CI, COLS, YS, css } from "../state.js";
import { tally } from "../stats.js";

const REGION = {
  ...Object.fromEntries(["AC", "AM", "AP", "PA", "RO", "RR", "TO"].map((u) => [u, "N"])),
  ...Object.fromEntries(["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"].map((u) => [u, "NE"])),
  ...Object.fromEntries(["DF", "GO", "MS", "MT"].map((u) => [u, "CW"])),
  ...Object.fromEntries(["ES", "MG", "RJ", "SP"].map((u) => [u, "SE"])),
  ...Object.fromEntries(["PR", "RS", "SC"].map((u) => [u, "S"])),
};
// state capitals, by IBGE code
const CAPITALS = new Set(
  (
    "1100205 1200401 1302603 1400100 1501402 1600303 1721000 2111300 2211001 2304400 2408102 2507507 2611606 " +
    "2704302 2800308 2927408 3106200 3205309 3304557 3550308 4106902 4205407 4314902 5002704 5103403 5208707 5300108"
  ).split(" "),
);

// spec.by: "region" (spec.keys: region codes), "capital", or a variable key with spec.cuts between groups
function groupShares(spec) {
  const groups = new Map(),
    add = (key, m) => {
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { a: [0, 0], b: [0, 0] }));
      for (const [j, y] of [
        [0, YS[1]],
        [1, YS[0]],
      ]) {
        const t = tally(y, m);
        if (!t) return;
        g[j ? "b" : "a"][0] += t.d.c[CI("13")];
        g[j ? "b" : "a"][1] += t.valid;
      }
    };
  const v = spec.by === "region" ? null : VARS.find((z) => z.k === spec.by);
  for (const f of MG.features) {
    const m = M[f.properties.codarea];
    if (!m || !m.y[YS[0]] || !m.y[YS[1]]) continue;
    if (spec.by === "region") {
      add(REGION[m.uf], m);
      continue;
    }
    if (spec.by === "capital") {
      add(CAPITALS.has(f.properties.codarea) ? 0 : 1, m);
      continue;
    }
    const x = v.get(m);
    if (x == null) continue;
    const i = spec.cuts.findIndex((c) => x < c);
    add(i < 0 ? spec.cuts.length : i, m);
  }
  const keys = spec.by === "region" ? spec.keys : spec.labels.map((_, i) => i);
  return keys.map((k, i) => {
    const g = groups.get(k) || { a: [0, 1], b: [0, 1] };
    return { label: spec.labels[i], a: (100 * g.a[0]) / g.a[1], b: (100 * g.b[0]) / g.b[1] };
  });
}

const chartSvg = (el, W, H, title) => {
  const s = d3
    .select(el)
    .append("svg")
    .attr("class", "dumb")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img")
    .attr("aria-label", title);
  s.append("text").attr("class", "ct").attr("x", 0).attr("y", 12).text(title);
  return s;
};

// Each row's change as an arrow: a hollow dot at the earlier value (a), the arrowhead at the later one (b), so a fall
// points left and a rise right, whichever way the eye reads. Rows with only one value get a filled dot there.
export function changeArrows(r, x, col) {
  r.filter((d) => d.a != null && d.b != null).each(function (d) {
    const g = d3.select(this),
      x0 = x(d.a),
      x1 = x(d.b),
      dir = x1 >= x0 ? 1 : -1,
      head = 7;
    if (Math.abs(x1 - x0) > head)
      g.append("line")
        .attr("x1", x0 + dir * 3.5)
        .attr("x2", x1 - dir * head)
        .attr("stroke", col(d))
        .attr("stroke-width", 2);
    g.append("circle")
      .attr("cx", x0)
      .attr("r", 3.5)
      .attr("fill", "none")
      .attr("stroke", col(d))
      .attr("stroke-width", 1.5);
    g.append("path")
      .attr("d", `M${x1},0L${x1 - dir * head},-4.5L${x1 - dir * head},4.5Z`)
      .attr("fill", col(d));
  });
  r.filter((d) => (d.a == null) !== (d.b == null))
    .append("circle")
    .attr("cx", (d) => x(d.a ?? d.b))
    .attr("r", 4)
    .attr("fill", col);
}

export function chart(el, spec) {
  if (spec.by === "series") return seriesChart(el, spec);
  const rows = groupShares(spec),
    W = 330,
    rh = 22,
    top = 36,
    H = top + rows.length * rh + 6,
    lx = 118,
    lula = COLS[CI("13")];
  const x = d3
    .scaleLinear()
    .domain([
      Math.floor(d3.min(rows, (r) => Math.min(r.a, r.b)) / 10) * 10,
      Math.ceil(d3.max(rows, (r) => Math.max(r.a, r.b)) / 10) * 10,
    ])
    .range([lx, W - 40]);
  const s = chartSvg(el, W, H, spec.title);
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
    .attr("transform", (d, i) => `translate(0,${top + i * rh + rh / 2})`);
  r.append("text")
    .attr("class", "rl")
    .attr("x", 0)
    .attr("y", 4)
    .text((d) => d.label);
  changeArrows(r, x, () => lula);
  r.append("text")
    .attr("class", "rv")
    .attr("x", W)
    .attr("text-anchor", "end")
    .attr("y", 4)
    .text((d) => signed(d.b - d.a));
  d3.select(el)
    .append("p")
    .attr("class", "ck lula")
    .html(`<i class="was"></i>${t("charts.lulaLegend", { from: YS[1], to: YS[0] })}`);
}

// a small column chart for a series given in the step (e.g. abstention by election), the last column highlighted
function seriesChart(el, spec) {
  const W = 330,
    H = 128,
    top = 36,
    bot = 18,
    x = d3
      .scaleBand()
      .domain(spec.points.map((p) => p[0]))
      .range([0, W])
      .padding(0.28);
  const y = d3
    .scaleLinear()
    .domain([spec.min ?? 0, d3.max(spec.points, (p) => p[1])])
    .range([H - bot, top]);
  const g = chartSvg(el, W, H, spec.title)
    .append("g")
    .selectAll("g")
    .data(spec.points)
    .join("g")
    .attr("transform", (p) => `translate(${x(p[0])},0)`);
  g.append("rect")
    .attr("y", (p) => y(p[1]))
    .attr("height", (p) => y.range()[0] - y(p[1]))
    .attr("width", x.bandwidth())
    .attr("rx", 2)
    .attr("fill", (p, i) => (i === spec.points.length - 1 ? css("--ca") : css("--edge")));
  g.append("text")
    .attr("class", "rv")
    .attr("x", x.bandwidth() / 2)
    .attr("y", (p) => y(p[1]) - 4)
    .attr("text-anchor", "middle")
    .text((p) => pctN(p[1]));
  g.append("text")
    .attr("class", "tk")
    .attr("x", x.bandwidth() / 2)
    .attr("y", H - 4)
    .text((p) => p[0]);
  if (spec.note) d3.select(el).append("p").attr("class", "ck").text(spec.note);
}
