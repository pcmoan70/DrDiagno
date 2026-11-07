# Architecture

Last updated: 2026-11-07

A deliberately small system: one declarative catalog, one idempotent fetch
script, data on an external exFAT drive.

```mermaid
flowchart LR
  C[catalog/datasets.yaml<br/>69 entries] --> F[scripts/fetch.py]
  F -->|source: url| W[wget -c<br/>GitHub releases, OBO purls, NLM, CMS,<br/>Orphadata, Dataverse, Springer ESM]
  F -->|source: hf / hf_multi| H[huggingface_hub.snapshot_download<br/>local_dir mode, no symlinks]
  F -->|source: kaggle| K[kaggle CLI<br/>only if ~/.kaggle/kaggle.json exists]
  F -->|source: manual| M[listed only<br/>credentialed sources]
  W & H & K --> D[/media/pc/ext4TB/diagnosis_data/<br/>category/id/files + _meta.json/]
  D --> R[MANIFEST.json<br/>--status report]
  D --> V[scripts/verify.py<br/>sha256 vs HF upstream]
  D --> I[scripts/inspect.py<br/>INSPECTION.json -> docs/DATA_OVERVIEW.md]
```

## Components

- **catalog/datasets.yaml** – the only place datasets are defined. Fields: `id`,
  `category` (drive folder), `source`, locator (`files[]` with url+name, `repo`,
  `repos[]`, or `slug`), `license`, `url` (homepage), `coverage` (what
  diseases/symptoms it adds), `note` (manual entries).
- **scripts/fetch.py** – iterates the catalog, downloads into
  `<data_root>/<category>/<id>/`, then writes `_meta.json` containing per-file
  sha256 and sizes. Existence of `_meta.json` = complete, so re-runs are
  idempotent and interrupted downloads resume (`wget -c`, HF resume).
  Failures are written to `_FAILED.txt` and the run continues with the next
  dataset. A `_LOCK` file (pid) prevents two processes from downloading the same
  dataset. `--status` prints a timestamped table; `--manifest` aggregates all
  `_meta.json` into `MANIFEST.json`.
- **scripts/verify.py** – for every complete Hugging Face dataset, compares the
  local file list with the repo's: LFS files must match sha256 and size. Run after
  every fetch run.
- **scripts/inspect.py** – read-only inventory of every file (format, columns, row
  counts, zip members) into `INSPECTION.json`; the basis of `docs/DATA_OVERVIEW.md`.

## Design decisions

- **exFAT drive** – no symlinks, so Hugging Face downloads use `local_dir`
  (plain files) rather than the symlinked cache; the HF `.cache` bookkeeping
  folder is removed after each successful snapshot.
- **Raw files, not a unified schema** – datasets are stored exactly as
  published (zips unextracted) so licences and provenance stay clear;
  normalisation into a common disease/symptom schema is a later step.
- **Coverage by layering** – terminologies define the universe of diseases and
  symptoms, knowledge graphs give disease↔symptom links with frequencies, case
  and dialogue datasets give realistic presentations. No single source covers
  more than a few thousand diseases, so breadth comes from the union.
- **No credentials in the pipeline** – anything requiring an account is a
  `manual` entry with instructions, never a stored secret.

## Dr. Diagno game subsystem (added 2026-11-06)

```mermaid
flowchart LR
  subgraph drive[External drive]
    HPO[hp.obo + phenotype.hpoa]
    ORPHA[Orphanet product9]
    MONDO[mondo.obo]
    PKG[PrimeKG]
  end
  subgraph build[game/build, python3 -I]
    BT[build_terms.py] --> TJ[terms.json + defs.json]
    BD[build_diseases.py] --> DJ[diseases/index.json + 16 shards]
    HS[hsdn.py / ddxplus.py: common diseases] --> BD
    BR[build_drugs.py] --> RJ[drugs.json]
    BI[build_images.py] --> IJ[images.json]
    BC[build_credits.py] --> CJ[credits.json]
    V[validate.py] --> REP[data_report.md]
  end
  subgraph web[game/web, static ES modules = the deployed folder]
    IDX[index.html + styles.css] --> APP[app.js]
    APP --> ENG[engine: rng, db, case, scoring, search (fuzzy), progress]
    APP --> LS[(localStorage: history, best)]
    ENG --> DATA[data/*.json]
    ENG --> TESTS[content/tests.json]
  end
  WD[Wikidata + Commons API] --> BI
  HPO & ORPHA & MONDO & PKG --> build
  TJ & DJ & RJ --> DATA
  web -->|push to main| GH[GitHub Pages workflow]
```

- `orderTests(db, state, ids)` runs several studies in one clock advance (longest duration, summed cost);
  `orderTest` is the one-study case. The UI offers this for lab, imaging and specialist studies.
- Engine functions are pure over `(db, state)` and tested with `node --test` (`game/tests`, outside the served folder).
- `scoring.js` also serves the differential map (`differentialMap()`: tier diseases not hard-excluded and
  explaining >= half the weighted evidence, per HPO organ system) and `search.js` the watch-along term search.
- Confidence chips live in `state.chips` (`setChips`, `autoChips`, `calibration` in `case.js`); `commit()` needs
  5 chips and treats a hedged wrong call as a 6 h / 20-stability setback instead of a loss.
- Screens: title, play (patient / differential with chips and map / workup), watch-along (`#watch/...`,
  state in the URL), debrief modal, disease profile modal (`showDisease()`: findings with likelihood,
  opened from any disease name). Added 2026-11-06.
- `game/tests/bot.js` plays hundreds of cases with a greedy strategy to measure balance.
- `web/data/` is derived but versioned (Pages builds from the repo alone); `web/content/tests.json` is hand-curated.
- Term balloons: elements with `data-term` get a fixed-position tooltip (lay name, HPO name, definition from
  `data/defs.json`, fetched in the background after boot) via document-level mouseover/focusin delegation.
- Progress: finished cases are appended to `localStorage.history` by the debrief; `engine/progress.js` (pure,
  tested) computes per-tier stats, weakest organ systems and unsolved diseases for the `#progress` screen.
- Student tier: `poolFor` maps it to the Resident pool; `consult` skips the clock, `commit` never ends the case on a
  wrong call, `scoring.suggestTests()` (over `compatibleIds()`) feeds the Coach panel, and `scoring.vennSets()`
  (per finding, a bitmask of the top-3 candidates that explain it, via `explainStrength()`) feeds the Venn panel.
- Pictures: `data/images.json` (from `build_images.py`, the only build step that uses the network) maps HPO and
  Mondo ids to hotlinked Commons thumbnails with credits, and Mondo ids to Wikipedia articles; shown in balloons,
  the disease profile and the debrief.
- `game/web/` is the deployment unit and contains only what the browser loads; raw data (drive), build
  scripts (`game/build`) and tests (`game/tests`) live outside it, and the Pages workflow checks that.
