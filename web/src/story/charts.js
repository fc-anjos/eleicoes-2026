// Small charts in story cards: dumbbells of Lula's share of valid votes in 2022 (hollow) and 2026 (filled) for
// groups of municipalities, summed over the group, computed from the same data as the map; and a column chart for
// a series given in the step.
import * as d3 from "d3";
import { M, MG, ORDER } from "../data.js";
import { DOT } from "../dots.js";
import { codeOf } from "../filters/filter.js";
import { VARS } from "../filters/vars.js";
import { num, pctN, signed } from "../format.js";
import { t } from "../i18n/index.js";
import { A8, AB, AO, CI, COLS, K, YS, css } from "../state.js";
import { CAPITALS, tally } from "../stats.js";

const REGION = {
  ...Object.fromEntries(["AC", "AM", "AP", "PA", "RO", "RR", "TO"].map((u) => [u, "N"])),
  ...Object.fromEntries(["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"].map((u) => [u, "NE"])),
  ...Object.fromEntries(["DF", "GO", "MS", "MT"].map((u) => [u, "CW"])),
  ...Object.fromEntries(["ES", "MG", "RJ", "SP"].map((u) => [u, "SE"])),
  ...Object.fromEntries(["PR", "RS", "SC"].map((u) => [u, "S"])),
};

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

// Polling places inside one municipality, by a place variable: each place's exact votes (GV) summed per bucket, for
// both years. bucket(x) gives a place's bucket from its value, or -1 to leave it out. Returns, per bucket, Lula's
// votes and the valid votes, by year, and the 2026 valid votes (to weigh the deciles).
// where: a municipality's code, "*" for all of Brazil, "!code" for Brazil without that municipality
const rowsOf = (where) => {
  const all = d3.range(ORDER.length);
  if (where === "*") return all;
  if (where[0] === "!") return all.filter((r) => codeOf[ORDER[r]] !== where.slice(1));
  return all.filter((r) => codeOf[ORDER[r]] === where);
};
function placeSums(where, v, bucket, nb) {
  const out = d3.range(nb).map(() => ({ [YS[0]]: [0, 0], [YS[1]]: [0, 0] })),
    lula = CI("13"),
    rows = rowsOf(where);
  for (const y of YS) {
    const D = DOT[y];
    for (const r of rows)
      for (let g = D.GM[r]; g < D.GM[r + 1]; g++) {
        const row = D.GR[g],
          x = row >= 0 ? v.val(row) : null,
          b = x == null ? -1 : bucket(x);
        if (b < 0) continue;
        let valid = 0;
        for (let i = 0, o = g * K; i < K; i++) if (i !== AB && i !== AO && i !== A8) valid += D.GV[o + i];
        out[b][y][0] += D.GV[g * K + lula];
        out[b][y][1] += valid;
      }
  }
  return out;
}
const shareOf = (s, y) => (100 * s[y][0]) / s[y][1];

// spec.by "places": buckets by spec.cuts on a place variable inside spec.muni, rows as in the other dumbbells
function placeRows(spec) {
  const v = VARS.find((z) => z.k === spec.var),
    cuts = spec.cuts,
    b = (x) => {
      const i = cuts.findIndex((c) => x < c);
      return i < 0 ? cuts.length : i;
    };
  return placeSums(spec.muni, v, b, cuts.length + 1).map((s, i) => ({
    label: spec.labels[i],
    a: shareOf(s, YS[1]),
    b: shareOf(s, YS[0]),
  }));
}

// Charts are drawn at the card's own width in css px, so their text keeps its set size however wide the column is
// (a fixed viewBox would scale the type up with the column)
export const chartW = (el) => {
  const cs = getComputedStyle(el),
    w = el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  return w > 200 ? Math.round(w) : 330;
};

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
  if (spec.by === "stack") return stackChart(el, spec);
  if (spec.by === "deciles") return decileChart(el, spec);
  if (spec.by === "bands") return bandChart(el, spec);
  const rows = spec.by === "places" ? placeRows(spec) : groupShares(spec),
    W = chartW(el),
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
    .attr("transform", (d, i) => `translate(0,${top + i * rh + rh / 2})`)
    .attr("opacity", (d, i) => (spec.hl == null || spec.hl === i ? 1 : 0.3));
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
  const W = chartW(el),
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

