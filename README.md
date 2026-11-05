# diagnosis – open diagnosis dataset collection

Last updated: 2026-11-05

Scripts and a catalog for downloading open-licence datasets covering **diseases,
symptoms and the links between them**, stored on the external 4 TB drive at
`/media/pc/ext4TB/diagnosis_data/`. Intended as the data foundation for a
symptom → diagnosis model.

## Quick start

```bash
python3 -I scripts/fetch.py --status          # what is on the drive (timestamped)
python3 -I scripts/fetch.py                   # download everything not yet complete (resumable)
python3 -I scripts/fetch.py --only hpo mondo  # selected datasets
python3 -I scripts/fetch.py --category 02_disease_symptom_knowledge
python3 -I scripts/fetch.py --manifest        # rebuild MANIFEST.json
python3 -I scripts/verify.py                  # compare every Hugging Face file with upstream sha256
python3 -I scripts/inspect.py                 # per-file formats/columns/row counts -> INSPECTION.json
DIAG_DATA_ROOT=/other/path python3 -I scripts/fetch.py   # different target
```

Requirements: Python 3 with `pyyaml` and `huggingface_hub`, plus `wget`.
No accounts are needed for anything the script downloads.

**Data overview** (what each file contains, columns, row counts, and how the
datasets link through shared identifiers): [`docs/DATA_OVERVIEW.md`](docs/DATA_OVERVIEW.md).
- Structure diagram: `docs/figures/dataset_structure.svg` (Graphviz source `.dot`, rebuild with `dot -Tsvg -o docs/figures/dataset_structure.svg docs/figures/dataset_structure.dot`); viewable page with coverage and size panels: `docs/figures/diagnosis_data_map.html`.

## What is collected and why

Coverage comes from five layers; see `catalog/datasets.yaml` for every entry
(licence, homepage, coverage note, exact URLs / Hugging Face repo).

| Folder on drive | Layer | Datasets |
|---|---|---|
| `01_ontologies_terminologies` | The universe of disease and symptom names, synonyms, cross-references | HPO (+ `phenotype.hpoa` disease–phenotype annotations), Mondo, Disease Ontology, Symptom Ontology, MeSH 2026 (descriptors, qualifiers, supplementary concepts), ICD-10-CM FY2026, Orphanet/Orphadata (nomenclature, HPO phenotypes, genes, epidemiology, natural history, 36 classifications), CTD MEDIC |
| `02_disease_symptom_knowledge` | Curated or mined disease ↔ symptom associations | Monarch KG, PrimeKG v2.1, Hetionet, Human Symptoms–Disease Network (4,219 diseases × 322 symptoms), Columbia Disease-Symptom KB (+ CSV mirrors), SymCat scrape (801 conditions × 474 symptoms) |
| `03_symptom_disease_tabular` | Symptom vector / text → diagnosis label | DDXPlus (1.3M synthetic patients, 49 pathologies), Kaggle classics (41 diseases × 132 symptoms, descriptions, precautions), Symptom2Disease (24 diseases), Disease-Symptom-Extensive (773 diseases × 377 symptoms), MedlinePlus-encyclopedia symptoms (1,713 diseases), Mayo scrape (~1,130 diseases), symptom-disease-dataset (1,082 labels), Diseases_Symptoms (~400), Gretel symptom_to_diagnosis, CoD-PatientSymDisease (76k cases), synthetic EHR → ICD-10 (753k) |
| `04_clinical_cases_notes` | Patient-level presentations with a diagnosis | PMC-Patients (167k case summaries), Open-Patients (180k), CaseReportCollective (86k), PMC-CaseReport QA, FindZebra rare cases, clinical-case → ICD-10, DiagnosisArena, rare-disease-diagnosis benchmark, NEJM/MedQA diagnostic reasoning, MACCROBAT, Asclepius synthetic notes (158k), augmented clinical notes (30k), Phenopacket Store, RareBench, Synthea sample, MTSamples |
| `05_dialogue_qa` | Patient-language symptom descriptions, doctor answers, exam-style diagnostic reasoning | ChatDoctor HealthCareMagic + iCliniq, MedDialog EN, ai-medical-chatbot, dialogue → SOAP, MedQuAD, MedQA (two variants + CoT), Medbullets, MedMCQA, PubMedQA, medical-o1 reasoning + verifiable problems, medAlpaca medical_meadow (8 sets), lavita aggregate, all-human-diseases list (2,194) + synthetic encounters |
| `06_reference_text` | Per-disease prose incl. "signs and symptoms" sections | MedlinePlus Health Topics XML, Wikipedia medical terms, EPFL clinical guidelines, MedRAG textbooks |
| `_manual` (catalog only) | Needs an account/licence; not downloaded | MIMIC-IV, eICU, UMLS/SNOMED CT, OMIM, WHO ICD-11, DisGeNET, Kaggle originals |

Out of scope: imaging datasets.

## Layout on the drive

```
/media/pc/ext4TB/diagnosis_data/
  <category>/<id>/            files exactly as published (zips are not extracted)
  <category>/<id>/_meta.json  source, licence, download time, per-file bytes + sha256
  <category>/<id>/_FAILED.txt present only if the last attempt failed (re-run resumes)
  <category>/<id>/_LOCK       present only while a fetch.py process is downloading it
  _logs/fetch_<UTC timestamp>.log
  MANIFEST.json               all _meta.json files aggregated
  INSPECTION.json             output of scripts/inspect.py
```

Status on 2026-11-05: 62 of 62 downloadable datasets complete, 12.98 GB, all
Hugging Face files verified against upstream sha256. Three small parquet datasets
need pyarrow >= 20 to read (see docs/DATA_OVERVIEW.md, section 1).

`_meta.json` marks a dataset complete; delete it to force a re-download.

## Licences

Most sources are CC0 / CC BY / MIT / Apache. Some are **non-commercial or
research-only** (PMC-Patients, Asclepius, augmented clinical notes: CC BY-NC-SA;
ChatDoctor/MedDialog content: copyright of the source sites; SymCat and Mayo Clinic
scrapes: no clear licence; nisten encounters are LLM-synthetic). Check `license` in the catalog before redistributing or training a
commercial model.

## Adding a dataset

Add an entry to `catalog/datasets.yaml` (`source: url | hf | hf_multi | kaggle |
manual`) and run `python3 -I scripts/fetch.py --only <id>`.
