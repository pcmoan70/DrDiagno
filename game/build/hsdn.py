"""Common diseases from the Human Symptoms-Disease Network (Zhou, Menche, Barabasi, Sharma 2014,
Nature Communications, CC BY 4.0): MeSH symptom x MeSH disease co-occurrence in PubMed with TF-IDF
weights. Maps MeSH diseases to Mondo and MeSH symptoms to HPO so they can join the HPO-annotated
library. Likelihoods come from the co-mention counts scaled to the disease's most-mentioned symptom
(TF-IDF would lift rare oddities); they are literature prominence, not clinical frequency.
Run with `python3 -I`."""
import collections, math, re
import xml.etree.ElementTree as ET
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA_ROOT, HPO_DIR, MONDO_OBO, parse_obo

HSDN = DATA_ROOT / "02_disease_symptom_knowledge" / "hsdn_zhou2014" / "SupplementaryData3.txt"
MESH_DESC = DATA_ROOT / "01_ontologies_terminologies" / "mesh_2026" / "desc2026.xml"
MIN_OCC, TOP, MIN_TERMS, MIN_LIFT = 2, 30, 8, 1.0

# MeSH symptom -> HPO term *name* where the names do not match; None = not a patient finding (or a
# disease in its own right), skip. Names are resolved against hp.obo and unresolved ones reported.
SYMPTOM_OVERRIDES = {
    "Aging, Premature": "Prematurely aged appearance", "Angina Pectoris, Variant": "Angina pectoris", "Angina, Unstable": "Angina pectoris",
    "Anoxia": "Hypoxemia", "Aphasia, Broca": "Aphasia", "Aphasia, Conduction": "Aphasia", "Aphasia, Primary Progressive": "Aphasia",
    "Primary Progressive Nonfluent Aphasia": "Aphasia", "Apraxia, Ideomotor": "Apraxia", "Articulation Disorders": "Dysarthria",
    "Cardiac Output, Low": "Congestive heart failure", "Colic": "Abdominal pain", "Consciousness Disorders": "Reduced consciousness/confusion",
    "Diarrhea, Infantile": "Diarrhea", "Dyslexia, Acquired": "Dyslexia", "Earache": "Ear pain", "Edema, Cardiac": "Edema",
    "Emaciation": "Decreased body weight", "Thinness": "Decreased body weight", "Fever of Unknown Origin": "Fever",
    "Gait Disorders, Neurologic": "Gait disturbance", "Hearing Disorders": "Hearing abnormality",
    "Hearing Loss, Bilateral": "Hearing impairment", "Hearing Loss, Central": "Hearing impairment", "Hearing Loss, Functional": "Hearing impairment",
    "Hearing Loss, Mixed Conductive-Sensorineural": "Hearing impairment", "Hearing Loss, Noise-Induced": "Hearing impairment",
    "Hearing Loss, Sudden": "Hearing impairment", "Hearing Loss, Unilateral": "Hearing impairment", "Hypesthesia": "Hypoesthesia",
    "Jaundice, Obstructive": "Jaundice", "Korsakoff Syndrome": "Memory impairment", "Memory Disorders": "Memory impairment",
    "Language Development Disorders": "Delayed speech and language development", "Learning Disorders": "Specific learning disability",
    "Muscle Cramp": "Muscle cramps", "Obesity, Morbid": "Obesity", "Olfaction Disorders": "Abnormality of the sense of smell",
    "Orthostatic Intolerance": "Orthostatic hypotension", "Pain, Intractable": "Pain", "Pain, Referred": "Pain", "Paresis": "Muscle weakness",
    "Pupil Disorders": "Abnormal pupil morphology", "Purpura Fulminans": "Purpura", "Purpura, Hyperglobulinemic": "Purpura",
    "Purpura, Thrombocytopenic": "Purpura", "Reflex, Babinski": "Babinski sign", "Renal Colic": "Flank pain", "Respiratory Aspiration": "Aspiration",
    "Respiratory Sounds": "Abnormal breath sound", "Sarcopenia": "Skeletal muscle atrophy", "Sleep Disorders": "Sleep abnormality", "Sneezing": "Sneeze",
    "Speech Disorders": "Abnormality of speech or vocalization", "Systolic Murmurs": "Heart murmur", "Taste Disorders": "Abnormality of taste sensation",
    "Toothache": None, "Urinary Bladder, Neurogenic": "Neurogenic bladder", "Urinary Bladder, Overactive": "Urinary urgency",
    "Urinary Incontinence, Urge": "Urinary incontinence", "Virilism": None, "Vision Disorders": "Abnormality of vision",
    "Vision, Low": "Visual impairment", "Voice Disorders": "Abnormality of the voice", "Vomiting, Anticipatory": "Vomiting", "Facial Pain": None,
    "Mouth Breathing": None, "Eye Hemorrhage": None, "Catatonia": None, "Spasm": "Muscle spasm",
    "Cerebrospinal Fluid Rhinorrhea": None, "Decerebrate State": "Decerebrate rigidity",
    # not findings of a patient, or diseases of their own
    "Aerophagy": None, "Akathisia, Drug-Induced": None, "Alexia, Pure": None, "Alien Hand Syndrome": None, "Auditory Perceptual Disorders": None,
    "Birth Weight": None, "Body Weight": None, "Body Weight Changes": None, "Brown-Sequard Syndrome": None, "Cardiac Output, High": None,
    "Catalepsy": None, "Cerebrospinal Fluid Otorrhea": None, "Communication Disorders": None, "Coprophagia": None, "Deaf-Blind Disorders": None,
    "Eructation": None, "Eye Manifestations": None, "Feminization": None, "Fetal Hypoxia": None, "Fetal Weight": None, "Gagging": None,
    "Gerstmann Syndrome": None, "Glossalgia": None, "Hyperoxia": None, "Infantile Apparent Life-Threatening Event": None, "Labor Pain": None,
    "Mobility Limitation": None, "Morning Sickness": None, "Motion Sickness": None, "Space Motion Sickness": None, "Neuralgia, Postherpetic": None,
    "Neurobehavioral Manifestations": None, "Neurologic Manifestations": None, "Oral Manifestations": None, "Skin Manifestations": None,
    "Perceptual Disorders": None, "Psychomotor Disorders": None, "Psychophysiologic Disorders": None, "Sensation Disorders": None,
    "Somatosensory Disorders": None, "Pain, Postoperative": None, "Phantom Limb": None, "Piriformis Muscle Syndrome": None,
    "Postoperative Nausea and Vomiting": None, "Prostatism": None, "Purpura, Schoenlein-Henoch": None, "Purpura, Thrombocytopenic, Idiopathic": None,
    "Purpura, Thrombotic Thrombocytopenic": None, "Sleep Deprivation": None, "Slit Ventricle Syndrome": None, "Supranuclear Palsy, Progressive": None,
    "Susac Syndrome": None, "Sweating Sickness": None, "Tinea Pedis": None, "Usher Syndromes": None, "Waterhouse-Friderichsen Syndrome": None,
}


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def uninvert(s):
    """'Aging, Premature' -> 'Premature Aging'; 'Pain, Abdominal' -> 'Abdominal Pain'."""
    parts = [p.strip() for p in s.split(",")]
    return " ".join(reversed(parts)) if len(parts) == 2 else s


