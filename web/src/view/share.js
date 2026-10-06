// Share: a dialog with a link and a copy button. In the story it shares the story itself (in the page's language),
// optionally opening at the step on screen; in Explore, the exact view (optionally map only, for embedding).
import * as d3 from "d3";
import { LANG, t } from "../i18n/index.js";
import { currentStep } from "../story/story.js";
import { stateHash } from "./hash.js";

const storyMode = () => d3.select("#page").classed("storymode");
function storyLink(atStep) {
  const u = new URL(location.pathname, location.origin);
  if (LANG !== "en") u.searchParams.set("lang", LANG);
  const st = currentStep();
  if (atStep && st) u.searchParams.set("step", st.id);
  return u.href;
}

export function initShare() {
  const dlg = document.getElementById("sharedlg"),
    surl = document.getElementById("shareurl"),
    copy = d3.select("#sharecopy");
  const refresh = () => {
    const story = storyMode(),
      st = currentStep();
    d3.select("#sharet").text(t(story ? "share.storyTitle" : "share.title"));
    const atStep = document.getElementById("sharestep").checked && st;
    d3.select("#sharebody").text(t(story ? (atStep ? "share.storyBodyStep" : "share.storyBody") : "share.body"));
    d3.select("#shareembedrow").property("hidden", story);
    d3.select("#sharesteprow").property("hidden", !story || !st);
    if (st) d3.select("#sharesteplabel").text(t("share.atStep", { h: st.h }));
    surl.value = story
      ? storyLink(document.getElementById("sharestep").checked)
      : location.href.split("#")[0] + "#" + stateHash(document.getElementById("shareembed").checked);
    copy.text(t("share.copy"));
  };
  d3.select("#share").on("click", () => {
    document.getElementById("sharestep").checked = false; // the whole story by default
    refresh();
    dlg.showModal();
    surl.select();
  });
  d3.select("#shareembed").on("change", refresh);
  d3.select("#sharestep").on("change", refresh);
  copy.on("click", async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(surl.value);
      ok = true;
    } catch {
      surl.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        /* the reader copies it by hand */
      }
    }
    copy.text(t(ok ? "share.copied" : "share.manual"));
  });
  d3.select("#shareclose").on("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
}
