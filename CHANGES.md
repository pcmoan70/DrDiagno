# CHANGES

## 2026-11-07
- Dr. Diagno: a logo/icon was tried (detective silhouette, five iterations) and removed again at
  the user's request. No logo or favicon; the header and hero are text only.
- Dr. Diagno: fuzzy search in both boxes (typos, word order, phrases; `engine/search.js`, shared by
  findings and diseases) and three new studies (Ask about pain, Pregnancy and birth history, ENT
  exam) plus wider reveal roots on skin and chest exams, EMG and MRI brain, so voice, pain,
  prenatal, sweating, breast, neuropathy and CNS-morphology findings can be found in play (58
  studies; 99% of disease findings revealable). 29 node tests.
- Dr. Diagno: common diseases. The library now holds 8,277 diseases: 1,191 common ones (common cold,
  influenza, appendicitis, myocardial infarction, asthma...) join the 7,086 HPO-annotated rare
  diseases. Measured symptom frequencies from DDXPlus (CC BY 4.0, 33 acute conditions) and
  literature co-mention from the Human Symptoms–Disease Network (CC BY 4.0) mapped to Mondo and HPO
  (`game/build/ddxplus.py`, `hsdn.py`, merged in `build_diseases.py`). 385 common diseases enter the
  Student/Resident pools. Disease profiles state which kind of likelihood they show; credits updated;
  2 new node tests (28). SymCat was not used: no licence.

## 2026-11-06
- Dr. Diagno: fix watch-along findings vanishing as soon as they were added (and their × not
  removing them): the progress feature's `history()` helper shadowed `window.history`, so the URL
  update threw before the list re-rendered. Helper renamed; a node test now forbids top-level
  bindings in app.js that shadow browser globals (26 tests). Hint mentions the × to remove a finding.
- Dr. Diagno: Venn view in Student mode. A collapsible panel under the differential draws the three
  best-matching candidates as circles and places every symptom (filled chip) and test result
  (outlined chip) in the region of the diseases that explain it; unexplained findings are listed
  apart. `scoring.vennSets()` / `explainStrength()` (extracted from `fit()`), 1 new node test (25).
- Dr. Diagno: progress tracking in local storage. Finished cases are recorded; a "Your progress" page
  shows per-tier played/solved/best/trend, a score chart, the weakest organ systems, unsolved diseases
  with Retry links and recent cases, plus Clear history. `engine/progress.js`, 3 new node tests (24).
- Dr. Diagno: larger pictures (800 px thumbnails from the Commons API, clamped to the original size; balloon 460 px wide with a 260 px image, profile figure up to 380 px).
- Dr. Diagno: match percentage next to each candidate (where fit is visible) and a "Best match" item
  in the top bar in Student and Resident.
- Dr. Diagno: Student tier (Resident cases, 96 h, free consults, Coach panel suggesting the studies
  that best split the diseases still fitting, fit bars always on, map open, no sudden death). Ticked
  studies' buttons read "Order batch"; the watch-along Open button is amber. 21 node tests.
- Dr. Diagno: ticked studies show an amber Order button; pressing any of them runs the whole batch.
- Dr. Diagno: Wikimedia pictures. `build_images.py` collects Commons images (with author and licence)
  for 884 findings and 326 diseases and Wikipedia links for 1,533 diseases via Wikidata. Balloons show
  the finding's picture; the disease profile and debrief show the disease's picture and Wikipedia link.
  Genital and breast findings are excluded from pictures.
- Dr. Diagno: term balloons. Hovering or focusing any finding (chart, test results, map, watch-along,
  disease profile, "does not explain" lists) shows its everyday name, HPO name and HPO definition.
  New bundle `data/defs.json` (17,432 definitions) built by build_terms.py, loaded in the background.
- Root README now describes the game for visitors of the GitHub page; the dataset-collection
  README moved to `docs/DATASETS.md`. Differential-map count made bold and accent-coloured.
- Dr. Diagno deployed to GitHub Pages: https://pcmoan70.github.io/DrDiagno/ . The repository was made
  public (required by the plan) and the built data bundles (`game/web/data`, 15 MB) are now versioned
  because Pages builds from the repository alone.
- Dr. Diagno: parallel studies. Tick several lab, imaging or specialist studies and run them
  together: the clock advances by the longest, costs add up (`orderTests()`, 19 node tests).
- Dr. Diagno: literature consult results now open in a closable pane with Add / Add all buttons
  instead of being pushed straight into the differential.
- Dr. Diagno: clicking a disease name (differential, watch-along, debrief) opens a findings table
  with likelihood per finding (percentage, bar, HPO frequency class, excluded findings) and a
  column marking the patient's present/absent findings (in play: Resident or after a consult).
- Dr. Diagno: `game/web/` now holds only the served site. Tests, the balance bot and package.json
  moved to `game/tests/` and `game/`; `npm test` / `npm run serve` run from `game/`. The Pages
  workflow fails if tests, build scripts or raw data appear under `game/web/`.
- Build: drop Mondo synonyms containing U+FFFD (mojibake duplicates of correctly spelled names);
  they blocked publishing the bundles as a claude.ai artifact. Rebuilt, counts unchanged.
- Dr. Diagno: confidence chips. Ten chips over the differential (auto-placed by fit until moved);
  5 needed to diagnose; all-in wrong ends the case, hedged wrong costs 6 h and 20 stability and rules
  the disease out; chip and calibration bonuses on a correct call; chips-on-answer chart in the
  debrief; fit bars outside Resident only after a consult. Bot hedges too. 18 node tests.
- Dr. Diagno: differential map. An anonymised panel shows how many diseases of the tier still fit
  the evidence, per organ system, with cut systems struck through and a "Ruled out N diseases" toast
  after each action. On in Resident, collapsed in Attending, off in House. 15 node tests.
- Dr. Diagno: watch-along mode (`#watch`): type findings as you hear them, mark present/absent,
  and see all 7,086 diseases ranked live; shareable link; HPO term search (`engine/search.js`,
  12 node tests now). Design note for this and the next two features: `tasks/game_ideas_20261106.md`.
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
