# Dr. Diagno

**Play it: https://pcmoan70.github.io/DrDiagno/**

A House-style diagnostic puzzle game in the browser. A patient arrives with symptoms that do not
add up. The clock is running. You build a differential, order tests, try treatments and name the
disease before the patient runs out of time. Every case is generated from real medical knowledge:
7,086 diseases and 19,894 clinical findings from the Human Phenotype Ontology, Orphanet, Mondo and
PrimeKG. No two cases are alike, and every case has a code you can share and replay.

Entertainment and education only. Nothing in the game is medical advice.

## How to play

**Pick a tier.** Student is for learning: Resident cases with a 96 hour clock, free literature
consults, a coach that suggests the most informative next studies, and no sudden death on a wrong
diagnosis. Resident gives well-described diseases and 72 hours. Attending opens the full
library with decoys that share most of the picture, 60 hours. House is rare diseases, misleading
openers and 48 hours. Everybody lies.

**Read the chart.** The patient presents with two or three common complaints. More findings
surface as the clock runs, the non-specific ones first. Hover any finding for a plain-language
name and its precise definition.

**Work the patient up.** History and examination items take minutes. Laboratory, imaging and
specialist studies take hours and cost money; tick several to run them together, the clock
advances by the longest. Each study reveals at most three findings, so the rest need other
studies or time. Some findings are absent, and those pertinent negatives rule diseases out.

**Build the differential.** Add diseases by name, or consult the literature (3 hours) to get the
six best fits in a pane you can close. Click any disease name for its full list of findings with
likelihoods, marked against your patient.

**Watch the map.** The differential map shows how many diseases of the tier still explain the
evidence, by organ system, and which systems are cut. Hover a bar for the studies that probe it.
On in Resident, collapsed in Attending, off in House.

**Place your chips.** Ten confidence chips spread over your candidates. A disease needs five to be
diagnosed. All ten and wrong ends the case. Five to nine and wrong costs six hours, hurts the
patient and rules that disease out, but you play on. Chips kept on the right answer through the
case earn a calibration bonus.

**Treat or diagnose.** Treatment uses real indications: the right drug stabilises the patient, the
wrong one may harm them or add side effects. Diagnose when you are sure. Near-identical subtypes
count as correct.

**Watch-along mode** has no patient and no clock. Type findings as you hear them, say while
watching a medical drama, mark them present or absent, and see which of 7,086 diseases fit. The
list lives in the link, so it can be shared.

## Scoring

A correct diagnosis scores up to 1,000 points, scaled by time left, minus a share of what you
spent, plus a bonus for a stable patient, 20 points per chip above five, and up to 150 points
for calibration. Best scores per tier are kept in your browser.

## Data and credits

Disease and finding knowledge comes from the
[Human Phenotype Ontology](https://hpo.jax.org/) and its disease annotations,
[Orphanet / Orphadata](https://www.orphadata.com/) (CC BY 4.0),
[Mondo](https://mondo.monarchinitiative.org/) (CC BY 4.0) and
[PrimeKG](https://github.com/mims-harvard/PrimeKG) (MIT) for drug indications. Exact versions
are listed in `game/web/data/credits.json` and on the game's title screen. Pictures in balloons and
disease profiles come from [Wikimedia Commons](https://commons.wikimedia.org/), found through
Wikidata; each shows its author and licence and links to its file page, and is loaded from
Wikimedia's servers when shown. Wikipedia links on diseases come from Wikidata too.

## For developers

- [`game/README.md`](game/README.md): layout, building the data bundles, running locally,
  tests and the balance bot, how a case is generated, adding a test.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): engine, data flow and deployment, with diagrams.
- [`CHANGES.md`](CHANGES.md): dated change log.
- [`docs/DATASETS.md`](docs/DATASETS.md): the wider open-dataset collection this game was built
  from (62 datasets on diseases, symptoms, cases and dialogue), its catalog and fetch scripts.

The site is pure HTML, CSS and ES modules, no build step, no server. `game/web/` is the whole
deployment; GitHub Pages redeploys it on every push to `main`.
