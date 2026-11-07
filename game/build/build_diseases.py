"""diseases/*.json + diseases/index.json: one profile per Mondo disease with >= MIN_TERMS HPO
annotations, built from phenotype.hpoa (OMIM/ORPHA/DECIPHER) mapped to Mondo via mondo.obo
xrefs, enriched with Orphanet onset/prevalence, Mondo/Orphanet definitions, Mayo symptom text
(PrimeKG disease_features) and precomputed decoys (cosine similarity over IDF-weighted terms).
Common diseases that the HPO does not annotate (common cold, influenza, appendicitis...) come from
DDXPlus (measured symptom frequencies, 49 conditions) and the Human Symptoms-Disease Network
(literature co-mention, ~1,400 diseases): see ddxplus.py and hsdn.py. HPO-annotated profiles win."""
import json, csv, re, hashlib, collections
import xml.etree.ElementTree as ET
import numpy as np
from scipy import sparse
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import HPO_DIR, MONDO_OBO, ORPHA_DIR, PRIMEKG_DIR, OUT, parse_obo, mondo_id
import hsdn, ddxplus

MIN_TERMS, RESIDENT_TERMS, SHARDS, N_DECOYS = 10, 20, 16, 8
COMMON_MIN_TERMS, COMMON_RESIDENT_TERMS = 5, 12  # common-disease profiles are shorter than HPO annotations
FREQ = {"HP:0040280": 1.0, "HP:0040281": 0.9, "HP:0040282": 0.55, "HP:0040283": 0.17, "HP:0040284": 0.03, "HP:0040285": 0.0}
RARE_CLASSES = {"<1 / 1 000 000", "1-9 / 1 000 000", "1-9 / 100 000"}
PREV_ORDER = [">1 / 1000", "6-9 / 10 000", "1-5 / 10 000", "1-9 / 100 000", "1-9 / 1 000 000", "<1 / 1 000 000"]


def freq_to_p(s):
    if not s:
        return 0.5
    if s in FREQ:
        return FREQ[s]
    if s.endswith("%"):
        return max(0.02, min(1.0, float(s[:-1]) / 100))
    if "/" in s:
        a, b = s.split("/")
        return max(0.05, min(1.0, int(a) / max(1, int(b))))
    return 0.5


# ---- 1. phenotype.hpoa grouped by source disease id ----
src = {}
with open(HPO_DIR / "phenotype.hpoa", encoding="utf-8") as f:
    for line in f:
        if line.startswith("#") or line.startswith("database_id"):
            continue
        r = line.rstrip("\n").split("\t")
        d = src.setdefault(r[0], {"name": r[1], "terms": {}, "neg": set(), "onset": set(), "course": set(), "inh": set()})
        if r[10] == "P":
            if r[2] == "NOT":
                d["neg"].add(r[3])
            else:
                p = freq_to_p(r[7])
                if p > 0:
                    d["terms"][r[3]] = max(p, d["terms"].get(r[3], 0))
            if r[6]:
                d["onset"].add(r[6])
        elif r[10] == "C":
            d["course"].add(r[3])
        elif r[10] == "I":
            d["inh"].add(r[3])

# ---- 2. Mondo mapping (prefer equivalentTo xrefs) ----
mondo = parse_obo(MONDO_OBO)
to_mondo = {}
for mid, t in mondo.items():
    if t["obsolete"] or not mid.startswith("MONDO:"):
        continue
    for xid, line in t["xref"]:
        key = None
        if xid.startswith("OMIM:"):
            key = xid
        elif xid.startswith("Orphanet:"):
            key = "ORPHA:" + xid[9:]
        elif xid.startswith("DECIPHER:"):
            key = xid
        if key:
            eq = "MONDO:equivalentTo" in line
            if key not in to_mondo or (eq and not to_mondo[key][1]):
                to_mondo[key] = (mid, eq)

# ---- 3. Orphanet onset / prevalence ----
onset_by_orpha, prev_by_orpha = {}, {}
for dis in ET.parse(ORPHA_DIR / "en_product9_ages_natural_history.xml").getroot().iter("Disorder"):
    code = "ORPHA:" + dis.find("OrphaCode").text
    onset_by_orpha[code] = [n.text for n in dis.findall("AverageAgeOfOnsetList/AverageAgeOfOnset/Name") if n.text != "No data available"]
