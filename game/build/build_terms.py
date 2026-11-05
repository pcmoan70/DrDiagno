"""terms.json: every non-obsolete HPO term with name, layperson synonym, parents and IDF.
IDF is computed over the diseases in phenotype.hpoa (distinct term per disease, aspect P)."""
import json, math, collections
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import HPO_DIR, OUT, parse_obo

hp = parse_obo(HPO_DIR / "hp.obo")
df = collections.Counter()
diseases = set()
with open(HPO_DIR / "phenotype.hpoa", encoding="utf-8") as f:
    seen = set()
    for line in f:
        if line.startswith("#") or line.startswith("database_id"):
            continue
        r = line.rstrip("\n").split("\t")
        if r[10] != "P" or r[2] == "NOT":
            continue
        diseases.add(r[0])
        if (r[0], r[3]) not in seen:
            seen.add((r[0], r[3]))
            df[r[3]] += 1
N = len(diseases)
terms = {}
for tid, t in hp.items():
    if t["obsolete"] or not tid.startswith("HP:"):
        continue
    lay = next((s[0] for s in t["syn"] if s[2] == "layperson"), None)
    idf = round(math.log((N + 1) / (df.get(tid, 0) + 1)), 3)
    terms[tid] = [t["name"], lay, t["is_a"], idf]
OUT.mkdir(parents=True, exist_ok=True)
with open(OUT / "terms.json", "w", encoding="utf-8") as f:
    json.dump({"N": N, "t": terms}, f, ensure_ascii=False, separators=(",", ":"))
print(f"terms.json: {len(terms)} terms, {sum(1 for v in terms.values() if v[1])} with lay names, N={N} diseases")
