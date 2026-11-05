"""drugs.json: for pool diseases, PrimeKG indication / contraindication drugs and each drug's
side-effect HPO terms (drug_effect edges), limited to the most specific terms."""
import json, csv, collections
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import PRIMEKG_DIR, OUT, mondo_id, hp_id

index = json.load(open(OUT / "diseases" / "index.json", encoding="utf-8"))["d"]
pool = {e["i"] for e in index}
terms = json.load(open(OUT / "terms.json", encoding="utf-8"))["t"]
MAX_DRUGS, MAX_EFFECTS = 6, 8

ind, contra = collections.defaultdict(list), collections.defaultdict(list)
effects = collections.defaultdict(set)
names = {}
csv.field_size_limit(10 ** 9)
with open(PRIMEKG_DIR / "kg.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        rel = r["relation"]
        if rel in ("indication", "contraindication") and r["x_type"] == "drug":
            names[r["x_id"]] = r["x_name"]
            for part in r["y_id"].split("_"):
                if part.isdigit():
                    m = mondo_id(part)
                    if m in pool:
                        (ind if rel == "indication" else contra)[m].append(r["x_id"])
        elif rel == "drug_effect" and r["x_type"] == "drug":
            names[r["x_id"]] = r["x_name"]
            if r["y_id"].isdigit():
                effects[r["x_id"]].add(hp_id(r["y_id"]))

by_disease, used = {}, set()
for m in pool:
    i = list(dict.fromkeys(ind.get(m, [])))[:MAX_DRUGS]
    c = list(dict.fromkeys(contra.get(m, [])))[:MAX_DRUGS]
    if i or c:
        by_disease[m] = [i, c]
        used.update(i); used.update(c)
drugs = {}
for d in used:
    eff = [t for t in effects.get(d, []) if t in terms]
    eff.sort(key=lambda t: -terms[t][3])
    drugs[d] = [names[d], eff[:MAX_EFFECTS]]
with open(OUT / "drugs.json", "w", encoding="utf-8") as f:
    json.dump({"d": drugs, "i": by_disease}, f, ensure_ascii=False, separators=(",", ":"))
print(f"drugs.json: {len(drugs)} drugs, {len(by_disease)} pool diseases with indication/contraindication, {sum(1 for v in by_disease.values() if v[0])} with an indicated drug")
