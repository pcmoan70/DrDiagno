# Lessons

- 2026-11-05: YAML plain scalars containing `: ` (e.g. `CC0 1.0 (edges: CC BY 4.0)`) must be quoted; validate the catalog with `yaml.safe_load` right after editing.
- 2026-11-05: Dataverse `.tab` files need `?format=original` to get the uploaded CSV; GitHub `releases/latest/download/` and OBO purls redirect, so use `wget` (follows redirects) rather than checking `Content-Length` on the first hop.
- 2026-11-05: Two fetch.py processes with overlapping selections downloaded the same HF dataset into the same folder; after one was killed the other wrote `_meta.json` with a file missing. Fix: per-dataset `_LOCK` (pid) in fetch.py, and `scripts/verify.py` compares every HF file to upstream sha256 after a run. Rule: never launch overlapping selections; always run verify.py before declaring a run complete.
- 2026-11-05: pyarrow 19 fails with "Repetition level histogram size mismatch" on some newer parquet files (Medbullets, DiagnosisArena, clinical-case-icd10). Files are byte-identical to upstream; it is a reader bug – read them with pyarrow >= 20 (or polars/duckdb).

## 2026-11-06 Dr. Diagno game
- `python3 -I` does not put the script's own directory on `sys.path`; shared modules next to the
  script need an explicit `sys.path.insert(0, dirname(__file__))`.
- Hash-only navigation (`page#case`) does not reload a single-page app; after editing JS, navigate
  to a different URL (or hard-reload) before testing, otherwise the old code keeps running.
- A test that reveals a whole HPO subtree dumps the entire profile (neuro exam showed 14 findings);
  cap findings per test and let the rest surface through progression.
- A bot that is handed the true disease in its differential measures nothing; the honest bot must
  build its differential from findings (consult) and the win rate halves.
- Hand-curated content (`content/tests.json`) must not live in a gitignored derived-data folder.
- 2026-11-06: A static ES-module site silently does nothing when opened via `file://` (CORS blocks
  module scripts and fetch). Always state the HTTP-server requirement in the run docs and make the
  page itself detect `location.protocol === 'file:'` and say so; never leave a loader that can
  stall without an error path.
- 2026-11-06: `pkill -f "http.server 8077"` matched the shell running it (the pattern is in its own command line) and killed the tool shell (exit 144) while leaving the server state unclear. Anchor the pattern (`pkill -f '^python3 -m http.server 8077'`) or kill by port (`fuser -k 8077/tcp`).
- 2026-11-06: The served folder (`game/web`) had tests and package.json inside it, so any deployment (Pages upload, home server, artifact) would have shipped them. Rule: the deploy folder contains only what the browser loads; tests, build scripts and raw data live beside it, and CI asserts it.
