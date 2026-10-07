// "How to read this map": a motion graphic in a modal, opened from the change circles' map key. It teaches how to
// read the circles on three real cities, one idea per caption, each shape turning into the next rather than cutting
// away. Every area is on one scale (area to votes); when a bigger city comes in, the view widens rather than the
// shapes shrinking, and a caption says both are on one scale.
// 1. Goiânia's whole vote grows out of a point into a square, area to votes;
// 2. the square split at Lula's 2022 share;
// 3. the split slides to his 2026 share: the strip between is the change;
// 4. the strip takes the colour of the direction (blue: Lula's share fell);
// 5. the strip gathers into a circle of the same area, about 38,000 votes; the city stays as a faint outline;
// 6-7. the camera pulls back for São Paulo, more than eight times bigger: a thin 1-point strip, yet a bigger circle;
// 8. Belém, Goiânia's size, moved the other way: a red circle;
// 9. the circles stay, the squares recede; the reader can play it again or close it.
// Escape, the close button or a click outside the panel close it. Without motion there is no button.
import * as d3 from "d3";
import { LANG } from "../i18n/index.js";
import en from "./readviz/en.json";
import pt from "./readviz/pt.json";
import { CI, COLS } from "../state.js";

// the graphic's words (captions, labels), one file per language, kept apart so they can be edited on their own
const copy = () => (LANG === "en" ? en : pt);
const still = matchMedia("(prefers-reduced-motion: reduce)");
// the places: valid votes in 2026, Lula's 2022 share (%), the net votes of the change in his share (its sign the
// direction) and x along the stage's baseline (world units, a square's side being √votes)
const TOWNS = [
  { k: "gyn", v: 791095, a: 33.0, net: -38e3, x: 0 },
  { k: "sp", v: 6552820, a: 47.5, net: -63e3, x: 1500 },
  { k: "bel", v: 826218, a: 45.7, net: 19e3, x: 4660 },
];
for (const d of TOWNS) {
  d.S = Math.sqrt(d.v);
  d.b = d.a + (100 * d.net) / d.v; // the 2026 share the net implies
  d.r = Math.sqrt(Math.abs(d.net) / Math.PI);
  d.gap = Math.min(0.12 * d.S, 140);
  d.cx = d.x + d.S / 2;
  d.cy = -d.S - d.gap - d.r;
}
let RUN = 0;
let box = null,
  opener = null;
export const stopRead = () => {
  RUN++;
  if (!box) return;
  box.interrupt().selectAll("*").interrupt();
  box.remove();
  box = null;
  document.removeEventListener("keydown", onKey);
  opener?.focus();
};
const onKey = (e) => {
  if (e.key === "Escape") stopRead();
  e.stopPropagation(); // the story's arrow keys stay with the modal while it is open
};

// the map key's "how to read this map" button opens it (the key is redrawn, so the click is caught on the key)
export function initReadViz() {
  d3.select("#vkey").on("click.rv", (e) => {
    const b = e.target.closest(".rvopen");
    if (b) ((opener = b), playRead());
  });
}

// the panel's box for the shapes, with room under it for the caption
function stage(panel) {
  const w = panel.getBoundingClientRect(),
    capH = w.width < 600 ? 120 : 96,
    sw = w.width - 48,
    sh = Math.max(160, w.height - capH - 72);
  return { x: 24, y: 48, sw, sh };
}

