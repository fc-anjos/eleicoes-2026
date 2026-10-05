"""Build the self-contained dot map (brazil_2026_president_map.html) from data/ and web/.

Each dot is VPD votes for one candidate, placed in the Voronoi cell of the polling place where the votes were
cast (see geometry.cells), clipped to the municipality. Run from the repo root: python3 -m pipeline.build
"""
import base64, json, os, random
import numpy as np
from .geometry import round_coords, rewind, polygons, edges, bbox, inside, uniform, dist_km, area_km2, cells

VPD = 250  # votes per dot (the page can show coarser samples: multiples of this)
PER_PLACE = int(os.environ.get("PER_PLACE", 50))  # lattice points per polling place: how finely cells are resolved
TOL_KM = lambda a: max(1, .05 * np.sqrt(a))  # outline tolerance for polling places: 1 km, or 5% of the width
MIN_SHARE = .01  # candidates above this national share get their own colour; the rest are "Others"
LABEL = {"FLAVIO BOLSONARO": "Flávio Bolsonaro", "LULA": "Lula", "ESCRITOR AUGUSTO CURY": "Augusto Cury"}
OUT = "brazil_2026_president_map.html"

random.seed(2026)
rng = np.random.default_rng(2026)


def pt_title(name):
    """Title-case a Portuguese place name, keeping particles lowercase: São José dos Campos, not Dos."""
    small = {"de", "do", "dos", "da", "das", "e", "d'"}
    return " ".join(w if i and w in small else w[:1].upper() + w[1:] for i, w in enumerate(name.lower().split()))


def load_geometry():
    mgeo = json.load(open("data/br-mun.geojson"))
    sgeo = json.load(open("data/br-states.geojson"))
    for g in (mgeo, sgeo):
        for f in g["features"]:
            f["geometry"]["coordinates"] = round_coords(f["geometry"]["coordinates"])
    for f in mgeo["features"]:
        g = f["geometry"]
        g["coordinates"] = rewind([g["coordinates"]])[0] if g["type"] == "Polygon" else rewind(g["coordinates"])
    sgeo["features"] = [{"type": "Feature", "properties": {"sigla": f["properties"]["sigla"]}, "geometry": f["geometry"]}
                        for f in sgeo["features"]]
    return mgeo, sgeo


def municipality_summaries(results):
    """Name, state, total and top four candidates per municipality, for the tooltip and search."""
    muns = {}
    for code, m in results["municipalities"].items():
        if m["uf"] == "zz": continue  # votes cast abroad
        ranked = sorted(m["votes"].items(), key=lambda x: -x[1])[:4]
        muns[code] = {"n": pt_title(m["name"]), "uf": m["uf"].upper(), "t": sum(m["votes"].values()), "v": ranked}
    return muns


def candidates(results):
    """Colour categories: one per candidate above MIN_SHARE nationally, then "Others". Returns (list, name -> index)."""
    nat = results["national"]["votes"]; total = sum(nat.values())
    label = lambda k: LABEL.get(k, k.title())
    ranked = sorted(nat.items(), key=lambda x: -x[1])
    main = [k for k, v in ranked if v / total > MIN_SHARE]
    cat = {k: i for i, k in enumerate(main)}
    rest = [(k, v) for k, v in ranked if k not in cat]
    cands = [{"k": k, "n": label(k), "v": nat[k]} for k in main]
    cands.append({"k": "", "n": "Others", "v": sum(v for _, v in rest), "who": [label(k) for k, _ in rest]})
    return cands, cat


