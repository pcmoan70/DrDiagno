#!/usr/bin/env python3
"""Inspect downloaded datasets: per file -> format, size, columns, row count, sample.

Usage: inspect.py [--only ID ...] [--out PATH]
Writes JSON (default <data_root>/INSPECTION.json) used to write docs/DATA_OVERVIEW.md.
Only reads files; never executes anything from the data directories.
"""
import argparse, bz2, csv, gzip, io, json, os, sys, zipfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(os.environ.get("DIAG_DATA_ROOT", "/media/pc/ext4TB/diagnosis_data"))
csv.field_size_limit(1 << 30)
SKIP = {"_meta.json", "_FAILED.txt", ".gitattributes"}
TEXT_TABLE = {".csv", ".tsv", ".txt", ".hpoa", ".sif"}


def opener(p):
    if p.suffix == ".gz":
        return gzip.open(p, "rt", encoding="utf-8", errors="replace"), p.with_suffix("").suffix
    if p.suffix == ".bz2":
        return bz2.open(p, "rt", encoding="utf-8", errors="replace"), p.with_suffix("").suffix
    return open(p, "rt", encoding="utf-8", errors="replace"), p.suffix


def count_lines(fh):
    n = 0
    for _ in fh:
        n += 1
    return n


def inspect_table(p):
    fh, ext = opener(p)
    with fh:
        head = []
        for line in fh:
            if not line.startswith("#"):
                head.append(line.rstrip("\n"))
                if len(head) >= 3:
                    break
        if not head:
            return {"kind": "empty"}
        sample = "\n".join(head)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t|;")
            delim = dialect.delimiter
        except csv.Error:
            delim = "\t" if "\t" in head[0] else ","
        cols = next(csv.reader([head[0]], delimiter=delim))
        rows = count_lines(fh) + len(head) - 1
    return {"kind": "table", "delimiter": delim, "columns": cols[:60], "n_columns": len(cols),
            "rows_approx": rows, "sample": head[1][:300] if len(head) > 1 else ""}


def inspect_jsonl(p):
    fh, _ = opener(p)
    with fh:
        first = fh.readline()
        try:
            obj = json.loads(first)
        except Exception:
            return {"kind": "text", "first_line": first[:200]}
        n = count_lines(fh) + 1
    return {"kind": "jsonl", "keys": list(obj.keys())[:60] if isinstance(obj, dict) else None,
            "rows": n, "sample": first[:300]}


def inspect_json(p):
    size = p.stat().st_size
    if size > 400_000_000:
        return {"kind": "json", "note": "large; not parsed", "bytes": size}
    with open(p, encoding="utf-8", errors="replace") as fh:
        head = fh.read(2000)
    try:
        with open(p, encoding="utf-8", errors="replace") as fh:
            obj = json.load(fh)
    except Exception:
        return inspect_jsonl(p) if "\n" in head.strip() else {"kind": "json", "head": head[:300]}
    if isinstance(obj, list):
        first = obj[0] if obj else None
        return {"kind": "json-array", "rows": len(obj),
                "keys": list(first.keys())[:60] if isinstance(first, dict) else None,
                "sample": json.dumps(first)[:300] if first is not None else ""}
    if isinstance(obj, dict):
        ks = list(obj.keys())
        return {"kind": "json-object", "n_keys": len(ks), "keys": ks[:40],
                "sample": json.dumps(obj[ks[0]])[:300] if ks else ""}
    return {"kind": "json"}


def inspect_parquet(p):
    import pyarrow.parquet as pq
    f = pq.ParquetFile(p)
    row = f.read_row_group(0).slice(0, 1).to_pylist()
    return {"kind": "parquet", "columns": f.schema_arrow.names, "rows": f.metadata.num_rows,
            "sample": json.dumps(row[0], default=str)[:300] if row else ""}


def inspect_zip(p):
    with zipfile.ZipFile(p) as z:
        infos = z.infolist()
        files = [(i.filename, i.file_size) for i in infos if not i.is_dir()]
    exts = {}
    for n, _ in files:
        exts[Path(n).suffix] = exts.get(Path(n).suffix, 0) + 1
    return {"kind": "zip", "n_files": len(files), "uncompressed_bytes": sum(s for _, s in files),
            "extensions": exts, "members": [n for n, _ in files[:15]]}


def inspect_obo(p):
    terms = 0
    with open(p, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("[Term]"):
                terms += 1
    return {"kind": "obo", "terms": terms}


def inspect_xml(p):
    with open(p, encoding="utf-8", errors="replace") as fh:
        head = fh.read(1500)
    tags = []
    import re
    for m in re.finditer(r"<([A-Za-z][\w:-]*)", head):
        if m.group(1) not in tags:
            tags.append(m.group(1))
    return {"kind": "xml", "first_tags": tags[:12]}


def inspect_file(p):
    name = p.name.lower()
    try:
        if name.endswith(".parquet"):
            return inspect_parquet(p)
        if name.endswith(".zip"):
            return inspect_zip(p)
        if name.endswith(".obo"):
            return inspect_obo(p)
        if name.endswith(".xml") or name.endswith(".owl"):
            return inspect_xml(p)
        if name.endswith(".jsonl") or name.endswith(".jsonl.gz"):
            return inspect_jsonl(p)
        if name.endswith(".json") or name.endswith(".json.bz2") or name.endswith(".json.gz"):
            return inspect_json(p)
        if name.endswith((".tar.gz", ".tgz")):
            import tarfile
            with tarfile.open(p) as t:
                members = [m.name for m in t.getmembers() if m.isfile()]
            return {"kind": "tar", "n_files": len(members), "members": members[:20]}
        base = name[:-3] if name.endswith(".gz") else name
        if Path(base).suffix in TEXT_TABLE or Path(base).suffix in (".hpoa",):
            return inspect_table(p)
        if name.endswith((".xls", ".xlsx", ".pdf", ".html", ".md", ".png", ".jpg", ".py")):
            return {"kind": Path(name).suffix[1:]}
        return {"kind": "other"}
    except Exception as e:
        return {"kind": "error", "error": f"{type(e).__name__}: {e}"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="+")
    ap.add_argument("--out", default=str(DATA_ROOT / "INSPECTION.json"))
    a = ap.parse_args()
    cat = yaml.safe_load(open(ROOT / "catalog" / "datasets.yaml"))
    out = {}
    for ds in cat:
        if a.only and ds["id"] not in a.only:
            continue
        d = DATA_ROOT / ds["category"] / ds["id"]
        if not (d / "_meta.json").exists():
            continue
        files = {}
        for p in sorted(d.rglob("*")):
            if p.is_file() and p.name not in SKIP and ".cache" not in p.parts:
                info = inspect_file(p)
                info["bytes"] = p.stat().st_size
                files[str(p.relative_to(d))] = info
        out[ds["id"]] = {"category": ds["category"], "files": files}
        print(f"{ds['id']}: {len(files)} files", flush=True)
    Path(a.out).write_text(json.dumps(out, indent=1, default=str))
    print("wrote", a.out)


if __name__ == "__main__":
    main()
