# CHANGES

## 2026-11-05
- Added `tasks/house_game_plan_20261105.md`: plan for a static-JavaScript House-style diagnostic game built from the HPO/Orphanet/Mondo/PrimeKG data, deployable on GitHub Pages. Plan only, no code yet.
- Added `docs/figures/`: Graphviz structure diagram of the collection (layers, datasets, identifier joins) as .dot/.svg/.png, plus `diagnosis_data_map.html` with coverage-depth and bytes-per-layer panels. Linked from DATA_OVERVIEW.md section 2 and README.
- Initial version: plan (`tasks/diagnosis_datasets_plan_20261105.md`),
  catalog of 69 datasets (62 downloadable, 7 manual), `scripts/fetch.py`
  downloader with resume, sha256 manifest and status report.
- First full download run to `/media/pc/ext4TB/diagnosis_data/`: 62/62 datasets, 12.98 GB.
- Added per-dataset `_LOCK` in fetch.py after two overlapping runs left a dataset
  incomplete; added `scripts/verify.py` (upstream sha256 check) and
  `scripts/inspect.py` (file inventory).
- Added `docs/DATA_OVERVIEW.md`: per-dataset file structure, columns, row counts,
  identifier systems and cross-dataset relations.
