#!/usr/bin/env python3
"""
build-asset-manifest.py  —  the asset SORTER.

Walks the static asset tree (logos/, assets/) and produces ONE unified,
browsable manifest: assets/asset-manifest.json

This is regenerable DATA, per ARCHITECTURE.md (The One Rule). When assets
change, you RE-RUN this — you never hand-edit the manifest or patch a viewer.

Categories are derived from the real folder structure, not invented.
Existing per-folder MANIFEST.json metadata (airline name, IATA, country)
is merged in where present so the browser can show real labels.

Usage:
    python3 build-asset-manifest.py /path/to/site-root
    (defaults to current directory)
"""

import os, sys, json, datetime

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.getcwd()

ASSET_EXT = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov", ".eps"}
SKIP = {".DS_Store"}

# ── Category map: folder prefix -> (category, subcategory, human label) ──
# Order matters: first match wins, so put more specific paths first.
RULES = [
    ("logos/airline-tiles",            "airline", "tile",            "Airline tile logos (row icons)"),
    ("logos/icao-icons",               "airline", "archive",         "Airline icons (archive / deep fallback)"),
    ("logos/symbols/airlines-mono",    "airline", "symbol-mono",     "Airline symbols (monochrome)"),
    ("logos/symbols/airlines",         "airline", "symbol",          "Airline symbols (emblem only)"),
    ("logos/wordmarks-mono",           "airline", "wordmark-mono",   "Airline wordmarks (monochrome)"),
    ("logos/wordmarks",                "airline", "wordmark",        "Airline wordmarks"),
    ("logos/airlines/canadian-regional","airline","canadian-regional","Airlines — Canadian regional"),
    ("logos/airlines/canadian",        "airline", "canadian",        "Airlines — Canadian"),
    ("logos/airlines/us-major",        "airline", "us-major",        "Airlines — US major"),
    ("logos/airlines/us-regional",     "airline", "us-regional",     "Airlines — US regional"),
    ("logos/airlines/european",        "airline", "european",        "Airlines — European"),
    ("logos/airlines/asian-other",     "airline", "asian-other",     "Airlines — Asian & other"),
    ("logos/airlines/alliances",       "airline", "alliance",        "Airline alliances"),
    ("logos/airlines/other",           "airline", "other",           "Airlines — other"),
    ("logos/airlines",                 "airline", "misc",            "Airlines — misc"),
    ("logos/tails-modern",             "livery",  "tail-modern",     "Aircraft tails (modern)"),
    ("logos/tails-fake",               "livery",  "tail-fake",       "Aircraft tails (placeholder)"),
    ("logos/hotels/accor-luxury",      "hotel",   "accor-luxury",    "Hotels — Accor Luxury"),
    ("logos/hotels/accor-premium",     "hotel",   "accor-premium",   "Hotels — Accor Premium"),
    ("logos/hotels/accor-midscale",    "hotel",   "accor-midscale",  "Hotels — Accor Midscale"),
    ("logos/hotels/accor-economy",     "hotel",   "accor-economy",   "Hotels — Accor Economy"),
    ("logos/hotels/accor-corporate",   "hotel",   "accor-corporate", "Hotels — Accor Corporate"),
    ("logos/hotels/accor-other",       "hotel",   "accor-other",     "Hotels — Accor other"),
    ("logos/hotels/sofitel",           "hotel",   "sofitel",         "Hotels — Sofitel"),
    ("logos/hotels/marriott",          "hotel",   "marriott",        "Hotels — Marriott"),
    ("logos/hotels/hilton",            "hotel",   "hilton",          "Hotels — Hilton"),
    ("logos/hotels/ihg",               "hotel",   "ihg",             "Hotels — IHG"),
    ("logos/hotels/hyatt",             "hotel",   "hyatt",           "Hotels — Hyatt"),
    ("logos/hotels/wyndham",           "hotel",   "wyndham",         "Hotels — Wyndham"),
    ("logos/hotels/choice-le-meridien","hotel",   "choice",          "Hotels — Choice / Le Meridien"),
    ("logos/hotels/other-chains",      "hotel",   "other-chains",    "Hotels — other chains"),
    ("logos/hotels",                   "hotel",   "misc",            "Hotels — misc"),
    ("assets/logos/hotels",            "hotel",   "misc",            "Hotels — misc (assets)"),
    ("logos/Backgrounds",              "background","airline-bg",     "Backgrounds (airline-themed)"),
    ("logos/advertisements",           "ad",      "house",           "Advertisements"),
    ("logos/symbols-utility",          "symbol",  "utility",         "Utility symbols"),
    ("logos/symbols",                  "symbol",  "misc",            "Symbols — misc"),
    ("logos/weather",                  "weather", "icon",            "Weather icons"),
    ("logos",                          "misc",    "root",            "Uncategorized (logos root)"),
    ("assets",                         "misc",    "assets",          "Uncategorized (assets root)"),
]

