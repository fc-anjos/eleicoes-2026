// The map's data, built by pipeline/build.py into public/data/map.json and fetched once at startup. Every module
// that imports from here runs after it has loaded (top-level await).
//   MG, SG     municipality and state outlines (GeoJSON)
//   M          per municipality (IBGE code): name, state, per-year counts by colour category, studio variables
//   CATS       colour categories shared by both years: {k: ballot number ("" for Others, "A…" abstention), col}
//   YEARS      per year: date, national figures, candidates, packed dots and their groups
//   ORDER      municipality order of the dot groups (feature indices of MG)
//   STUDIO     municipal filter variables; PLACES: neighbourhood variables per polling place
//   VPD        votes per dot
import STORY from "./story/story.json";

const res = await fetch(`${import.meta.env.BASE_URL}data/map.json`);
if (!res.ok) throw new Error(`Could not load the map data (${res.status}): run \`make data\``);
export const { MG, SG, M, CATS, YEARS, ORDER, STUDIO, PLACES, VPD } = await res.json();
export { STORY };
