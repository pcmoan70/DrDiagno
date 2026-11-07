# Fuzzy search and wider test coverage (2026-11-07)

User: "list of tests and symptoms should cover more symptoms, and list should be fuzzy-searchable".

- [x] Coverage audit: 97.6% of (disease, finding) pairs were revealable; the gaps were voice/ENT,
      pain as a history item, pregnancy and birth history, sweating, breast/nipples, peripheral
      neuropathy on EMG, CNS morphology and myelination on MRI.
- [x] `web/content/tests.json`: new "Ask about pain", "Pregnancy and birth history", "Ear, nose and
      throat exam"; wider roots on skin exam, chest exam, EMG, MRI brain (55 -> 58 tests).
- [x] `engine/search.js`: shared fuzzy matcher (token prefix / substring / edit distance 1-2, phrase
      bonus, word order free); `searchTerms` (findings) and new `searchDiseases` (differential box).
- [x] hints in index.html; node tests; docs (game/README, README, ARCHITECTURE, CHANGES)
- [x] verify in Chrome (typo queries answer in ~20 ms after a 180 ms first index build), deploy, artifact

## Review
Four-letter queries get no edit tolerance, so "asma" does not find asthma; acceptable, since
the lay-name phrase match covers the common cases. 29 node tests.
