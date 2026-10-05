"""Build a self-contained HTML dot map of the 2026 presidential 1st round, placing votes around their polling places."""
import json, random
import numpy as np

VPD = 250  # votes per dot
random.seed(2026)
rng = np.random.default_rng(2026)

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
def edges(polys):
    """All ring edges of a (multi)polygon as arrays x1, y1, x2, y2."""
    e = np.array([(*a, *b) for p in polys for ring in p for a, b in zip(ring, ring[1:])], dtype=float)
    return e[:, 0], e[:, 1], e[:, 2], e[:, 3]

def inside(px, py, E, chunk=4000):
    """Vectorised even-odd point-in-polygon test for arrays of points."""
    x1, y1, x2, y2 = (a[:, None] for a in E)
    out = np.zeros(len(px), bool)
    for i in range(0, len(px), chunk):
        X, Y = px[i:i + chunk], py[i:i + chunk]
        with np.errstate(divide="ignore", invalid="ignore"):
            hit = ((y1 > Y) != (y2 > Y)) & (X < (x2 - x1) * (Y - y1) / (y2 - y1) + x1)
        out[i:i + chunk] = hit.sum(0) % 2 == 1
    return out

def uniform(E, bbox, n):
    """n points uniformly inside the polygon (rejection sampling in its bounding box)."""
    x0, y0, x1, y1 = bbox; got = np.empty((0, 2))
    for _ in range(200):
        if len(got) >= n: break
        m = max(64, 2 * (n - len(got)))
        c = np.column_stack([rng.uniform(x0, x1, m), rng.uniform(y0, y1, m)])
        got = np.vstack([got, c[inside(c[:, 0], c[:, 1], E)]])
    return got[:n] if len(got) >= n else np.vstack([got, np.tile([(x0 + x1) / 2, (y0 + y1) / 2], (n - len(got), 1))])

def dist_km(P, E):
    """Distance from each point to the nearest polygon edge, in km (approximate)."""
    x1, y1, x2, y2 = (a[None] for a in E); px, py = P[:, :1], P[:, 1:]
    dx, dy = x2 - x1, y2 - y1
    t = np.clip(((px - x1) * dx + (py - y1) * dy) / np.maximum(dx * dx + dy * dy, 1e-12), 0, 1)
    return np.sqrt((x1 + t * dx - px) ** 2 + (y1 + t * dy - py) ** 2).min(1) * 111

def area_km2(E):
    """Polygon area in km² (shoelace over all rings; holes are wound the other way and subtract)."""
    x1, y1, x2, y2 = E; k = np.cos(np.radians(y1.mean()))
    return abs((x1 * y2 - x2 * y1).sum()) / 2 * k * 111 ** 2

def cells(P, E, bbox, owner, per_place):
    """One point per entry of owner, inside the owner place's Voronoi cell clipped to the municipality.
    A lattice is laid inside the municipality (spacing chosen so there are ~per_place lattice points per polling
    place) and each lattice point is assigned to its nearest place. A dot takes a random lattice point of its
    place's cell, jittered within one lattice spacing. A place whose cell holds no lattice point (a sliver, or a
    place just outside the outline) uses its nearest lattice points instead, so every dot stays by its place."""
    x0, y0, x1, y1 = bbox; k = np.cos(np.radians((y0 + y1) / 2)); n = len(P)
    s = np.sqrt(area_km2(E) / (n * per_place)) / 111  # lattice spacing in degrees of latitude
    for _ in range(6):  # tiny or odd-shaped municipalities: refine until the lattice has enough points
        gx, gy = np.meshgrid(np.arange(x0 + rng.uniform(0, s / k), x1, s / k), np.arange(y0 + rng.uniform(0, s), y1, s))
        G = np.column_stack([gx.ravel(), gy.ravel()]); G = G[inside(G[:, 0], G[:, 1], E)]
        if len(G) >= n * per_place / 4: break
        s /= 2
    Q, GQ = P * [k, 1], G * [k, 1]
    near = np.concatenate([((GQ[i:i + 2000, None] - Q[None]) ** 2).sum(-1).argmin(1) for i in range(0, len(G), 2000)])
    order = np.argsort(near, kind="stable"); start = np.searchsorted(near[order], np.arange(n + 1))
    out = np.empty((len(owner), 2))
    for i in np.unique(owner):
        mine, pts, step = order[start[i]:start[i + 1]], G, s
        if not len(mine) and n > 1:
            # cell smaller than the lattice (dense downtowns): a local lattice sized to this place's neighbourhood
            dn = np.sqrt(((Q - Q[i]) ** 2).sum(1)); dn[i] = np.inf; step = dn.min() / 6
            lx, ly = np.meshgrid(np.arange(-6, 7) * step / k, np.arange(-6, 7) * step)
            L = P[i] + np.column_stack([lx.ravel(), ly.ravel()])
            L = L[inside(L[:, 0], L[:, 1], E)]
            if len(L):
                L = L[((L[:, None] * [k, 1] - Q[None]) ** 2).sum(-1).argmin(1) == i]
            if len(L): pts, mine = L, np.arange(len(L))
            else: step = s
        if not len(mine):  # place outside the outline with no cell inside it: borrow its nearest lattice points
            mine = ((GQ - Q[i]) ** 2).sum(1).argsort()[:4]; EMPTY.append(i)
        j = owner == i; pick = pts[mine[rng.integers(0, len(mine), j.sum())]]
        out[j] = pick + np.column_stack([rng.uniform(-.5, .5, j.sum()) * step / k, rng.uniform(-.5, .5, j.sum()) * step])
    return out, s * 111

