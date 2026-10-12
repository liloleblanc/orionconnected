#!/usr/bin/env python3
"""The departures / arrivals row weather icons drawn for Orion Connected:
one file per icon, two sets.

The sources are two Linearity Curve sheets of the same 20 line icons (the
drawings of the night set, night-owner/, without its circles):
  - a WHITE set, white shapes with a thin blue edge, drawn for dark grounds;
  - a COLOUR set, gradient shapes (gold suns and bolts, blue clouds, some
    dark navy rain clouds), drawn for light grounds.

Every icon keeps its artwork exactly as drawn: the same path data, the same
fills, gradients, edge strokes and clipping, in the sheet's own coordinates.
What changes is only what is around it:
  - the sheet's charcoal background and its thin frame are left out (a row
    draws its own ground);
  - every gradient and clip id is the file's own (wxrw-<name>-g1 in the white
    set, wxrc-<name>-g1 in the colour set), so an inlined icon brings nothing
    global with it; the editor's own metadata attributes are dropped;
  - the sheet's inherited drawing defaults (fill-rule, clip-rule, round caps
    and joins, miter limit) are written on each file's root;
  - every file has the same square viewBox, one size for both sets, centred
    on the icon's drawn extent (the union of its white and colour drawings,
    so a row that swaps one set for the other never moves). The widest icon
    spans 69.64 % of the frame: the share today's row glyphs (solid/) take,
    78 % of the box less 6 % each side. One size keeps every line at the
    weight it was drawn with, relative to the others.

  python3 rows-owner.py split <White.svg> <Color.svg> <workdir>
      writes <workdir>/raw/{white,color}/<name>.svg, each icon framed on a
      generous box round its place on the sheet, and raw/index.json, for
      measuring (rows-owner-measure.js in headless Chrome, on a page served
      from <workdir>, prints the drawn extent of each: save it as
      measure.json)
  python3 rows-owner.py build <White.svg> <Color.svg> <measure.json> <outroot>
      writes <outroot>/rows-owner-white/ and <outroot>/rows-owner-color/:
      <name>.svg for the 20 drawings, plus a copy under every other condition
      name the boards draw (ALIAS, the same mapping as night-owner/)

On the boards (v24046) every departures / arrivals row wears one of the two
sets, picked from the ground its icon sits on (fids-core.js _fidsRowWxSet):
white below a ground luminance of _WX_ROW_SPLIT, colour above it. The split
is where the two sets' median contrast crosses: rows-owner-split.js measures
it in headless Chrome.
"""
import json, math, os, re, sys
import xml.etree.ElementTree as ET

SVGNS = 'http://www.w3.org/2000/svg'
NS = '{%s}' % SVGNS
XLINK = '{http://www.w3.org/1999/xlink}'

# Reading order on both sheets (4 rows of 5), named as the boards name them
# (fids-v2.js WX_LOOK_NAMES); the same grid and names as night-owner.py, so
# every set drawn for Orion Connected shares one mapping.
GRID = [
    ['clear-day', 'partly-cloudy-day', 'sunrise', 'cloudy', 'overcast'],
    ['clear-night', 'partly-cloudy-night', 'rain', 'lightning-bolt', 'thunderstorms'],
    ['snowflake', 'snow', 'fog', 'wind', 'thunderstorms-rain'],
    ['thermometer-colder', 'partly-cloudy-day-snow', 'umbrella', 'tornado', 'thermometer-warmer'],
]
# every other condition the boards draw, and the icon it takes (night-owner.py)
ALIAS = {
    'drizzle': 'rain',
    'extreme-rain': 'rain',
    'sleet': 'rain',
    'hail': 'snow',
    'extreme-snow': 'snow',
    'mist': 'fog',
    'overcast-day': 'overcast',
    'overcast-night': 'overcast',
    'thunderstorms-day-rain': 'thunderstorms-rain',
    'thunderstorms-night-rain': 'thunderstorms-rain',
    'wind-cloud': 'wind',
}
SETS = {'white': ('rows-owner-white', 'wxrw'), 'color': ('rows-owner-color', 'wxrc')}
# today's row glyphs (build.py): the glyph box is 78 % of the icon, the glyph
# 6 % inside it on each side -> the glyph's longest side is 78 / 1.12 %
SPAN = 0.78 / 1.12
# the sheet root's inherited defaults (its style attribute and miter limit)
ROOT_DEFAULTS = [('fill-rule', 'nonzero'), ('clip-rule', 'evenodd'), ('stroke-linecap', 'round'),
                 ('stroke-linejoin', 'round'), ('stroke-miterlimit', '10')]

