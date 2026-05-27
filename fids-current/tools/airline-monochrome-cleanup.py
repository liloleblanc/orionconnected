#!/usr/bin/env python3
"""Generate monochrome-black + monochrome-white silhouettes for every airline
SVG that doesn't already have them.

Skip rules:
  • any file already ending in -monochrome-black.svg or -monochrome-white.svg
  • any file already ending in -wordmark-dark.svg or -wordmark-light.svg
    (these serve as the b/w pair for text-only contexts — leave alone)
  • any file ending in -white.svg or -on-black.svg / -on-light.svg
    (already a brand-supplied b/w variant)
  • PNG / JPG / WEBP / AVIF — can't text-swap rasters

For each kept file:
  • monochrome-black variant: every fill / stroke colour set to #000000
  • monochrome-white variant: every fill / stroke colour set to #FFFFFF
  • SVGs without any fill declaration get a forced <style> block injected
"""
import re
import shutil
from pathlib import Path

SRC = Path('/tmp/airline-work/logos/airlines')
OUT = Path('/tmp/airline-work/out/logos/airlines')

# What to skip
SKIP_SUFFIX = (
    '-monochrome-black.svg', '-monochrome-white.svg',
    '-wordmark-dark.svg',    '-wordmark-light.svg',
    '-on-black.svg',         '-on-light.svg', '-on-white.svg',
    '-white.svg',
    '_white_wordmark.svg',   '_wordmark.svg',
)
# These specific file STEMS are too noisy / aren't really airline logos
SKIP_STEMS = {
    'AC.TO_BIG.D (1)',  # the literal " (1)" duplicate
}

HEX_RE = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')

def make_monochrome(svg_text: str, target_hex: str) -> str:
    """Set every fill / stroke colour in the SVG to target_hex."""
    out = svg_text
    # Named colours and CSS keywords
    for old in ['"black"', "'black'", '"white"', "'white'",
                ':black', ': black', ':white', ': white',
                'currentColor', 'currentcolor']:
        # All these become the target colour
        out = out.replace(old, f'"{target_hex}"' if old.startswith(('"', "'")) else f':{target_hex}')
    # Fix the colon-form replacements (we may have produced ":#FFFFFF" inside attrs accidentally)
    out = out.replace(':"' + target_hex + '"', ':' + target_hex)  # defensive
    # Swap every hex colour to the target
    out = HEX_RE.sub(target_hex, out)
    # Swap rgb() forms
    out = re.sub(r'rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)', target_hex, out)
    # If no fill at all, inject a style block
    if not re.search(r'(?:fill\s*[=:]|<style)', out, re.IGNORECASE):
        out = re.sub(r'(<svg[^>]*?>)', r'\1<style>*{fill:' + target_hex + ';stroke:' + target_hex + '}</style>', out, count=1)
    return out

def is_skip(name: str) -> bool:
    n = name.lower()
    if any(n.endswith(s.lower()) for s in SKIP_SUFFIX):
        return True
    stem = name.rsplit('.', 1)[0]
    if stem in SKIP_STEMS:
        return True
    if name.startswith('.') or name == '.DS_Store':
        return True
    return False

stats = {'processed': 0, 'skipped': 0, 'black_generated': 0, 'white_generated': 0}
manifest = []

for svg in sorted(SRC.rglob('*.svg')):
    rel = svg.relative_to(SRC)        # e.g. us-major/jetblue.svg
    name = svg.name
    dest_dir = OUT / rel.parent
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Always copy the original file through (so the output bundle is complete)
    shutil.copy2(svg, dest_dir / name)

    if is_skip(name):
        stats['skipped'] += 1
        manifest.append((str(rel.parent), name, 'kept-as-is'))
        continue

    stats['processed'] += 1
    stem = name[:-4]  # strip .svg
    text = svg.read_text(encoding='utf-8', errors='replace')

    black_name = f'{stem}-monochrome-black.svg'
    if not (SRC / rel.parent / black_name).exists():
        (dest_dir / black_name).write_text(make_monochrome(text, '#000000'), encoding='utf-8')
        stats['black_generated'] += 1
        manifest.append((str(rel.parent), black_name, 'black-generated'))

    white_name = f'{stem}-monochrome-white.svg'
    if not (SRC / rel.parent / white_name).exists():
        (dest_dir / white_name).write_text(make_monochrome(text, '#FFFFFF'), encoding='utf-8')
        stats['white_generated'] += 1
        manifest.append((str(rel.parent), white_name, 'white-generated'))

print('STATS:', stats)
print('\nPer-folder count after generation:')
for folder in sorted(OUT.iterdir()):
    if folder.is_dir():
        files = list(folder.glob('*.svg'))
        new = sum(1 for f in files if '-monochrome-' in f.name)
        print(f'  {folder.name}: {len(files)} svg ({new} monochrome variants)')

Path('/tmp/airline-work/airlines-manifest.tsv').write_text(
    'folder\tfilename\trole\n' + '\n'.join('\t'.join(r) for r in manifest),
    encoding='utf-8')
print(f'\nManifest: /tmp/airline-work/airlines-manifest.tsv')
