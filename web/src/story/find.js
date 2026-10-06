// "Find your place": a step where the reader types a municipality; the map flies there in compare mode and the
// card says how it moved against the country
import * as d3 from "d3";
import { M } from "../data.js";
import { MAXK, path, proj, select } from "../map/base.js";
import { CI, S, YS } from "../state.js";
import { abRate, share } from "../stats.js";
import { find } from "../search.js";
import { figures } from "../totals.js";
import { applyState, restoring } from "../view/hash.js";

const nat = (y, k) => {
  const F = figures(y);
  return (100 * F.c[CI(k)]) / F.valid;
};

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
    const a = share(YS[1], m, "13"),
      b = share(YS[0], m, "13"),
      dl = b - a,
      dn = nat(YS[0], "13") - nat(YS[1], "13"),
      ab = abRate(YS[0], m) - abRate(YS[1], m);
    const ns = `${Math.abs(dn).toFixed(1)} points nationally`;
    const how =
      dl >= 0
        ? `rose ${dl.toFixed(1)} points here, while it fell ${ns}`
        : `fell ${Math.abs(dl).toFixed(1)} points here, ` +
          (Math.abs(dl - dn) < 1
            ? `about the same as the ${ns}`
            : dl > dn
              ? `less than the ${ns}`
              : `more than the ${ns}`);
    res.html(
      `<p><b>${d.label}</b>: Lula ${a.toFixed(1)}% in ${YS[1]}, ${b.toFixed(1)}% in ${YS[0]}. His share ${how}. ` +
        `Abstention ${ab >= 0 ? "rose" : "fell"} ${Math.abs(ab).toFixed(1)} points.</p>`,
    );
  }
}
