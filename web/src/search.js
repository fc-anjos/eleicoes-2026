// Municipality search: accent- and case-insensitive; prefix matches first, then substring matches, each by size
import * as d3 from "d3";
import { M, MG } from "./data.js";
import { fold } from "./format.js";
import { t as tr } from "./i18n/index.js";
import { select } from "./map/base.js";
import { votesCast } from "./stats.js";

// every municipality, bigger ones first
export const index = MG.features
  .filter((f) => M[f.properties.codarea])
  .map((f) => {
    const m = M[f.properties.codarea];
    return { f, label: m.n, uf: m.uf, key: fold(m.n), t: votesCast(m) };
  })
  .sort((a, b) => b.t - a.t);

export function find(text, n) {
  const t = fold(text.trim());
  if (!t) return [];
  return [
    ...index.filter((d) => d.key.startsWith(t)),
    ...index.filter((d) => !d.key.startsWith(t) && d.key.includes(t)),
  ].slice(0, n);
}

export function initSearch() {
  const q = document.getElementById("q"),
    ql = d3.select("#qlist");
  let hits = [],
    cur = -1;
  function show() {
    const t = q.value.trim();
    hits = find(t, 8);
    cur = hits.length ? 0 : -1;
    ql.attr("hidden", t ? null : true);
    q.setAttribute("aria-expanded", String(!!t));
    ql.selectAll("li")
      .data(hits.length ? hits : t ? [null] : [])
      .join("li")
      .attr("id", (d, i) => "q" + i)
      .attr("role", (d) => (d ? "option" : null))
      .attr("class", (d) => (d ? null : "none"))
      .html((d) => (d ? `${d.label}<span>${d.uf}</span>` : tr("explore.noMatch")))
      .on("mousedown", (e, d) => {
        if (d) {
          e.preventDefault();
          pick(d);
        }
      });
    mark();
  }
  function mark() {
    ql.selectAll("li").attr("aria-selected", (d, i) => String(i === cur));
    q.setAttribute("aria-activedescendant", cur >= 0 ? "q" + cur : "");
    if (cur >= 0) document.getElementById("q" + cur)?.scrollIntoView({ block: "nearest" });
  }
  function pick(d) {
    q.value = `${d.label}, ${d.uf}`;
    ql.attr("hidden", true);
    q.setAttribute("aria-expanded", "false");
    select(d.f, true);
  }
  q.addEventListener("input", show);
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!hits.length) return;
      e.preventDefault();
      cur = (cur + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length;
      mark();
    } else if (e.key === "Enter" && cur >= 0) {
      e.preventDefault();
      pick(hits[cur]);
    } else if (e.key === "Escape") {
      q.value = "";
      show();
      select(null);
    }
  });
  q.addEventListener("blur", () =>
    setTimeout(() => {
      ql.attr("hidden", true);
      q.setAttribute("aria-expanded", "false");
    }, 100),
  );
}
