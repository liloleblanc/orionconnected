#!/usr/bin/env python3
"""Propose a duplicate cleanup PER FORMAT.

For each carrier folder, group files by carrier stem, then within each carrier
by FORMAT category (full / symbol / stacked / tail / roundel / wordmark-short /
wordmark-long / wordmark-mono-light / wordmark-mono-dark / monochrome-black /
monochrome-white / sub-brand). Within a format group, pick one canonical file
and mark the rest as deletion candidates.

DOES NOT delete anything. Writes /tmp/airline-work/cleanup-proposal.txt:
  KEEP: <path>      <reason>
  DELETE: <path>    <duplicate-of>
"""
import re
from pathlib import Path
from collections import defaultdict

SRC = Path('/tmp/airline-work/logos/airlines')

# Carrier stems we recognise. Order matters — longer / more specific first.
# Each maps to a canonical carrier key.
CARRIER_PATTERNS = [
    # US Major + sub-brands
    ('american-airlines',  'american-airlines'),
    ('american_airlines',  'american-airlines'),
    ('american-wordmark',  'american-wordmark-short'),  # the SHORT "American" wordmark
    ('american-flight',    'american-flight-symbol'),
    ('american-airlines-logo', 'american-airlines'),
    ('american',           'american-airlines'),         # bare "american" → AA
    ('aaadvantage',        'aaadvantage'),                # AA loyalty programme — separate brand
    ('united_airlines',    'united-airlines'),
    ('united-airlines',    'united-airlines'),
    ('united-globe',       'united-globe-symbol'),
    ('united-rebrand',     'united-airlines'),
    ('united',             'united-airlines'),
    ('delta_airlines',     'delta'),
    ('delta-airlines',     'delta'),
    ('delta-hotels',       'delta-hotels'),
    ('delta-widget',       'delta-widget'),
    ('delta-on-black',     'delta'),
    ('delta',              'delta'),
    ('southwest',          'southwest'),
    ('alaska-airlines',    'alaska'),
    ('alaska',             'alaska'),
    ('jetblue',            'jetblue'),
    ('hawaiian-airlines',  'hawaiian'),
    ('hawaiian_airlines',  'hawaiian'),
    ('hawaiian-pualani',   'hawaiian-pualani-symbol'),
    ('hawaiian',           'hawaiian'),
    ('Hawaiian',           'hawaiian'),
    ('frontier-emblem',    'frontier-emblem'),
    ('frontier',           'frontier'),
    ('spirit',             'spirit'),
    ('breeze-airways',     'breeze'),
    ('breeze',             'breeze'),
    ('mokulele-emblem',    'mokulele-emblem'),
    ('mokulele',           'mokulele'),
    # Canadian + sub-brands
    ('air-canada-aeroplan','air-canada-aeroplan'),  # AC+Aeroplan combination
    ('air-canada-big',     'air-canada'),
    ('air-canada-logo',    'air-canada'),
    ('air-canada-white',   'air-canada-white'),
    ('air-canada-wordmark','air-canada-wordmark'),
    ('air-canada@logotyp', 'air-canada'),
    ('air-canada',         'air-canada'),
    ('logo-air-canada',    'air-canada'),
    ('Air_Canada_Logo_2017_stacked_variant', 'air-canada-stacked-variant'),
    ('Air_Canada_Logo_2017_stacked', 'air-canada-stacked'),
    ('ACAEROPLANStar',     'aeroplan-star'),
    ('Aeroplan2',          'aeroplan'),
    ('aeroplan',           'aeroplan'),
    ('Air-Canada-Aeroplan','air-canada-aeroplan'),
    ('AC-tail-reversed',   'ac-tail'),
    ('ac-roundel',         'ac-roundel'),
    ('AC.TO_BIG.D',        'ac-toronto-bigd'),     # all caps "AC.TO"
    ('AC.TO_BIG',          'ac-toronto-big'),
    ('AC.TO',              'ac-toronto'),
    ('air-transat',        'transat'),
    ('transat',            'transat'),
    ('westjet-leaf',       'westjet-leaf-symbol'),
    ('WestJet_Logo_2018_white_wordmark','westjet-wordmark-light'),
    ('WestJet_Logo_2018',  'westjet'),
    ('WestJet_Logo_2016_symbol','westjet-symbol'),
    ('westjet-encore',     'westjet-encore'),
    ('westjet',            'westjet'),
    ('mr-porter',          'mr-porter'),
    ('viporter-wordmark',  'viporter-wordmark'),
    ('viporter',           'viporter'),
    ('Porter_Airlines_Logo_2006', 'porter-classic-2006'),
    ('porter_classic',     'porter-classic'),
    ('porter_airlines_logo','porter'),
    ('porter-wordmark',    'porter-wordmark'),
    ('porter-white',       'porter-white'),
    ('porter',             'porter'),
    ('flair-wordmark',     'flair-wordmark'),
    ('flair',              'flair'),
    ('encore',             'westjet-encore'),
    ('rouge-icon',         'rouge-icon'),
    ('rouge',              'rouge'),
    ('PAL_Airlines_Canada_Logo','pal-airlines'),
    ('PAL-Airlines',       'pal-airlines'),
    ('pal-airlines-wordmark','pal-airlines-wordmark'),
    ('pal-square',         'pal-square'),
    ('pal-symbol',         'pal-symbol'),
    # Canadian regional
    ('aircanada-express',  'aircanada-express'),
    ('jazz-wordmark',      'jazz-wordmark'),
    ('jazz',               'jazz'),
    ('calmair',            'calm-air'),
    ('canadian-north',     'canadian-north'),
    ('firstair',           'first-air'),
    ('airinuit',           'air-inuit'),
    ('airnorth',           'air-north'),
    ('pascan',             'pascan'),
    ('perimeter-aviation-logo','perimeter-aviation'),
    ('Perimeter_Aviation_Logo','perimeter-aviation'),
    # US regional
    ('endeavor-air',       'endeavor-air'),
    ('skywest-airlines-logo','skywest'),
    ('skywest-airlines',   'skywest'),
    ('Skywest-Airlines',   'skywest'),
    ('mesa-airlines',      'mesa-airlines'),
    ('psa-airlines',       'psa-airlines'),
    ('psa',                'psa-airlines'),
    ('PSa',                'psa-airlines'),
    ('Piedmont_Airlines_Logo','piedmont'),
    ('piedmont',           'piedmont'),
    ('Piedmont',           'piedmont'),
    ('republic',           'republic'),
    ('horizon-air',        'horizon-air'),
    ('gojet',              'gojet'),
    ('Envoy',              'envoy'),
    ('envoy',              'envoy'),
    ('comair',             'comair'),
]