TOK = re.compile(r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')
NARGS = dict(M=2, L=2, H=1, V=1, C=6, S=4, Q=4, T=2, A=7, Z=0)


def subpath_points(d):
    """Every on-curve and control point of every subpath, absolute. Used only
    to tell which place on the sheet a shape belongs to; the path data itself
    is never rewritten."""
    toks = TOK.findall(d); i = 0; cmd = None
    cx = cy = sx = sy = 0.0; out = []; cur = None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t; i += 1
            if cmd in 'Zz':
                cx, cy = sx, sy
                continue
        C = cmd.upper(); rel = cmd.islower(); n = NARGS[C]
        a = [float(x) for x in toks[i:i + n]]; i += n
        if C == 'M':
            if rel: a = [a[0] + cx, a[1] + cy]
            cur = [tuple(a)]; out.append(cur); cx, cy = a; sx, sy = a
            cmd = 'l' if rel else 'L'
            continue
        if C == 'H':
            cx = a[0] + (cx if rel else 0)
        elif C == 'V':
            cy = a[0] + (cy if rel else 0)
        elif C == 'A':
            cx, cy = a[5] + (cx if rel else 0), a[6] + (cy if rel else 0)
        else:
            for k in range(0, n, 2):
                cur.append((a[k] + (cx if rel else 0), a[k + 1] + (cy if rel else 0)))
            cx, cy = cur[-1]
            continue
        cur.append((cx, cy))
    return out


def box(points):
    xs = [p[0] for p in points]; ys = [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))


def centre(b):
    return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


def all_paths(el):
    return [e for e in el.iter() if e.tag == NS + 'path' and e.get('d')]


def drawn_paths(el):
    """Paths that paint (not the ones inside a clipPath)."""
    out = []
    def walk(e, inclip):
        if e.tag == NS + 'clipPath':
            inclip = True
        if e.tag == NS + 'path' and e.get('d') and not inclip:
            out.append(e)
        for c in e:
            walk(c, inclip)
    walk(el, False)
    return out


def bands(values, n, what):
    """Split sorted centre values into n bands at the n-1 widest gaps."""
    vs = sorted(values)
    gaps = sorted(range(1, len(vs)), key=lambda i: vs[i] - vs[i - 1], reverse=True)[:n - 1]
    cuts = sorted((vs[i - 1] + vs[i]) / 2 for i in gaps)
    if len(cuts) != n - 1 or min(vs[i] - vs[i - 1] for i in gaps) < 100:
        raise SystemExit('the sheet does not fall into %d %s' % (n, what))
    return cuts


class Sheet:
    def __init__(self, src):
        self.root = ET.parse(src).getroot()
        vb = [float(v) for v in self.root.get('viewBox').split()]
        self.view = vb
        defs = self.root.find(NS + 'defs')
        self.defs = {el.get('id'): el for el in (defs if defs is not None else []) if el.get('id')}
        for cp in self.root.iter(NS + 'clipPath'):
            self.defs[cp.get('id')] = cp
        self.items = []   # (element, bbox, [subpath centres])
        for layer in self.root.findall(NS + 'g'):
            for el in list(layer):
                self._take(el)
        cs = [centre(b) for _, b, _ in self.items]
        xcuts = bands([c[0] for c in cs], 5, 'columns')
        ycuts = bands([c[1] for c in cs], 4, 'rows')
        cell = lambda p: (sum(p[1] > y for y in ycuts), sum(p[0] > x for x in xcuts))
        self.icons = {name: [] for row in GRID for name in row}
        self.place = {}
        for el, b, subs in self.items:
            r, c = cell(centre(b))
            for s in subs:     # every part of a shape on the same place
                if cell(s) != (r, c):
                    raise SystemExit('a shape spans two places on the sheet')
            self.icons[GRID[r][c]].append(el)
        for name, els in self.icons.items():
            if not els:
                raise SystemExit('no drawing for %s' % name)
            pts = [p for e in els for q in drawn_paths(e) for sp in subpath_points(q.get('d')) for p in sp]
            self.place[name] = box(pts)

    def _covers_sheet(self, el):
        pts = [p for q in all_paths(el) for sp in subpath_points(q.get('d')) for p in sp]
        if not pts:
            return False
        b = box(pts)
        return (b[2] - b[0]) >= 0.95 * self.view[2] and (b[3] - b[1]) >= 0.95 * self.view[3]

    def _take(self, el):
        if el.tag not in (NS + 'path', NS + 'g'):
            raise SystemExit('unexpected <%s> on the sheet' % el.tag.replace(NS, ''))
        if not drawn_paths(el):
            return                      # an empty group draws nothing
        if self._covers_sheet(el):
            return                      # the charcoal background or its frame
        pts = []; subs = []
        for q in drawn_paths(el):
            for sp in subpath_points(q.get('d')):
                pts += sp; subs.append(centre(box(sp)))
        self.items.append((el, box(pts), subs))


def esc(v):
    return v.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')


