"""Fetch 2026 presidential 1st-round results (TSE) nationally, by state and by municipality -> data/results.json.

Also saves the TSE municipality list (data/mun-config.json), which maps TSE codes to IBGE codes.
Municipalities that fail on the first pass are retried with fewer workers and a backoff.
"""

import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from .jsonio import dump_json

BASE = "https://resultados.tse.jus.br/oficial/ele2026/6257"


def get(path, tries=4, backoff=0):
    for i in range(tries):
        try:
            with urllib.request.urlopen(f"{BASE}/{path}", timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(backoff * (i + 1))
    return None


def parse(d):
    cands = {c["nmu"]: int(c["vap"]) for agr in d["carg"][0]["agr"] for par in agr["par"] for c in par["cand"]}
    s = {k: d["s"].get(k) for k in ("pst", "st")} if isinstance(d.get("s"), dict) else {}
    return {"votes": cands, "totals": d.get("v"), "status": s}


def main():
    cfg = get("config/mun-e006257-cm.json")
    dump_json(cfg, "data/mun-config.json")
    states = [uf["cd"] for uf in cfg["abr"]]
    muns = [(uf["cd"], m["cd"], m["cdi"], m["nm"]) for uf in cfg["abr"] for m in uf["mu"]]
    out = {"national": parse(get("dados/br/br-c0001-e006257-u.json")), "states": {}, "municipalities": {}}

    def fstate(uf):
        d = get(f"dados/{uf}/{uf}-c0001-e006257-u.json")
        return uf, parse(d) if d else None

    def fmun(m, **kw):
        uf, cd, _ibge, _nm = m
        d = get(f"dados/{uf}/{uf}{cd}-c0001-e006257-u.json", **kw)
        return m, parse(d) if d else None

    def collect(results):
        for (uf, cd, ibge, nm), r in results:
            if r:
                out["municipalities"][ibge or uf + cd] = {"uf": uf, "name": nm, **r}

    with ThreadPoolExecutor(32) as ex:
        out["states"] = dict(ex.map(fstate, states))
        collect(ex.map(fmun, muns))
    todo = [m for m in muns if (m[2] or m[0] + m[1]) not in out["municipalities"]]
    with ThreadPoolExecutor(4) as ex:  # the server throttles bursts: retry slowly
        collect(ex.map(lambda m: fmun(m, tries=6, backoff=2), todo))
    print(len(states), "states;", len(out["municipalities"]), "of", len(muns), "municipalities")
    dump_json(out, "data/results.json")


if __name__ == "__main__":
    main()
