#!/usr/bin/env python3
"""Logo cleanup processor for the Accor batch.

Reads SVGs from a source folder, programmatically produces white variants
from monochrome-black files, then sorts everything into Accor tier folders
plus a couple of small "stray" buckets.

Output structure written into /tmp/accor-work/out/:

  logos/hotels/accor-luxury/
  logos/hotels/accor-premium/
  logos/hotels/accor-midscale/
  logos/hotels/accor-economy/
  logos/hotels/accor-other/
  logos/advertisements/retro-airlines/   (AirNova, AirToronto)
  logos/advertisements/misc/              (mr porter pieces — confirm with user)
  logos/airports/                         (MCO airport logo)
  logos/airlines/canadian/                (westjet leaf b+w)
  logos/airlines/us-major/                (united emblem)

For every Accor -monochrome-black.svg the script writes both the original
black file and a generated -monochrome-white.svg with fill colours swapped.
"""
import re
import shutil
from pathlib import Path

SRC = Path('/tmp/accor-work/Logos')
OUT = Path('/tmp/accor-work/out/logos')
OUT.mkdir(parents=True, exist_ok=True)

# Accor brand → tier classification (based on Accor's official portfolio structure)
ACCOR_TIER = {
    # Luxury & Lifestyle
    'raffles': 'luxury', 'orientexpress': 'luxury', 'fairmont': 'luxury',
    'sofitellegend': 'luxury', 'sofitel': 'premium',  # sofitel is premium per Accor; legend is luxury
    'banyan': 'luxury', 'faena': 'luxury',
    'mondrian': 'luxury', 'delano': 'luxury', 'Delano-Logo-Monochrome': 'luxury',
    'SLS': 'luxury', 'hyde': 'luxury', 'rixos': 'luxury',
    '21cmuseum': 'luxury', 'onefinestay': 'luxury',
    'parissociety': 'luxury', 'mantis': 'luxury',
    'emblems': 'luxury',                          # Emblems Collection
    'SO': 'luxury',                                # SO / Hotels (lifestyle-lux)
    # Premium
    'pullman': 'premium', 'mgallery': 'premium',
    'movenpick': 'premium', 'swissotel': 'premium',
    'angsana': 'premium', 'artseries': 'premium',
    # Midscale / Premium economy
    'novotel': 'midscale', 'mercure': 'midscale', 'grandmercure': 'midscale',
    'mantra': 'midscale', 'BreakFree': 'midscale',
    'adagioaccess': 'midscale', 'adagiooriginal': 'midscale', 'adagiopremium': 'midscale',
    'peppers': 'midscale', 'thesebel': 'midscale',
    'handwritten': 'midscale', 'mamashelter': 'midscale',
    '25th': 'midscale',                            # 25hours
    'tribe': 'midscale', 'thehoxton': 'midscale',
    'morgansoriginals': 'midscale',
    # Economy
    'ibis': 'economy', 'ibisstyles': 'economy', 'ibisbudget': 'economy',
    'greet': 'economy', 'hotelF1': 'economy',
    'jo&joe': 'economy', 'Homm': 'economy',
    # Other / Partner brands (Banyan group, Huazhu partners)
    'cassia': 'other', 'dhawa': 'other', 'garrya': 'other',
    'huazhu': 'other', 'folio': 'other', 'thalassa': 'other', 'purist': 'other',
}

# Strays — not Accor, route elsewhere
STRAYS = {
    'AirNova.svg':                        ('advertisements/retro-airlines', None),
    'AirToronto.svg':                     ('advertisements/retro-airlines', None),
    'MCO_airport_logo.svg':               ('airports', None),
    'met_mr_porter_drink.svg':            ('advertisements/misc', None),
    'met_hero_on_va_vous_mr_p.svg':       ('advertisements/misc', None),
    'westjet-leaf-monochrome-black.svg':  ('airlines/canadian', None),
    'westjet-leaf-monochrome-white.svg':  ('airlines/canadian', None),
    'unitedairlines-emblem-black.svg':    ('airlines/us-major', None),
}

# Color-swap rules (any dark colour → white). Smart luminance-based detection:
# anything with a BT.601 luminance below the threshold is considered "ink" and
# gets flipped to white. Anything brighter (brand accent colours) is preserved.
HEX_RE = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
DARK_LUMA = 60   # 0–255 scale; #404040 is luma ~64, so this keeps mid-grey safe

def _luma(h):
    if len(h) == 3: h = ''.join(c*2 for c in h)
    r = int(h[0:2], 16); g = int(h[2:4], 16); b = int(h[4:6], 16)
    return (r*299 + g*587 + b*114) / 1000

