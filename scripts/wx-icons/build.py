#!/usr/bin/env python3
"""Build the board's Solid and Colour weather icons from the split packs.

  python3 build.py <split-dir> <logos/weather dir>

<split-dir> holds solid/icons, line/icons and flat/icons (NN.svg each), made
from the three Vecteezy packs by export.jsx (Illustrator) -> split.js
(headless Chrome measures every shape) -> cluster.py (one file per icon,
one-colour ones as a luminance mask in drawing order). See README.md.

Writes, one file per board condition name (23):
  solid/<c>.svg          solid glyph, white, 78% of the box: the rows (a
                         light row turns it dark in CSS)
  solid-in-disc/<c>.svg  the same glyph at 80%, used as a CSS mask over the
                         airline's brand colour on its deep colour (the gate)
  disc-day/<c>.svg       light circle + colour icon at 76% (Colour): white,
                         or on the weather card the light tint of the card's
                         ground it sits on (--wxc-disc)
  disc-night/<c>.svg     circle + solid glyph at 80% coloured by CSS variables
                         --wx-disc / --wx-ink (Solid on the weather card, which
                         inlines its icons, so the variables reach them)
Where a pack has no icon for a condition, a stand-in is used: the line
pack's glyph drawn bolder for Solid, the solid glyph in the pack's slate
blue for Colour.

Every glyph is framed on its own drawn geometry (v24044): its box is the
art's exact bounding box (path data through its transform, bold strokes
included) plus 6% each side, centred, so the nested viewBox and the mask
can never cut it; and if the art would reach past the safe circle (46 of
the disc's 50) at its size, it is drawn smaller until it does not.
tests/weather-icon-fit.test.js measures every file the same way.
"""
import math, os, re, sys

SPLIT, OUT = sys.argv[1], sys.argv[2]
INK, SLATE = '#FFFFFF', '#6D8AA3'
# board condition -> (solid, line, colour) icon ids from the split packs
MAP = {
    'clear-day': ('s01', 'l20', 'f00'), 'clear-night': ('s03', 'l16', 'f14'),
    'partly-cloudy-day': ('s17', 'l09', 'f02'), 'partly-cloudy-night': (None, 'l14', None),
    'cloudy': ('s04', 'l08', 'f06'), 'overcast': ('s04', 'l08', 'f13'),
    'overcast-day': ('s00', 'l00', 'f05'), 'overcast-night': (None, 'l14', None),
    'fog': ('s16', 'l04', None), 'mist': ('s16', 'l04', None),
    'drizzle': ('s06', 'l29', None), 'rain': ('s06', 'l10', None), 'extreme-rain': ('s06', 'l27', None),
    'sleet': (None, 'l31', None), 'snow': ('s02', 'l24', 'f08'), 'extreme-snow': ('s02', 'l39', 'f08'),
    'hail': ('s18', 'l22', None), 'thunderstorms': ('s09', 'l18', 'f04'),
    'thunderstorms-rain': ('s09', 'l38', 'f03'), 'thunderstorms-day-rain': ('s09', 'l38', 'f03'),
    'thunderstorms-night-rain': (None, 'l30', None), 'wind': ('s19', 'l11', 'f07'),
    'wind-cloud': ('s07', 'l13', None),
}
# the margin round the art inside its box, and the circle the art must stay
# inside, in the 100-unit icon (the disc's radius is 50)
PAD = 0.06
R_SAFE = 46.0
BOLD = 9          # the line stand-ins' added stroke, in the pack's own units

def load(i):
    d = {'s': 'solid', 'l': 'line', 'f': 'flat'}[i[0]]
    svg = open(os.path.join(SPLIT, d, 'icons', i[1:] + '.svg')).read()
    vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
    inner = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    # 2 decimals is plenty for the path data (the packs' own units, a few
    # thousand across), but never for the transforms that scale it: cutting
    # 0.2286 to 0.22 shrank every glyph toward the sheet's corner, off its
    # own box, and the box (the nested viewBox and the mask) cut it — the
    # rain clouds, drops and wind lines cut off in the circles (v24044).
    inner = re.sub(r'\bd="([^"]*)"', lambda m: 'd="%s"' % re.sub(r'(\d+\.\d{2})\d+', r'\1', m.group(1)), inner)
    return vb, inner

NUM = re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')

def segments(d):
    """Path data -> ('L', p0, p1) and ('C', p0, p1, p2, p3) in its own units.
    The packs use M L H V C S Z, absolute and relative."""
    toks = re.findall(r'[MmLlHhVvCcSsZz]|' + NUM.pattern, d)
    i, cmd, cur, start, prev_c2 = 0, None, (0.0, 0.0), (0.0, 0.0), None
    out = []
    def num():
        nonlocal i
        v = float(toks[i]); i += 1
        return v
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]):
            cmd = toks[i]; i += 1
            if cmd in 'Zz':
                if cur != start: out.append(('L', cur, start))
                cur, prev_c2 = start, None
                continue
        rel = cmd.islower()
        ox, oy = cur if rel else (0.0, 0.0)
        c = cmd.upper()
        if c == 'M':
            cur = start = (ox + num(), oy + num()); prev_c2 = None
            cmd = 'l' if rel else 'L'
        elif c == 'L':
            p = (ox + num(), oy + num()); out.append(('L', cur, p)); cur, prev_c2 = p, None
        elif c == 'H':
            p = ((cur[0] if rel else 0.0) + num(), cur[1]); out.append(('L', cur, p)); cur, prev_c2 = p, None
        elif c == 'V':
            p = (cur[0], (cur[1] if rel else 0.0) + num()); out.append(('L', cur, p)); cur, prev_c2 = p, None
        elif c == 'C':
            p1 = (ox + num(), oy + num()); p2 = (ox + num(), oy + num()); p3 = (ox + num(), oy + num())
            out.append(('C', cur, p1, p2, p3)); cur, prev_c2 = p3, p2
        elif c == 'S':
            p1 = (2 * cur[0] - prev_c2[0], 2 * cur[1] - prev_c2[1]) if prev_c2 else cur
            p2 = (ox + num(), oy + num()); p3 = (ox + num(), oy + num())
            out.append(('C', cur, p1, p2, p3)); cur, prev_c2 = p3, p2
        else:
            raise ValueError('path command %s is not one the packs use' % cmd)
    return out

