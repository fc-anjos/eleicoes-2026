"""Aggregate TSE section-level presidential votes to polling places (locais de votação) with coordinates.

Inputs (TSE open data, unzipped into data/raw/):
  votacao_secao_2026_BR.csv            votes per section and candidate
  eleitorado_local_votacao_2026_XX.csv one row per section: its polling place and that place's lat/long
  y2024/eleitorado_local_votacao_2024.csv the same for 2024: fallback coordinates for places whose 2026 ones
                                        are missing or wrong (matched on municipality, place number and name)
Output: data/places.json  {ibge_code: {"p": [[lon, lat, {name: votes}, alt], ...], "u": {name: votes}}}
  alt is the 2024 [lon, lat] (or null). "u" holds votes from places with no coordinates in either year.
"""
import csv, glob, json
from collections import defaultdict

RAW = "data/raw"
num = lambda s: float(s.replace(",", "."))

# TSE municipality code -> IBGE code (the map's geometry is keyed by IBGE)
cfg = json.load(open("data/mun-config.json"))
ibge = {(uf["cd"].upper(), int(m["cd"])): m["cdi"] for uf in cfg["abr"] for m in uf["mu"]}

# section -> polling place. Codes are compared as integers: the polling-place file zero-pads
# municipality codes ("01473") while the votes file does not (1473).
sec = {}
for f in glob.glob(f"{RAW}/eleitorado_local_votacao_2026_[A-Z][A-Z].csv"):
    for r in csv.DictReader(open(f, encoding="latin1"), delimiter=";"):
        if r["NR_TURNO"] != "1": continue
        uf, mun, zona = r["SG_UF"], int(r["CD_MUNICIPIO"]), int(r["NR_ZONA"])
        try: lat, lon = num(r["NR_LATITUDE"]), num(r["NR_LONGITUDE"])
        except ValueError: lat = lon = None
        if lat in (-1, 0) or lon in (-1, 0): lat = lon = None
        sec[(uf, mun, zona, int(r["NR_SECAO"]))] = ((uf, mun, zona, int(r["NR_LOCAL_VOTACAO"])), lat, lon, r["NM_LOCAL_VOTACAO"])

def coords(r):
    try: lat, lon = num(r["NR_LATITUDE"]), num(r["NR_LONGITUDE"])
    except ValueError: return None
    return None if lat in (-1, 0) or lon in (-1, 0) else (lon, lat)
old = {}  # 2024 coordinates by (uf, municipality, place number, place name)
for r in csv.DictReader(open(f"{RAW}/y2024/eleitorado_local_votacao_2024.csv", encoding="latin1"), delimiter=";"):
    c = coords(r)
    if c: old[(r["SG_UF"], int(r["CD_MUNICIPIO"]), int(r["NR_LOCAL_VOTACAO"]), r["NM_LOCAL_VOTACAO"])] = c

# candidate names differ between files ("FLAVIO NANTES BOLSONARO" vs "FLAVIO BOLSONARO"); every national
# total matches exactly, so names are mapped by total
res = json.load(open("data/results.json"))["national"]["votes"]
by_total = {v: k for k, v in res.items()}

place_votes = defaultdict(lambda: defaultdict(int))
place_xy, unplaced = {}, defaultdict(lambda: defaultdict(int))
nat = defaultdict(int)
for r in csv.DictReader(open(f"{RAW}/votacao_secao_2026_BR.csv", encoding="latin1"), delimiter=";"):
    if r["NR_VOTAVEL"] in ("95", "96"): continue  # blank and null votes
    v = int(r["QT_VOTOS"]); nat[r["NM_VOTAVEL"]] += v  # national totals include votes cast abroad
    if r["SG_UF"] == "ZZ": continue  # abroad: not on the map
    k = (r["SG_UF"], int(r["CD_MUNICIPIO"]), int(r["NR_ZONA"]), int(r["NR_SECAO"]))
    place, lat, lon, nm = sec[k]
    alt = old.get((place[0], place[1], place[3], nm))
    if lat is None and alt is None: unplaced[ibge[k[:2]]][r["NM_VOTAVEL"]] += v
    else: place_votes[place][r["NM_VOTAVEL"]] += v; place_xy[place] = ((lon, lat) if lat is not None else None, alt)

# a voting option missing from the official valid totals (2026: no. 28, 5,246 votes) is treated like blank and
# null votes: not valid, not drawn
name = {n: by_total[v] for n, v in nat.items() if v in by_total}
skipped = {n: v for n, v in nat.items() if v not in by_total}
place_votes = {p: {name[n]: v for n, v in vs.items() if n in name} for p, vs in place_votes.items()}
unplaced = {c: {n: v for n, v in vs.items() if n in name} for c, vs in unplaced.items()}
out = defaultdict(lambda: {"p": [], "u": {}})
for place, votes in place_votes.items():
    xy, alt = place_xy[place]; xy = xy or alt  # no 2026 coordinates: use 2024's
    alt = [round(alt[0], 5), round(alt[1], 5)] if alt and alt != xy else None
    out[ibge[place[:2]]]["p"].append([round(xy[0], 5), round(xy[1], 5), votes, alt])
for code, votes in unplaced.items():
    out[code]["u"] = {name[n]: v for n, v in votes.items()}
json.dump(out, open("data/places.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("skipped as not valid:", skipped)
print(sum(1 for xy, alt in place_xy.values() if alt), "places with 2024 coordinates;", len(place_votes), "polling places,", sum(sum(v.values()) for v in unplaced.values()), "votes without coordinates")
