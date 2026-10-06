# Brazil 2026 presidential dot map. `make` builds the data and the site (dist/); `make dev` serves it with reload.
PY ?= python3
DATA = web/public/data/map.json

all: build

$(DATA): pipeline/build.py pipeline/geometry.py pipeline/jsonio.py data/places_2026.json data/places_2022.json data/mun-config.json data/studio.csv data/places_studio.csv
	$(PY) -m pipeline.build

data: $(DATA)

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

build: $(DATA) node_modules
	npm run build

dev: $(DATA) node_modules
	npm run dev

# Linters and formatters: ruff for the pipeline, ESLint and Prettier for the page
lint: node_modules
	uvx ruff check pipeline
	uvx ruff format --check pipeline
	npm run lint

format: node_modules
	uvx ruff check --fix pipeline
	uvx ruff format pipeline
	npm run format

# Opens the built page in headless Chromium and checks each mode draws (npx playwright install chromium, once)
test: build
	npm run test:smoke

# Refetch results from the TSE API (data/results.json, data/mun-config.json)
results:
	$(PY) -m pipeline.fetch_results

# Rebuild data/places_YYYY.json; needs the TSE open-data CSVs unzipped into data/raw/ (see README)
places:
	$(PY) -m pipeline.prep_places 2026
	$(PY) -m pipeline.prep_places 2022

.PHONY: all data build dev lint format test results places
