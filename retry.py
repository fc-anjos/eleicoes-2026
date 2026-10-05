import json, time
from concurrent.futures import ThreadPoolExecutor
import fetch_lib as F
out = json.load(open("data/results.json"))
cfg = json.load(open("data/mun-config.json"))
todo = [(u["cd"], m["cd"], m["cdi"], m["nm"]) for u in cfg["abr"] for m in u["mu"] if (m["cdi"] or u["cd"]+m["cd"]) not in out["municipalities"]]
def f(m):
    uf, cd, ibge, nm = m
    for i in range(6):
        d = F.get(f"dados/{uf}/{uf}{cd}-c0001-e006257-u.json")
        if d: return m, F.parse(d)
        time.sleep(2*(i+1))
    return m, None
with ThreadPoolExecutor(4) as ex:
    for (uf, cd, ibge, nm), r in ex.map(f, todo):
        if r: out["municipalities"][ibge or uf+cd] = {"uf": uf, "name": nm, **r}
print("now", len(out["municipalities"]), "of", sum(len(u["mu"]) for u in cfg["abr"]))
json.dump(out, open("data/results.json", "w"), ensure_ascii=False)
