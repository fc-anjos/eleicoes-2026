"""Aggregate TSE section-level presidential results (1st round) to polling places (locais de votação) with coordinates.
Run from the repo root: python3 -m pipeline.prep_places 2026   (or 2022)

Inputs (TSE open data, unzipped into data/raw/, or data/raw/y2022/ for 2022):
  votacao_secao_YYYY_BR.csv             votes per section and candidate
  detalhe_votacao_secao_YYYY_BR.csv     per section: eligible voters, abstentions, blank and null votes
  eleitorado_local_votacao_YYYY*.csv    one row per section: its polling place and that place's lat/long
  y2024/eleitorado_local_votacao_2024.csv  2024 coordinates (and, for 2022, 2026's): a fallback for places
                                           whose own are missing or wrong (matched on municipality, place
                                           number and name)
Output: data/places_YYYY.json
  {"nat": {key: votes}, "names": {key: TSE name}, "muns": {ibge_code: {"p": [[lon, lat, {key: votes}, alt, id], ...],
   "u": {key: votes}, "bn": blank and null votes}}}
  Keys are candidate numbers, plus "A" for abstentions (people on the roll who didn't vote), which are placed at
  their section's polling place like votes. alt is the fallback [lon, lat] (or null); id is
  "UF-municipality-zone-place" (TSE codes). "u" holds votes from places with no coordinates in either year. "nat"
  includes votes cast abroad; "muns" doesn't.
"""

import csv
import glob
import sys
from collections import defaultdict

from .jsonio import dump_json, load_json

YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
RAW = "data/raw" if YEAR == 2026 else f"data/raw/y{YEAR}"
# a voting option missing from the official valid totals (2026: no. 28, 5,246 votes, annulled and counted
# separately) is treated like blank and null votes: not valid, not drawn
NOT_VALID = {2026: {"28"}}.get(YEAR, set())
num = lambda s: float(s.replace(",", "."))


def rows(path):
    """CSV rows as dicts, read with csv.reader (much faster than DictReader on the 1.6 GB 2022 file)."""
    with open(path, encoding="latin1") as f:
        r = csv.reader(f, delimiter=";")
        head = next(r)
        ix = {k: i for i, k in enumerate(head)}
        for row in r:
            yield row, ix


# TSE municipality code -> IBGE code (the map's geometry is keyed by IBGE); TSE codes are stable across years
cfg = load_json("data/mun-config.json")
ibge = {(uf["cd"].upper(), int(m["cd"])): m["cdi"] for uf in cfg["abr"] for m in uf["mu"]}


def coords(lat, lon):
    try:
        lat, lon = num(lat), num(lon)
    except ValueError:
        return None
    return None if lat in (-1, 0) or lon in (-1, 0) else (lon, lat)


# section -> polling place. Codes are compared as integers: the polling-place file zero-pads
# municipality codes ("01473") while the votes file does not (1473).
sec = {}
for f in glob.glob(f"{RAW}/eleitorado_local_votacao_{YEAR}*.csv"):
    if f.endswith("_BRASIL.csv"):
        continue  # the same rows as the per-state files
    for r, ix in rows(f):
        if r[ix["NR_TURNO"]] != "1":
            continue
        uf, mun, zona = r[ix["SG_UF"]], int(r[ix["CD_MUNICIPIO"]]), int(r[ix["NR_ZONA"]])
        sec[(uf, mun, zona, int(r[ix["NR_SECAO"]]))] = (
            (uf, mun, zona, int(r[ix["NR_LOCAL_VOTACAO"]])),
            coords(r[ix["NR_LATITUDE"]], r[ix["NR_LONGITUDE"]]),
            r[ix["NM_LOCAL_VOTACAO"]],
            r[ix["DS_ENDERECO"]],
        )
