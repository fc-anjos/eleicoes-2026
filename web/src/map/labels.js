// Place names. Municipalities are tried in order of votes cast; a name is shown when it falls in view and doesn't
// collide with one already placed, so big cities win and more names appear as you zoom in. Names sit at the
// municipality's centroid.
import * as d3 from "d3";
import { M, MG } from "../data.js";
import { S } from "../state.js";
import { votesCast } from "../stats.js";
import { path, svg } from "./base.js";

const LABELS_K = 2.5; // names appear from this zoom
let labG = null;
const LAB = MG.features
  .filter((f) => M[f.properties.codarea])
  .map((f) => ({ f, n: M[f.properties.codarea].n, t: votesCast(M[f.properties.codarea]), c: [0, 0] }))
  .sort((a, b) => b.t - a.t);
let labGen = -1;

export function placeLabels(t) {
  if (!labG) return;
  const { w, h } = S;
  if (labGen !== S.layoutGen) {
    LAB.forEach((d) => (d.c = path.centroid(d.f))); // centroids follow the fitted projection
    labGen = S.layoutGen;
  }
  const out = [];
  if (t.k >= LABELS_K) {
    const boxes = [],
      max = Math.round((w * h) / 28000);
    for (const d of LAB) {
      if (out.length >= max) break;
      const x = d.c[0] * t.k + t.x,
        y = d.c[1] * t.k + t.y;
      if (x < 20 || x > w - 20 || y < 10 || y > h - 90) continue; // keep clear of the key and credits
      const fs = d.t > 1e6 ? 13.5 : d.t > 2e5 ? 12 : 11,
        bw = d.n.length * fs * 0.56 + 40,
        bh = fs + 26,
        b = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
      if (boxes.some((o) => o[0] < b[2] && b[0] < o[2] && o[1] < b[3] && b[1] < o[3])) continue;
      boxes.push(b);
      out.push({ d, x, y, fs });
    }
  }
  labG
    .selectAll("text")
    .data(out, (o) => o.d.f.properties.codarea)
    .join("text")
    .attr("x", (o) => o.x)
    .attr("y", (o) => o.y)
    .style("font-size", (o) => o.fs + "px")
    .classed("big", (o) => o.d.t > 1e6)
    .text((o) => o.d.n);
}

export function initLabels() {
  labG = svg.append("g").attr("class", "place");
  placeLabels(d3.zoomIdentity);
}
