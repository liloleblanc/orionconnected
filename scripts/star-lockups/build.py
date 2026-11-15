#!/usr/bin/env python3
"""
build.py: the Star Alliance member lockups of the gate header and the Welcome card.

    python3 scripts/star-lockups/build.py            (from the repository root)

Writes fids-current/logos/airlines/star-lockups/<CODE>.svg and <CODE>-white.svg.

The layout is the one of the first supplied Air Canada lockup (kept as
scripts/star-lockups/AC-member-line.svg): the carrier's mark on top, a thin
rule the full width of it, then A STAR ALLIANCE MEMBER with the Star Alliance
star and its TM at the right. AC.svg and MS.svg (EgyptAir) are the supplied
files and are not built here, only their white twins. AC.svg is the later
supplied Air Canada design: a bar running grey to Air Canada red under the
mark, then the member line in white on a black band.

For every other carrier the mark on top is what the gate header draws for it:
its emblem in an 82 px box with corners of 12 px, a 16 px gap, then its
wordmark contained in the box the header gives it (measured on the header at
1680x1050). Below it go the rule, the member line, the TM and the star of
AC-member-line.svg, its own paths and not a retyped copy, scaled so the rule is as wide as
the mark, at the gap of the supplied EgyptAir lockup (a share of the width).

The white twin (for a dark ground) takes the wordmark's own white cut, a white
rule and member line, and the star as drawn. No plate goes behind anything.
Where the board does not set a carrier's emblem on a dark ground (the Welcome
card's WELCOME_CARD_NO_EMBLEM, or an emblem that is a white square) the twin
has the lettering alone.
"""

import copy
import os
import re
import xml.etree.ElementTree as ET

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FC = os.path.join(REPO, 'fids-current')
OUT = os.path.join(FC, 'logos', 'airlines', 'star-lockups')
# The rule, the member line, the TM and the star of the first supplied Air Canada
# lockup (thin black rule, black member line): every built lockup takes its paths.
MEMBER_LINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'AC-member-line.svg')
SVG = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', XLINK)

T = '/logos/airline-tiles/'
E = '/logos/airlines/european/'
S = '/logos/airlines/split/'
# code: (emblem or None, wordmark for a light ground, its white cut, width of the wordmark's box)
CARRIERS = {
    'LH': (T + 'DLH.svg', E + 'lufthansa-wordmark-dark.svg', E + 'lufthansa-wordmark-light.svg', 393),
    'UA': (T + 'UAL-sq.svg', '/logos/airlines/us-major/united-wordmark-color.svg', '/logos/airlines/us-major/united-wordmark-light.svg', 393),
    'SQ': (T + 'SIA.svg', S + 'singapore-airlines-wordmark-dark.svg', S + 'singapore-airlines-wordmark-light.svg', 255),
    'TK': (T + 'THY.svg', S + 'turkish-airlines-wordmark-dark.svg', S + 'turkish-airlines-wordmark-light.svg', 393),
    'SK': (T + 'SAS.svg', E + 'sas-wordmark-dark.svg', E + 'sas-wordmark-light.svg', 234),
    'OS': (T + 'AUA.svg', E + 'austrian-wordmark-dark.svg', E + 'austrian-wordmark-light.svg', 393),
    'LX': (T + 'SWR.svg', E + 'swiss-wordmark-dark.svg', E + 'swiss-wordmark-light.svg', 353),
    'SN': (T + 'BEL.svg', S + 'brussels-airlines-wordmark-dark.svg', S + 'brussels-airlines-wordmark-light.svg', 269),
    'A3': ('/logos/symbols/airlines/A3.svg', E + 'aegean-wordmark-dark.svg', E + 'aegean-wordmark-light.svg', 393),
    'NZ': (T + 'ANZ.svg', '/logos/airlines/asian-other/NZ-wordmark-dark.svg', '/logos/airlines/asian-other/NZ-wordmark-light.svg', 393),
    'CM': (T + 'CMP.svg', '/logos/airlines/asian-other/copa-wordmark-color.svg', '/logos/airlines/asian-other/copa-wordmark-light.svg', 393),
    # Rouge and the Air Canada Express codes: the header draws AIR CANADA alone
    'RV': (None, '/logos/airlines/canadian/air-canada-wordmark-dark.svg', '/logos/airlines/canadian/air-canada-wordmark-light.svg', 491),
    'ZX': (None, '/logos/airlines/canadian/air-canada-wordmark-dark.svg', '/logos/airlines/canadian/air-canada-wordmark-light.svg', 491),
    '9L': (None, '/logos/airlines/canadian/air-canada-wordmark-dark.svg', '/logos/airlines/canadian/air-canada-wordmark-light.svg', 491),
}
WHITE_NO_EMBLEM = {'A3', 'NZ', 'CM'}

