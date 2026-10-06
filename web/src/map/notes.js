// Map notes: a story step can label places on the map, each a short text with a leader line to its point, kept in
// place as the map moves
import * as d3 from "d3";
import { S } from "../state.js";
import { proj, svg } from "./base.js";

let notesG = null;

export function drawNotes(t) {
  if (!notesG) return;
  t = t || d3.zoomTransform(svg.node());
  const sel = notesG
    .selectAll("g.note")
    .data(S.NOTES, (d) => d.t)
    .join(
      (en) => {
        const g = en.append("g").attr("class", "note").style("opacity", 0);
        g.append("line");
        g.append("circle").attr("r", 3);
        g.append("text");
        g.transition().duration(500).style("opacity", 1);
        return g;
      },
      undefined,
      (ex) => ex.transition().duration(300).style("opacity", 0).remove(),
    );
  sel.each(function (d) {
    const p = proj(d.at),
      x = p[0] * t.k + t.x,
      y = p[1] * t.k + t.y,
      dx = d.dx ?? 40,
      dy = d.dy ?? -30,
      g = d3.select(this);
    g.select("circle").attr("cx", x).attr("cy", y);
    g.select("line")
      .attr("x1", x)
      .attr("y1", y)
      .attr("x2", x + dx * 0.85)
      .attr("y2", y + dy * 0.85);
    g.select("text")
      .attr("x", x + dx)
      .attr("y", y + dy)
      .attr("text-anchor", dx < 0 ? "end" : "start")
      .text(d.t);
  });
}

export function setNotes(notes) {
  S.NOTES = notes || [];
  drawNotes();
}

export function initNotes() {
  notesG = svg.append("g").attr("class", "notes");
}