class Writer:
    """Serialises one icon: its ids become the file's own, the editor's
    metadata is dropped, everything that draws is kept as written."""
    def __init__(self, sheet, prefix, name):
        self.s = sheet; self.prefix = prefix; self.name = name; self.ids = {}; self.grads = []

    def new_id(self, old):
        if old not in self.ids:
            kind = 'c' if self.s.defs[old].tag == NS + 'clipPath' else 'g'
            n = sum(1 for v in self.ids.values() if v.rsplit('-', 1)[1].startswith(kind)) + 1
            self.ids[old] = '%s-%s-%s%d' % (self.prefix, self.name, kind, n)
            if kind == 'g':
                self.grads.append(old)
        return self.ids[old]

    def value(self, v):
        return re.sub(r'url\(#([^)]+)\)', lambda m: 'url(#%s)' % self.new_id(m.group(1)), v)

    def el(self, e):
        tag = e.tag.replace(NS, '')
        out = []
        for k, v in e.attrib.items():
            if k.startswith('{'):
                if k.startswith(XLINK):
                    raise SystemExit('an xlink reference on the sheet')
                continue                # vectornator:layerName and the like
            if k == 'id':
                v = self.new_id(v)
            elif 'url(' in v:
                v = self.value(v)
            out.append((k, v))
        head = '<' + tag + ''.join(' %s="%s"' % (k, esc(v)) for k, v in out)
        kids = list(e)
        if not kids:
            return head + '/>'
        return head + '>' + ''.join(self.el(k) for k in kids) + '</' + tag + '>'

    def defs(self):
        out = []
        for old in self.grads:
            d = self.s.defs[old]
            tag = d.tag.replace(NS, '')
            a = ''.join(' %s="%s"' % (k, esc(v)) for k, v in d.attrib.items() if k != 'id' and not k.startswith('{'))
            stops = ''.join('<stop' + ''.join(' %s="%s"' % (k, esc(v)) for k, v in st.attrib.items()) + '/>' for st in d)
            out.append('<%s id="%s"%s>%s</%s>' % (tag, self.ids[old], a, stops, tag))
        return ('<defs>' + ''.join(out) + '</defs>') if out else ''


def fmt(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def icon_svg(sheet, prefix, name, view):
    w = Writer(sheet, prefix, name)
    body = ''.join(w.el(e) for e in sheet.icons[name])
    root = ' '.join('%s="%s"' % kv for kv in ROOT_DEFAULTS)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" %s>' % (' '.join(fmt(v) for v in view), root)
            + w.defs() + body + '</svg>\n')


def split(white, color, work):
    sheets = {'white': Sheet(white), 'color': Sheet(color)}
    index = {}
    for name in sheets['white'].icons:
        bs = [sheets[k].place[name] for k in sheets]
        b = (min(x[0] for x in bs), min(x[1] for x in bs), max(x[2] for x in bs), max(x[3] for x in bs))
        cx, cy = centre(b)
        index[name] = (cx - 220, cy - 220, 440, 440)
    for k, s in sheets.items():
        d = os.path.join(work, 'raw', k); os.makedirs(d, exist_ok=True)
        for name, view in index.items():
            open(os.path.join(d, name + '.svg'), 'w').write(icon_svg(s, SETS[k][1], name, view))
            print('%-6s %-24s %d shapes' % (k, name, len(s.icons[name])))
    json.dump(index, open(os.path.join(work, 'raw', 'index.json'), 'w'), indent=1)


def build(white, color, measure, outroot):
    sheets = {'white': Sheet(white), 'color': Sheet(color)}
    m = json.load(open(measure))
    ext = {}
    for name in sheets['white'].icons:
        bs = [m[k][name] for k in sheets]
        for b in bs:
            if b['edge']:
                raise SystemExit('%s reaches the edge of its measuring box' % name)
        x0 = min(b['x'] for b in bs); y0 = min(b['y'] for b in bs)
        x1 = max(b['x'] + b['w'] for b in bs); y1 = max(b['y'] + b['h'] for b in bs)
        ext[name] = (x0, y0, x1, y1)
    side = max(max(e[2] - e[0], e[3] - e[1]) for e in ext.values()) / SPAN
    frames = {}
    for name, e in ext.items():
        cx, cy = centre(e)
        frames[name] = (cx - side / 2, cy - side / 2, side, side)
    for k, s in sheets.items():
        folder, prefix = SETS[k]
        out = os.path.join(outroot, folder); os.makedirs(out, exist_ok=True)
        for name, view in frames.items():
            open(os.path.join(out, name + '.svg'), 'w').write(icon_svg(s, prefix, name, view))
        for alias, name in ALIAS.items():
            txt = open(os.path.join(out, name + '.svg')).read().replace('%s-%s-' % (prefix, name), '%s-%s-' % (prefix, alias))
            open(os.path.join(out, alias + '.svg'), 'w').write(txt)
    widest = max(ext, key=lambda n: max(ext[n][2] - ext[n][0], ext[n][3] - ext[n][1]))
    print('frame %.2f sheet units, set by %s' % (side, widest))
    return frames


if __name__ == '__main__':
    if len(sys.argv) >= 5 and sys.argv[1] == 'split':
        split(sys.argv[2], sys.argv[3], sys.argv[4])
    elif len(sys.argv) >= 6 and sys.argv[1] == 'build':
        build(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
    else:
        print(__doc__); sys.exit(2)
