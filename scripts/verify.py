#!/usr/bin/env python3
"""Verify completed Hugging Face datasets against upstream file lists.

For every complete `hf`/`hf_multi` dataset, compare local files with the repo's
file list: LFS files must match sha256 and size, other files must exist.
Prints one line per problem and a summary; exit code 1 if anything is wrong.
Usage: verify.py [--only ID ...]
"""
import argparse, json, os, sys
from pathlib import Path
import yaml
from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(os.environ.get("DIAG_DATA_ROOT", "/media/pc/ext4TB/diagnosis_data"))


def check_repo(api, repo, local_dir, local):
    bad = 0
    info = api.dataset_info(repo, files_metadata=True)
    for s in info.siblings:
        if s.rfilename == ".gitattributes":
            continue
        rel = str(Path(local_dir) / s.rfilename) if local_dir else s.rfilename
        l = local.get(rel)
        if l is None:
            print(f"MISSING {repo} {s.rfilename}"); bad += 1
        elif s.lfs and (l["sha256"] != s.lfs.sha256 or l["bytes"] != s.lfs.size):
            print(f"SHA256-MISMATCH {repo} {s.rfilename}"); bad += 1
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="+")
    a = ap.parse_args()
    api = HfApi()
    cat = yaml.safe_load(open(ROOT / "catalog" / "datasets.yaml"))
    checked = problems = 0
    for ds in cat:
        if ds["source"] not in ("hf", "hf_multi") or (a.only and ds["id"] not in a.only):
            continue
        meta_p = DATA_ROOT / ds["category"] / ds["id"] / "_meta.json"
        if not meta_p.exists():
            continue
        local = {f["path"]: f for f in json.loads(meta_p.read_text())["files"]}
        repos = [(ds["repo"], "")] if ds["source"] == "hf" else [(r, r.split("/", 1)[1]) for r in ds["repos"]]
        n = sum(check_repo(api, repo, sub, local) for repo, sub in repos)
        checked += 1
        problems += n
        print(f"{'ok ' if n == 0 else 'BAD'} {ds['id']}")
    print(f"\nchecked {checked} datasets, {problems} problems")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
