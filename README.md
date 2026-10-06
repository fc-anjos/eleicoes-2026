# Where Brazil Voted

A dot-density map of the Brazilian presidential election, first round, in 2026 and 2022 (switchable): one dot per
250 votes, placed around the polling place where the votes were cast. Abstentions (people on the roll who didn't
vote) can be shown as grey dots, placed the same way. A scrolling story walks through how the vote moved between
the two elections; Explore has the full results panel and the studio's filters.

## Layout

```
pipeline/              Python data pipeline (run as modules from the repo root)
  fetch_results.py     TSE results API -> data/results.json, data/mun-config.json
  prep_places.py       TSE open-data CSVs (data/raw/) -> data/places_YYYY.json: votes and abstentions per polling place
  geometry.py          polygon helpers: point-in-polygon, distances, Voronoi-cell placement
  build.py             data/ -> web/public/data/map.json, the page's data (dots, outlines, figures, filters)
  jsonio.py            JSON/CSV file helpers
web/                   the page (Vite root)
  index.html           markup
  src/main.js          entry point: sets up each part of the page in order
  src/data.js          loads map.json; story/story.json holds the story's steps (views, charts, note positions)
  src/i18n/            every string the reader sees (en.json) and t(), the lookup the modules use
  src/state.js         shared view state (year, filters, focus…), colour categories and their colours
  src/format.js, stats.js, totals.js, dots.js       formatting, per-municipality figures, totals, packed dots
  src/filters/         filter variables and the filter itself
  src/map/             SVG base map and zoom, the dot canvas (render.js), swing arrows, labels, notes, year divider
  src/panel/           results panel and studio controls
  src/story/           story steps, card charts, "find your place"
  src/view/            the view in the URL, share dialog, first-visit hints
  src/styles/          CSS, one file per area, imported in cascade order by main.css
data/                  inputs (committed; data/raw/ is not)
  br-mun.geojson, br-states.geojson   IBGE outlines
tests/smoke.mjs        opens the built page in headless Chromium and checks each mode draws
```

## Translating

All copy lives in `web/src/i18n/en.json`: the page's labels, the story's text by step id (`story.steps.<id>`), chart
titles and the filter variables' names. To add a language, copy it to `web/src/i18n/xx.json` (e.g. `pt.json`),
translate the values and open the page with `?lang=xx`. Keys left out fall back to English; `{name}` placeholders
must stay. Numbers follow the locale.

## Building

Needs Python 3.11+ with numpy, Node 20+ and [uv](https://docs.astral.sh/uv/) (for ruff).

```
make          # build the data (web/public/data/map.json) and the site (dist/)
make dev      # serve the page with live reload
make lint     # ruff, ESLint and Prettier (make format fixes what it can)
make test     # smoke test (once: npx playwright install chromium)
```

`dist/` is a static site: serve it from any path (e.g. GitHub Pages).

To regenerate the data: `make results` refetches the totals, and `make places` rebuilds the polling-place file
from these TSE open-data files, unzipped into `data/raw/`:

- `votacao_secao_2026_BR.csv`: votes per section
- `detalhe_votacao_secao_2026_BR.csv`: abstentions, blank and null votes per section
- `eleitorado_local_votacao_2026_XX.csv`: one per state, polling places with coordinates
- `y2022/`: the same three for 2022 (`eleitorado_local_votacao_2022.csv` is a single file)
- `y2024/eleitorado_local_votacao_2024.csv`: 2024 coordinates, a fallback for missing or bad ones

Each year uses its own polling-place coordinates. Only where that year's record has none (TSE's 2022 file lacks
them for ~30% of voters in BA, ES and SE) are the same place's 2024 or 2026 coordinates used, matched by
municipality and place number and name, then name, then address.

Tuning: `VPD`, `PER_PLACE` and `TOL_KM` at the top of `pipeline/build.py`; dot radius and opacity at the top of
`web/src/map/render.js`, border zoom behaviour in `web/src/map/base.js`.
