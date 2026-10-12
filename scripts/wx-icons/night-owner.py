#!/usr/bin/env python3
"""The night weather icons drawn for Orion Connected: one file per icon.

The source is one Illustrator sheet of 20 line icons, each on a dark charcoal
circle. Every icon keeps its artwork exactly as drawn (the same path data, the
same gradients and their clipping, the same thin light edge stroke); what
changes is only what is around it:
  - the charcoal circle is left out (the card draws its own circle);
  - each file's gradient and clip ids are its own (wxo-<name>-…), and the
    sheet's shared stylesheet is written onto each shape as attributes, so an
    icon inlined into the page brings no global .cls-N rules with it;
  - the thin rectangle left around the bolt of the storm-with-rain icon is
    removed;
  - every file has the same square viewBox, one size for the whole set (so
    every line keeps the weight it was drawn with, relative to the others),
    centred on the icon's own drawn extent.

  python3 night-owner.py split <WEATHER.svg> <workdir>
      writes <workdir>/raw/<name>.svg (each icon framed on its sheet circle)
      and <workdir>/raw/disc-<name>.svg (the circle alone), for measuring
  (measure every raw file in headless Chrome: night-owner-measure.js, run in
   a page served from <workdir>, prints the drawn extent of each)
  python3 night-owner.py build <WEATHER.svg> <measure.json> <outdir>
      writes the set: <outdir>/<name>.svg, plus a copy under every other
      condition name the boards draw (ALIAS below)
"""
import json, math, os, re, sys
import xml.etree.ElementTree as ET

SVGNS = 'http://www.w3.org/2000/svg'
NS = '{%s}' % SVGNS

# Reading order on the sheet (4 rows of 5), named as the boards name them
# (fids-v2.js WX_LOOK_NAMES); the ones the boards have no condition for take
# the Meteocons name for the same picture.
GRID = [
    ['clear-day', 'partly-cloudy-day', 'sunrise', 'cloudy', 'overcast'],
    ['clear-night', 'partly-cloudy-night', 'rain', 'lightning-bolt', 'thunderstorms'],
    ['snowflake', 'snow', 'fog', 'wind', 'thunderstorms-rain'],
    ['thermometer-colder', 'partly-cloudy-day-snow', 'umbrella', 'tornado', 'thermometer-warmer'],
]
# every other condition the boards draw, and the icon it takes
ALIAS = {
    'drizzle': 'rain',
    'extreme-rain': 'rain',
    'sleet': 'rain',            # the card says Freezing rain (WMO 56/57/66/67): rain that freezes on landing
    'hail': 'snow',             # ice pellets (Tomorrow.io 7000s): white grains from a cloud
    'extreme-snow': 'snow',
    'mist': 'fog',
    'overcast-day': 'overcast',
    'overcast-night': 'overcast',
    'thunderstorms-day-rain': 'thunderstorms-rain',
    'thunderstorms-night-rain': 'thunderstorms-rain',
    'wind-cloud': 'wind',
}
MARGIN = 0.04   # each side of the largest icon, as a share of the frame

