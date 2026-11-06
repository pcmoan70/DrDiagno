# Dr. Diagno (preliminary name)

A House-style diagnostic puzzle game: a patient arrives with puzzling symptoms, the clock runs,
and the player builds a differential, orders tests, treats, and commits to a diagnosis.
Every case is generated in the browser from real disease knowledge (HPO, Orphanet, Mondo,
PrimeKG). Pure static site: HTML + ES modules, no server, no model at play time.

Updated 2026-11-06. Plan: `../tasks/house_game_plan_20261105.md`.

## Layout
```
build/      Python scripts that compile the drive data into JSON bundles (run with python3 -I)
tests/      node --test suite and the balance bot (package.json lives here too)
web/        the site, and nothing else: index.html, app.js, styles.css, engine/, content/tests.json, data/ (built)
```
`web/` is the deployment unit: whatever serves or publishes the game (GitHub Pages, a home server,
a claude.ai artifact) takes that folder alone. Raw datasets stay on the drive, build scripts in
`build/`, tests in `tests/`; the Pages workflow fails if any of them turn up under `web/`.

## Build the data bundles
Needs the datasets on the drive (`DIAG_DATA_ROOT`, default `/media/pc/ext4TB/diagnosis_data`), numpy and scipy.
```bash
cd game/build
python3 -I build_terms.py      # terms.json: HPO terms, lay names, parents, IDF; defs.json: HPO definitions
python3 -I build_diseases.py   # diseases/index.json + 16 shards: profiles, onset, prevalence, decoys
python3 -I build_drugs.py      # drugs.json: PrimeKG indications, contraindications, side effects
python3 -I build_credits.py    # credits.json
python3 -I validate.py         # checks + game/data_report.md (dated)
```
`web/data/` is derived (~15 MB raw / 3.4 MB gzipped) but versioned, because GitHub Pages builds from
the repository alone. Rebuild and commit it when the sources or build scripts change; the raw datasets
never enter the repo.

## Play online
The game is served by GitHub Pages at https://pcmoan70.github.io/DrDiagno/ . Every push to `main`
that touches `game/web/**` or `game/tests/**` runs the tests and redeploys (`.github/workflows/pages.yml`).
The repository is public, which the free Pages plan requires.

## Run locally
```bash
cd game && npm run serve     # python3 -m http.server 8077 -d web; open http://127.0.0.1:8077/
```

Do not open `index.html` directly from disk: browsers block ES modules and `fetch` on `file://`
URLs, so the page would stay at "Loading… 0%" (it now shows a hint instead). It needs an HTTP server.

## Confidence chips
Ten chips sit on the differential. Until the player moves one they follow the chart's fit
(`autoChips()`, largest-remainder rounding); a click on a dot places chips, taking them first from
the pool and then from the biggest other holder (`setChips()`). A disease needs 5 chips to be
diagnosed. All 10 and wrong ends the case; 5-9 and wrong costs 6 hours and 20 stability, rules
the disease out and the case goes on. On a correct diagnosis the score adds 20 per chip above 5
and a calibration bonus of up to 150 for the time-weighted share of the case during which chips
sat on the answer (`calibration()`, recorded by `advance()` in `state.chipTrack`, drawn in the
debrief). Outside Resident, fit bars appear only after a literature consult, so the chips carry
the player's own judgement. All numbers are in `TUNING` in `engine/case.js`.

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

## Parallel studies
Laboratory, imaging and specialist studies carry a checkbox. Ticked studies run together from a
sticky bar that shows their count, duration and cost: the clock advances once, by the longest
study, and costs add up (`orderTests()`; results are produced in catalog order, so the batch is
deterministic whatever the click order). History and examination items stay one at a time.

## Term balloons
Hovering (or keyboard-focusing) any finding shows a balloon with its everyday name, the HPO name
and the HPO definition from `data/defs.json` (17,432 definitions, 0.7 MB gzipped, loaded in the
background after the game starts). Findings carry `data-term`; an optional `data-extra` adds a
line, used for pertinent negatives, the organ-system map (which studies probe it) and watch-along
chips. Covered: patient findings, test results, "does not explain" lists, the map, watch-along
chips and the disease profile table.

## Disease profile
Every disease name (differential, watch-along ranking, debrief) opens a table of the disease's
annotated findings with their likelihood: the share of patients who show the finding, as a
percentage, bar and HPO frequency class (Obligate, Very frequent, Frequent, Occasional, Very rare),
plus any findings the disease is annotated as never having (Excluded). A third column marks which
of the patient's findings are present or absent; in play it appears in Resident or after a consult,
in watch-along it marks the entered findings.

## Test and balance
```bash
cd game
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
7. Consult (3 h) ranks the whole library by fit; the six best appear in a closable pane with Add
   buttons (and Add all), so the differential stays the player's own list. Treat uses PrimeKG indications; wrong drugs
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
