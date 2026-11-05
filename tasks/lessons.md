# Lessons

- 2026-11-05: YAML plain scalars containing `: ` (e.g. `CC0 1.0 (edges: CC BY 4.0)`) must be quoted; validate the catalog with `yaml.safe_load` right after editing.
- 2026-11-05: Dataverse `.tab` files need `?format=original` to get the uploaded CSV; GitHub `releases/latest/download/` and OBO purls redirect, so use `wget` (follows redirects) rather than checking `Content-Length` on the first hop.
- 2026-11-05: Two fetch.py processes with overlapping selections downloaded the same HF dataset into the same folder; after one was killed the other wrote `_meta.json` with a file missing. Fix: per-dataset `_LOCK` (pid) in fetch.py, and `scripts/verify.py` compares every HF file to upstream sha256 after a run. Rule: never launch overlapping selections; always run verify.py before declaring a run complete.
- 2026-11-05: pyarrow 19 fails with "Repetition level histogram size mismatch" on some newer parquet files (Medbullets, DiagnosisArena, clinical-case-icd10). Files are byte-identical to upstream; it is a reader bug – read them with pyarrow >= 20 (or polars/duckdb).