# category per dot: one per candidate above 1% nationally, plus one for everyone else; random rounding keeps totals unbiased
LABEL = {"FLAVIO BOLSONARO": "Flávio Bolsonaro", "LULA": "Lula", "ESCRITOR AUGUSTO CURY": "Augusto Cury"}
nat = r["national"]["votes"]; nat_tot = sum(nat.values())
label = lambda k: LABEL.get(k, k.title())
ranked = sorted(nat.items(), key=lambda x: -x[1])
main = [k for k, v in ranked if v / nat_tot > .01]
CAT = {k: i for i, k in enumerate(main)}
cands = [{"k": k, "n": label(k), "v": nat[k]} for k in main] + [{"k": "", "n": "Others", "v": sum(v for k, v in ranked if k not in CAT), "who": [label(k) for k, v in ranked if k not in CAT]}]
# dots: votes are placed in the Voronoi cell of the polling place where they were cast (data/places.json, from
# prep_places.py), clipped to the municipality. Places slightly outside our simplified outline (rounded to ~100 m,
# coarse on coasts and rivers) still count, with a tolerance that grows with the municipality's size; farther
# out means bad coordinates. Votes from those places, and from places with no coordinates, go to the
# municipality's other places in proportion to their votes.
import os
PER_PLACE = int(os.environ.get("PER_PLACE", 50))  # lattice points per polling place: sets how finely cells are resolved
TOL_KM = lambda a: max(1, .05 * np.sqrt(a))  # outline tolerance: 1 km, or 5% of the municipality's width
places = json.load(open("data/places.json"))
def ndots(votes):
    cats = [0] * len(cands)
    for name, v in votes.items(): cats[CAT.get(name, len(main))] += v
    return [c for c, v in enumerate(cats) for _ in range(int(v // VPD) + (random.random() < v % VPD / VPD))]
EMPTY = []
dots, stats, spacing = [], {"place": 0, "spread": 0, "reassigned_votes": 0, "dropped_far_places": 0, "used_2024": 0}, []
for f in mgeo["features"]:
    code = f["properties"]["codarea"]
    if code not in places: continue
    g = f["geometry"]; polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    E = edges(polys); xs = np.concatenate([E[0], E[2]]); ys = np.concatenate([E[1], E[3]])
    bbox = (xs.min(), ys.min(), xs.max(), ys.max())
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
    owner, cat = [], []
    for i, p in enumerate(keep):
        cs = ndots(p); owner += [i] * len(cs); cat += cs
    if owner: pts, sp = cells(P, E, bbox, np.array(owner), PER_PLACE); spacing.append(sp)
    else: pts = np.zeros((0, 2))
    us = ndots(spread); upts = uniform(E, bbox, len(us)) if us else np.zeros((0, 2))
    stats["place"] += len(owner); stats["spread"] += len(us)
    for (x, y), c in zip(np.vstack([pts, upts]), cat + us):
        dots += [round(x * 1000), round(y * 1000), c]
stats["empty_cells"] = len(EMPTY)
print(stats, "lattice spacing km: median %.3f, p5 %.3f, p95 %.3f" % tuple(np.percentile(spacing, [50, 5, 95])))
idx = list(range(len(dots) // 3)); random.shuffle(idx)  # avoid one colour painting over another
dots = [v for i in idx for v in dots[3 * i:3 * i + 3]]
print(len(dots) // 3, "dots")

html = open("map_template.html").read()
for k, v in {"__MGEO__": mgeo, "__SGEO__": sgeo, "__MUNS__": muns, "__CANDS__": cands, "__DOTS__": dots, "__VPD__": VPD}.items():
    html = html.replace(k, json.dumps(v, ensure_ascii=False, separators=(",", ":")))
open("brazil_2026_president_map.html", "w").write(html)
print("ok", len(muns), "municipalities;", sum(1 for f in mgeo["features"] if f["properties"]["codarea"] not in muns), "unmatched shapes")
