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
python3 -I build_images.py     # images.json: Commons images + credits for findings/diseases, Wikipedia links (network; cached on the drive)
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

## Match percentage
In Student and Resident (and after a consult elsewhere) each candidate shows the share of the
weighted evidence it explains as a percentage next to its name; the consult pane shows it too. In
Student and Resident the top bar also shows "Best match" with the leading candidate.

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
Laboratory, imaging and specialist studies carry a checkbox. Ticking one turns its Order button amber
to show it belongs to the batch; that button, or the sticky bar with count, duration and cost, runs
the whole batch: the clock advances once, by the longest
study, and costs add up (`orderTests()`; results are produced in catalog order, so the batch is
deterministic whatever the click order). History and examination items stay one at a time.

## Term balloons
Hovering (or keyboard-focusing) any finding shows a balloon with its everyday name, the HPO name
and the HPO definition from `data/defs.json` (17,432 definitions, 0.7 MB gzipped, loaded in the
background after the game starts). Findings carry `data-term`; an optional `data-extra` adds a
line, used for pertinent negatives, the organ-system map (which studies probe it) and watch-along
chips. Covered: patient findings, test results, "does not explain" lists, the map, watch-along
chips and the disease profile table. When Wikidata lists a Commons image for the term, the balloon
shows it (up to 800 px thumbnail, hotlinked, with author and licence).

## Pictures and Wikipedia links
`build_images.py` asks Wikidata for every item with an HPO id (P3841) or Mondo id (P5270) and an
image (P18) or English Wikipedia article, then the Commons `imageinfo` API for thumbnail URLs,
author and licence. Result: `data/images.json` (884 finding images, 326 disease images, 1,533
Wikipedia links; 0.5 MB). Findings under the genital system (HP:0000078) and breast (HP:0000769)
are excluded so explicit photographs never appear in hover balloons. Images are whatever Wikidata
chose as the item's main picture, so some are diagrams or historical art rather than clinical
photographs. Raw API responses are cached in `DIAG_DATA_ROOT/_cache/wikimedia/`.

## Disease profile
Every disease name (differential, watch-along ranking, debrief) opens a table of the disease's
annotated findings with their likelihood: the share of patients who show the finding, as a
percentage, bar and HPO frequency class (Obligate, Very frequent, Frequent, Occasional, Very rare),
plus any findings the disease is annotated as never having (Excluded). The header shows the disease's
Commons image and a Wikipedia link when Wikidata has them; the debrief shows the same. A third column marks which
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
| Student | the Resident pool, with help (below) | 96 h |
| Resident | ≥ 20 findings and a Mayo Clinic symptom text | 72 h |
| Attending | all 7,086 diseases with ≥ 10 findings | 60 h |
| House | 2,444 Orphanet rare diseases with onset data | 48 h |

## Student mode
`#student-<code>` plays Resident cases with help: literature consults cost no time, fit bars and
"does not explain" are always shown, the differential map starts open, a wrong all-in diagnosis is
treated like a hedged one (6 h, 20 stability, disease ruled out) instead of ending the case, and a
Coach panel above the workup lists the three unordered studies that best split the diseases still
fitting (`scoring.suggestTests()`: a study probes a disease when it can reveal one of its findings
with p >= 0.5; rank by min(probed, not probed), then by duration). Best scores are kept per tier.

### Venn view
Under the differential a collapsible panel draws the three best-matching candidates as circles A, B
and C and places every finding in the region of the diseases that explain it (`scoring.vennSets()`,
using the same rule as the fit score via `explainStrength()`: the disease has the term or a child of
it, or a parent at 0.6 weight). The SVG shows a count per region with the findings as a tooltip;
below it a legend (name, match %) and a list per region of the findings as chips: filled for
symptoms (history, examination, course, treatment), outlined for laboratory, imaging and specialist
results. Findings explained by none of the three are listed as "None of them" and counted in the
panel header. Pinned by a test in `tests/map.test.js`.

## Progress (local storage)
`renderDebrief()` records each finished case once (`recordCase()`): tier, seed, disease, result
(won / wrong / timeout), score, hours, spent, tests ordered and the disease's organ systems. The
history (up to 500 entries, key `history`) lives in localStorage next to the per-tier best scores.
`engine/progress.js` aggregates it with pure, node-tested functions: `tierStats` (played, solved,
best, last-5 average, trend against the previous 5), `topicStats` (organ systems, weakest first),
`missedDiseases` (unsolved diseases with the last case code; a later win removes them). The
`#progress` screen renders these plus a score chart and recent cases, with a Clear button.

## Adding a test
Edit `web/content/tests.json`: `id`, `kind`, `name`, `hours`, `cost`, `reveals` (HPO ids whose
subtrees the test can detect). `special` is one of `onset`, `inh`, `genetic`. Run `validate.py`.