// spec.by "stack": one bar split into parts (shares in spec.parts, each with its colour variable), each labelled
// below with its name and share: who the non-voters were
function stackChart(el, spec) {
  const W = chartW(el),
    H = 92,
    top = 26,
    bh = 18,
    tot = d3.sum(spec.parts, (p) => p[0]),
    x = d3.scaleLinear().domain([0, tot]).range([0, W]);
  let x0 = 0;
  const parts = spec.parts.map(([v, col], i) => {
    const d = { v, col, x0, x1: x0 + v, label: spec.labels[i] };
    x0 += v;
    return d;
  });
  const g = chartSvg(el, W, H, spec.title).append("g").selectAll("g").data(parts).join("g");
  g.append("rect")
    .attr("x", (d) => x(d.x0) + (d.x0 ? 1 : 0))
    .attr("y", top)
    .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - (d.x0 ? 1 : 0)))
    .attr("height", bh)
    .attr("rx", 2)
    .attr("fill", (d) => css("--" + d.col));
  g.append("text")
    .attr("class", "rv")
    .attr("x", (d) => x((d.x0 + d.x1) / 2))
    .attr("y", top + bh / 2 + 4)
    .attr("text-anchor", "middle")
    .style("fill", css("--night"))
    .text((d) => pctN(d.v, 0));
  // names under the bar: the first flush left, the last flush right, the rest centred on their part
  g.append("text")
    .attr("class", "tk")
    .attr("x", (d, i) => (i === 0 ? 0 : i === parts.length - 1 ? W : x((d.x0 + d.x1) / 2)))
    .attr("y", top + bh + 16)
    .style("text-anchor", (d, i) => (i === 0 ? "start" : i === parts.length - 1 ? "end" : "middle"))
    .text((d) => d.label);
  if (spec.note) d3.select(el).append("p").attr("class", "ck").text(spec.note);
}

// spec.by "deciles": a municipality's polling places in ten groups of equal 2026 valid vote by a place variable,
// a bar per group for the change in Lula's share, labelled with the group's range (in minimum wages for income)
function decileChart(el, spec) {
  const v = VARS.find((z) => z.k === spec.var),
    vals = [],
    D = DOT[YS[0]],
    muni = rowsOf(spec.muni);
  for (const r of muni)
    for (let g = D.GM[r]; g < D.GM[r + 1]; g++) {
      const row = D.GR[g],
        x = row >= 0 ? v.val(row) : null;
      if (x == null) continue;
      let valid = 0;
      for (let i = 0, o = g * K; i < K; i++) if (i !== AB && i !== AO && i !== A8) valid += D.GV[o + i];
      vals.push([x, valid]);
    }
  vals.sort((p, q) => p[0] - q[0]);
  // cuts at each tenth of the valid vote
  const tot = d3.sum(vals, (p) => p[1]),
    cuts = [];
  let acc = 0;
  for (const [x, w] of vals) {
    acc += w;
    if (cuts.length < 9 && acc >= (tot * (cuts.length + 1)) / 10) cuts.push(x);
  }
  const bucket = (x) => {
      const i = cuts.findIndex((c) => x <= c);
      return i < 0 ? 9 : i;
    },
    sums = placeSums(spec.muni, v, bucket, 10),
    lo = [vals[0][0], ...cuts],
    hi = [...cuts, vals[vals.length - 1][0]],
    mw = (x) => num(x / spec.unit, 1),
    rows = sums.map((s, i) => ({
      d: shareOf(s, YS[0]) - shareOf(s, YS[1]),
      label: i === 9 ? `>${mw(lo[i])}` : `${mw(lo[i])}–${mw(hi[i])}`,
    }));
  const W = chartW(el),
    H = 158,
    top = 34,
    bot = 36,
    x = d3.scaleBand().domain(d3.range(10)).range([0, W]).padding(0.22),
    ext = d3.max(rows, (q) => Math.abs(q.d)),
    y = d3
      .scaleLinear()
      .domain([
        Math.min(0, -ext),
        Math.max(
          0,
          d3.max(rows, (q) => q.d),
        ),
      ])
      .nice()
      .range([H - bot, top]),
    lula = COLS[CI("13")];
  const s = chartSvg(el, W, H, spec.title);
  s.append("line").attr("x1", 0).attr("x2", W).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", css("--rule"));
  const g = s
    .append("g")
    .selectAll("g")
    .data(rows)
    .join("g")
    .attr("transform", (q, i) => `translate(${x(i)},0)`);
  g.append("rect")
    .attr("y", (q) => Math.min(y(0), y(q.d)))
    .attr("height", (q) => Math.abs(y(q.d) - y(0)))
    .attr("width", x.bandwidth())
    .attr("rx", 2)
    .attr("fill", lula)
    .attr("opacity", (q) => (q.d < 0 ? 1 : 0.45));
  g.append("text")
    .attr("class", "rv")
    .attr("x", x.bandwidth() / 2)
    .attr("y", (q) => (q.d < 0 ? y(q.d) + 11 : y(q.d) - 4))
    .attr("text-anchor", "middle")
    .style("font-size", "9.5px")
    .text((q) => signed(q.d));
  g.append("text")
    .attr("class", "tk")
    .attr("x", x.bandwidth() / 2)
    .attr("y", H - 4)
    .style("font-size", "8.5px")
    .text((q) => q.label);
  d3.select(el).append("p").attr("class", "ck").text(spec.note);
}

