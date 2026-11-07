# Common diseases in the library (2026-11-07)

Problem: the library is built from HPO disease annotations (OMIM / Orphanet / DECIPHER), so it holds
rare, mostly genetic diseases only. Common cold, influenza, asthma, appendicitis, myocardial
infarction etc. are missing (user report 2026-11-06).

Source decision: SymCat (proposed first) has no licence and unclear copyright, so it cannot be
published in a public repo / GitHub Pages. Use the Human Symptoms–Disease Network (Zhou, Menche,
Barabási, Sharma 2014, Nature Communications, CC BY 4.0): 322 MeSH symptoms × 4,219 MeSH diseases
with PubMed co-occurrence counts and TF-IDF weights. Weights are literature prominence, not clinical
frequency; the app says so in the disease profile. DDXPlus (CC BY 4.0, 49 pathologies with real
frequencies) is a possible later refinement.

Design
- `game/build/hsdn.py`: MeSH disease name -> MeSH UI (desc2026.xml) -> Mondo (mondo.obo xrefs,
  equivalentTo preferred); MeSH symptom name -> HPO (hp.obo names/synonyms, inverted MeSH forms,
  manual overrides); per disease keep symptoms with >= 2 co-mentions, top 30 by TF-IDF,
  p = 0.1 + 0.85 * sqrt(score / max score). Diseases need >= 8 mapped symptoms.
- `build_diseases.py`: merge these profiles into the pool before decoys/twins unless the Mondo id
  already has an HPO-annotated profile. Tiers: attending; resident if >= 12 terms and Mayo text.
  Index/shard format unchanged; `src` = ["HSDN:MESH:Dxxxxxx"].
- UI: disease profile note for HSDN-sourced likelihoods; credits (footer, credits.json, READMEs).

- [x] hsdn.py with mapping stats
- [x] manual symptom overrides for unmatched MeSH symptoms (and ddxplus.py with measured frequencies, added after seeing HSDN noise)
- [x] build_diseases.py merge + tiers; rebuild; validate.py; node tests
- [x] app: profile note + credits; counts in texts
- [x] docs: README.md, game/README.md, docs/DATASETS.md, ARCHITECTURE.md, CHANGES.md
- [ ] verify in Chrome (watch-along "fever, cough, sneezing" -> common cold / influenza), deploy, artifact

## Review
HSDN alone was too noisy with TF-IDF weights (influenza: vocal cord paralysis above headache); switched
to co-mention counts with a lift filter, then added DDXPlus for measured frequencies on the acute
common conditions. Result: 8,277 diseases, 1,191 common, 385 in Resident/Student; 28 node tests.
