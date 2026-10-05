# Where Brazil Voted

A dot-density map of the 2026 Brazilian presidential election, first round: one dot per 250 votes, placed
around the polling place where the votes were cast. The output is a single self-contained page,
`brazil_2026_president_map.html` (d3 and fonts load from CDNs).

## Layout

```
pipeline/            Python data pipeline (run as modules from the repo root)
  fetch_results.py   TSE results API -> data/results.json, data/mun-config.json
  prep_places.py     TSE open-data CSVs (data/raw/) -> data/places.json: votes per polling place, with coordinates
  geometry.py        polygon helpers: point-in-polygon, distances, Voronoi-cell placement
  build.py           data/ + web/ -> brazil_2026_president_map.html
web/                 the page, as source
  index.html         markup; build.py inlines the CSS, JS and data into it
  style.css
  map.js             canvas dot renderer, zoom, selection, search, controls
data/                inputs (committed; data/raw/ is not)
  br-mun.geojson, br-states.geojson   IBGE outlines
```

## Building

```
make          # rebuild the page (python3 with numpy)
make open
```

To regenerate the data: `make results` refetches the totals, and `make places` rebuilds the polling-place file
from these TSE open-data files, unzipped into `data/raw/`:

- `votacao_secao_2026_BR.csv`: votes per section
- `eleitorado_local_votacao_2026_XX.csv`: one per state, polling places with coordinates
- `y2024/eleitorado_local_votacao_2024.csv`: 2024 coordinates, a fallback for bad 2026 ones

Tuning: `VPD`, `PER_PLACE` and `TOL_KM` at the top of `pipeline/build.py`; dot radius, opacity and border
zoom behaviour at the top of the relevant sections of `web/map.js`.