// spec.by "bands": the change in Lula's share by fixed income bands (spec.edges, in spec.unit), one line per area in
// spec.series (a municipality, "!code" for the rest of Brazil), so places of different incomes compare on one axis.
// A grey bar under each band shows the share of the second series' valid vote in it.
function bandChart(el, spec) {
  const v = VARS.find((z) => z.k === spec.var),
    edges = spec.edges.map((e) => e * spec.unit),
    nb = edges.length + 1,
    bucket = (x) => {
      const i = edges.findIndex((e) => x < e);
      return i < 0 ? edges.length : i;
    },
    series = spec.series.map((where, j) => {
      const sums = placeSums(where, v, bucket, nb),
        tot = d3.sum(sums, (q) => q[YS[0]][1]);
      return {
        j,
        pts: sums.map((q, i) => ({
          i,
          d: q[YS[0]][1] > spec.min ? shareOf(q, YS[0]) - shareOf(q, YS[1]) : null,
          w: q[YS[0]][1] / tot,
        })),
      };
    });
  const W = chartW(el),
    H = 178,
    top = 40,
    bot = 44,
    x = d3
      .scalePoint()
      .domain(d3.range(nb))
      .range([18, W - 8]),
    all = series.flatMap((q) => q.pts.map((p) => p.d)).filter((d) => d != null),
    y = d3
      .scaleLinear()
      .domain([Math.min(0, d3.min(all)), Math.max(0, d3.max(all))])
      .nice()
      .range([H - bot, top]),
    cols = [COLS[CI("13")], css("--haze")],
    s = chartSvg(el, W, H, spec.title);
  s.append("g")
    .selectAll("text")
    .data(y.ticks(4))
    .join("text")
    .attr("class", "tk")
    .attr("x", 0)
    .attr("y", (d) => y(d) + 3)
    .style("text-anchor", "start")
    .text((d) => (d ? signed(d).replace(/[.,]0$/, "") : "0"));
  s.append("line").attr("x1", 18).attr("x2", W).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", css("--rule"));
  // where the voters are: the share of the last series' valid vote in each band
  const wb = series[series.length - 1].pts,
    wmax = d3.max(wb, (p) => p.w);
  s.append("g")
    .selectAll("rect")
    .data(wb)
    .join("rect")
    .attr("x", (p) => x(p.i) - 8)
    .attr("width", 16)
    .attr("y", (p) => H - 30 - (10 * p.w) / wmax)
    .attr("height", (p) => (10 * p.w) / wmax)
    .attr("fill", css("--rule"));
  for (const q of series) {
    const line = d3
      .line()
      .defined((p) => p.d != null)
      .x((p) => x(p.i))
      .y((p) => y(p.d));
    s.append("path").attr("d", line(q.pts)).attr("fill", "none").attr("stroke", cols[q.j]).attr("stroke-width", 2);
    s.append("g")
      .selectAll("circle")
      .data(q.pts.filter((p) => p.d != null))
      .join("circle")
      .attr("cx", (p) => x(p.i))
      .attr("cy", (p) => y(p.d))
      .attr("r", 3)
      .attr("fill", cols[q.j]);
  }
  const lab = (i) =>
    i === 0
      ? `<${num(spec.edges[0], 1)}`
      : i === nb - 1
        ? `>${num(spec.edges[i - 1], 0)}`
        : `${num(spec.edges[i - 1], 1)}–${num(spec.edges[i], 1)}`.replace(/[.,]0(?=–|$)/g, "");
  s.append("g")
    .selectAll("text")
    .data(d3.range(nb))
    .join("text")
    .attr("class", "tk")
    .attr("x", (i) => x(i))
    .attr("y", H - 16)
    .style("font-size", "8.5px")
    .text(lab);
  s.append("text")
    .attr("class", "tk")
    .attr("x", W / 2)
    .attr("y", H - 2)
    .style("font-size", "9px")
    .text(spec.axis);
  d3.select(el)
    .append("p")
    .attr("class", "ck")
    .html(
      spec.labels.map((l, j) => `<i style="background:${cols[j]}"></i>${l}`).join(" ") +
        ` <i style="background:var(--rule);border-radius:0"></i>${spec.weight}`,
    );
}
