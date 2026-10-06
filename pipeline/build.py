"""Build the self-contained dot map (brazil_2026_president_map.html) from data/ and web/.

Each dot is VPD votes for one candidate, placed in the Voronoi cell of the polling place where the votes were
cast (see geometry.cells), clipped to the municipality. Run from the repo root: python3 -m pipeline.build
"""
import base64, csv, json, os, random
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
COLOR = {"22": "c0", "13": "c1", "70": "c2", "14": "c3", "55": "c4", "15": "c6", "12": "c7", "": "c5", "A": "ca", "AO": "cb", "A8": "cc"}
# Abstention is split by age: "A" for people who had to vote (18–69), "AO" for those for whom voting is optional
# (16–17 and 70–79) and "A8" for 80+, a band of its own because it partly counts people no longer living who are
# still on the roll. Shares per municipality come from data/studio.csv (from the elections-abstentions project):
# observed in 2022, modelled in 2026, where the model's bands cover ages 18+ only, so the small remainder (mostly
# 16–17) counts as optional. Defaults: the national shares.
SHARE_DEFAULT = {"AO": .19, "A8": .13}
# Studio filters: municipal variables from data/studio.csv, shown as range sliders. [column, label, unit, source]
STUDIO = [("renda_dom_pc_media_2022", "Household income per person", "brl", "Censo 2022, monthly average"),
          ("censo_sup_comp_25p_2022", "Adults with a degree", "pct", "Censo 2022, ages 25+"),
          ("censo_medio_comp_mais_25p_2022", "Adults who finished secondary school", "pct", "Censo 2022, ages 25+"),
          ("pct_urbana_2022", "Urban population", "pct", "Censo 2022"),
          ("pop_2022", "Population", "int", "Censo 2022"),
          ("eleit_sup_comp_2026", "Voters with a degree", "pct", "TSE 2026, self-reported at registration"),
          # religion describes the places, not their voters: see the note under the filters
          ("pct_evangelica_2022", "Evangelical", "pct", "Censo 2022, residents aged 10+"),
          ("pct_catolica_2022", "Catholic", "pct", "Censo 2022, residents aged 10+"),
          ("pct_sem_religiao_2022", "No religion", "pct", "Censo 2022, residents aged 10+")]
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
    ("A", "AO", "A8": people on the roll who didn't vote, by age band; see COLOR). Returns the keys in order and, per year, key -> index."""
    keys, mains = [], {}
    for y in YEARS:
        nat = places[y]["nat"]; valid = sum(v for k, v in nat.items() if k not in ("A", "BN"))
        for k, v in sorted(nat.items(), key=lambda x: -x[1]):
            if k not in ("A", "BN") and v / valid > MIN_SHARE:
                assert k in COLOR, f"no colour for candidate {k} ({y}): add it to COLOR and web/style.css"
                mains.setdefault(y, []).append(k)
                if k not in keys: keys.append(k)
    keys += ["", "A", "AO", "A8"]
    cat = {k: i for i, k in enumerate(keys)}
    # per year, only that year's own main candidates: a number reused by another party's candidate (14 was PTB in
    # 2022, Missão in 2026) falls into "Others" rather than borrowing a colour
    return keys, {y: {k: cat[k] for k in mains[y] + ["", "A", "AO", "A8"]} for y in YEARS}


def year_summary(y, pl, keys, cat):
    """National results for one year, for the side panel: [{k, n (label), v (votes), i (category)}], with the
    smaller candidates folded into "Others" (who lists them), plus abstentions and blank/null votes."""
    nat, names = pl["nat"], pl["names"]
    ranked = sorted(((k, v) for k, v in nat.items() if k not in ("A", "BN")), key=lambda x: -x[1])
    cands = [{"k": k, "n": label(y, k, names), "v": v, "i": cat[k]} for k, v in ranked if k in cat]
    rest = [(k, v) for k, v in ranked if k not in cat]
    cands.append({"k": "", "n": "Others", "v": sum(v for _, v in rest), "i": cat[""], "who": [label(y, k, names) for k, _ in rest]})
    return {"date": DATE[y], "cands": cands, "a": nat["A"], "bn": nat["BN"], "names": {k: label(y, k, names) for k, _ in ranked}}


def load_studio():
    """data/studio.csv by IBGE code: the optional share of abstainers per year, and the STUDIO variables."""
    num = lambda v: float(v) if v not in ("", None) else None
    out = {}
    for r in csv.DictReader(open("data/studio.csv")):
        a26, a22 = num(r["abst_2026"]), num(r["abst_2022"])
        req26 = (num(r["abst26_18_34_est"]) or 0) + (num(r["abst26_35_69_est"]) or 0)
        e26, e22 = num(r["abst26_80p_est"]), num(r["abst22_80p"])
        out[r["cd_ibge"]] = {
            "opt": {2026: {"A8": e26 / a26, "AO": max(0, 1 - (req26 + e26) / a26)} if a26 and e26 is not None else None,
                    2022: {"A8": e22 / a22, "AO": (num(r["abst22_optional"]) - e22) / a22}
                    if a22 and r["abst22_optional"] and e22 is not None else None},
            "x": [num(r[c]) for c, *_ in STUDIO],
            # eligible voters aged 80+ (TSE voter profile at the close of the rolls), to take them out of rates
            "e80": {2026: num(r["aptos_80p_2026"]), 2022: num(r["aptos_80p_2022"])}}
    return out


def split_abstention(votes, p):
    """Split a place's abstainers ("A") by age band, multinomially with shares p = {"AO": .., "A8": ..}."""
    a = votes.pop("A", 0)
    if a:
        o, e, r = rng.multinomial(a, [p["AO"], p["A8"], max(0, 1 - p["AO"] - p["A8"])])
        votes["AO"] = votes.get("AO", 0) + int(o); votes["A8"] = votes.get("A8", 0) + int(e); votes["A"] = int(r)
    return votes


def municipality_summaries(places, cats_y, studio):
    """Name, state and, per year: blank/null votes and counts by colour category (candidates, Others, abstention
    split by age), for the tooltip, search and the studio's live totals; plus the studio variables."""
    cfg = json.load(open("data/mun-config.json"))
    where = {m["cdi"]: (uf["cd"].upper(), m["nm"]) for uf in cfg["abr"] for m in uf["mu"] if m["cdi"]}
    ncat = max(max(c.values()) for c in cats_y.values()) + 1
    muns = {}
    for y in YEARS:
        cat = cats_y[y]
        for code, m in places[y]["muns"].items():
            c = [0] * ncat
            for votes in [p[2] for p in m["p"]] + [m["u"]]:
                for k, v in votes.items(): c[cat.get(k, cat[""])] += v
            p = studio.get(code, {}).get("opt", {}).get(y) or SHARE_DEFAULT  # as in the dots, but the expected split
            a = c[cat["A"]]; c[cat["AO"]] = round(a * p["AO"]); c[cat["A8"]] = round(a * p["A8"]); c[cat["A"]] = a - c[cat["AO"]] - c[cat["A8"]]
            uf, nm = where[code]
            d = muns.setdefault(code, {"n": pt_title(nm), "uf": uf, "y": {}, "x": studio.get(code, {}).get("x")})
            d["y"][y] = {"c": c, "bn": m["bn"], "e80": int(studio.get(code, {}).get("e80", {}).get(y) or 0)}
    return muns


def make_dots(mgeo, places, cat, others, opt, order, n_ref):
    """Flat [lon*1000, lat*1000, category, ...] list (abstentions are dots too, at their polling place), grouped by
    municipality (in `order`, indices into mgeo's features) and within it by polling place, so the page can filter
    whole municipalities or single places. Returns (dots, groups per municipality, dots per group, each group's
    polling place as (id, lon, lat), or None for votes spread over the municipality). Groups come in a fixed random
    order and dots are shuffled within each, so no colour systematically paints over another. opt(code) gives the
    age-band shares of the municipality's abstainers.

    Placement is stable across years (see geometry.cells): each municipality's lattice is seeded by its code and
    sized for n_ref[code] places, and each polling place lays its dots in a fixed order seeded by its location,
    with categories filling them in a fixed order. Where a place exists in both years, its dots sit in the same
    spots and only their colours change.

    Places slightly outside our simplified outline (rounded to ~100 m, coarse on coasts and rivers) still count,
    with a tolerance that grows with the municipality's size; farther out means bad coordinates, so the 2024
    coordinates are tried. Votes from places that still don't fit, and from places with no coordinates, go to
    the municipality's other places in proportion to their votes.
    """
    def ndots(votes):  # one category per dot; random rounding keeps totals unbiased
        cats = [0] * (max(cat.values()) + 1)
        for k, v in votes.items(): cats[cat.get(k, others)] += v
        return [c for c, v in enumerate(cats) for _ in range(int(v // VPD) + (random.random() < v % VPD / VPD))]

    dots, counts, gcnt, gplace, spacing = [], [], [], [], []
    stats = {"place": 0, "spread": 0, "reassigned_votes": 0, "dropped_far_places": 0, "used_2024": 0, "empty_cells": 0}
    for fi in order:
        f = mgeo["features"][fi]; code = f["properties"]["codarea"]
        if code not in places: counts.append(0); continue
        ids = [p[4] for p in places[code]["p"]]
        E = edges(polygons(f["geometry"])); box = bbox(E)
        p_opt = opt(code)
        pl = [[*p[:2], split_abstention(dict(p[2]), p_opt), p[3]] for p in places[code]["p"]]
        spread = split_abstention(dict(places[code]["u"]), p_opt)
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
        keep = [dict(p[2]) for p, good in zip(pl, ok) if good]; P = P[ok]; kid = [i for i, good in zip(ids, ok) if good]
        if keep and spread:  # reassign unplaceable votes to the known places, weighted by their votes
            w = np.array([sum(k.values()) for k in keep], float); w /= w.sum()
            for n, v in spread.items():
                for k, share in zip(keep, rng.multinomial(v, w)): k[n] = k.get(n, 0) + int(share)
            stats["reassigned_votes"] += sum(spread.values()); spread = {}
        owner, cs = [], []
        for i, p in enumerate(keep):
            c = ndots(p); owner += [i] * len(c); cs += c
        if owner:
            mrng = np.random.default_rng(int(code))
            prng = lambda i: np.random.default_rng([int(code), int(round(P[i][0] * 1e4)) & 0xFFFFFFFF, int(round(P[i][1] * 1e4)) & 0xFFFFFFFF])
            pts, sp, empty = cells(P, E, box, np.array(owner), PER_PLACE, mrng, n_ref.get(code), prng)
            spacing.append(sp); stats["empty_cells"] += empty
        else: pts = np.zeros((0, 2))
        us = ndots(spread)  # no usable polling place at all: spread over the municipality
        upts = uniform(E, box, len(us), np.random.default_rng(int(code) + 1)) if us else np.zeros((0, 2))
        stats["place"] += len(owner); stats["spread"] += len(us)
        allp = np.vstack([pts, upts]); grp = owner + [-1] * len(us); allc = cs + us
        groups = {}
        for (x, y), c, gi in zip(allp, allc, grp): groups.setdefault(gi, []).append([round(x * 1000), round(y * 1000), c])
        gl = list(groups.items()); random.shuffle(gl); counts.append(len(gl))
        for gi, mine in gl:
            random.shuffle(mine); gcnt.append(len(mine))
            gplace.append((kid[gi], float(P[gi][0]), float(P[gi][1])) if gi >= 0 else None)
            for d in mine: dots += d
    print(stats, "lattice spacing km: median %.3f, p5 %.3f, p95 %.3f" % tuple(np.percentile(spacing, [50, 5, 95])))
    return dots, counts, gcnt, gplace


def pack(dots):
    """Dots as base64 binary, much faster for the page to load than a JSON array: uint16 longitudes, then uint16
    latitudes (thousandths of a degree above x0 / y0: Brazil spans ~40° each way, under 65.536), then uint8
    categories."""
    a = np.array(dots, dtype=np.int64).reshape(-1, 3)
    x0, y0 = int(a[:, 0].min()), int(a[:, 1].min())
    assert a[:, 0].max() - x0 < 65536 and a[:, 1].max() - y0 < 65536
    raw = (a[:, 0] - x0).astype("<u2").tobytes() + (a[:, 1] - y0).astype("<u2").tobytes() + a[:, 2].astype("u1").tobytes()
    return {"n": len(a), "x0": x0, "y0": y0, "b": base64.b64encode(raw).decode()}


# Neighbourhood variables per polling place (Censo 2022 tracts within 1 km of it, from the elections-abstentions
# project, data/places_studio.csv), packed as one byte each: [column, label, unit, source, encode, decode-in-page]
PLACE_VARS = [
    ("setor_renda_resp_media", "Household-head income", "brl", "Censo 2022 tracts within 1 km, monthly mean", "log", [100, 30000]),
    ("setor_pct_urbana", "Urban", "pct", "Censo 2022 tracts within 1 km", "lin", [0, 100]),
    ("setor_dens_hab_km2", "Density", "dens", "Censo 2022 tracts within 1 km, people per km²", "log", [1, 50000]),
    ("setor_pct_70p", "Aged 70+", "pct", "Censo 2022 tracts within 1 km", "lin", [0, 40]),
    ("setor_pct_preta_parda", "Black or Brown", "pct", "Censo 2022 tracts within 1 km", "lin", [0, 100]),
    ("pct_excess_2026", "Excess abstention", "pp", "2026 abstention minus expected from age, education and neighbourhood (model)", "lin", [-25, 25])]
NEAR_KM = 2  # a 2022 polling place takes the neighbourhood values of the nearest 2026 place within this distance


def load_places_studio():
    """data/places_studio.csv by place id ("UF-municipality-zone-place"), with coordinates, as byte-coded rows."""
    rows, xy = {}, {}
    for r in csv.DictReader(open("data/places_studio.csv")):
        pid = "%s-%d-%d-%d" % (r["uf"], int(r["cd_tse"]), int(r["zona"]), int(r["nr_local"]))
        code = []
        for col, _, _, _, enc, (lo, hi) in PLACE_VARS:
            v = r[col]
            if v in ("", None): code.append(255); continue
            v = float(v)
            t = (np.log(max(v, lo)) - np.log(lo)) / (np.log(hi) - np.log(lo)) if enc == "log" else (v - lo) / (hi - lo)
            code.append(int(round(min(1, max(0, t)) * 254)))
        rows[pid] = code; xy[pid] = (float(r["lon"]), float(r["lat"]))
    return rows, xy


def place_rows(gplace, rows, xy, exact):
    """Each group's row in the place table: its own place's (exact id match, 2026), or the nearest 2026 place in the
    same municipality within NEAR_KM (2022: numbering changes between elections); -1 if none."""
    ids = list(rows); index = {pid: i for i, pid in enumerate(ids)}
    by_mun = {}
    for pid in ids: by_mun.setdefault(pid.rsplit("-", 2)[0], []).append(pid)
    out, hit = [], 0
    for g in gplace:
        if g is None: out.append(-1); continue
        pid, lon, lat = g
        if exact and pid in index: out.append(index[pid]); hit += 1; continue
        cand = by_mun.get(pid.rsplit("-", 2)[0], [])
        if cand:
            C = np.array([xy[c] for c in cand]); d = np.hypot((C[:, 0] - lon) * np.cos(np.radians(lat)), C[:, 1] - lat) * 111
            j = int(d.argmin())
            if d[j] <= NEAR_KM: out.append(index[cand[j]]); hit += 1; continue
        out.append(-1)
    print("place groups matched to neighbourhood data:", hit, "of", sum(1 for g in gplace if g))
    return out


def summary_stats(muns):
    """Per studio variable: label, unit, source, and the values' quantiles (0–100), so the sliders move by
    municipality count rather than raw value: income and population are very skewed."""
    out = []
    for j, (col, lab, unit, src) in enumerate(STUDIO):
        v = sorted(m["x"][j] for m in muns.values() if m["x"] and m["x"][j] is not None)
        out.append({"k": col, "n": lab, "u": unit, "src": src, "q": [v[min(len(v) - 1, round(i * (len(v) - 1) / 100))] for i in range(101)]})
    return out


def render(data):
    """Inline web/style.css, web/map.js and the data into web/index.html."""
    html = open("web/index.html").read()
    html = html.replace("/*__CSS__*/", open("web/style.css").read()).replace("/*__JS__*/", open("web/map.js").read())
    for k, v in data.items():
        html = html.replace(k, json.dumps(v, ensure_ascii=False, separators=(",", ":")))
    return html


def main():
    places = {y: json.load(open(f"data/places_{y}.json")) for y in YEARS}
    studio = load_studio()
    prow, pxy = load_places_studio()
    mgeo, sgeo = load_geometry()
    keys, cats_y = categories(places)
    order = list(range(len(mgeo["features"]))); random.shuffle(order)
    n_ref = {c: max(len(places[y]["muns"].get(c, {}).get("p", [])) for y in YEARS) for c in places[YEARS[0]]["muns"]}
    years = {}
    for y in YEARS:
        cat = cats_y[y]
        opt = lambda code: (studio.get(code, {}).get("opt", {}).get(y) or SHARE_DEFAULT)
        dots, counts, gcnt, gplace = make_dots(mgeo, places[y]["muns"], cat, cat[""], opt, order, n_ref)
        print(y, len(dots) // 3, "dots in", len(gcnt), "groups")
        pr = place_rows(gplace, prow, pxy, exact=(y == 2026))
        assert max(gcnt) < 65536
        groups = np.array(pr, "<i4").tobytes() + np.array(gcnt, "<u2").tobytes()  # place rows, then dot counts
        years[y] = {**year_summary(y, places[y], keys, cat), "dots": pack(dots), "cnt": counts, "ng": len(gcnt),
                    "groups": base64.b64encode(groups).decode()}
    muns = municipality_summaries(places, cats_y, studio)
    cats = [{"k": k, "col": COLOR[k]} for k in keys]
    open(OUT, "w").write(render({"__MGEO__": mgeo, "__SGEO__": sgeo, "__MUNS__": muns, "__CATS__": cats,
                                 "__YEARS__": years, "__ORDER__": order, "__STUDIO__": summary_stats(muns), "__VPD__": VPD, "__STORY__": json.load(open("web/story.json")),
                                 "__PLACES__": {"n": len(prow), "b": base64.b64encode(np.array(list(prow.values()), "u1").T.tobytes()).decode(),
                                                "vars": [{"k": c, "n": n, "u": u, "src": s_, "enc": e, "r": r} for c, n, u, s_, e, r in PLACE_VARS]}}))
    print("ok", len(muns), "municipalities;", sum(1 for f in mgeo["features"] if f["properties"]["codarea"] not in muns), "unmatched shapes;",
          sum(1 for c in muns if c not in studio), "without studio data")


if __name__ == "__main__":
    main()
