"""Build a self-contained HTML choropleth of the 2026 presidential 1st round by municipality."""
import json, random

VPD = 1000  # votes per dot
random.seed(2026)

def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 3), round(c[1], 3)]

r = json.load(open("data/results.json"))
mgeo = json.load(open("data/br-mun.geojson"))
sgeo = json.load(open("data/br-states.geojson"))
for g in (mgeo, sgeo):
    for f in g["features"]:
        f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])
def area(r):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:]))

def rewind(polys):
    # d3-geo wants clockwise outer rings and counter-clockwise holes
    return [[ring[::-1] if (area(ring) > 0) == (i == 0) else ring for i, ring in enumerate(p)] for p in polys]

for f in mgeo["features"]:
    g = f["geometry"]
    g["coordinates"] = rewind([g["coordinates"]])[0] if g["type"] == "Polygon" else rewind(g["coordinates"])
sgeo["features"] = [{"type": "Feature", "properties": {"sigla": f["properties"]["sigla"]}, "geometry": f["geometry"]} for f in sgeo["features"]]

muns = {}
for code, m in r["municipalities"].items():
    if m["uf"] == "zz": continue
    ranked = sorted(m["votes"].items(), key=lambda x: -x[1])[:4]
    muns[code] = {"n": m["name"].title(), "uf": m["uf"].upper(), "t": sum(m["votes"].values()), "v": ranked}
def inside(x, y, polys):
    c = False
    for p in polys:
        for ring in p:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
                if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                    c = not c
    return c

def sample(polys, n):
    pts = [pt for p in polys for pt in p[0]]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    out, tries = [], 0
    while len(out) < n and tries < n * 200 + 1000:
        tries += 1
        x, y = random.uniform(x0, x1), random.uniform(y0, y1)
        if inside(x, y, polys): out.append((x, y))
    return out

# category per dot: 0 Flavio, 1 Lula, 2 everyone else; random rounding keeps totals unbiased
CAT = {"FLAVIO BOLSONARO": 0, "LULA": 1}
dots = []
for f in mgeo["features"]:
    m = r["municipalities"].get(f["properties"]["codarea"])
    if not m: continue
    g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    cats = [0, 0, 0]
    for name, v in m["votes"].items():
        cats[CAT.get(name, 2)] += v
    want = []
    for c, v in enumerate(cats):
        want += [c] * (int(v // VPD) + (random.random() < v % VPD / VPD))
    for (x, y), c in zip(sample(polys, len(want)), want):
        dots += [round(x * 1000), round(y * 1000), c]
idx = list(range(len(dots) // 3)); random.shuffle(idx)  # avoid one colour painting over another
dots = [v for i in idx for v in dots[3 * i:3 * i + 3]]
print(len(dots) // 3, "dots")

html = open("map_template.html").read()
for k, v in {"__MGEO__": mgeo, "__SGEO__": sgeo, "__MUNS__": muns, "__NAT__": r["national"]["votes"], "__DOTS__": dots, "__VPD__": VPD}.items():
    html = html.replace(k, json.dumps(v, ensure_ascii=False, separators=(",", ":")))
open("brazil_2026_president_map.html", "w").write(html)
print("ok", len(muns), "municipalities;", sum(1 for f in mgeo["features"] if f["properties"]["codarea"] not in muns), "unmatched shapes")
