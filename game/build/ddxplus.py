"""Common acute conditions from DDXPlus (Fansi Tchango et al. 2022, CC BY 4.0): 49 pathologies with
symptom frequencies measured over its synthetic patients (validation split, 132k rows). Conditions are
mapped to Mondo by name, evidences to HPO terms by hand (symptoms only; antecedents such as smoking
or travel are not findings). Pain locations are grouped (temples, forehead... -> Headache).
Run with `python3 -I`."""
import ast, collections, csv, re
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA_ROOT, HPO_DIR, MONDO_OBO, parse_obo

DDX = DATA_ROOT / "03_symptom_disease_tabular" / "ddxplus"
MIN_P, MIN_TERMS = 0.05, 3  # thin profiles are completed from HSDN in build_diseases.py

# DDXPlus condition -> Mondo names to try in order; None = not a disease of its own, or no Mondo term
# (Mondo has no angina pectoris, laryngospasm, PSVT or scombroid poisoning for humans)
CONDITIONS = {
    "Acute COPD exacerbation / infection": ["chronic obstructive pulmonary disease"], "Acute dystonic reactions": None,
    "Acute laryngitis": ["acute laryngitis", "laryngitis"], "Acute otitis media": ["acute otitis media", "otitis media"],
    "Acute pulmonary edema": ["pulmonary edema"], "Acute rhinosinusitis": ["acute sinusitis", "sinusitis"], "Allergic sinusitis": ["allergic rhinitis"],
    "Anaphylaxis": ["anaphylaxis"], "Anemia": ["anemia"], "Atrial fibrillation": ["atrial fibrillation"], "Boerhaave": ["Boerhaave syndrome", "esophageal rupture"],
    "Bronchiectasis": ["bronchiectasis"], "Bronchiolitis": ["bronchiolitis"], "Bronchitis": ["acute bronchitis", "bronchitis"],
    "Bronchospasm / acute asthma exacerbation": ["asthma"], "Chagas": ["Chagas disease"], "Chronic rhinosinusitis": ["chronic sinusitis", "chronic rhinosinusitis"],
    "Cluster headache": ["cluster headache"], "Croup": ["croup"], "Ebola": ["Ebola hemorrhagic fever", "Ebola virus disease"], "Epiglottitis": ["epiglottitis"],
    "GERD": ["gastroesophageal reflux disease"], "Guillain-Barré syndrome": ["Guillain-Barre syndrome"],
    "HIV (initial infection)": ["acute HIV infection", "HIV infectious disease", "human immunodeficiency virus infectious disease"], "Influenza": ["influenza"],
    "Inguinal hernia": None, "Larygospasm": None, "Localized edema": None, "Myasthenia gravis": ["myasthenia gravis"],
    "Myocarditis": ["myocarditis"], "PSVT": None,
    "Pancreatic neoplasm": ["pancreatic cancer", "pancreatic neoplasm"], "Panic attack": ["panic disorder"], "Pericarditis": ["pericarditis"], "Pneumonia": ["pneumonia"],
    "Possible NSTEMI / STEMI": ["myocardial infarction"], "Pulmonary embolism": ["pulmonary embolism"], "Pulmonary neoplasm": ["lung cancer", "lung neoplasm"],
    "SLE": ["systemic lupus erythematosus"], "Sarcoidosis": ["sarcoidosis"], "Scombroid food poisoning": None,
    "Spontaneous pneumothorax": ["spontaneous pneumothorax", "pneumothorax"], "Spontaneous rib fracture": None,
    "Stable angina": None, "Tuberculosis": ["tuberculosis"],
    "URTI": ["upper respiratory tract infection", "acute upper respiratory infection", "common cold"], "Unstable angina": ["unstable angina", "unstable angina pectoris"],
    "Viral pharyngitis": ["viral pharyngitis", "pharyngitis"], "Whooping cough": ["pertussis", "whooping cough"],
}

