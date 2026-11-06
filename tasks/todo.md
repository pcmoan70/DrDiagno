# tasks/todo.md

Active plan: `tasks/diagnosis_datasets_plan_20261105.md`

- [x] 1. Verify candidate URLs / HF repos
- [x] 2. Write catalog/datasets.yaml
- [x] 3. Write scripts/fetch.py
- [x] 4. Tier 1 downloads (ontologies + knowledge)
- [x] 5. Tier 2 downloads (HF datasets)
- [x] 6. Tier 3 downloads (large files)
- [x] 7. Add agent-researched sources
- [x] 8. MANIFEST.json + sanity checks
- [x] 9. Documentation (README, ARCHITECTURE, CHANGES, drive README)
- [x] 10. Review section

## Review (2026-11-05)
- 62 downloadable datasets fetched to `/media/pc/ext4TB/diagnosis_data/` (12.98 GB), 7 credentialed sources documented as manual.
- verify.py: 44 HF datasets, 0 problems. MANIFEST.json and INSPECTION.json written.
- Deviation: running overlapping fetch selections in parallel caused one incomplete dataset; fixed with `_LOCK` + verify.py, re-fetched. Recorded in lessons.md.
- HF throttled to ~0.5 MB/s with 4 parallel streams; 2 streams is the sweet spot.
- docs/DATA_OVERVIEW.md written from actual file inspection; README/ARCHITECTURE/CHANGES updated.
- [x] 11. docs/DATA_OVERVIEW.md: per-dataset file structure, columns, row counts, cross-dataset identifier links (requested 2026-11-05)

## House-style game (plan only, 2026-11-05)
Plan: `tasks/house_game_plan_20261105.md` (static JavaScript, GitHub Pages)
- [x] M0 user confirmed: "Dr. Diagno" (preliminary), English only
- [x] M1 data build (terms, diseases, drugs, credits, validate) 2026-11-05
- [x] M2 engine with node tests (10 passing)
- [x] M3 test catalog (55 tests, all HPO ids validated)
- [x] M4 UI (first version, verified in Chrome 2026-11-06)
- [~] M5 balance: bot baseline done, per-test cap added; human playtest pending
- [~] M6 deploy: workflow added; blocked, repo is private (Pages needs public repo or Pro) and data bundles are not pushed
- [x] M7 documentation (game/README.md, root README, ARCHITECTURE, CHANGES)
- [x] Game ideas written up: `tasks/game_ideas_20261106.md`; user approved the recommended order 2026-11-06

## Game features round 2 (approved 2026-11-06, in order)
F3 Watch-along mode
- [x] HPO term search (name + lay name, phenotypic-abnormality subtree) in a new `#watch` screen
- [x] Present/absent findings as chips; live ranking of all 7,086 diseases via `suggest()` with reason lines
- [x] Shareable URL `#watch/HP:..,HP:..,-HP:..`; copy-link button; disclaimer; title-screen entry
- [x] Verify in Chrome; docs (game/README, CHANGES); commit
F1 Differential map (Resident on, Attending collapsible, House off)
- [x] `scoring.isCut()` hard-cut rule plus fit >= 0.5 soft rule (hard negatives alone were too rare: 320 diseases have excluded terms), drug-sourced findings exempt
- [x] Map panel: compatible count, per-organ-system bars, cut branches struck through, tooltip listing tests that probe the branch
- [x] "Ruled out N" toast after each action; node test: true disease never cut over 1,000 random cases
- [x] Verify in Chrome; docs; commit
F2 Confidence chips
- [x] Engine: `state.chips`, `setChips()`, auto placement by fit until the player moves one; chips-on-truth recorded on every advance
- [x] Commit rule: >=5 chips to diagnose; wrong with 10 ends the case, wrong with 5-9 costs 6 h and 20 stability and continues
- [x] Score: +20 per chip above 5 when correct, calibration bonus up to 150 from area under chips-on-truth curve
- [x] Fit bars hidden in Attending/House until a consult; debrief chart of chips on truth over time
- [x] Bot updated and re-balanced; node tests; verify in Chrome; docs; commit
