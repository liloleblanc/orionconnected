#!/usr/bin/env python3
"""Verify each generated monochrome SVG is truly single-colour.

A monochrome-black should contain ONLY #000000 (or #000, or 'black', or no
explicit fills at all — relying on the injected style block). Anything
non-black/grey is a leak.
A monochrome-white should contain ONLY #FFFFFF (or #FFF, 'white', or the
injected style block).

We allow:
  - "transparent" / "none" (no-fill values)
  - the target colour, in any form
  - inline <style> blocks that force everything to the target

We flag:
  - any other hex colour
  - any other named colour
  - any rgb() that isn't pure target
"""
import re
from pathlib import Path

HEX_RE = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
RGB_RE = re.compile(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', re.I)
# Named colours that aren't allowed
NAMED = re.compile(
    r'\b(red|orange|yellow|green|blue|purple|pink|brown|grey|gray|cyan|'
    r'magenta|navy|teal|maroon|olive|lime|aqua|silver|gold|indigo|violet|'
    r'crimson|coral|salmon|khaki|plum|tan|beige|ivory|azure|mintcream|'
    r'darkred|darkblue|darkgreen|lightblue|lightgreen|lightgrey|lightgray)\b',
    re.I)

def hex_to_rgb(h):
    if len(h) == 3: h = ''.join(c*2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def is_target_hex(h, target):
    r, g, b = hex_to_rgb(h)
    if target == 'black':
        return r < 20 and g < 20 and b < 20
    elif target == 'white':
        return r > 235 and g > 235 and b > 235

def is_target_rgb(r, g, b, target):
    if target == 'black':
        return int(r) < 20 and int(g) < 20 and int(b) < 20
    elif target == 'white':
        return int(r) > 235 and int(g) > 235 and int(b) > 235

def verify(path, target):
    """target = 'black' or 'white'. Returns list of leaks (empty = clean)."""
    text = path.read_text(encoding='utf-8', errors='replace')
    leaks = []
    # Strip XML comments
    body = re.sub(r'<!--.*?-->', '', text, flags=re.S)

    # Check every hex colour
    for m in HEX_RE.finditer(body):
        h = m.group(1)
        if not is_target_hex(h, target):
            leaks.append(f'hex #{h}')
    # Check every rgb()
    for m in RGB_RE.finditer(body):
        r, g, b = m.group(1), m.group(2), m.group(3)
        if not is_target_rgb(r, g, b, target):
            leaks.append(f'rgb({r},{g},{b})')
    # Check named colours
    # Strip out the names appearing INSIDE id="" / class="" / x="" attrs so we
    # don't false-positive on element IDs that happen to look like words.
    text_no_ids = re.sub(r'\sid="[^"]*"', '', body)
    text_no_ids = re.sub(r"\sid='[^']*'", '', text_no_ids)
    text_no_ids = re.sub(r'\sclass="[^"]*"', '', text_no_ids)
    text_no_ids = re.sub(r"\sclass='[^']*'", '', text_no_ids)
    # Only count named colours appearing in fill/stroke/stop-color/style contexts
    for m in re.finditer(r'(fill|stroke|stop-color|color)\s*[:=]\s*["\']?([a-zA-Z]+)', text_no_ids):
        attr, val = m.group(1), m.group(2).lower()
        if val in ('none', 'transparent', 'currentcolor', 'inherit'):
            continue
        if target == 'black' and val == 'black': continue
        if target == 'white' and val == 'white': continue
        if val in ('red','orange','yellow','green','blue','purple','pink',
                   'brown','grey','gray','cyan','magenta','navy','teal',
                   'maroon','olive','lime','aqua','silver','gold','indigo',
                   'violet','crimson','coral','salmon'):
            leaks.append(f'{attr}={val}')
    return leaks

# -- AIRLINE bundle --
airline_root = Path('/tmp/airline-work/out/logos/airlines')
accor_root = Path('/tmp/accor-work/out/logos/hotels')

total = {'clean': 0, 'leaky': 0}
leaky_files = []

for root, label in [(airline_root, 'airlines'), (accor_root, 'hotels')]:
    if not root.exists(): continue
    for p in sorted(root.rglob('*.svg')):
        name = p.name
        if name.endswith('-monochrome-black.svg'):
            target = 'black'
        elif name.endswith('-monochrome-white.svg'):
            target = 'white'
        else:
            continue
        leaks = verify(p, target)
        if leaks:
            total['leaky'] += 1
            # Dedupe leak list per file
            unique = sorted(set(leaks))[:5]
            leaky_files.append((str(p.relative_to(root.parent)), target, unique))
        else:
            total['clean'] += 1

print(f"Total monochrome SVGs verified: {total['clean'] + total['leaky']}")
print(f"  ✓ Clean:  {total['clean']}")
print(f"  ✗ Leaky:  {total['leaky']}")
if leaky_files:
    print(f"\n=== LEAKY FILES ({len(leaky_files)}) ===")
    for path, target, leaks in leaky_files:
        print(f"  [{target:>5}] {path}")
        for l in leaks:
            print(f"          ↳ {l}")
