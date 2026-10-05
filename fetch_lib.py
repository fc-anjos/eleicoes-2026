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