export async function playRead() {
  stopRead();
  if (still.matches) return;
  const L = copy();
  box = d3
    .select("body")
    .append("div")
    .attr("class", "rvmodal rviz")
    .attr("role", "dialog")
    .attr("aria-modal", "true")
    .attr("aria-label", L.aria)
    .on("click", (e) => e.target === e.currentTarget && stopRead());
  const panel = box.append("div").attr("class", "rv-panel");
  panel
    .append("button")
    .attr("class", "rv-x")
    .attr("aria-label", L.close)
    .text("×")
    .on("click", stopRead)
    .node()
    .focus();
  document.addEventListener("keydown", onKey, true);
  const run = RUN,
    C = L.captions,
    s = stage(panel.node()),
    blue = COLS[CI("22")],
    red = COLS[CI("13")],
    { sw, sh } = s,
    // labels sit under each square and over each circle, so the camera frames the shapes in a slightly smaller box
    fw = sw - 24,
    fh = sh - 64,
    ox = s.x + sw / 2,
    oy = s.y + 22 + fh / 2;
  // a stop (another step, Explore, a replay) ends the sequence at its next await
  const alive = () => {
    if (run !== RUN) throw new Error("stopped");
  };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms)).then(alive);
  const tr = (sel, dur = 900) => sel.transition().duration(dur).ease(d3.easeCubicInOut);
  const done = (x) => x.end().then(alive, alive);
  const root = panel.append("svg").attr("class", "rv-svg").attr("aria-hidden", "true"),
    world = root.append("g").attr("class", "rv-world"),
    ui = root.append("g");
  const cap = panel
    .append("p")
    .attr("class", "rv-cap")
    .style("left", s.x + (sw - Math.min(sw, 560)) / 2 + "px")
    .style("width", Math.min(sw, 560) + "px")
    .style("top", s.y + sh + 8 + "px");
  // a caption, and the time it needs to be read: what the beat waits for before moving on
  const say = async (key) => {
    await done(tr(cap, 300).style("opacity", 0));
    cap.text(C[key]);
    await done(tr(cap, 400).style("opacity", 1));
    return wait(900 + 30 * C[key].length);
  };

  // the camera: [centre x, centre y, width] in world units, moved with d3's smooth zoom; labels are in screen space
  // and follow their world anchors
  let cam = [0, 0, 1];
  const u = () => fw / cam[2],
    sx = (x) => ox + (x - cam[0]) * u(),
    sy = (y) => oy + (y - cam[1]) * u();
  const place = () => {
    world.attr("transform", `translate(${sx(0)},${sy(0)}) scale(${u()})`);
    ui.selectAll("text")
      .attr("x", (d) => sx(d.x))
      .attr("y", (d) => sy(d.y) + d.dy);
  };
  // the view that frames these places, circles and all
  const frame = (ts) => {
    const x0 = d3.min(ts, (d) => d.x) - 20,
      x1 = d3.max(ts, (d) => d.x + d.S) + 20,
      y0 = d3.min(ts, (d) => d.cy - d.r) - 10,
      w = Math.max(x1 - x0, (-y0 * fw) / fh);
    return [(x0 + x1) / 2, y0 / 2, w];
  };
  const look = (ts, dur) => {
    const i = d3.interpolateZoom(cam, frame(ts));
    return done(
      box
        .transition()
        .duration(dur || Math.max(1400, i.duration * 1.1))
        .ease(d3.easeCubicInOut)
        .tween("cam", () => (k) => ((cam = i(k)), place())),
    );
  };
  // a rect drawn as a circle of radius r around (cx, cy): the shape the sliver morphs into
  const disc = (sel, cx, cy, r) =>
    sel
      .attr("x", cx - r)
      .attr("y", cy - r)
      .attr("width", 2 * r)
      .attr("height", 2 * r)
      .attr("rx", r);
  const label = (x, y, dy, text, cls = "rv-s") =>
    ui.append("text").datum({ x, y, dy }).attr("class", cls).text(text).style("opacity", 0);

  // each place: its whole vote (a square), Lula's part of it, the sliver of change, and its labels
  for (const d of TOWNS) {
    const g = world.append("g").style("opacity", 0);
    d.g = g;
    d.sq = g
      .append("rect")
      .attr("class", "rv-sq")
      .attr("x", d.x)
      .attr("y", -d.S)
      .attr("width", d.S)
      .attr("height", d.S);
    d.lula = g.append("rect").attr("x", d.x).attr("y", -d.S).attr("width", 0).attr("height", d.S).style("fill", red);
    const lo = Math.min(d.a, d.b) / 100,
      hi = Math.max(d.a, d.b) / 100;
    d.sl = world
      .append("rect")
      .attr("class", "rv-sl")
      .attr("x", d.x + lo * d.S)
      .attr("y", -d.S)
      .attr("width", (hi - lo) * d.S)
      .attr("height", d.S)
      .attr("rx", 0)
      .style("fill", d.net < 0 ? blue : red)
      .style("fill-opacity", 0)
      .style("opacity", 0);
    d.labs = [
      label(d.cx, 0, 18, L.cities[d.k].name, "rv-n"),
      label(d.cx, 0, 34, L.cities[d.k].votes),
      label(d.cx, d.cy - d.r, -24, L.cities[d.k].change),
      label(d.cx, d.cy - d.r, -8, L.cities[d.k].net),
    ];
  }
  place();
  const [gyn, sp, bel] = TOWNS;
  // the whole vote, then Lula's 2022 share of it
  const show = async (d) => {
    tr(d.g, 600).style("opacity", 1);
    tr(d.labs[0], 600).style("opacity", 1);
    await done(tr(d.labs[1], 600).style("opacity", 1));
  };
  const split = (d) => done(tr(d.lula, 1000).attr("width", (d.a / 100) * d.S));
  // the line slides to 2026, the sliver lights up and takes its colour
  const slide = async (d, colour = true) => {
    tr(d.lula, 1100).attr("width", (Math.min(d.a, d.b) / 100) * d.S);
    await done(tr(d.sl, 600).style("opacity", 1));
    if (colour) await done(tr(d.sl, 800).style("fill-opacity", 1));
  };
  // the sliver gathers into a circle of the same area above its town, which recedes to an outline
  const gather = async (d) => {
    tr(d.g, 1200).style("opacity", 0.35);
    await done(tr(d.sl, 1300).style("stroke-opacity", 0).call(disc, d.cx, d.cy, d.r));
    await done(tr(d.labs[2], 500).style("opacity", 1));
  };

  try {
    cam = frame([gyn]);
    place();
    // 1: Goiânia's whole vote grows out of a point as its caption appears
    let read = say("b1");
    gyn.sq.call(disc, gyn.cx, -gyn.S / 2, 0);
    gyn.g.style("opacity", 1);
    await done(tr(gyn.sq, 300).call(disc, gyn.cx, -gyn.S / 2, gyn.S * 0.03));
    await done(
      tr(gyn.sq, 1300).attr("x", gyn.x).attr("y", -gyn.S).attr("width", gyn.S).attr("height", gyn.S).attr("rx", 0),
    );
    await read;
    // 2-5: Goiânia, beat by beat
    read = say("b2");
    await show(gyn);
    await split(gyn);
    await read;
    read = say("b3");
    await slide(gyn, false);
    await read;
    read = say("b4");
    await done(tr(gyn.sl, 800).style("fill-opacity", 1));
    await read;
    read = say("b5");
    await gather(gyn);
    await read;
    // 6-7: the camera pulls back for São Paulo
    read = say("b6");
    await look([gyn, sp]);
    await show(sp);
    await split(sp);
    await read;
    read = say("b7");
    await slide(sp);
    await gather(sp);
    await read;
    // 8: Belém, the other way
    read = say("b8");
    await look(TOWNS, 1200);
    await show(bel);
    await split(bel);
    await slide(bel);
    await gather(bel);
    await read;
    // 9: the three circles stay; the squares recede, and the reader can play it again or go back to the map
    say("b9");
    for (const d of TOWNS) tr(d.g, 700).style("opacity", 0.15);
    const end = panel.append("div").attr("class", "rv-end");
    end
      .append("button")
      .text(L.replay)
      .on("click", () => playRead());
    end.append("button").text(L.close).on("click", stopRead);
    tr(end, 600).style("opacity", 1);
  } catch {
    // stopped
  }
}