def make_dots(mgeo, places, cat, n_cats):
    """Flat [lon*1000, lat*1000, category, ...] list, shuffled so no colour systematically paints over another.

    Places slightly outside our simplified outline (rounded to ~100 m, coarse on coasts and rivers) still count,
    with a tolerance that grows with the municipality's size; farther out means bad coordinates, so the 2024
    coordinates are tried. Votes from places that still don't fit, and from places with no coordinates, go to
    the municipality's other places in proportion to their votes.
    """
    def ndots(votes):  # one category per dot; random rounding keeps totals unbiased
        cats = [0] * n_cats
        for name, v in votes.items(): cats[cat.get(name, n_cats - 1)] += v
        return [c for c, v in enumerate(cats) for _ in range(int(v // VPD) + (random.random() < v % VPD / VPD))]

    dots, spacing = [], []
    stats = {"place": 0, "spread": 0, "reassigned_votes": 0, "dropped_far_places": 0, "used_2024": 0, "empty_cells": 0}
    for f in mgeo["features"]:
        code = f["properties"]["codarea"]
        if code not in places: continue
        E = edges(polygons(f["geometry"])); box = bbox(E)
        pl = places[code]["p"]; spread = dict(places[code]["u"])
        P = np.array([p[:2] for p in pl], float).reshape(-1, 2)
        tol = TOL_KM(area_km2(E))
        ok = dist_km(P, E) <= tol if len(P) else np.zeros(0, bool)
        for i, p in enumerate(pl):  # 2026 coordinates far off: try the place's 2024 coordinates
            if not ok[i] and p[3] and dist_km(np.array([p[3]], float), E)[0] <= tol:
                P[i] = p[3]; ok[i] = True; stats["used_2024"] += 1
        ok[inside(P[:, 0], P[:, 1], E)] = True
        for p, good in zip(pl, ok):
            if not good:
                for n, v in p[2].items(): spread[n] = spread.get(n, 0) + v
        stats["dropped_far_places"] += int((~ok).sum())
        keep = [dict(p[2]) for p, good in zip(pl, ok) if good]; P = P[ok]
        if keep and spread:  # reassign unplaceable votes to the known places, weighted by their votes
            w = np.array([sum(k.values()) for k in keep], float); w /= w.sum()
            for n, v in spread.items():
                for k, share in zip(keep, rng.multinomial(v, w)): k[n] = k.get(n, 0) + int(share)
            stats["reassigned_votes"] += sum(spread.values()); spread = {}
        owner, cs = [], []
        for i, p in enumerate(keep):
            c = ndots(p); owner += [i] * len(c); cs += c
        if owner:
            pts, sp, empty = cells(P, E, box, np.array(owner), PER_PLACE, rng)
            spacing.append(sp); stats["empty_cells"] += empty
        else: pts = np.zeros((0, 2))
        us = ndots(spread)  # no usable polling place at all: spread over the municipality
        upts = uniform(E, box, len(us), rng) if us else np.zeros((0, 2))
        stats["place"] += len(owner); stats["spread"] += len(us)
        for (x, y), c in zip(np.vstack([pts, upts]), cs + us):
            dots += [round(x * 1000), round(y * 1000), c]
    print(stats, "lattice spacing km: median %.3f, p5 %.3f, p95 %.3f" % tuple(np.percentile(spacing, [50, 5, 95])))
    idx = list(range(len(dots) // 3)); random.shuffle(idx)
    return [v for i in idx for v in dots[3 * i:3 * i + 3]]


def pack(dots):
    """Dots as base64 binary, much faster for the page to load than a JSON array: uint16 longitudes, then uint16
    latitudes (thousandths of a degree above x0 / y0: Brazil spans ~40° each way, under 65.536), then uint8
    categories."""
    a = np.array(dots, dtype=np.int64).reshape(-1, 3)
    x0, y0 = int(a[:, 0].min()), int(a[:, 1].min())
    assert a[:, 0].max() - x0 < 65536 and a[:, 1].max() - y0 < 65536
    raw = (a[:, 0] - x0).astype("<u2").tobytes() + (a[:, 1] - y0).astype("<u2").tobytes() + a[:, 2].astype("u1").tobytes()
    return {"n": len(a), "x0": x0, "y0": y0, "b": base64.b64encode(raw).decode()}


def render(data):
    """Inline web/style.css, web/map.js and the data into web/index.html."""
    html = open("web/index.html").read()
    html = html.replace("/*__CSS__*/", open("web/style.css").read()).replace("/*__JS__*/", open("web/map.js").read())
    for k, v in data.items():
        html = html.replace(k, json.dumps(v, ensure_ascii=False, separators=(",", ":")))
    return html


def main():
    results = json.load(open("data/results.json"))
    places = json.load(open("data/places.json"))
    mgeo, sgeo = load_geometry()
    muns = municipality_summaries(results)
    cands, cat = candidates(results)
    dots = make_dots(mgeo, places, cat, len(cands))
    print(len(dots) // 3, "dots")
    open(OUT, "w").write(render({"__MGEO__": mgeo, "__SGEO__": sgeo, "__MUNS__": muns, "__CANDS__": cands,
                                 "__DOTS__": pack(dots), "__VPD__": VPD}))
    print("ok", len(muns), "municipalities;", sum(1 for f in mgeo["features"] if f["properties"]["codarea"] not in muns), "unmatched shapes")


if __name__ == "__main__":
    main()
