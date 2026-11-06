"""Checks the built bundles and writes game/data_report.md with a UTC date stamp."""
import json, gzip, sys, datetime, collections
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT

problems = []
terms = json.load(open(OUT / "terms.json", encoding="utf-8"))["t"]
defs = json.load(open(OUT / "defs.json", encoding="utf-8"))
index = json.load(open(OUT / "diseases" / "index.json", encoding="utf-8"))
tests = json.load(open(OUT.parent / "content" / "tests.json", encoding="utf-8"))
drugs = json.load(open(OUT / "drugs.json", encoding="utf-8"))
ids = {e["i"] for e in index["d"]}
sizes = {}
for p in sorted(OUT.rglob("*.json")):
    raw = p.read_bytes()
    sizes[str(p.relative_to(OUT))] = (len(raw), len(gzip.compress(raw, 6)))
for tid in defs:
    if tid not in terms:
        problems.append(f"defs.json: {tid} not a term")
for tid, v in terms.items():
    for par in v[2]:
        if par not in terms:
            problems.append(f"term {tid} parent {par} missing")
n_dz = 0
for sh in range(index["shards"]):
    d = json.load(open(OUT / "diseases" / f"shard-{sh:02d}.json", encoding="utf-8"))
    for mid, e in d.items():
        n_dz += 1
        if mid not in ids:
            problems.append(f"{mid} in shard but not index")
        if len(e["t"]) < 10:
            problems.append(f"{mid} has {len(e['t'])} terms")
        for t, p in e["t"]:
            if t not in terms:
                problems.append(f"{mid} term {t} unknown")
        for x in e["decoys"] + e["twins"]:
            if x not in ids:
                problems.append(f"{mid} decoy {x} not in pool")
        if not e["n"]:
            problems.append(f"{mid} no name")
if n_dz != len(ids):
    problems.append(f"index has {len(ids)} diseases, shards {n_dz}")
for t in tests:
    for r in t["reveals"]:
        if r not in terms:
            problems.append(f"test {t['id']} reveals unknown term {r}")
for m, (i, c) in drugs["i"].items():
    for d in i + c:
        if d not in drugs["d"]:
            problems.append(f"{m} drug {d} missing")
total_gz = sum(g for _, g in sizes.values())
tiers = collections.Counter(t for e in index["d"] for t in e["tiers"])
now = datetime.datetime.now(datetime.timezone.utc)
lines = [f"# Dr. Diagno data report", f"Generated {now:%Y-%m-%d %H:%M:%S} UTC", "",
         f"- diseases in pool: {len(ids)} (tiers: {dict(tiers)})", f"- HPO terms: {len(terms)} ({len(defs)} with definitions)",
         f"- tests: {len(tests)}", f"- drugs: {len(drugs['d'])} for {len(drugs['i'])} diseases",
         f"- total JSON: {sum(r for r, _ in sizes.values())/1e6:.2f} MB raw, {total_gz/1e6:.2f} MB gzipped (budget 8 MB)",
         f"- problems: {len(problems)}", "", "| file | raw KB | gzip KB |", "|---|---:|---:|"]
lines += [f"| {k} | {r/1024:.0f} | {g/1024:.0f} |" for k, (r, g) in sizes.items()]
if problems:
    lines += ["", "## Problems"] + [f"- {p}" for p in problems[:50]]
(OUT.parents[1] / "data_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("\n".join(lines[:9]))
if total_gz > 8e6:
    problems.append("size budget exceeded")
sys.exit(1 if problems else 0)