for dis in ET.parse(ORPHA_DIR / "en_product9_prev_epidemiology.xml").getroot().iter("Disorder"):
    code = "ORPHA:" + dis.find("OrphaCode").text
    best = None
    for p in dis.findall("PrevalenceList/Prevalence"):
        ptype = p.find("PrevalenceType/Name").text
        cls = p.find("PrevalenceClass/Name")
        cls = cls.text if cls is not None else None
        geo = p.find("PrevalenceGeographic/Name")
        geo = geo.text if geo is not None else ""
        rank = {"Point prevalence": 0, "Prevalence at birth": 1, "Lifetime Prevalence": 2, "Annual incidence": 3, "Cases/families": 4}.get(ptype, 5)
        if geo == "Worldwide":
            rank -= 0.5
        if ptype == "Cases/families":
            cls = "case reports only"
        if cls and (best is None or rank < best[0]):
            best = (rank, ptype, cls)
    if best:
        prev_by_orpha[code] = (best[1], best[2])

# ---- 4. PrimeKG disease_features: Orphanet definition + Mayo symptoms ----
csv.field_size_limit(10 ** 9)
feat = {}
with open(PRIMEKG_DIR / "disease_features.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        for part in str(r["mondo_id"]).split("_"):
            if part.isdigit():
                m = mondo_id(part)
                cur = feat.setdefault(m, {})
                for k in ("orphanet_definition", "mayo_symptoms"):
                    if r[k] and not cur.get(k):
                        cur[k] = r[k].strip()

# ---- 5. merge per Mondo id ----
dz = {}
unmapped = 0
for sid, d in src.items():
    if len(d["terms"]) == 0:
        continue
    m = to_mondo.get(sid)
    if not m:
        unmapped += 1
        continue
    mid = m[0]
    e = dz.setdefault(mid, {"id": mid, "src": [], "terms": {}, "neg": set(), "onset": set(), "course": set(), "inh": set(), "orpha_onset": [], "prev": None})
    e["src"].append(sid)
    for t, p in d["terms"].items():
        e["terms"][t] = max(p, e["terms"].get(t, 0))
    e["neg"] |= d["neg"]; e["onset"] |= d["onset"]; e["course"] |= d["course"]; e["inh"] |= d["inh"]
    if sid.startswith("ORPHA:"):
        e["orpha_onset"] = e["orpha_onset"] or onset_by_orpha.get(sid, [])
        e["prev"] = e["prev"] or prev_by_orpha.get(sid)

pool = {mid: e for mid, e in dz.items() if len(e["terms"]) >= MIN_TERMS}

# ---- 5b. common diseases: HSDN breadth, DDXPlus frequencies on top; never over an HPO-annotated profile ----
hp = parse_obo(HPO_DIR / "hp.obo")
common = {}
for mid, c in hsdn.common_diseases(mondo, hp)[0].items():
    common[mid] = {"src": [c["src"]], "terms": dict(c["terms"])}
ddx, measurable = ddxplus.common_diseases(mondo, hp)
for mid, c in ddx.items():
    e = common.setdefault(mid, {"src": [], "terms": {}})
    e["src"].insert(0, c["src"])
    # measured frequency replaces literature prominence; a literature finding that DDXPlus could measure
    # but found in < 5% of patients (diarrhea for the common cold) is dropped
    e["terms"] = {t: p for t, p in e["terms"].items() if t not in measurable} | c["terms"]
n_common = 0
for mid, c in common.items():
    if mid in pool or mid not in mondo or mondo[mid]["obsolete"] or len(c["terms"]) < COMMON_MIN_TERMS:
        continue
    pool[mid] = {"id": mid, "src": c["src"], "terms": c["terms"], "neg": set(), "onset": set(), "course": set(), "inh": set(), "orpha_onset": [], "prev": None, "common": True}
    n_common += 1
print(f"common diseases added: {n_common} (DDXPlus-backed: {sum(1 for e in pool.values() if e.get('common') and e['src'][0].startswith('DDXPLUS:'))})")

for mid, e in pool.items():
    t = mondo[mid]
    e["name"] = t["name"]
    # Mondo carries a few mojibake duplicates ("Ch\ufffd\ufffddiak") next to the correct spelling; drop them.
    syn = [s[0] for s in t["syn"] if s[1] == "EXACT" and s[0].lower() != t["name"].lower() and "\ufffd" not in s[0]]
    e["syn"] = list(dict.fromkeys(syn))[:6]
    e["def"] = t["def"] or feat.get(mid, {}).get("orphanet_definition", "")
    e["mayo"] = feat.get(mid, {}).get("mayo_symptoms", "")[:700]
    rare = e["prev"] is not None and (e["prev"][1] in RARE_CLASSES or e["prev"][1] == "case reports only")
    tiers = ["attending"]
    if e.get("common"):
        if len(e["terms"]) >= COMMON_RESIDENT_TERMS and (e["mayo"] or e["src"][0].startswith("DDXPLUS:")):
            tiers.append("resident")
    elif len(e["terms"]) >= RESIDENT_TERMS and e["mayo"]:
        tiers.append("resident")
    if rare and (e["orpha_onset"] or e["onset"]):
        tiers.append("house")
    e["tiers"] = tiers

# ---- 6. decoys and twins: cosine similarity over IDF-weighted term vectors ----
terms_json = json.load(open(OUT / "terms.json", encoding="utf-8"))["t"]
ids = sorted(pool)
tix = {t: i for i, t in enumerate(terms_json)}
rows, cols, vals = [], [], []
for i, mid in enumerate(ids):
    for t, p in pool[mid]["terms"].items():
        if t in tix:
            rows.append(i); cols.append(tix[t]); vals.append(terms_json[t][3] * (0.5 + 0.5 * p))
X = sparse.csr_matrix((vals, (rows, cols)), shape=(len(ids), len(tix)), dtype=np.float32)
norm = np.sqrt(np.asarray(X.multiply(X).sum(axis=1)).ravel()) + 1e-9
X = sparse.diags(1 / norm) @ X
S = (X @ X.T).toarray()
np.fill_diagonal(S, 0)
for i, mid in enumerate(ids):
    order = np.argsort(-S[i])
    twins = [ids[j] for j in order[:20] if S[i, j] >= 0.9]
    decoys = [ids[j] for j in order if 0.05 <= S[i, j] < 0.9][:N_DECOYS]
    pool[mid]["twins"] = twins
    pool[mid]["decoys"] = decoys
    dec_terms = set().union(*(pool[d]["terms"].keys() for d in decoys)) if decoys else set()
    pool[mid]["shared"] = sorted(t for t in pool[mid]["terms"] if t in dec_terms)

# ---- 7. write shards + index ----
def shard_of(mid):
    return int(hashlib.md5(mid.encode()).hexdigest(), 16) % SHARDS

shards = collections.defaultdict(dict)
index = []
for mid in ids:
    e = pool[mid]
    sh = shard_of(mid)
    shards[sh][mid] = {
        "n": e["name"], "src": e["src"], "def": e["def"][:600], "mayo": e["mayo"],
        "t": [[t, round(p, 2)] for t, p in sorted(e["terms"].items(), key=lambda kv: -kv[1])],
        "neg": sorted(e["neg"]), "onset": sorted(e["onset"]), "course": sorted(e["course"]), "inh": sorted(e["inh"]),
        "oonset": e["orpha_onset"], "prev": list(e["prev"]) if e["prev"] else None,
        "decoys": e["decoys"], "twins": e["twins"], "shared": e["shared"],
    }
    index.append({"i": mid, "n": e["name"], "s": e["syn"], "tiers": e["tiers"], "h": sh, "k": len(e["terms"])})
(OUT / "diseases").mkdir(parents=True, exist_ok=True)
for sh, d in shards.items():
    with open(OUT / "diseases" / f"shard-{sh:02d}.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
with open(OUT / "diseases" / "index.json", "w", encoding="utf-8") as f:
    json.dump({"shards": SHARDS, "d": index}, f, ensure_ascii=False, separators=(",", ":"))
tc = collections.Counter(t for e in index for t in e["tiers"])
print(f"source diseases with terms: {sum(1 for d in src.values() if d['terms'])}, unmapped to Mondo: {unmapped}, Mondo diseases: {len(dz)}, pool (>= {MIN_TERMS} terms): {len(pool)}")
print("tiers:", dict(tc), "| with twins:", sum(1 for e in pool.values() if e["twins"]), "| median decoys:", int(np.median([len(e['decoys']) for e in pool.values()])))