# Binary symptom evidences -> HPO names to try in order (unlisted evidences are skipped; E_129 "lesions,
# redness or problems on your skin" is a gate question that is positive for 99% of pneumonia patients)
EVIDENCES = {
    "E_9": ["Lymphadenopathy"], "E_14": ["Chest pain"], "E_23": ["Sleep apnea"], "E_30": ["Abdominal distention"], "E_32": ["Poor appetite", "Decreased appetite"],
    "E_39": ["Confusion"], "E_43": ["Seizure"], "E_45": ["Hemoptysis"], "E_50": ["Hyperhidrosis"], "E_51": ["Diarrhea"], "E_52": ["Diplopia"],
    "E_63": ["Dysarthria"], "E_64": ["Exertional dyspnea"], "E_65": ["Dysphagia"], "E_66": ["Dyspnea"], "E_67": ["Paroxysmal dyspnea"],
    "E_74": ["Conjunctival hyperemia", "Red eye"], "E_76": ["Dizziness", "Lightheadedness", "Vertigo"], "E_77": ["Productive cough"], "E_82": ["Presyncope", "Dizziness"],
    "E_83": ["Facial palsy"], "E_84": ["Muscle weakness"], "E_88": ["Fatigue"], "E_89": ["Fatigue"], "E_90": ["Fatigable weakness"], "E_91": ["Fever"],
    "E_92": ["Flushing", "Facial erythema"], "E_93": ["Paresthesia"], "E_94": ["Chills"], "E_96": ["Weight gain", "Increased body weight"],
    "E_97": ["Sore throat", "Pharyngalgia", "Pharyngitis"], "E_103": ["Anosmia"], "E_111": ["Panic attack", "Anxiety"], "E_112": ["Stridor"], "E_114": ["Irritability"],
    "E_127": ["Epiphora", "Excessive tearing"], "E_140": ["Melena"], "E_144": ["Myalgia"], "E_145": ["Menorrhagia"], "E_148": ["Nausea"],
    "E_151": ["Edema"], "E_154": ["Pallor"], "E_155": ["Palpitations"], "E_156": ["Facial palsy"], "E_157": ["Paresthesia"], "E_159": ["Syncope"],
    "E_161": ["Poor appetite", "Decreased appetite"], "E_162": ["Weight loss"], "E_164": ["Arrhythmia"], "E_166": ["Post-tussive vomiting", "Vomiting"],
    "E_170": ["Ocular pruritus"], "E_171": ["Depersonalization"], "E_172": ["Ptosis"], "E_173": ["Heartburn", "Gastroesophageal reflux"], "E_174": ["Weight loss"],
    "E_175": ["Malaise", "Fatigue"], "E_176": ["Muscle weakness"], "E_177": ["Paresthesia"], "E_178": ["Bruising susceptibility"], "E_179": ["Hematochezia"],
    "E_180": ["Ophthalmoparesis", "Abnormality of eye movement"], "E_181": ["Nasal congestion", "Rhinorrhea", "Rhinitis"], "E_182": ["Purulent rhinorrhea", "Rhinorrhea", "Rhinitis"],
    "E_188": ["Dark urine", "Jaundice"], "E_190": ["Hypersalivation", "Drooling"], "E_192": ["Torticollis"], "E_193": ["Muscle spasm"], "E_194": ["Stridor"],
    "E_201": ["Cough"], "E_203": ["Paroxysmal cough", "Cough"], "E_205": ["Trismus"], "E_206": ["Oral ulcer"], "E_210": ["Hematemesis"], "E_211": ["Vomiting"],
    "E_212": ["Hoarse voice"], "E_214": ["Wheezing"],
}
# "Do you feel pain somewhere?" (E_55) locations -> HPO names; a patient counts once per group
PAIN = [
    (r"forehead|top of the head|back of head|occiput|temple", ["Headache"]),
    (r"ear\(", ["Ear pain"]),
    (r"tonsil|pharynx|thyroid cartilage|palace|uvula|under the jaw", ["Sore throat", "Pharyngalgia", "Pharyngitis"]),
    (r"chest|breast|scapula", ["Chest pain"]),
    (r"epigastric", ["Epigastric pain", "Abdominal pain"]),
    (r"hypochondrium|belly|iliac fossa|iliac wing|iliac crest|pubis", ["Abdominal pain"]),
    (r"flank|renal fossa", ["Flank pain"]),
    (r"lumbar spine|thoracic spine|coccyx|buttock", ["Back pain", "Low back pain"]),
    (r"cervical spine|back of the neck|side of the neck|trapezius", ["Neck pain"]),
    (r"groin", ["Inguinal pain", "Groin pain", "Abdominal pain"]),
    (r"thigh|calf|knee|tibia|ankle|heel|sole|foot|toe|hip|popliteal|ischio", ["Lower limb pain", "Limb pain"]),
    (r"biceps|triceps|forearm|elbow|wrist|hand|palm|finger|thumb|shoulder|axilla", ["Upper limb pain", "Limb pain"]),
    (r"eye\(", ["Eye pain", "Ocular pain"]),
]


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def resolver(obo, prefix):
    by_name, by_syn = {}, {}
    for tid, t in obo.items():
        if t["obsolete"] or not tid.startswith(prefix):
            continue
        by_name.setdefault(norm(t["name"]), tid)
        for s, scope, _ in t["syn"]:
            if scope == "EXACT":
                by_syn.setdefault(norm(s), tid)

    def find(names):
        for n in names:
            if norm(n) in by_name:
                return by_name[norm(n)]
        for n in names:
            if norm(n) in by_syn:
                return by_syn[norm(n)]
        return None
    return find


