# CHANGES

## 2026-11-06
- Dr. Diagno: the Workup column now shows each test category (History, Examination, Laboratory,
  Imaging, Specialist studies) as a collapsible section with a count of ordered tests; History
  starts expanded and the open/closed state survives re-renders.
- Dr. Diagno: opening `game/web/index.html` directly from disk left the page at "Loading… 0%"
  forever (browsers block ES modules and `fetch` on `file://`). The page now explains this and how to
  serve the folder; data-load failures are shown instead of swallowed. README notes the requirement.
- Dr. Diagno game, first playable version (`game/`): data build scripts (7,086 diseases, 19,894
  HPO terms, 55 tests, 696 drugs; 3.5 MB gzipped), pure-function engine with 10 node tests,
  balance bot, vanilla-JS UI (title, case board, workup, debrief, case codes, local best scores),
  GitHub Pages workflow. Project turned into a git repo and pushed to github.com/pcmoan70/DrDiagno
  (data excluded).

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
