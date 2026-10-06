// First-visit hints: how to move the map, and that the year divider drags. Each goes once used.
import * as d3 from "d3";
import { t } from "../i18n/index.js";

export function hintDone(id) {
  document.getElementById(id)?.classList.add("gone");
}

export function initHints() {
  setTimeout(() => hintDone("maphint"), 12000);
  if (matchMedia("(pointer:coarse)").matches) d3.select(".mh-z").text(t("map.hintPinch"));
}
