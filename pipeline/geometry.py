"""Polygon helpers on lon/lat coordinates, vectorised with numpy. Polygons are lists of rings (GeoJSON order)."""

from itertools import pairwise

import numpy as np


def round_coords(c, nd=3):
    """Round nested GeoJSON coordinates (3 decimals ≈ 100 m) to keep the page small."""
    return [round_coords(x, nd) for x in c] if isinstance(c[0], list) else [round(c[0], nd), round(c[1], nd)]


def _signed_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in pairwise(ring))


def rewind(polys):
    """d3-geo wants clockwise outer rings and counter-clockwise holes."""
    return [[ring[::-1] if (_signed_area(ring) > 0) == (i == 0) else ring for i, ring in enumerate(p)] for p in polys]


def polygons(geometry):
    """A Polygon or MultiPolygon geometry as a list of polygons."""
    return [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]


def edges(polys):
    """All ring edges of a (multi)polygon as arrays x1, y1, x2, y2."""
    e = np.array([(*a, *b) for p in polys for ring in p for a, b in pairwise(ring)], dtype=float)
    return e[:, 0], e[:, 1], e[:, 2], e[:, 3]


def bbox(E):
    xs, ys = np.concatenate([E[0], E[2]]), np.concatenate([E[1], E[3]])
    return xs.min(), ys.min(), xs.max(), ys.max()


def inside(px, py, E, chunk=4000):
    """Even-odd point-in-polygon test for arrays of points."""
    x1, y1, x2, y2 = (a[:, None] for a in E)
    out = np.zeros(len(px), bool)
    for i in range(0, len(px), chunk):
        X, Y = px[i : i + chunk], py[i : i + chunk]
        with np.errstate(divide="ignore", invalid="ignore"):
            hit = ((y1 > Y) != (y2 > Y)) & ((x2 - x1) * (Y - y1) / (y2 - y1) + x1 > X)
        out[i : i + chunk] = hit.sum(0) % 2 == 1
    return out


def uniform(E, box, n, rng):
    """n points uniformly inside the polygon (rejection sampling in its bounding box)."""
    x0, y0, x1, y1 = box
    got = np.empty((0, 2))
    for _ in range(200):
        if len(got) >= n:
            break
        m = max(64, 2 * (n - len(got)))
        c = np.column_stack([rng.uniform(x0, x1, m), rng.uniform(y0, y1, m)])
        got = np.vstack([got, c[inside(c[:, 0], c[:, 1], E)]])
    return got[:n] if len(got) >= n else np.vstack([got, np.tile([(x0 + x1) / 2, (y0 + y1) / 2], (n - len(got), 1))])


def dist_km(P, E):
    """Distance from each point to the nearest polygon edge, in km (approximate)."""
    x1, y1, x2, y2 = (a[None] for a in E)
    px, py = P[:, :1], P[:, 1:]
    dx, dy = x2 - x1, y2 - y1
    t = np.clip(((px - x1) * dx + (py - y1) * dy) / np.maximum(dx * dx + dy * dy, 1e-12), 0, 1)
    return np.sqrt((x1 + t * dx - px) ** 2 + (y1 + t * dy - py) ** 2).min(1) * 111


def area_km2(E):
    """Polygon area in km² (shoelace over all rings; holes are wound the other way and subtract)."""
    x1, y1, x2, y2 = E
    k = np.cos(np.radians(y1.mean()))
    return abs((x1 * y2 - x2 * y1).sum()) / 2 * k * 111**2


def cells(P, E, box, owner, per_place, rng, n_ref=None, place_rng=None):
    """One point per entry of owner, inside the owner place's Voronoi cell clipped to the municipality.

    A lattice is laid inside the municipality (spacing chosen so there are ~per_place lattice points per polling
    place) and each lattice point is assigned to its nearest place. A dot takes a random lattice point of its
    place's cell, jittered within one lattice spacing. A place whose cell holds no lattice point (a sliver, or a
    place just outside the outline) uses its nearest lattice points instead, so every dot stays by its place.

    For stable placement across elections: the lattice is sized for n_ref places (the same in every year) and laid
    from rng (seeded by municipality), and place_rng(i) gives each place its own generator (seeded by its
    location). A place's dots then take its cell's lattice points in a fixed random order with fixed jitter, so
    the same place with the same cell puts its k-th dot in the same spot in every year.

    Returns (points, lattice spacing in km, number of places that had to borrow lattice points).
    """
    x0, y0, x1, y1 = box
    k = np.cos(np.radians((y0 + y1) / 2))
    n = len(P)
    empty = 0
    s = np.sqrt(area_km2(E) / ((n_ref or n) * per_place)) / 111  # lattice spacing in degrees of latitude
    for _ in range(6):  # tiny or odd-shaped municipalities: refine until the lattice has enough points
        gx, gy = np.meshgrid(np.arange(x0 + rng.uniform(0, s / k), x1, s / k), np.arange(y0 + rng.uniform(0, s), y1, s))
        G = np.column_stack([gx.ravel(), gy.ravel()])
        G = G[inside(G[:, 0], G[:, 1], E)]
        if len(G) >= n * per_place / 4:
            break
        s /= 2
    Q, GQ = P * [k, 1], G * [k, 1]
    near = np.concatenate([((GQ[i : i + 2000, None] - Q[None]) ** 2).sum(-1).argmin(1) for i in range(0, len(G), 2000)])
    order = np.argsort(near, kind="stable")
    start = np.searchsorted(near[order], np.arange(n + 1))
    out = np.empty((len(owner), 2))
    for i in np.unique(owner):
        mine, pts, step = order[start[i] : start[i + 1]], G, s
        if not len(mine) and n > 1:
            # cell smaller than the lattice (dense downtowns): a local lattice sized to this place's neighbourhood
            dn = np.sqrt(((Q - Q[i]) ** 2).sum(1))
            dn[i] = np.inf
            step = dn.min() / 6
            lx, ly = np.meshgrid(np.arange(-6, 7) * step / k, np.arange(-6, 7) * step)
            L = P[i] + np.column_stack([lx.ravel(), ly.ravel()])
            L = L[inside(L[:, 0], L[:, 1], E)]
            if len(L):
                L = L[((L[:, None] * [k, 1] - Q[None]) ** 2).sum(-1).argmin(1) == i]
            if len(L):
                pts, mine = L, np.arange(len(L))
            else:
                step = s
        if not len(mine):  # place outside the outline with no cell inside it: borrow its nearest lattice points
            mine = ((GQ - Q[i]) ** 2).sum(1).argsort()[:4]
            empty += 1
        j = owner == i
        m = int(j.sum())
        r = place_rng(i) if place_rng else rng
        # the cell's lattice points in a fixed random order, cycled when the place has more dots than points
        seq = np.concatenate([r.permutation(len(mine)) for _ in range(-(-m // len(mine)))])[:m]
        pick = pts[mine[seq]]
        out[j] = pick + np.column_stack([r.uniform(-0.5, 0.5, m) * step / k, r.uniform(-0.5, 0.5, m) * step])
    return out, s * 111, empty
