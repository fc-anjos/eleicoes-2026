"""Fetch 2026 presidential 1st-round results (TSE) by state and municipality."""
import json, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://resultados.tse.jus.br/oficial/ele2026/6257"

def get(path):
    for _ in range(4):
        try:
            with urllib.request.urlopen(f"{BASE}/{path}", timeout=30) as r:
                return json.load(r)
        except Exception:
            pass
    return None

def parse(d):
    cands = {}
    for agr in d["carg"][0]["agr"]:
        for par in agr["par"]:
            for c in par["cand"]:
                cands[c["nmu"]] = int(c["vap"])
    s = {k: d["s"].get(k) for k in ("pst", "st")} if isinstance(d.get("s"), dict) else {}
    return {"votes": cands, "totals": d.get("v"), "status": s}

cfg = get("config/mun-e006257-cm.json")
states, muns = [], []
for uf in cfg["abr"]:
    states.append(uf["cd"])
    for m in uf["mu"]:
        muns.append((uf["cd"], m["cd"], m["cdi"], m["nm"]))

out = {"national": parse(get("dados/br/br-c0001-e006257-u.json")), "states": {}, "municipalities": {}}

def fstate(uf):
    d = get(f"dados/{uf}/{uf}-c0001-e006257-u.json")
    return uf, parse(d) if d else None

def fmun(m):
    uf, cd, ibge, nm = m
    d = get(f"dados/{uf}/{uf}{cd}-c0001-e006257-u.json")
    return m, parse(d) if d else None

with ThreadPoolExecutor(32) as ex:
    for uf, r in ex.map(fstate, states):
        out["states"][uf] = r
    missing = 0
    for (uf, cd, ibge, nm), r in ex.map(fmun, muns):
        if r is None: missing += 1; continue
        out["municipalities"][ibge or f"{uf}{cd}"] = {"uf": uf, "name": nm, **r}
print(len(states), "states;", len(out["municipalities"]), "municipalities; missing", missing)
json.dump(out, open("data/results.json", "w"), ensure_ascii=False)