EMB, GAP, RADIUS = 82.0, 16.0, 12.0
RULE_GAP = 9.57 / 484.57        # EgyptAir lockup: rule 9.57 under the wordmark, 484.57 long
AC_RULE_LEN = 1556.78            # AC-member-line.svg: rule from x 0 to 1556.78
AC_RULE_TOP = 502.524
AC_BOTTOM = 649.28               # foot of the star
AC_RIGHT = 1601.98               # right of the TM
AC_CAPS = (553.091, 615.45)      # the member line's capitals


def fmt(v):
    return ('%.3f' % v).rstrip('0').rstrip('.')


def ns(el):
    return el.tag.split('}')[0][1:] if el.tag.startswith('{') else ''


def local(name):
    return name.split('}')[-1]


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def part(src, pfx):
    """An SVG file of the board, ready to nest: (viewBox, root presentation, children)."""
    root = ET.parse(FC + src).getroot()
    vb = root.get('viewBox') or '0 0 %s %s' % (root.get('width').replace('px', ''), root.get('height').replace('px', ''))
    keep = {}
    for k in ('fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-miterlimit', 'opacity'):
        if root.get(k) is not None:
            keep[k] = root.get(k)
    if root.get('style'):
        st = ';'.join(x.strip() for x in root.get('style').split(';') if x.strip() and not x.strip().startswith('enable-background'))
        if st:
            keep['style'] = st
    kids = [copy.deepcopy(k) for k in root]
    ids = set()

    def clean(parent):
        for el in list(parent):
            if ns(el) != SVG or local(el.tag) in ('metadata', 'title', 'desc'):
                parent.remove(el)
                continue
            for a in list(el.attrib):
                if a.startswith('{') and not a.startswith('{' + XLINK + '}'):
                    del el.attrib[a]
            if el.get('id'):
                ids.add(el.get('id'))
            clean(el)
    holder = ET.Element('g')
    holder.extend(kids)
    clean(holder)
    for el in holder.iter():
        if el.get('id'):
            el.set('id', pfx + '-' + el.get('id'))
        if el.get('class'):
            el.set('class', ' '.join(pfx + '-' + c for c in el.get('class').split()))
        for a, v in list(el.attrib.items()):
            for i in ids:
                v = v.replace('url(#%s)' % i, 'url(#%s-%s)' % (pfx, i))
                if v == '#' + i:
                    v = '#%s-%s' % (pfx, i)
            el.set(a, v)
        if local(el.tag) == 'style' and el.text:
            for sel in re.findall(r'([^{}]+)\{', el.text):
                for one in sel.split(','):
                    if one.strip() and not re.fullmatch(r'\.[A-Za-z_][\w-]*', one.strip()):
                        raise SystemExit('a selector this script cannot scope, %r, in %s' % (one.strip(), src))
            el.text = re.sub(r'\.(?=[A-Za-z_])', '.' + pfx + '-', el.text)
    return vb, keep, list(holder)


def nested(parent, x, y, w, h, vb, keep, kids):
    el = ET.SubElement(parent, '{%s}svg' % SVG, {'x': fmt(x), 'y': fmt(y), 'width': fmt(w), 'height': fmt(h), 'viewBox': vb})
    for k, v in keep.items():
        el.set(k, v)
    el.extend(kids)
    return el


def contain(x, box_w, box_h, vb):
    """Where a file is drawn in a box, as object-fit: contain draws it (centred)."""
    _, _, vw, vh = [float(v) for v in vb.replace(',', ' ').split()]
    k = min(box_w / vw, box_h / vh)
    w, h = vw * k, vh * k
    return x + (box_w - w) / 2, (box_h - h) / 2, w, h


def member_paths(white):
    root = ET.parse(MEMBER_LINE).getroot()
    paths = [el for el in root.iter('{%s}path' % SVG)]
    assert len(paths) == 19, len(paths)
    out = []
    for i, p in enumerate(paths[2:], start=2):
        fill = p.get('fill')
        if white and i in (2, 3, 4):        # rule, member line, TM
            assert fill == '#000000', fill
            fill = '#ffffff'
        out.append(ET.Element('{%s}path' % SVG, {'d': p.get('d'), 'fill': fill, 'fill-rule': p.get('fill-rule', 'nonzero')}))
    return out