# Format classifiers (applied to a "remainder" after stripping the carrier stem)
FORMAT_PATTERNS = [
    ('monochrome-black',  re.compile(r'monochrome[-_]black', re.I)),
    ('monochrome-white',  re.compile(r'monochrome[-_]white', re.I)),
    ('wordmark-dark',     re.compile(r'wordmark[-_]dark', re.I)),
    ('wordmark-light',    re.compile(r'wordmark[-_]light', re.I)),
    ('wordmark',          re.compile(r'wordmark', re.I)),
    ('emblem-symbol',     re.compile(r'emblem|symbol|tail|roundel|globe|maple|swoosh', re.I)),
    ('stacked',           re.compile(r'stacked', re.I)),
    ('white',             re.compile(r'-white|on[-_]black|reversed', re.I)),
    ('alternative',       re.compile(r'alternative', re.I)),
    ('classic',           re.compile(r'classic', re.I)),
    ('icon',              re.compile(r'icon', re.I)),
    ('square',            re.compile(r'square|tile|badge', re.I)),
]

# Sources we consider LOW quality / unwanted duplicates
LOW_QUALITY_PATTERNS = [
    re.compile(r'freelogovectors', re.I),
    re.compile(r'\s\(\d+\)\.svg$', re.I),       # " (1).svg" duplicates
    re.compile(r'@logotyp', re.I),               # community trace
]