def common_diseases(mondo, hp, log=print):
    """-> ({mondo_id: {"src": "DDXPLUS:<condition>", "terms": {hp: p}, "n": patients}}, measurable HPO ids).
    A measurable term missing from a condition's profile was reported by fewer than MIN_P of its patients."""
    import json
    find_m, find_h = resolver(mondo, "MONDO:"), resolver(hp, "HP:")
    cond_to_mondo = {}
    for c, names in CONDITIONS.items():
        if names is None:
            continue
        mid = find_m(names)
        if mid:
            cond_to_mondo[c] = mid
        else:
            log(f"ddxplus.py: no Mondo term for {c!r} ({names})")
    ev_hp = {}
    for e, names in EVIDENCES.items():
        t = find_h(names)
        if t:
            ev_hp[e] = t
        else:
            log(f"ddxplus.py: no HPO term for evidence {e} ({names})")
    pain_hp = []
    for pat, names in PAIN:
        t = find_h(names)
        if t:
            pain_hp.append((re.compile(pat), t))
        else:
            log(f"ddxplus.py: no HPO term for pain group {pat!r} ({names})")
    loc = {v: m["en"] for v, m in json.load(open(DDX / "release_evidences.json", encoding="utf-8"))["E_55"]["value_meaning"].items()}
    n, counts = collections.Counter(), collections.defaultdict(collections.Counter)
    with open(DDX / "validate.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            c = r["PATHOLOGY"]
            if c not in cond_to_mondo:
                continue
            n[c] += 1
            found = set()
            for e in ast.literal_eval(r["EVIDENCES"]):
                code, _, val = e.partition("_@_")
                if code == "E_55" and val in loc:
                    for rx, t in pain_hp:
                        if rx.search(loc[val]):
                            found.add(t)
                elif code in ev_hp:
                    found.add(ev_hp[code])
            for t in found:
                counts[c][t] += 1
    out = {}
    for c, mid in cond_to_mondo.items():
        terms = {t: round(k / n[c], 2) for t, k in counts[c].items() if k / n[c] >= MIN_P}
        if len(terms) < MIN_TERMS:
            log(f"ddxplus.py: {c!r} has only {len(terms)} findings >= {MIN_P}, skipped")
            continue
        if mid in out and len(out[mid]["terms"]) >= len(terms):  # stable/unstable angina may share a Mondo id
            continue
        out[mid] = {"src": "DDXPLUS:" + c, "terms": terms, "n": n[c]}
    log(f"DDXPlus: {len(cond_to_mondo)} conditions mapped to {len(set(cond_to_mondo.values()))} Mondo ids, {len(out)} kept; evidences mapped: {len(ev_hp)} + {len(pain_hp)} pain groups")
    return out, set(ev_hp.values()) | {t for _, t in pain_hp}


if __name__ == "__main__":
    mondo = parse_obo(MONDO_OBO)
    hp = parse_obo(HPO_DIR / "hp.obo")
    out, _ = common_diseases(mondo, hp)
    for mid, e in sorted(out.items(), key=lambda kv: kv[1]["src"]):
        print(f"\n{e['src'][8:]} -> {mid} {mondo[mid]['name']} (n={e['n']}, {len(e['terms'])} findings): " + ", ".join(f"{hp[t]['name']} {p}" for t, p in sorted(e["terms"].items(), key=lambda kv: -kv[1])[:12]))
