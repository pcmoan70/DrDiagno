# Plan: open diagnosis datasets → external 4 TB drive

Date: 2026-11-05

## Goal
Collect open-licence datasets that together give the widest possible coverage of
**diseases** and **symptoms** (and the links between them), and store them on the
external drive at `/media/pc/ext4TB/diagnosis_data/` with a manifest (sizes,
sha256, source, licence, download date) so that they can be used offline for
building/evaluating a diagnosis model.

## Assumptions (stated, not confirmed with user)
- "Diagnosis datasets" = text/tabular/ontology data (symptoms, findings, patient
  descriptions, differential diagnosis, QA). Imaging datasets (chest X-ray, derm,
  pathology) are out of scope; they are 100s of GB and not symptom-centric.
- Only sources downloadable without an account are fetched automatically.
  Credentialed sources (MIMIC-IV, eICU, n2c2, UMLS/SNOMED CT, OMIM, ICD-11,
  DisGeNET, Kaggle originals) are listed in the catalog as `manual` with
  instructions, so the user can add them later.
- No Kaggle credentials exist on this machine; Kaggle datasets are taken from
  Hugging Face / GitHub mirrors where they exist.
- Drive is exFAT: no symlinks, so Hugging Face downloads use `local_dir`
  (plain files) instead of the symlinked cache.

## Coverage strategy (why these sources)
Coverage comes from combining five layers:

| Layer | Purpose | Sources |
|---|---|---|
| 1. Terminologies | Define the *universe* of diseases and symptoms + synonyms + cross-refs | MONDO (~25k diseases), Disease Ontology, HPO (~18k phenotypes), Symptom Ontology, MeSH 2026 (descriptors + supplementary concepts), ICD-10-CM FY2026 (~74k codes), Orphanet nomenclature (~6k rare diseases), CTD MEDIC |
| 2. Disease↔symptom knowledge | Curated / mined associations with frequencies | HPO `phenotype.hpoa` (~270k disease–phenotype pairs, ~12k diseases), Orphanet HPO associations, Monarch KG, PrimeKG (~17k diseases incl. phenotype edges), Hetionet, Human Symptoms–Disease Network (4,219 diseases × 322 symptoms), Columbia Disease-Symptom KB, SymCat (~800 conditions) |
| 3. Case-level / patient-level | Realistic symptom presentations with a diagnosis label | DDXPlus (1.3M synthetic patients, 49 pathologies, 223 evidences), PMC-Patients (167k real case summaries), Phenopacket Store (rare-disease cases), MACCROBAT, Asclepius & augmented synthetic notes, MTSamples, Synthea sample, RareBench |
| 4. Dialogue / QA | Patient-language symptom descriptions + doctor answers; exam-style diagnostic reasoning | ChatDoctor HealthCareMagic + iCliniq, ai-medical-chatbot, MedQuAD, MedQA, MedMCQA, PubMedQA, medical-o1 reasoning, medical_meadow, lavita aggregate, MedDialog (if mirror found) |
| 5. Reference text | Per-disease descriptions incl. symptom sections | MedlinePlus Health Topics XML, Wikipedia medical terms, EPFL clinical guidelines, MedRAG textbooks |

Small classic Kaggle tables (41 diseases × 132 symptoms, Symptom2Disease 24
diseases, 773-disease table) are included via mirrors for completeness, but the
coverage mainly comes from layers 1–3.

## Storage layout (on the drive)
```
/media/pc/ext4TB/diagnosis_data/
  01_ontologies_terminologies/<id>/
  02_disease_symptom_knowledge/<id>/
  03_symptom_disease_tabular/<id>/
  04_clinical_cases_notes/<id>/
  05_dialogue_qa/<id>/
  06_reference_text/<id>/
  _logs/fetch_<timestamp>.log
  MANIFEST.json            # aggregated from every <id>/_meta.json
```
Each `<id>/_meta.json` = source, licence, download time, file list with bytes +
sha256. Its presence marks the dataset complete (idempotent re-runs skip it).

Estimated total: 10–20 GB (drive has ~2 TB free).

## Steps
- [ ] 1. Verify candidate URLs / HF repos (HEAD checks, HF API; research agents for hard ones)
- [ ] 2. Write `catalog/datasets.yaml` (one entry per dataset, with licence + coverage note)
- [ ] 3. Write `scripts/fetch.py` (idempotent downloader: wget -c for URLs, `snapshot_download(local_dir=)` for HF; `--status` report with timestamp)
- [ ] 4. Run tier 1: ontologies + knowledge (small, fast)
- [ ] 5. Run tier 2: HF datasets (tabular, cases, QA, reference)
- [ ] 6. Run tier 3: large files (PrimeKG, Monarch KG, MeSH supplementary, DDXPlus, PMC-Patients)
- [ ] 7. Add sources found by research agents (HSDN, SymCat, Columbia KB, Kaggle mirrors, MedDialog, MTSamples)
- [ ] 8. Build `MANIFEST.json`; sanity-check a sample of files (unzip -t, parse CSV/JSON headers)
- [ ] 9. Documentation: README.md (catalog table, how to re-run), ARCHITECTURE.md, CHANGES.md, data-drive README
- [ ] 10. Review section in tasks/todo.md; lessons.md if anything went wrong

## Out of scope / needs user action
- Imaging datasets.
- Credentialed: MIMIC-IV / MIMIC-IV-Note / eICU (PhysioNet CITI training + DUA), n2c2, UMLS Metathesaurus & SNOMED CT (UMLS licence), OMIM (registration), WHO ICD-11 (account), DisGeNET (account), NHS Conditions API (key), Kaggle originals (API token).
