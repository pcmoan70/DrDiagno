#!/usr/bin/env python3
"""Download the open diagnosis datasets listed in catalog/datasets.yaml.

Usage:
  fetch.py                    download everything not yet complete
  fetch.py --only ID [ID..]   download selected entries
  fetch.py --category CAT     download one category
  fetch.py --status           print status report (with timestamp)
  fetch.py --manifest         rebuild <data_root>/MANIFEST.json from _meta.json files

A dataset directory is complete when it contains _meta.json (sha256 of every
file). Incomplete downloads resume on re-run (wget -c / HF snapshot resume).
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import traceback
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "catalog" / "datasets.yaml"
DATA_ROOT = Path(os.environ.get("DIAG_DATA_ROOT", "/media/pc/ext4TB/diagnosis_data"))


def now():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def log(msg, fh=None):
    line = f"[{now()}] {msg}"
    print(line, flush=True)
    if fh:
        fh.write(line + "\n")
        fh.flush()


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_catalog():
    with open(CATALOG) as f:
        return yaml.safe_load(f)


def dest_dir(ds):
    return DATA_ROOT / ds["category"] / ds["id"]


def fetch_url(url, dest):
    subprocess.run(
        ["wget", "-c", "-t", "5", "--timeout=60", "--waitretry=15", "-q", "-O", str(dest), url],
        check=True,
    )
    if dest.stat().st_size == 0:
        raise RuntimeError(f"empty download: {url}")


def fetch_hf(repo, dest):
    from huggingface_hub import snapshot_download

    snapshot_download(repo_id=repo, repo_type="dataset", local_dir=str(dest), max_workers=4)
    shutil.rmtree(dest / ".cache", ignore_errors=True)  # HF bookkeeping, not data


def fetch_kaggle(slug, dest):
    if not (Path.home() / ".kaggle" / "kaggle.json").exists():
        raise RuntimeError("no ~/.kaggle/kaggle.json (see manual entry kaggle_originals)")
    subprocess.run(["kaggle", "datasets", "download", "-d", slug, "-p", str(dest), "--unzip"], check=True)


def write_meta(ds, dest, started):
    files = []
    for p in sorted(dest.rglob("*")):
        if p.is_file() and p.name not in ("_meta.json", "_FAILED.txt", "_LOCK"):
            files.append({"path": str(p.relative_to(dest)), "bytes": p.stat().st_size, "sha256": sha256(p)})
    meta = {
        "id": ds["id"],
        "name": ds.get("name"),
        "category": ds["category"],
        "source": ds["source"],
        "locator": ds.get("repo") or ds.get("repos") or ds.get("slug") or [f["url"] for f in ds.get("files", [])],
        "homepage": ds.get("url"),
        "license": ds.get("license"),
        "coverage": ds.get("coverage"),
        "download_started": started,
        "download_finished": now(),
        "total_bytes": sum(f["bytes"] for f in files),
        "file_count": len(files),
        "files": files,
    }
    (dest / "_meta.json").write_text(json.dumps(meta, indent=1))
    return meta


def run_one(ds, fh):
    if ds["source"] == "manual":
        return "manual"
    dest = dest_dir(ds)
    if (dest / "_meta.json").exists():
        log(f"skip  {ds['id']} (complete)", fh)
        return "done"
    dest.mkdir(parents=True, exist_ok=True)
    lock = dest / "_LOCK"
    if lock.exists():
        pid = lock.read_text().strip()
        if pid.isdigit() and Path(f"/proc/{pid}").exists():
            log(f"skip  {ds['id']} (being downloaded by pid {pid})", fh)
            return "locked"
    lock.write_text(str(os.getpid()))
    (dest / "_FAILED.txt").unlink(missing_ok=True)
    started = now()
    log(f"start {ds['id']}", fh)
    try:
        src = ds["source"]
        if src == "url":
            for f in ds["files"]:
                name = f.get("name") or f["url"].rstrip("/").rsplit("/", 1)[-1]
                (dest / name).parent.mkdir(parents=True, exist_ok=True)
                fetch_url(f["url"], dest / name)
        elif src == "hf":
            fetch_hf(ds["repo"], dest)
        elif src == "hf_multi":
            for repo in ds["repos"]:
                fetch_hf(repo, dest / repo.split("/", 1)[1])
        elif src == "kaggle":
            fetch_kaggle(ds["slug"], dest)
        else:
            raise ValueError(f"unknown source {src}")
        meta = write_meta(ds, dest, started)
        log(f"done  {ds['id']}  {meta['file_count']} files  {meta['total_bytes']/1e6:.1f} MB", fh)
        return "done"
    except Exception as e:  # keep going with the other datasets
        msg = f"{type(e).__name__}: {e}"
        (dest / "_FAILED.txt").write_text(f"{now()}\n{msg}\n{traceback.format_exc()}")
        log(f"FAIL  {ds['id']}  {msg}", fh)
        return "failed"
    finally:
        lock.unlink(missing_ok=True)


def state_of(ds):
    if ds["source"] == "manual":
        return "manual", 0
    dest = dest_dir(ds)
    meta = dest / "_meta.json"
    if meta.exists():
        return "done", json.loads(meta.read_text())["total_bytes"]
    if (dest / "_FAILED.txt").exists():
        return "failed", 0
    if dest.exists():
        return "partial", sum(p.stat().st_size for p in dest.rglob("*") if p.is_file())
    return "pending", 0


def status(catalog):
    print(f"Status at {now()}  (local {dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
    print(f"data root: {DATA_ROOT}")
    total = 0
    counts = {}
    print(f"{'state':8s} {'MB':>9s}  {'category':30s} id")
    for ds in catalog:
        st, b = state_of(ds)
        counts[st] = counts.get(st, 0) + 1
        total += b
        print(f"{st:8s} {b/1e6:9.1f}  {ds['category']:30s} {ds['id']}")
    print(f"\ntotal on disk: {total/1e9:.2f} GB   " + "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    du = shutil.disk_usage(DATA_ROOT) if DATA_ROOT.exists() else None
    if du:
        print(f"drive free: {du.free/1e9:.0f} GB of {du.total/1e9:.0f} GB")


def manifest(catalog):
    entries = []
    for ds in catalog:
        meta = dest_dir(ds) / "_meta.json"
        if meta.exists():
            entries.append(json.loads(meta.read_text()))
    out = {"generated": now(), "data_root": str(DATA_ROOT), "dataset_count": len(entries),
           "total_bytes": sum(e["total_bytes"] for e in entries), "datasets": entries}
    (DATA_ROOT / "MANIFEST.json").write_text(json.dumps(out, indent=1))
    print(f"MANIFEST.json: {len(entries)} datasets, {out['total_bytes']/1e9:.2f} GB")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="+", metavar="ID")
    ap.add_argument("--category")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--manifest", action="store_true")
    a = ap.parse_args()
    catalog = load_catalog()
    if a.status:
        return status(catalog)
    if a.manifest:
        return manifest(catalog)
    sel = [d for d in catalog if (not a.only or d["id"] in a.only) and (not a.category or d["category"] == a.category)]
    if a.only:
        missing = set(a.only) - {d["id"] for d in sel}
        if missing:
            sys.exit(f"unknown ids: {sorted(missing)}")
    (DATA_ROOT / "_logs").mkdir(parents=True, exist_ok=True)
    logfile = DATA_ROOT / "_logs" / f"fetch_{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}.log"
    with open(logfile, "a") as fh:
        for ds in sel:
            run_one(ds, fh)
        summary = {}
        for ds in sel:
            st, _ = state_of(ds)
            summary[st] = summary.get(st, 0) + 1
        log("summary: " + "  ".join(f"{k}={v}" for k, v in sorted(summary.items())), fh)
    manifest(catalog)


if __name__ == "__main__":
    main()
