"""Shared helpers for the Dr. Diagno data build. Run every script with `python3 -I`."""
import os
from pathlib import Path

DATA_ROOT = Path(os.environ.get("DIAG_DATA_ROOT", "/media/pc/ext4TB/diagnosis_data"))
HPO_DIR = DATA_ROOT / "01_ontologies_terminologies" / "hpo"
MONDO_OBO = DATA_ROOT / "01_ontologies_terminologies" / "mondo" / "mondo.obo"
ORPHA_DIR = DATA_ROOT / "01_ontologies_terminologies" / "orphanet_orphadata"
PRIMEKG_DIR = DATA_ROOT / "02_disease_symptom_knowledge" / "primekg"
OUT = Path(__file__).resolve().parents[1] / "web" / "data"


def parse_obo(path):
    """Minimal OBO parser: id -> dict(name, def, syn[(text, scope, type)], xref[(id, line)], is_a[], obsolete)."""
    terms, cur = {}, None
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if line == "[Term]":
                cur = {"name": "", "def": "", "syn": [], "xref": [], "is_a": [], "obsolete": False}
            elif line.startswith("[") or cur is None:
                cur = None if line.startswith("[") and line != "[Term]" else cur
            elif line.startswith("id: ") and "name" in cur and not cur.get("id"):
                cur["id"] = line[4:]
                terms[cur["id"]] = cur
            elif line.startswith("name: "):
                cur["name"] = line[6:]
            elif line.startswith("def: "):
                q = line[5:]
                cur["def"] = q[1:q.rfind('"')] if q.startswith('"') else q
            elif line.startswith("synonym: "):
                q = line[9:]
                text = q[1:q.find('" ')]
                rest = q[q.find('" ') + 2:]
                parts = rest.split(" ")
                cur["syn"].append((text, parts[0], parts[1] if len(parts) > 1 and not parts[1].startswith("[") else ""))
            elif line.startswith("xref: "):
                cur["xref"].append((line[6:].split(" ")[0], line[6:]))
            elif line.startswith("is_a: "):
                cur["is_a"].append(line[6:].split(" ")[0])
            elif line == "is_obsolete: true":
                cur["obsolete"] = True
    return terms


def hp_id(num):
    return "HP:%07d" % int(num)


def mondo_id(num):
    return "MONDO:%07d" % int(num)
