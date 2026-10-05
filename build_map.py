"""Build a self-contained HTML choropleth of the 2026 presidential 1st round by municipality."""
import json

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
html = open("map_template.html").read()
for k, v in {"__MGEO__": mgeo, "__SGEO__": sgeo, "__MUNS__": muns, "__NAT__": r["national"]["votes"]}.items():
    html = html.replace(k, json.dumps(v, ensure_ascii=False, separators=(",", ":")))
open("brazil_2026_president_map.html", "w").write(html)
print("ok", len(muns), "municipalities;", sum(1 for f in mgeo["features"] if f["properties"]["codarea"] not in muns), "unmatched shapes")