def mesh_name_to_ui():
    ui = {}
    for _, el in ET.iterparse(MESH_DESC):
        if el.tag == "DescriptorRecord":
            d = el.find("DescriptorUI").text
            names = [el.find("DescriptorName/String").text] + [s.text for s in el.findall("ConceptList/Concept/TermList/Term/String")]
            for n in names:
                ui.setdefault(norm(n), d)
            el.clear()
    return ui


def mesh_to_mondo(mondo):
    """MESH:Dxxxx -> Mondo id; equivalentTo xrefs win over looser ones; obsolete terms skipped."""
    out, loose = {}, {}
    for mid, t in mondo.items():
        if t["obsolete"] or not mid.startswith("MONDO:"):
            continue
        for xid, line in t["xref"]:
            if xid.startswith("MESH:"):
                (out if "equivalentTo" in line else loose).setdefault(xid, mid)
    for k, v in loose.items():
        out.setdefault(k, v)
    return out


def symptom_to_hpo(hp):
    """MeSH symptom name -> HP id via exact name, then exact synonym, on the raw and un-inverted forms."""
    by_name, by_syn = {}, {}
    for tid, t in hp.items():
        if t["obsolete"] or not tid.startswith("HP:"):
            continue
        by_name.setdefault(norm(t["name"]), tid)
        for s, scope, _ in t["syn"]:
            if scope in ("EXACT", "RELATED", "BROAD"):
                by_syn.setdefault(norm(s), tid)

    def find(name):
        if name in SYMPTOM_OVERRIDES:
            want = SYMPTOM_OVERRIDES[name]
            if want is None:
                return None
            tid = by_name.get(norm(want)) or by_syn.get(norm(want))
            if not tid:
                print(f"hsdn.py: override for {name!r} names no HPO term: {want!r}")
            return tid
        for cand in (name, uninvert(name)):
            for form in (cand, re.sub(r"s$", "", cand)):
                k = norm(form)
                if k in by_name:
                    return by_name[k]
            for form in (cand, re.sub(r"s$", "", cand)):
                k = norm(form)
                if k in by_syn:
                    return by_syn[k]
        return None
    return find


