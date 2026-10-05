# Brazil 2026 presidential dot map. `make` rebuilds the page from the committed data.
PY ?= python3
OUT = brazil_2026_president_map.html

$(OUT): pipeline/build.py pipeline/geometry.py web/index.html web/style.css web/map.js data/places.json data/results.json
	$(PY) -m pipeline.build

# Refetch results from the TSE API (data/results.json, data/mun-config.json)
results:
	$(PY) -m pipeline.fetch_results

# Rebuild data/places.json; needs the TSE open-data CSVs unzipped into data/raw/ (see README)
places:
	$(PY) -m pipeline.prep_places

open: $(OUT)
	open $(OUT)

.PHONY: results places open
