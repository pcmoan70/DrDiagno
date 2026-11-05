"""credits.json: dataset names, versions (download dates) and licences for the pages' credits link."""
import json, sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA_ROOT, OUT

used = ["01_ontologies_terminologies/hpo", "01_ontologies_terminologies/mondo", "01_ontologies_terminologies/orphanet_orphadata", "02_disease_symptom_knowledge/primekg"]
out = []
for rel in used:
    m = json.load(open(DATA_ROOT / rel / "_meta.json", encoding="utf-8"))
    out.append({"name": m["name"], "homepage": m.get("homepage"), "license": m.get("license"), "downloaded": m.get("download_finished")})
json.dump(out, open(OUT / "credits.json", "w", encoding="utf-8"), indent=1)
print("credits.json:", len(out), "sources")
