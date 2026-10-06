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
MIN_SHARE = .01  # candidates above this national share (in either year) get their own colour; the rest are "Others"
YEARS = (2026, 2022)  # the first is shown on load
DATE = {2026: "4 October 2026", 2022: "2 October 2022"}
# Candidates are keyed by ballot number, which follows the party: 22 (PL) is Jair Bolsonaro in 2022 and Flávio in
# 2026, 13 (PT) is Lula in both, so each camp keeps its colour across years. Colours are tokens in web/style.css.
LABEL = {"22": {2026: "Flávio Bolsonaro", 2022: "Jair Bolsonaro"}, "13": "Lula", "70": "Augusto Cury", "14": "Renan Santos",
         "55": "Ronaldo Caiado", "15": "Simone Tebet", "12": "Ciro Gomes"}
COLOR = {"22": "c0", "13": "c1", "70": "c2", "14": "c3", "55": "c4", "15": "c6", "12": "c7", "": "c5", "A": "ca"}
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


def label(year, k, names):
    l = LABEL.get(k)
    return (l.get(year) if isinstance(l, dict) else l) or pt_title(names.get(k, k))


def categories(places):
    """Colour categories shared by both years: candidates above MIN_SHARE in either, then "Others", then abstentions
    ("A": people on the roll who didn't vote). Returns the keys in order and, per year, key -> index."""
    keys, mains = [], {}
    for y in YEARS:
        nat = places[y]["nat"]; valid = sum(v for k, v in nat.items() if k not in ("A", "BN"))
        for k, v in sorted(nat.items(), key=lambda x: -x[1]):
            if k not in ("A", "BN") and v / valid > MIN_SHARE:
                assert k in COLOR, f"no colour for candidate {k} ({y}): add it to COLOR and web/style.css"
                mains.setdefault(y, []).append(k)
                if k not in keys: keys.append(k)
    keys += ["", "A"]
    cat = {k: i for i, k in enumerate(keys)}
    # per year, only that year's own main candidates: a number reused by another party's candidate (14 was PTB in
    # 2022, Missão in 2026) falls into "Others" rather than borrowing a colour
    return keys, {y: {k: cat[k] for k in mains[y] + ["", "A"]} for y in YEARS}


def year_summary(y, pl, keys, cat):
    """National results for one year, for the side panel: [{k, n (label), v (votes), i (category)}], with the
    smaller candidates folded into "Others" (who lists them), plus abstentions and blank/null votes."""
    nat, names = pl["nat"], pl["names"]
    ranked = sorted(((k, v) for k, v in nat.items() if k not in ("A", "BN")), key=lambda x: -x[1])
    cands = [{"k": k, "n": label(y, k, names), "v": v, "i": cat[k]} for k, v in ranked if k in cat]
    rest = [(k, v) for k, v in ranked if k not in cat]
    cands.append({"k": "", "n": "Others", "v": sum(v for _, v in rest), "i": cat[""], "who": [label(y, k, names) for k, _ in rest]})
    return {"date": DATE[y], "cands": cands, "a": nat["A"], "bn": nat["BN"], "names": {k: label(y, k, names) for k, _ in ranked}}


def municipality_summaries(places):
    """Name, state and, per year, valid votes, abstentions, blank/null and top four candidates: tooltip and search."""
    cfg = json.load(open("data/mun-config.json"))
    where = {m["cdi"]: (uf["cd"].upper(), m["nm"]) for uf in cfg["abr"] for m in uf["mu"] if m["cdi"]}
    muns = {}
    for y in YEARS:
        for code, m in places[y]["muns"].items():
            tot = {}
            for votes in [p[2] for p in m["p"]] + [m["u"]]:
                for k, v in votes.items(): tot[k] = tot.get(k, 0) + v
            a = tot.pop("A", 0)
            uf, nm = where[code]
            d = muns.setdefault(code, {"n": pt_title(nm), "uf": uf, "y": {}})
            d["y"][y] = {"t": sum(tot.values()), "a": a, "bn": m["bn"], "v": sorted(tot.items(), key=lambda x: -x[1])[:4]}
    return muns


def make_dots(mgeo, places, cat, others):
    """Flat [lon*1000, lat*1000, category, ...] list (abstentions are dots too, at their polling place), shuffled so no colour systematically paints over another.

    Places slightly outside our simplified outline (rounded to ~100 m, coarse on coasts and rivers) still count,
    with a tolerance that grows with the municipality's size; farther out means bad coordinates, so the 2024
    coordinates are tried. Votes from places that still don't fit, and from places with no coordinates, go to
    the municipality's other places in proportion to their votes.
    """
    def ndots(votes):  # one category per dot; random rounding keeps totals unbiased
        cats = [0] * (max(cat.values()) + 1)
        for k, v in votes.items(): cats[cat.get(k, others)] += v
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
    places = {y: json.load(open(f"data/places_{y}.json")) for y in YEARS}
    mgeo, sgeo = load_geometry()
    keys, cats_y = categories(places)
    years = {}
    for y in YEARS:
        cat = cats_y[y]
        dots = make_dots(mgeo, places[y]["muns"], cat, cat[""])
        print(y, len(dots) // 3, "dots")
        years[y] = {**year_summary(y, places[y], keys, cat), "dots": pack(dots)}
    muns = municipality_summaries(places)
    cats = [{"k": k, "col": COLOR[k]} for k in keys]
    open(OUT, "w").write(render({"__MGEO__": mgeo, "__SGEO__": sgeo, "__MUNS__": muns, "__CATS__": cats,
                                 "__YEARS__": years, "__VPD__": VPD}))
    print("ok", len(muns), "municipalities;", sum(1 for f in mgeo["features"] if f["properties"]["codarea"] not in muns), "unmatched shapes")


if __name__ == "__main__":
    main()