def classify(relpath):
    p = relpath.replace("\\", "/")
    for prefix, cat, sub, label in RULES:
        if p.startswith(prefix + "/") or p == prefix:
            return cat, sub, label
    return "misc", "unknown", "Uncategorized"

# ── Load any existing per-folder MANIFEST.json metadata (name/iata/country) ──
def load_existing_meta():
    meta = {}  # relpath -> {name, iata, country}
    for folder in ("logos/airline-tiles", "logos/icao-icons"):
        mpath = os.path.join(ROOT, folder, "MANIFEST.json")
        if not os.path.isfile(mpath):
            continue
        try:
            with open(mpath) as f:
                data = json.load(f)
            for section in ("commercial", "military"):
                for code, info in (data.get(section) or {}).items():
                    fn = info.get("file")
                    if fn:
                        meta[f"{folder}/{fn}"] = {
                            "name": info.get("name", ""),
                            "iata": info.get("iata", ""),
                            "country": info.get("country", ""),
                        }
        except Exception as e:
            print(f"  (skipped {mpath}: {e})")
    return meta

def nice_name(filename):
    base = os.path.splitext(filename)[0]
    return base.replace("-", " ").replace("_", " ").strip()

def main():
    existing = load_existing_meta()
    items = []
    counts = {}

    for dirpath, dirnames, filenames in os.walk(ROOT):
        # only walk inside logos/ and assets/
        rel_dir = os.path.relpath(dirpath, ROOT).replace("\\", "/")
        if not (rel_dir == "logos" or rel_dir.startswith("logos/")
                or rel_dir == "assets" or rel_dir.startswith("assets/")):
            continue
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext in SKIP or ext not in ASSET_EXT:
                continue
            rel = f"{rel_dir}/{fn}" if rel_dir != "." else fn
            cat, sub, label = classify(rel)
            m = existing.get(rel, {})
            items.append({
                "path": "/" + rel,                 # exact URL the screens use
                "file": fn,
                "category": cat,
                "subcategory": sub,
                "group": label,
                "name": m.get("name") or nice_name(fn),
                "iata": m.get("iata", ""),
                "country": m.get("country", ""),
                "ext": ext.lstrip("."),
            })
            counts[cat] = counts.get(cat, 0) + 1

    items.sort(key=lambda x: (x["category"], x["subcategory"], x["file"].lower()))

    manifest = {
        "_meta": {
            "description": "Unified, browsable catalog of all static assets. "
                           "Regenerable DATA per ARCHITECTURE.md — re-run "
                           "build-asset-manifest.py to update; never hand-edit.",
            "generated": datetime.datetime.utcnow().isoformat() + "Z",
            "total": len(items),
            "by_category": counts,
        },
        "items": items,
    }

    out_dir = os.path.join(ROOT, "assets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "asset-manifest.json")
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"Wrote {out_path}")
    print(f"Total assets sorted: {len(items)}")
    for c in sorted(counts):
        print(f"  {c:12} {counts[c]}")

if __name__ == "__main__":
    main()