def common_diseases(mondo, hp, log=print):
    """-> {mondo_id: {"src": "HSDN:MESH:Dxxxx", "mesh": name, "terms": {hp: p}}}"""
    ui = mesh_name_to_ui()
    m2m = mesh_to_mondo(mondo)
    find = symptom_to_hpo(hp)
    rows = collections.defaultdict(list)
    symptoms, s_tot, d_tot, total = set(), collections.Counter(), collections.Counter(), 0
    with open(HSDN, encoding="utf-8") as f:
        next(f)
        for line in f:
            s, d, occ, score = line.rstrip("\n").split("\t")
            symptoms.add(s)
            s_tot[s] += int(occ); d_tot[d] += int(occ); total += int(occ)
            if int(occ) >= MIN_OCC:
                rows[d].append((s, int(occ)))
    # lift = P(symptom | disease) / P(symptom): below MIN_LIFT the symptom is mentioned with this disease
    # less than with diseases in general (diarrhea in common-cold papers), so it is noise here
    for d in rows:
        rows[d] = [(s, occ) for s, occ in rows[d] if (occ / d_tot[d]) / (s_tot[s] / total) >= MIN_LIFT]
    smap = {s: find(s) for s in symptoms}
    unmatched = sorted(s for s, v in smap.items() if v is None and s not in SYMPTOM_OVERRIDES)
    out, no_ui, no_mondo, few = {}, [], [], 0
    for d, lst in rows.items():
        u = ui.get(norm(d))
        if not u:
            no_ui.append(d); continue
        mid = m2m.get("MESH:" + u)
        if not mid:
            no_mondo.append(d); continue
        lst.sort(key=lambda x: -x[1])
        top = lst[0][1]
        terms = {}
        for s, score in lst[:TOP]:
            t = smap.get(s)
            if t:
                terms[t] = max(terms.get(t, 0), round(0.1 + 0.85 * math.sqrt(score / top), 2))
        if len(terms) < MIN_TERMS:
            few += 1; continue
        if mid in out:  # two MeSH diseases on one Mondo id: keep the richer profile
            if len(terms) <= len(out[mid]["terms"]):
                continue
        out[mid] = {"src": "HSDN:MESH:" + u, "mesh": d, "terms": terms}
    log(f"HSDN: {len(rows)} diseases with >= {MIN_OCC} co-mentions; no MeSH UI: {len(no_ui)}; no Mondo xref: {len(no_mondo)}; < {MIN_TERMS} mapped symptoms: {few}; kept: {len(out)}")
    log(f"HSDN symptoms: {len(symptoms)}, mapped to HPO: {sum(1 for v in smap.values() if v)}, skipped by override: {sum(1 for s in symptoms if SYMPTOM_OVERRIDES.get(s, 1) is None)}, unmatched: {len(unmatched)}")
    return out, {"unmatched": unmatched, "no_ui": no_ui, "no_mondo": no_mondo, "smap": smap}


if __name__ == "__main__":
    mondo = parse_obo(MONDO_OBO)
    hp = parse_obo(HPO_DIR / "hp.obo")
    out, info = common_diseases(mondo, hp)
    print("UNMATCHED SYMPTOMS:", info["unmatched"])
    print("NO MESH UI (sample):", info["no_ui"][:40])
    print("NO MONDO (sample):", info["no_mondo"][:40])
    for want in ("Common Cold", "Influenza, Human", "Appendicitis", "Asthma", "Myocardial Infarction", "Urinary Tract Infections", "Migraine Disorders"):
        hit = next(((mid, e) for mid, e in out.items() if e["mesh"] == want), None)
        if hit:
            mid, e = hit
            print(f"\n{want} -> {mid} {mondo[mid]['name']} ({len(e['terms'])}): " + ", ".join(f"{hp[t]['name']} {p}" for t, p in sorted(e['terms'].items(), key=lambda kv: -kv[1])[:14]))
        else:
            print(f"\n{want}: not kept")
