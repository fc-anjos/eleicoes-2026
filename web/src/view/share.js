// Share: a dialog with this view's link (optionally map only, for embedding) and a copy button
import * as d3 from "d3";
import { stateHash } from "./hash.js";

export function initShare() {
  const dlg = document.getElementById("sharedlg"),
    surl = document.getElementById("shareurl"),
    copy = d3.select("#sharecopy");
  const refresh = () => {
    surl.value = location.href.split("#")[0] + "#" + stateHash(document.getElementById("shareembed").checked);
    copy.text("Copy");
  };
  d3.select("#share").on("click", () => {
    refresh();
    dlg.showModal();
    surl.select();
  });
  d3.select("#shareembed").on("change", refresh);
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
    copy.text(ok ? "Copied" : "Select and copy");
  });
  d3.select("#shareclose").on("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
}
