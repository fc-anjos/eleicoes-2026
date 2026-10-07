// The map's data, built by pipeline/build.py into public/data/map.json and fetched once at startup. Every module
// that imports from here runs after it has loaded (top-level await).
//   MG, SG     municipality and state outlines (GeoJSON)
//   M          per municipality (IBGE code): name, state, per-year counts by colour category, studio variables
//   CATS       colour categories shared by both years: {k: ballot number ("" for Others, "A…" abstention), col}
//   YEARS      per year: date, national figures, candidates, packed dots and their groups
//   ORDER      municipality order of the dot groups (feature indices of MG)
//   STUDIO     municipal filter variables; PLACES: neighbourhood variables per polling place
//   VPD        votes per dot
import { ROOT } from "./i18n/index.js";
import STORY from "./story/story.json";
import * as loader from "./view/loader.js";

// read as a stream, so the loader can show how much has arrived
async function load(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the map data (${res.status}): run \`make data\``);
  const total = __MAP_BYTES__ || +res.headers.get("content-length") || 0,
    reader = res.body.getReader(),
    parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    loader.progress(got, total);
  }
  loader.drawing();
  const all = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}

loader.start();
export const { MG, SG, M, CATS, YEARS, ORDER, STUDIO, PLACES, VPD } = await load(`${ROOT}data/map.json`);
export { STORY };