def _swap_hex(m):
    return '#FFFFFF' if _luma(m.group(1).upper()) < DARK_LUMA else m.group(0)

def make_white(black_text: str) -> str:
    out = black_text
    # Named black + currentColor
    for old, new in [
        ('"black"', '"white"'),
        ('"Black"', '"white"'),
        ("'black'", "'white'"),
        (':black',  ':white'),
        (': black', ': white'),
        ('currentColor', '#FFFFFF'),
        ('currentcolor', '#FFFFFF'),
    ]:
        out = out.replace(old, new)
    # rgb() forms (catch near-black before they slip through)
    out = re.sub(
        r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)',
        lambda m: 'rgb(255,255,255)' if (int(m[1])*299 + int(m[2])*587 + int(m[3])*114)/1000 < DARK_LUMA else m.group(0),
        out)
    # Hex colours (the big one — handles #000, #070809, etc.)
    out = HEX_RE.sub(_swap_hex, out)
    # If the SVG has no fill declaration anywhere, the renderer uses inherited
    # currentColor (defaults to black). Inject a style block to force white.
    if not re.search(r'(?:fill\s*[=:]|<style)', out, re.IGNORECASE):
        out = re.sub(r'(<svg[^>]*?>)', r'\1<style>*{fill:#FFFFFF;stroke:#FFFFFF}</style>', out, count=1)
    return out

def stem(filename: str) -> str:
    """Strip -monochrome-black.svg / -monochrome-white.svg / .svg."""
    s = filename
    for tail in ('-monochrome-black.svg', '-monochrome-white.svg', '-Monochrome-black.svg', '.svg'):
        if s.endswith(tail):
            return s[:-len(tail)]
    return s

def is_accor(fname: str) -> bool:
    if fname in STRAYS:
        return False
    return fname not in STRAYS and ('-monochrome-black' in fname.lower() or '-monochrome-Black' in fname)

# Process
stats = {'accor_black': 0, 'accor_white_generated': 0, 'strays': 0, 'skipped': 0}
manifest_rows = []

for svg in sorted(SRC.glob('*.svg')):
    if svg.name.startswith('.') or svg.name == '.DS_Store':
        stats['skipped'] += 1
        continue
    name = svg.name
    if name in STRAYS:
        target_dir, _ = STRAYS[name]
        dest_dir = OUT / target_dir
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(svg, dest_dir / name)
        manifest_rows.append((target_dir, name, 'stray'))
        stats['strays'] += 1
        continue
    if not is_accor(name):
        # File that's not classified — drop in accor-other for safety, flag manifest
        dest_dir = OUT / 'hotels' / 'accor-other'
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(svg, dest_dir / name)
        manifest_rows.append(('hotels/accor-other', name, 'unclassified'))
        continue
    # Find Accor brand stem
    st = stem(name)
    tier = ACCOR_TIER.get(st)
    if tier is None:
        # Last-ditch lookup with normalised stem (lowercase)
        tier = ACCOR_TIER.get(st.lower())
    if tier is None:
        tier = 'other'
    dest_dir = OUT / 'hotels' / f'accor-{tier}'
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Copy the original (black)
    shutil.copy2(svg, dest_dir / name)
    manifest_rows.append((f'hotels/accor-{tier}', name, 'black'))
    stats['accor_black'] += 1
    # Generate the white variant
    black_text = svg.read_text(encoding='utf-8', errors='replace')
    white_text = make_white(black_text)
    white_name = name.replace('-monochrome-black.svg', '-monochrome-white.svg')\
                     .replace('-Monochrome-black.svg', '-Monochrome-white.svg')
    if white_name == name:  # didn't end in the expected suffix
        white_name = name[:-4] + '-white.svg'
    (dest_dir / white_name).write_text(white_text, encoding='utf-8')
    manifest_rows.append((f'hotels/accor-{tier}', white_name, 'white-generated'))
    stats['accor_white_generated'] += 1

print("STATS:", stats)
print()
print("Folder counts:")
for folder in sorted(OUT.rglob('*')):
    if folder.is_dir() and any(folder.iterdir()):
        files = list(folder.glob('*.svg'))
        print(f"  {folder.relative_to(OUT)}: {len(files)} files")

# Save manifest
manifest_path = Path('/tmp/accor-work/manifest.txt')
manifest_path.write_text(
    'folder\tfilename\trole\n' +
    '\n'.join('\t'.join(r) for r in manifest_rows),
    encoding='utf-8'
)
print(f"\nManifest: {manifest_path}")