def classify_carrier(fname: str) -> str:
    stem = fname.rsplit('.', 1)[0]
    for pat, carrier in CARRIER_PATTERNS:
        if pat.lower() in stem.lower() or stem.lower().startswith(pat.lower()):
            return carrier
    # Otherwise use the stem with extension stripped + variant markers stripped
    s = stem.lower()
    for tail in ('-wordmark-dark', '-wordmark-light', '-wordmark', '-monochrome-black', '-monochrome-white', '-white', '-icon', '-emblem', '-symbol', '-square'):
        if s.endswith(tail):
            s = s[:-len(tail)]
            break
    return s

def classify_format(fname: str, carrier: str) -> str:
    stem = fname.rsplit('.', 1)[0]
    for label, rx in FORMAT_PATTERNS:
        if rx.search(stem):
            return label
    return 'full'  # default: full combination lockup

def score_quality(p: Path) -> int:
    """Higher = better. Used to pick the canonical within a format bucket."""
    fname = p.name
    score = 0
    ext = p.suffix.lower()
    if ext == '.svg': score += 100   # vector wins
    elif ext == '.png': score += 50
    elif ext in ('.webp', '.avif'): score += 30
    elif ext == '.jpg' or ext == '.jpeg': score += 10
    else: score += 5
    # Penalise low-quality sources
    for rx in LOW_QUALITY_PATTERNS:
        if rx.search(fname):
            score -= 200
    # Prefer simpler shorter names (canonical)
    score -= len(fname) // 5
    # Prefer files with no version suffix
    if re.search(r'\d+\.svg$', fname): score -= 10
    if 'logo' in fname.lower(): score -= 5    # "<carrier>-logo.svg" usually redundant
    return score

# Build inventory
by_carrier = defaultdict(lambda: defaultdict(list))

for p in sorted(SRC.rglob('*')):
    if not p.is_file():
        continue
    if p.name.startswith('.') or p.name == '.DS_Store':
        continue
    rel = p.relative_to(SRC)
    folder = str(rel.parent)
    carrier = classify_carrier(p.name)
    fmt = classify_format(p.name, carrier)
    key = (folder, carrier)
    by_carrier[key][fmt].append(p)

# Produce proposal
keep_list = []
delete_list = []

for (folder, carrier), fmts in sorted(by_carrier.items()):
    for fmt, files in sorted(fmts.items()):
        files_sorted = sorted(files, key=score_quality, reverse=True)
        canonical = files_sorted[0]
        keep_list.append((folder, canonical.name, f'canonical {fmt} for {carrier}'))
        for f in files_sorted[1:]:
            delete_list.append((folder, f.name, f'dup of {fmt}: kept {canonical.name}'))

# Write proposal
out_path = Path('/tmp/airline-work/cleanup-proposal.txt')
with out_path.open('w') as f:
    f.write(f"=== CLEANUP PROPOSAL ===\n")
    f.write(f"Total files: {sum(len(v) for fmts in by_carrier.values() for v in fmts.values())}\n")
    f.write(f"KEEP: {len(keep_list)}    DELETE: {len(delete_list)}\n\n")
    f.write("=== TO DELETE ===\n")
    for folder, name, reason in delete_list:
        f.write(f"  {folder}/{name}\n      → {reason}\n")
    f.write("\n=== TO KEEP (one per format per carrier) ===\n")
    last_carrier = None
    for folder, name, reason in keep_list:
        if reason != last_carrier:
            f.write(f"\n[{folder}] {reason}\n")
            last_carrier = reason
        f.write(f"  KEEP  {name}\n")

print(f"KEEP: {len(keep_list)}    DELETE: {len(delete_list)}")
print(f"Proposal written to {out_path}")
