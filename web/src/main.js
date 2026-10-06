// How Brazil Voted: the page's entry point. Modules set up their parts of the page in this order; the data has
// loaded by the time any of them runs (see data.js).
import "./styles/main.css";
import { applyDom } from "./i18n/index.js";
import { initArrows } from "./map/arrows.js";
import { initMap } from "./map/base.js";
import { initCompare } from "./map/compare.js";
import { initLabels } from "./map/labels.js";
import { initNotes } from "./map/notes.js";
import { repaint } from "./map/render.js";
import { panel } from "./panel/results.js";
import { initStudio } from "./panel/studio.js";
import { initSearch } from "./search.js";
import { initStory } from "./story/story.js";
import { initHash } from "./view/hash.js";
import { initHints } from "./view/hints.js";
import { done as loaded } from "./view/loader.js";
import { initShare } from "./view/share.js";

applyDom(); // the page's copy first: the modules below fill in parts of it
initHints();
initStudio();
initMap();
panel();
initLabels();
initNotes();
repaint();
initCompare();
initSearch();
initArrows();
initShare();
initStory();
initHash(); // after the tabs, so a shared view's layout and settings win
requestAnimationFrame(loaded); // once the first frame is painted