TOK = re.compile(r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')
NARGS = dict(M=2, L=2, H=1, V=1, C=6, S=4, Q=4, T=2, A=7, Z=0)


def subpath_points(d):
    """Every on-curve and control point of every subpath, in absolute terms.
    Used only to tell which circle a shape belongs to; the path data itself
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
            if a[3] not in (0, 1) or a[4] not in (0, 1):
                raise ValueError('arc flags out of step in ' + d[:40])
            cx, cy = a[5] + (cx if rel else 0), a[6] + (cy if rel else 0)
        else:
            for k in range(0, n, 2):
                cur.append((a[k] + (cx if rel else 0), a[k + 1] + (cy if rel else 0)))
            cx, cy = cur[-1]
            continue
        cur.append((cx, cy))
    return out


def centre(points):
    xs = [p[0] for p in points]; ys = [p[1] for p in points]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def shape_points(el):
    if el.tag == NS + 'rect':
        x, y, w, h = (float(el.get(k)) for k in ('x', 'y', 'width', 'height'))
        return [[(x, y), (x + w, y + h)]]
    if el.tag == NS + 'path':
        return subpath_points(el.get('d'))
    return []


class Sheet:
    def __init__(self, src):
        self.root = ET.parse(src).getroot()
        css = self.root.find('.//%sstyle' % NS).text
        self.rules = {}
        for sel, body in re.findall(r'([^{}]+)\{([^}]*)\}', css):
            props = {}
            for p in body.split(';'):
                if ':' in p:
                    k, v = p.split(':', 1); props[k.strip()] = v.strip()
            for s in sel.split(','):
                self.rules.setdefault(s.strip().lstrip('.'), {}).update(props)
        self.defs = {el.get('id'): el for el in self.root.find(NS + 'defs') if el.get('id')}
        self.layer = [g for g in self.root.iter(NS + 'g') if g.get('id') == 'Layer_1-2'][0]
        self.discs = []      # (element, centre)
        self.items = []      # (element, [centre of each subpath])
        for el in list(self.layer):
            self._take(el)
        if len(self.discs) != 20:
            raise SystemExit('expected 20 circles, found %d' % len(self.discs))
        # name the circles in reading order: 4 rows by their centres' y, then x
        ds = sorted(self.discs, key=lambda d: d[1][1])
        rows = [sorted(ds[r * 5:(r + 1) * 5], key=lambda d: d[1][0]) for r in range(4)]
        self.disc_of = {}
        for r, row in enumerate(rows):
            for c, (el, ctr) in enumerate(row):
                self.disc_of[GRID[r][c]] = (el, ctr)
        self.icons = {name: [] for name in self.disc_of}
        for el, ctrs in self.items:
            # a compound path: every subpath must sit on the same circle
            names = {self.nearest(c) for c in ctrs}
            if len(names) != 1:
                raise SystemExit('a shape spans circles %s' % sorted(names))
            self.icons[names.pop()].append(el)

    def props(self, el):
        out = {}
        for c in (el.get('class') or '').split():
            out.update(self.rules.get(c, {}))
        return out

    def clip_ids(self, el):
        ids = []
        for e in el.iter():
            cp = self.props(e).get('clip-path')
            if cp:
                ids.append(cp[5:-1])
        return ids

    def nearest(self, pt):
        best = min(self.disc_of.items(), key=lambda kv: math.hypot(kv[1][1][0] - pt[0], kv[1][1][1] - pt[1]))
        if math.hypot(best[1][1][0] - pt[0], best[1][1][1] - pt[1]) > 160:
            raise SystemExit('a shape at %.0f,%.0f is on no circle' % pt)
        return best[0]

    def _take(self, el):
        cls = el.get('class') or ''
        if el.tag == NS + 'path' and cls == 'cls-19':          # the charcoal circle
            pts = [p for sp in shape_points(el) for p in sp]
            self.discs.append((el, centre(pts)))
            return
        p = self.props(el)
        if el.tag == NS + 'rect':
            # an empty frame (fill none, no stroke) draws nothing; the one
            # rect with a stroke is the stray frame around the storm's bolt
            if p.get('fill', '#000') != 'none':
                raise SystemExit('a filled rect on the sheet: artwork, not a frame')
            return
        if el.tag == NS + 'g' and 'clip-path' not in p and not cls:
            # a plain wrapping group: its children may belong apart
            for ch in list(el):
                self._take(ch)
            return
        if el.tag == NS + 'g':
            pts = []
            for cid in self.clip_ids(el):
                for ch in self.defs[cid]:
                    pts += [q for sp in shape_points(ch) for q in sp]
            self.items.append((el, [centre(pts)]))
            return
        self.items.append((el, [centre(sp) for sp in shape_points(el)]))


def num(v):
    v = v.strip()
    if v.endswith('px'): v = v[:-2]
    if v.startswith('.'): v = '0' + v
    return v


def esc(v):
    return v.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')


class Writer:
    """Serialises one icon: the sheet's classes become attributes, ids become
    the file's own."""
    def __init__(self, sheet, name):
        self.s = sheet; self.name = name; self.ids = {}; self.used = []

    def ref(self, old):
        if old not in self.ids:
            kind = 'g' if self.s.defs[old].tag == NS + 'linearGradient' else 'c'
            n = sum(1 for v in self.ids.values() if v.split('-')[-1].startswith(kind)) + 1
            self.ids[old] = 'wxo-%s-%s%d' % (self.name, kind, n)
            self.used.append(old)
        return self.ids[old]

    def attrs(self, el, in_clip=False):
        out = []
        for k, v in el.attrib.items():
            if k in ('class', 'id', 'data-name'): continue
            out.append((k, v))
        if in_clip:
            return out          # paint has no meaning inside a clipPath
        p = self.s.props(el)
        for k in ('fill', 'stroke', 'stroke-width', 'stroke-miterlimit'):
            if k in p:
                v = p[k]
                m = re.match(r'url\(#([^)]+)\)', v)
                if m: v = 'url(#%s)' % self.ref(m.group(1))
                if k in ('stroke-width', 'stroke-miterlimit'): v = num(v)
                out.append((k, v))
        if 'clip-path' in p:
            out.append(('clip-path', 'url(#%s)' % self.ref(p['clip-path'][5:-1])))
        return out

    def el(self, e, in_clip=False, depth=0):
        tag = e.tag.replace(NS, '')
        a = self.attrs(e, in_clip)
        if e.tag == NS + 'rect' and not in_clip:
            raise SystemExit('a rect in an icon')
        head = '<' + tag + ''.join(' %s="%s"' % (k, esc(v)) for k, v in a)
        kids = list(e)
        if not kids:
            return head + '/>'
        return head + '>' + ''.join(self.el(k, in_clip, depth + 1) for k in kids) + '</' + tag + '>'

    def defs(self):
        out = []; done = set(); i = 0
        while i < len(self.used):       # a clip may name more ids while written
            old = self.used[i]; i += 1
            if old in done: continue
            done.add(old)
            d = self.s.defs[old]
            tag = d.tag.replace(NS, '')
            if tag == 'clipPath':
                body = ''.join(self.el(k, in_clip=True) for k in d)
                out.append('<clipPath id="%s">%s</clipPath>' % (self.ids[old], body))
            else:
                a = ''.join(' %s="%s"' % (k, esc(v)) for k, v in d.attrib.items() if k != 'id')
                stops = ''.join('<stop offset="%s" stop-color="%s"/>' % (num(st.get('offset')), st.get('stop-color')) for st in d)
                out.append('<%s id="%s"%s>%s</%s>' % (tag, self.ids[old], a, stops, tag))
        return ('<defs>' + ''.join(out) + '</defs>') if out else ''


def icon_svg(sheet, name, view):
    w = Writer(sheet, name)
    body = ''.join(w.el(e) for e in sheet.icons[name])
    vb = ' '.join(fmt(v) for v in view)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">' % vb) + w.defs() + body + '</svg>\n'


def fmt(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def split(src, work):
    s = Sheet(src)
    raw = os.path.join(work, 'raw'); os.makedirs(raw, exist_ok=True)
    index = {}
    for name, (disc, ctr) in s.disc_of.items():
        view = (ctr[0] - 200, ctr[1] - 200, 400, 400)
        open(os.path.join(raw, name + '.svg'), 'w').write(icon_svg(s, name, view))
        ds = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"><path fill="#000" d="%s"/></svg>\n'
              % (' '.join(fmt(v) for v in view), disc.get('d')))
        open(os.path.join(raw, 'disc-' + name + '.svg'), 'w').write(ds)
        index[name] = view
        print('%-24s %2d shapes' % (name, len(s.icons[name])))
    json.dump(index, open(os.path.join(work, 'raw', 'index.json'), 'w'), indent=1)


def build(src, measure, out):
    s = Sheet(src)
    m = json.load(open(measure))
    side = max(max(b['w'], b['h']) for b in m['icons'].values()) / (1 - 2 * MARGIN)
    os.makedirs(out, exist_ok=True)
    frames = {}
    for name in s.disc_of:
        b = m['icons'][name]
        cx, cy = b['x'] + b['w'] / 2, b['y'] + b['h'] / 2
        view = (cx - side / 2, cy - side / 2, side, side)
        frames[name] = view
        open(os.path.join(out, name + '.svg'), 'w').write(icon_svg(s, name, view))
    for alias, name in ALIAS.items():
        txt = open(os.path.join(out, name + '.svg')).read().replace('wxo-%s-' % name, 'wxo-%s-' % alias)
        open(os.path.join(out, alias + '.svg'), 'w').write(txt)
    # the drawn circle, measured on the sheet, as a share of the frame: the
    # size the icon was drawn at inside its circle
    dia = sum(d['w'] for d in m['discs'].values()) / len(m['discs'])
    print('frame %.2f units; sheet circle %.2f units; frame = %.4f of the circle' % (side, dia, side / dia))
    return frames


if __name__ == '__main__':
    if len(sys.argv) >= 4 and sys.argv[1] == 'split':
        split(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 5 and sys.argv[1] == 'build':
        build(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(__doc__); sys.exit(2)
