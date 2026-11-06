"""images.json: Wikimedia Commons images (hotlinked thumbnails with attribution) for HPO findings and
Mondo diseases, plus English Wikipedia links for diseases. Links come from Wikidata, thumbnail URLs
and credits from the Commons imageinfo API. Raw responses are cached on the drive."""
import json, re, sys, os, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA_ROOT, OUT

UA = "DrDiagno-build/0.1 (https://github.com/pcmoan70/DrDiagno)"
CACHE = DATA_ROOT / "_cache" / "wikimedia"
EXCLUDE_ROOTS = {"HP:0000078", "HP:0000769"}  # genital system, breast: no explicit photographs in balloons
THUMB_W = 800

SPARQL = {
    "hpo": "SELECT ?x ?img WHERE { ?item wdt:P3841 ?x ; wdt:P18 ?img . }",
    "mondo": """SELECT ?x ?img ?article WHERE { ?item wdt:P5270 ?x .
      OPTIONAL { ?item wdt:P18 ?img } OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> } }""",
}


def get(url, cache_name):
    path = CACHE / cache_name
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except Exception as e:  # transient API errors: back off and retry
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    time.sleep(0.5)
    return data


def sparql(name):
    url = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(SPARQL[name])
    rows = get(url, f"wikidata_{name}.json")["results"]["bindings"]
    return [{k: v["value"] for k, v in r.items()} for r in rows]


def norm_hp(x):
    return "HP:" + re.sub(r"^HP[:_]", "", x).zfill(7)


def norm_mondo(x):
    return "MONDO:" + re.sub(r"^MONDO[:_]", "", x).zfill(7)


def file_title(img_url):
    return "File:" + urllib.parse.unquote(img_url.rsplit("/", 1)[1]).replace("_", " ")


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def commons_info(titles):
    """title -> {u: thumb url, p: file page, a: artist, l: licence}; missing files are skipped."""
    out = {}
    titles = sorted(set(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        url = ("https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata"
               f"&iiurlwidth={THUMB_W}&format=json&titles=" + urllib.parse.quote("|".join(chunk)))
        data = get(url, "commons_%04d.json" % (i // 50))
        q = data.get("query", {})
        back = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for page in q.get("pages", {}).values():
            info = (page.get("imageinfo") or [None])[0]
            if not info or "thumburl" not in info:
                continue
            meta = info.get("extmetadata", {})
            title = back.get(page["title"], page["title"])
            out[title] = {"u": info["thumburl"].split("?")[0], "p": info["descriptionurl"],
                          "a": next((strip_html(meta[k]["value"])[:120] for k in ("Artist", "Credit", "Attribution") if meta.get(k, {}).get("value") and strip_html(meta[k]["value"])), "Unknown author"),
                          "l": meta.get("LicenseShortName", {}).get("value", "see file page")}
    return out


def main():
    terms = json.load(open(OUT / "terms.json", encoding="utf-8"))["t"]
    diseases = {e["i"] for e in json.load(open(OUT / "diseases" / "index.json", encoding="utf-8"))["d"]}
    anc_cache = {}

    def excluded(tid):
        if tid in anc_cache:
            return anc_cache[tid]
        seen, stack, hit = set(), [tid], False
        while stack and not hit:
            x = stack.pop()
            if x in EXCLUDE_ROOTS:
                hit = True
            for p in terms.get(x, [None, None, []])[2]:
                if p not in seen:
                    seen.add(p); stack.append(p)
        anc_cache[tid] = hit
        return hit

    hp_rows = [(norm_hp(r["x"]), r["img"]) for r in sparql("hpo")]
    hp_img = {}
    for tid, img in hp_rows:
        if tid in terms and not excluded(tid) and tid not in hp_img:
            hp_img[tid] = img
    mo_img, wiki = {}, {}
    for r in sparql("mondo"):
        mid = norm_mondo(r["x"])
        if mid not in diseases:
            continue
        if "img" in r and mid not in mo_img:
            mo_img[mid] = r["img"]
        if "article" in r and mid not in wiki:
            wiki[mid] = r["article"]
    titles = {file_title(u) for u in list(hp_img.values()) + list(mo_img.values())}
    info = commons_info(titles)
    img = {}
    for k, u in list(hp_img.items()) + list(mo_img.items()):
        t = file_title(u)
        if t in info:
            img[k] = info[t]
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "images.json", "w", encoding="utf-8") as f:
        json.dump({"img": img, "wiki": wiki}, f, ensure_ascii=False, separators=(",", ":"))
    n_hp = sum(1 for k in img if k.startswith("HP:")); n_mo = len(img) - n_hp
    print(f"images.json: {n_hp} finding images, {n_mo} disease images ({len(titles) - len(info)} files unresolved), "
          f"{len(wiki)} Wikipedia links; excluded {sum(1 for t, _ in hp_rows if t in terms and excluded(t))} genital/breast terms")


if __name__ == "__main__":
    main()