old = {}  # fallback coordinates by (uf, municipality, place number, place name): 2024's, then (for 2022) 2026's
fallback = ["data/raw/y2024/eleitorado_local_votacao_2024.csv"] + (
    glob.glob("data/raw/eleitorado_local_votacao_2026_[A-Z][A-Z].csv") if YEAR != 2026 else []
)
# Places get renumbered between elections, so looser keys follow: the name alone, then the address, within the
# municipality (the 2022 file lacks coordinates for ~30% of voters in BA, ES and SE)
norm = lambda t: " ".join(t.upper().replace(".", " ").replace(",", " ").split())
loose = {}
for f in fallback:
    for r, ix in rows(f):
        c = coords(r[ix["NR_LATITUDE"]], r[ix["NR_LONGITUDE"]])
        if not c:
            continue
        uf, mun = r[ix["SG_UF"]], int(r[ix["CD_MUNICIPIO"]])
        old.setdefault((uf, mun, int(r[ix["NR_LOCAL_VOTACAO"]]), r[ix["NM_LOCAL_VOTACAO"]]), c)
        loose.setdefault((uf, mun, "n", norm(r[ix["NM_LOCAL_VOTACAO"]])), c)
        loose.setdefault((uf, mun, "a", norm(r[ix["DS_ENDERECO"]])), c)

place_votes = defaultdict(lambda: defaultdict(int))
place_xy, alt_cache, unplaced, bn = {}, {}, defaultdict(lambda: defaultdict(int)), defaultdict(int)
nat, names, missing = defaultdict(int), {}, 0


def add(r, ix, key, v):
    global missing
    nat[key] += v  # national totals include votes cast abroad
    if r[ix["SG_UF"]] == "ZZ":
        return  # abroad: not on the map
    k = (r[ix["SG_UF"]], int(r[ix["CD_MUNICIPIO"]]), int(r[ix["NR_ZONA"]]), int(r[ix["NR_SECAO"]]))
    if k not in sec:
        missing += v
        unplaced[ibge[k[:2]]][key] += v
        return
    place, xy, nm, addr = sec[k]
    alt = (
        old.get((place[0], place[1], place[3], nm))
        or loose.get((place[0], place[1], "n", norm(nm)))
        or loose.get((place[0], place[1], "a", norm(addr)))
        if xy is None or place not in alt_cache
        else alt_cache[place]
    )
    alt_cache[place] = alt
    if xy is None and alt is None:
        unplaced[ibge[k[:2]]][key] += v
    else:
        place_votes[place][key] += v
        place_xy[place] = (xy, alt)


for r, ix in rows(f"{RAW}/votacao_secao_{YEAR}_BR.csv"):
    if r[ix["NR_TURNO"]] != "1" or r[ix["CD_CARGO"]] != "1":
        continue
    n = r[ix["NR_VOTAVEL"]]
    if n in ("95", "96") or n in NOT_VALID:
        continue  # blank and null votes
    names[n] = r[ix["NM_VOTAVEL"]]
    add(r, ix, n, int(r[ix["QT_VOTOS"]]))
for r, ix in rows(f"{RAW}/detalhe_votacao_secao_{YEAR}_BR.csv"):
    if r[ix["NR_TURNO"]] != "1" or r[ix["CD_CARGO"]] != "1":
        continue
    add(r, ix, "A", int(r[ix["QT_ABSTENCOES"]]))
    b = int(r[ix["QT_VOTOS_BRANCOS"]]) + int(r[ix["QT_VOTOS_NULOS"]])
    nat["BN"] += b
    if r[ix["SG_UF"]] != "ZZ":
        bn[ibge[(r[ix["SG_UF"]], int(r[ix["CD_MUNICIPIO"]]))]] += b

out = defaultdict(lambda: {"p": [], "u": {}, "bn": 0})
for place, votes in place_votes.items():
    xy, alt = place_xy[place]
    xy = xy or alt  # no coordinates of its own: use the fallback
    alt = [round(alt[0], 5), round(alt[1], 5)] if alt and alt != xy else None
    out[ibge[place[:2]]]["p"].append([round(xy[0], 5), round(xy[1], 5), dict(votes), alt, "{}-{}-{}-{}".format(*place)])
for code, votes in unplaced.items():
    out[code]["u"] = dict(votes)
for code, v in bn.items():
    out[code]["bn"] = v
dump_json({"nat": nat, "names": names, "muns": out}, f"data/places_{YEAR}.json", compact=True)
valid = sum(v for k, v in nat.items() if k not in ("A", "BN"))
print(
    YEAR,
    f"{valid:,} valid votes, {nat['A']:,} abstentions, {nat['BN']:,} blank/null;",
    len(place_votes),
    "polling places;",
    sum(1 for xy, alt in place_xy.values() if xy is None),
    "using fallback coordinates;",
    sum(sum(v.values()) for v in unplaced.values()),
    "votes without coordinates;",
    missing,
    "in sections missing from the place file",
)
