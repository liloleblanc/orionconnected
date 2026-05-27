#!/usr/bin/env python3
"""Force every -monochrome-black.svg / -monochrome-white.svg to be truly
single-colour. Every fill, stroke, stop-color, and CSS colour reference
is collapsed to the target colour.

Preserved: 'none', 'transparent', inherit/currentColor (already swapped).
"""
import re
from pathlib import Path

HEX_RE = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b')
RGB_RE = re.compile(r'rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)', re.I)
RGBA_RE = re.compile(r'rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)', re.I)
HSL_RE = re.compile(r'hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)', re.I)

# Named CSS colours that map to colour values (we strip these inside fill/stroke/stop-color)
NAMED_COLOURS = {
    'red','orange','yellow','green','blue','purple','pink','brown','grey',
    'gray','cyan','magenta','navy','teal','maroon','olive','lime','aqua',
    'silver','gold','indigo','violet','crimson','coral','salmon','khaki',
    'plum','tan','beige','ivory','azure','mintcream','darkred','darkblue',
    'darkgreen','lightblue','lightgreen','lightgrey','lightgray','darkgray',
    'darkgrey','dimgray','dimgrey','aliceblue','antiquewhite','aquamarine',
    'bisque','blanchedalmond','blueviolet','burlywood','cadetblue',
    'chartreuse','chocolate','cornflowerblue','cornsilk','darkblue',
    'darkcyan','darkgoldenrod','darkkhaki','darkmagenta','darkolivegreen',
    'darkorange','darkorchid','darkred','darksalmon','darkseagreen',
    'darkslateblue','darkslategray','darkslategrey','darkturquoise',
    'darkviolet','deeppink','deepskyblue','firebrick','floralwhite',
    'forestgreen','fuchsia','gainsboro','ghostwhite','goldenrod',
    'greenyellow','honeydew','hotpink','indianred','lavender','lavenderblush',
    'lawngreen','lemonchiffon','lightcoral','lightcyan','lightgoldenrodyellow',
    'lightpink','lightsalmon','lightseagreen','lightskyblue','lightslategray',
    'lightslategrey','lightsteelblue','lightyellow','linen','mediumaquamarine',
    'mediumblue','mediumorchid','mediumpurple','mediumseagreen',
    'mediumslateblue','mediumspringgreen','mediumturquoise','mediumvioletred',
    'midnightblue','mistyrose','moccasin','navajowhite','oldlace','olivedrab',
    'orangered','orchid','palegoldenrod','palegreen','paleturquoise',
    'palevioletred','papayawhip','peachpuff','peru','powderblue',
    'rebeccapurple','rosybrown','royalblue','saddlebrown','sandybrown',
    'seagreen','seashell','sienna','skyblue','slateblue','slategray',
    'slategrey','snow','springgreen','steelblue','thistle','tomato',
    'turquoise','wheat','whitesmoke','yellowgreen',
}
PRESERVE = {'none', 'transparent', 'inherit', 'currentcolor'}

def force_pure(text, target_hex):
    """Replace every colour in fills/strokes/stops/style with target_hex.
    Preserve 'none' / 'transparent' / 'inherit'.
    """
    target = target_hex
    out = text
    # 1) currentColor → target
    out = re.sub(r'\bcurrentColor\b', target, out, flags=re.I)

    # 2) Hex colours (anywhere) → target. Allowing this to be broad is fine
    #    because we're forcing the whole file to one colour.
    out = HEX_RE.sub(target, out)

    # 3) rgb() / rgba() / hsl() → target
    out = RGB_RE.sub(target, out)
    # rgba: preserve alpha? Simpler — fold to target hex too (alpha becomes
    # implicit 1.0). If you need true transparency use fill-opacity attr.
    out = RGBA_RE.sub(target, out)
    out = HSL_RE.sub(target, out)

    # 4) Named colour attributes: fill="red", stroke='blue', stop-color: gray, etc.
    def _swap_attr(m):
        attr = m.group(1)
        quote = m.group(2) or ''
        val = m.group(3).lower()
        if val in PRESERVE:
            return m.group(0)
        if val == 'black' and target.lower() == '#000000':
            return m.group(0)
        if val == 'white' and target.lower() == '#ffffff':
            return m.group(0)
        if val in NAMED_COLOURS or val in ('black', 'white'):
            return f'{attr}={quote}{target}{quote}'
        return m.group(0)
    out = re.sub(
        r'(fill|stroke|stop-color|color)\s*=\s*(["\']?)([a-zA-Z]+)\2',
        _swap_attr, out, flags=re.I)

    # 5) CSS-property form inside style attributes / blocks
    def _swap_css(m):
        prop = m.group(1)
        val = m.group(2).strip().lower()
        if val in PRESERVE:
            return m.group(0)
        if val == 'black' and target.lower() == '#000000':
            return m.group(0)
        if val == 'white' and target.lower() == '#ffffff':
            return m.group(0)
        if val in NAMED_COLOURS or val in ('black', 'white'):
            return f'{prop}:{target}'
        return m.group(0)
    out = re.sub(
        r'\b(fill|stroke|stop-color|color)\s*:\s*([a-zA-Z]+)',
        _swap_css, out, flags=re.I)

    return out

ROOTS = [
    Path('/tmp/airline-work/out/logos/airlines'),
    Path('/tmp/accor-work/out/logos/hotels'),
]

processed = {'black': 0, 'white': 0}
for root in ROOTS:
    if not root.exists():
        continue
    for p in sorted(root.rglob('*.svg')):
        name = p.name
        if name.endswith('-monochrome-black.svg'):
            target = '#000000'; key = 'black'
        elif name.endswith('-monochrome-white.svg'):
            target = '#FFFFFF'; key = 'white'
        else:
            continue
        original = p.read_text(encoding='utf-8', errors='replace')
        forced = force_pure(original, target)
        if forced != original:
            p.write_text(forced, encoding='utf-8')
        processed[key] += 1

print(f'Forced pure: {processed["black"]} black, {processed["white"]} white')