def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1])

def extrema(a, b, c, d):
    """t in (0, 1) where one coordinate of a cubic turns."""
    qa, qb, qc = -a + 3 * b - 3 * c + d, 2 * (a - 2 * b + c), b - a
    if abs(qa) < 1e-12:
        return [-qc / qb] if abs(qb) > 1e-12 and 0 < -qc / qb < 1 else []
    disc = qb * qb - 4 * qa * qc
    if disc < 0:
        return []
    r = math.sqrt(disc)
    return [t for t in ((-qb + r) / (2 * qa), (-qb - r) / (2 * qa)) if 0 < t < 1]

def art(inner, bold):
    """The drawn art's exact box and its sample points, in the icon's units:
    every inked path (not the mask's black paper) through its transform."""
    pts, edge, grow, n = [], [], 0.0, 0
    for m in re.finditer(r'<g transform="matrix\(([^)]*)\)"><path ([^>]*?)d="([^"]*)"', inner):
        a, b, c, d, e, f = [float(v) for v in m.group(1).split(',')]
        n += 1
        if 'fill="#000"' in m.group(2):
            continue
        T = lambda p: (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)
        for sg in segments(m.group(3)):
            q = [T(p) for p in sg[1:]]
            edge += [q[0], q[-1]]
            if sg[0] == 'C':
                for k in (0, 1):
                    for t in extrema(*[p[k] for p in q]):
                        edge.append(bez(*q, t))
                pts += [bez(*q, n / 24.0) for n in range(1, 24)]
        grow = max(grow, BOLD / 2.0 * math.hypot(a, b) if bold else 0.0)
    if n != inner.count('<path '):
        raise ValueError('a path the measure did not read')
    pts += edge
    xs, ys = [p[0] for p in edge], [p[1] for p in edge]
    return (min(xs) - grow, min(ys) - grow, max(xs) + grow, max(ys) + grow), pts, grow

def glyph(i, size, fill=None, style=None, bold=False, uid=''):
    """The icon placed centred in a 100x100 box at `size` (percent): its art's
    longest side is `size` less the 6% margins, never reaching past R_SAFE."""
    vb, inner = load(i)
    if bold:
        inner = inner.replace('fill="#fff"', 'fill="#fff" stroke="#fff" stroke-width="%d" stroke-linejoin="round"' % BOLD)
    (x0, y0, x1, y1), pts, grow = art(inner, bold)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0) * (1 + 2 * PAD)
    reach = max(math.hypot(px - cx, py - cy) for px, py in pts) + grow
    if reach * size / side > R_SAFE:
        size = R_SAFE * side / reach
    # the box the cluster step measured is replaced by the art's own, in the
    # viewBox, the mask's region and the masked fill alike
    box = '%.2f %.2f %.2f %.2f' % (cx - side / 2, cy - side / 2, side, side)
    old = 'x="%s" y="%s" width="%s" height="%s"' % tuple(vb.split())
    inner = inner.replace(old, 'x="%s" y="%s" width="%s" height="%s"' % tuple(box.split()))
    if i[0] != 'f':
        if style:
            inner = inner.replace('fill="currentColor"', 'style="fill:%s"' % style)
        else:
            inner = inner.replace('fill="currentColor"', 'fill="%s"' % fill)
        inner = inner.replace('id="m-', 'id="m%s-' % uid).replace('url(#m-', 'url(#m%s-' % uid)
    off = (100 - size) / 2
    return '<svg x="%.2f" y="%.2f" width="%.2f" height="%.2f" viewBox="%s">%s</svg>' % (off, off, size, size, box, inner)

def doc(body):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + body + '</svg>\n'

def solid_pick(c):
    s, l, _ = MAP[c]
    return (s, False) if s else (l, True)

for d in ('solid', 'solid-in-disc', 'disc-day', 'disc-night'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)
for c in MAP:
    sid, bold = solid_pick(c)
    fid = MAP[c][2]
    def write(d, body):
        open(os.path.join(OUT, d, c + '.svg'), 'w').write(doc(body))
    write('solid', glyph(sid, 78, fill=INK, bold=bold))
    write('solid-in-disc', glyph(sid, 80, fill=INK, bold=bold))
    day = glyph(fid, 76) if fid else glyph(sid, 76, fill=SLATE, bold=bold)
    # the day circle takes the card's light tint of its own ground (--wxc-disc,
    # fids-core.js _wxDiscTint, v24044); white wherever that is not set
    write('disc-day', '<circle cx="50" cy="50" r="50" style="fill:var(--wxc-disc, #FFFFFF)"/>' + day)
    write('disc-night', '<circle cx="50" cy="50" r="50" style="fill:var(--wx-disc, #033F77)"/>'
          + glyph(sid, 80, style='var(--wx-ink, #FFFFFF)', bold=bold))
print(len(MAP), 'conditions x 4 sets written to', OUT)