def build(code, white):
    emb, wm_dark, wm_light, box = CARRIERS[code]
    if white and code in WHITE_NO_EMBLEM:
        emb = None
    wm = wm_light if white else wm_dark
    root = ET.Element('{%s}svg' % SVG)
    x = 0.0
    if emb:
        defs = ET.SubElement(root, '{%s}defs' % SVG)
        clip = ET.SubElement(defs, '{%s}clipPath' % SVG, {'id': 'lk-emb'})
        ET.SubElement(clip, '{%s}rect' % SVG, {'width': fmt(EMB), 'height': fmt(EMB), 'rx': fmt(RADIUS), 'ry': fmt(RADIUS)})
        g = ET.SubElement(root, '{%s}g' % SVG, {'clip-path': 'url(#lk-emb)'})
        vb, keep, kids = part(emb, 'e')
        nested(g, 0, 0, EMB, EMB, vb, keep, kids)
        x = EMB + GAP
    vb, keep, kids = part(wm, 'w')
    nested(root, x, 0, box, EMB, vb, keep, kids)
    wx, wy, ww, wh = contain(x, box, EMB, vb)
    # the mark's extent: the emblem's box is all ink (a tile, or a mark that fills it)
    x0, x1 = (0.0 if emb else wx), wx + ww
    y0, y1 = (0.0 if emb else wy), (EMB if emb else wy + wh)
    width = x1 - x0
    s = width / AC_RULE_LEN
    rule_top = y1 + RULE_GAP * width
    ty = rule_top - AC_RULE_TOP * s
    g = ET.SubElement(root, '{%s}g' % SVG, {'transform': 'matrix(%.6f 0 0 %.6f %s %.4f)' % (s, s, fmt(x0), ty)})
    g.extend(member_paths(white))
    right = max(x1, x0 + AC_RIGHT * s)
    bottom = ty + AC_BOTTOM * s
    root.set('width', fmt(right - x0))
    root.set('height', fmt(bottom - y0))
    root.set('viewBox', '%s %s %s %s' % (fmt(x0), fmt(y0), fmt(right - x0), fmt(bottom - y0)))
    # the share of the height the airline's lettering fills (the Welcome card's rule 1)
    letters = wh / (bottom - y0)
    caps = (AC_CAPS[1] - AC_CAPS[0]) * s / (bottom - y0)
    return ET.tostring(root, encoding='unicode') + '\n', letters, caps


def white_twin_of_supplied():
    # Air Canada: the AIR CANADA lettering white; the bar, the black band and
    # the white member line on it are the same on either ground
    ac = read(os.path.join(OUT, 'AC.svg'))
    assert ac.count('fill="#2e2a25"') == 1 and ac.count('fill="#000000"') == 1
    ac = ac.replace('fill="#2e2a25"', 'fill="#ffffff"')
    ms = read(os.path.join(OUT, 'MS.svg'))
    assert ms.count('fill: #002d62;') == 1
    ms = ms.replace('fill: #002d62;', 'fill: #ffffff;')
    # the rule (class cls-2, no fill of its own), the member line and the TM (no class) are black by default
    assert ms.count('<path id="Rectangle" class="cls-2" d=') == 1 and ms.count('<path d="') == 2
    ms = ms.replace('<path id="Rectangle" class="cls-2" d=', '<path id="Rectangle" class="cls-2" fill="#ffffff" d=')
    ms = ms.replace('<path d="', '<path fill="#ffffff" d="')
    return ac, ms


def main():
    ac, ms = white_twin_of_supplied()
    with open(os.path.join(OUT, 'AC-white.svg'), 'w', encoding='utf-8') as f:
        f.write(ac)
    with open(os.path.join(OUT, 'MS-white.svg'), 'w', encoding='utf-8') as f:
        f.write(ms)
    for code in CARRIERS:
        for white in (False, True):
            svg, letters, caps = build(code, white)
            name = code + ('-white' if white else '') + '.svg'
            with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
                f.write(svg)
            print('%-13s letters %.3f of the height, member capitals %.3f' % (name, letters, caps))


if __name__ == '__main__':
    main()
