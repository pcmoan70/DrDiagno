# Wikimedia imagery for findings and diseases (2026-11-06)

Goal: show an illustrative Wikimedia Commons image for a finding in its term balloon and for a
disease in its profile / debrief, with attribution, plus a Wikipedia link for diseases.

Decisions
- Source of links: Wikidata (HPO id P3841, Mondo id P5270, image P18, English Wikipedia sitelink).
  Research 2026-11-06: 945 of 19,894 game terms and 326 of 7,086 game diseases have an image.
- Attribution and thumbnail URLs: Commons `imageinfo` API (extmetadata: Artist, LicenseShortName).
- Images are hotlinked from upload.wikimedia.org at 480 px width, loaded only when a balloon or
  profile shows them. Nothing binary enters the repo; `data/images.json` holds URLs and credits.
- Excluded: findings under Abnormality of the genital system (HP:0000078) and of the breast
  (HP:0000769), to keep explicit photographs out of hover balloons.
- Raw API responses are cached under `DIAG_DATA_ROOT/_cache/wikimedia/` (downloaded data stays on
  the drive, read with python3 -I).

Plan
- [x] `game/build/build_images.py`: SPARQL + Commons API -> `web/data/images.json` ({img: {id: {u, p, a, l}}, wiki: {MONDO: url}})
- [x] `validate.py`: keys exist, counts in the report
- [x] UI: image + credit in the term balloon; image, credit link and Wikipedia link in the disease profile and debrief
- [x] Docs: README credits, game/README build step, ARCHITECTURE, CHANGES
- [ ] Verify in Chrome, commit, push (Pages), republish artifact
