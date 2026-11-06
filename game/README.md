# Dr. Diagno (preliminary name)

A House-style diagnostic puzzle game: a patient arrives with puzzling symptoms, the clock runs,
and the player builds a differential, orders tests, treats, and commits to a diagnosis.
Every case is generated in the browser from real disease knowledge (HPO, Orphanet, Mondo,
PrimeKG). Pure static site: HTML + ES modules, no server, no model at play time.

Updated 2026-11-06. Plan: `../tasks/house_game_plan_20261105.md`.

## Layout
```
build/      Python scripts that compile the drive data into JSON bundles (run with python3 -I)
web/        the site: index.html, app.js, styles.css, engine/, content/tests.json, data/ (built)
web/tests/  node --test suite and the balance bot
```

## Build the data bundles
Needs the datasets on the drive (`DIAG_DATA_ROOT`, default `/media/pc/ext4TB/diagnosis_data`), numpy and scipy.
```bash
cd game/build
python3 -I build_terms.py      # terms.json: HPO terms, lay names, parents, IDF
python3 -I build_diseases.py   # diseases/index.json + 16 shards: profiles, onset, prevalence, decoys
python3 -I build_drugs.py      # drugs.json: PrimeKG indications, contraindications, side effects
python3 -I build_credits.py    # credits.json
python3 -I validate.py         # checks + game/data_report.md (dated)
```
`web/data/` is gitignored (derived, ~15 MB raw / 3.5 MB gzipped). The site cannot run without it,
so for GitHub Pages the bundles must be committed or published by a build step.

## Run locally
```bash
cd game/web && python3 -m http.server 8077     # then open http://127.0.0.1:8077/
```

Do not open `index.html` directly from disk: browsers block ES modules and `fetch` on `file://`
URLs, so the page would stay at "Loading… 0%" (it now shows a hint instead). It needs an HTTP server.

## Differential map
Under the differential (Resident: open, Attending: collapsed, House: off) a panel counts the tier's
diseases that still fit: not hard-excluded (`isCut()`: a present finding the disease never has, or an
absent finding it has at >=90%) and explaining at least half the weighted evidence
(`differentialMap()` in `engine/scoring.js`, findings caused by treatment ignored so the true disease
is never ruled out, pinned by `tests/map.test.js`). Bars per HPO organ system; struck-through systems
have no fitting disease left; hovering a bar lists the tests that probe it. A toast reports how many
diseases each action ruled out.

## Watch-along mode
`#watch` on the title screen opens a free diagnosis screen with no patient, clock or score: type
findings (HPO term or lay name, `engine/search.js`), mark them present or absent by clicking, and
the whole library is ranked live with the same `fit()` used in play. The list is kept in the URL
(`#watch/HP:0001250,-HP:0000819`, minus = absent) so a link reopens it.

## Test and balance
```bash
cd game/web
npm test            # engine tests (determinism, no leaks, every test resolves, 1000 random runs)
npm run bot -- 200  # greedy bot, 200 cases per tier: win rate, actions, hours, spent
```

## How a case is built
1. Pick a disease from the tier pool (seeded by the case code, so codes are shareable).
2. Sample which annotated findings this patient has, using HPO frequency classes.
3. Presenting complaints: 2–3 common, non-specific, lay-named findings, preferring ones the decoy
   diseases share (House tier weights this harder).
4. The remaining patient-visible findings appear over the clock, non-specific first.
5. Lab/imaging findings only appear through tests. Each test reveals at most 3 findings.
6. Fit of a candidate = IDF-weighted share of findings it explains, minus pertinent negatives.
7. Consult (3 h) ranks the whole library by fit. Treat uses PrimeKG indications; wrong drugs
   cost stability or add side-effect findings. Commit ends the case; twins (near-identical
   subtypes) count as correct.

## Tiers
| Tier | Pool | Clock |
|---|---|---|
| Resident | ≥ 20 findings and a Mayo Clinic symptom text | 72 h |
| Attending | all 7,086 diseases with ≥ 10 findings | 60 h |
| House | 2,444 Orphanet rare diseases with onset data | 48 h |

## Adding a test
Edit `web/content/tests.json`: `id`, `kind`, `name`, `hours`, `cost`, `reveals` (HPO ids whose
subtrees the test can detect). `special` is one of `onset`, `inh`, `genetic`. Run `validate.py`.
