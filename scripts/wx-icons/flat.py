#!/usr/bin/env python3
"""The departures / arrivals row weather icons and the night icons: the flat set in the style of
Vecteezy pack 98703.

Vecteezy pack 98703 is a flat weather set: white clouds with a #CCCCCC cloud behind them, a #F2A844 sun,
moon and bolt. It is licensed (Vecteezy PRO), so no attribution is needed and none is shown. Six icons are
the pack's own (partly cloudy, clear, snow, partly cloudy night, rain, storm with rain); the other 25 are
composed from the pack's shapes in the same flat language.

The source is flat/ beside this script:
  flat/<name>.svg    31 masters, one per condition name the boards draw: viewBox 0 0 100 100, each icon
                     centred on (50, 50) with its longest side about 80 (the pack's cloud pair is 80 across
                     and the same size in every cloud icon); every shape a <path> (M L C Z) or a <circle>
                     with a data-role and the dark colourway's fill
  flat/palette.json  the colours by role: "dark" (the pack's own colours, for dark rows and the night
                     circle) and "light" (navy #034C76 clouds, a #307895 cloud behind, a #A0610B sun, moon
                     and bolt, each at 3:1 or more on white and on the yellow Delayed row; the thermometer's
                     mercury, enclosed by its navy tube, keeps the pack's #F2A844 so it reads against the
                     tube). Its "mono" and "ratios" keys are notes and are not read here.

  python3 flat.py [<flat dir> [<outroot>]]

rewrites, under <outroot> (default fids-current/logos/weather), four folders of 31 files each, and removes
any other .svg file in them:
  night-flat/       the dark colourway, for the night circle. The boards draw the circle and place the
                    file's frame on the whole of it (fids-core.js _wxNightLineDisc on the weather card,
                    .fids-wx-line in css/display-overrides.css on the gate), so the frame IS the circle: one
                    square, NIGHT_SIDE units, centred on the masters' centre, the same for every icon. The
                    cloud pair (80) spans 64 % of the circle's diameter, as the pack's icons sit in their
                    tiles, and every icon keeps the masters' one scale, so a cloud, a drop or a flake is
                    the same size in every icon. Every point lies within 92 % of the circle's radius (the
                    boards' rule for circle sets), checked here.
  rows-flat-white/  the dark colourway, for a dark row
  rows-flat-color/  the light colourway, for a light row
                    The two row sets have the same shapes and one square frame, centred on the masters'
                    centre: the largest icon spans SPAN of it, the share the row icons have always taken
                    (78 % of the box less 6 % each side), so the rows' layout does not move.
  rows-flat-ink/    the ink copy's mask, under the rows' frame: where neither row set can be seen whole
                    (fids-core.js _wxRowWear) the row fills the drawing with one colour, its text's. The
                    master's shapes in white on a luminance mask, each run of one part (its role; the rays
                    are the sun's) first cut out of what lies behind it, INK_GAP all round, so one colour
                    still shows the sun behind the cloud, the bolt under it, the mercury in its tube.

Each drawing is the master's shapes as written (the same path data, the same circles, in the same order) in
its colourway, under its frame: no id, no style, no script, no data-role; each mask the same shapes and
one id of its own (wxk-<name>). The output depends on the masters alone. After a row file changes, run rows-pixels.js in headless Chrome and put the table it
returns in fids-core.js in place of _WX_ROW_PX (README.md), then npm run assets:build.
"""
import json, math, os, re, sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
NS = '{http://www.w3.org/2000/svg}'

# every condition name the boards draw in a row (fids-v2.js WX_ROW_NAMES) or in the night circle
# (fids-v2.js WX_LOOK_NAMES, and every name fids-core.js _wxAnimIcon / _wmoAnimIcon can give)
NAMES = ['clear-day', 'clear-night', 'cloudy', 'drizzle', 'extreme-rain', 'extreme-snow', 'fog', 'hail',
         'lightning-bolt', 'mist', 'overcast-day', 'overcast-night', 'overcast', 'partly-cloudy-day-snow',
         'partly-cloudy-day', 'partly-cloudy-night', 'rain', 'sleet', 'snow', 'snowflake', 'sunrise',
         'thermometer-colder', 'thermometer-warmer', 'thunderstorms-day-rain', 'thunderstorms-night-rain',
         'thunderstorms-rain', 'thunderstorms', 'tornado', 'umbrella', 'wind-cloud', 'wind']
CLOUD_PAIR = 80.0                   # the masters' cloud pair, the size every cloud icon shares
NIGHT_SHARE = 0.64                  # ... as a share of the night circle's diameter
NIGHT_SIDE = CLOUD_PAIR / NIGHT_SHARE
NIGHT_SAFE = 0.92                   # no point past 92 % of the circle's radius
SPAN = 0.78 / 1.12                  # the row frame: the largest icon's longest side, as a share of it
SETS = [('night-flat', 'dark', 'night'), ('rows-flat-white', 'dark', 'rows'), ('rows-flat-color', 'light', 'rows'),
        ('rows-flat-ink', 'ink', 'rows')]
# the ink copy's mask (rows-flat-ink/): every part cut back from the parts drawn in front of it by INK_GAP
# units, so a drawing filled with one colour still shows its parts (the sun behind the cloud, the bolt under
# it, the mercury in its tube). A part is its role, except that the rays are the sun's own.
INK_GAP = 3.2
INK_PART = {'ray': 'sun'}

TOK = re.compile(r'[MLCZ]|[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?')
NARGS = {'M': 2, 'L': 2, 'C': 6}


def segments(d, where):
    """The path as absolute straight ('L', p0, p1) and cubic ('C', p0, p1, p2, p3) segments."""
    if re.sub(r'[\s,]', '', re.sub(TOK, '', d)):
        raise SystemExit('%s: a path command other than M L C Z' % where)
    toks = TOK.findall(d)
    out, i, cmd, cur, start = [], 0, None, None, None
    while i < len(toks):
        t = toks[i]
        if t in ('M', 'L', 'C', 'Z'):
            cmd = t; i += 1
            if cmd == 'Z':
                if cur != start:
                    out.append(('L', cur, start))
                cur = start
                continue
        if cmd is None or cmd == 'Z':
            raise SystemExit('%s: a number with no command' % where)
        n = NARGS[cmd]
        v = [float(x) for x in toks[i:i + n]]
        if len(v) != n:
            raise SystemExit('%s: a short command' % where)
        i += n
        if cmd == 'M':
            cur = start = (v[0], v[1]); cmd = 'L'
        elif cmd == 'L':
            out.append(('L', cur, (v[0], v[1]))); cur = (v[0], v[1])
        else:
            p3 = (v[4], v[5]); out.append(('C', cur, (v[0], v[1]), (v[2], v[3]), p3)); cur = p3
    return out


def _cubic_range(a, b, c, d):
    """Least and greatest value of one coordinate of a cubic Bezier over 0..1 (exact)."""
    ts = [0.0, 1.0]
    qa, qb, qc = -a + 3 * b - 3 * c + d, 2 * (a - 2 * b + c), b - a
    if abs(qa) < 1e-12:
        if abs(qb) > 1e-12:
            ts.append(-qc / qb)
    else:
        disc = qb * qb - 4 * qa * qc
        if disc >= 0:
            r = math.sqrt(disc); ts += [(-qb + r) / (2 * qa), (-qb - r) / (2 * qa)]
    vals = [(1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d for t in ts if 0 <= t <= 1]
    return min(vals), max(vals)


def _bez(q, t):
    u = 1 - t
    return tuple(u * u * u * q[0][k] + 3 * u * u * t * q[1][k] + 3 * u * t * t * q[2][k] + t * t * t * q[3][k] for k in (0, 1))


class Shape:
    def __init__(self, el, where):
        tag = el.tag.replace(NS, '')
        self.tag, self.role, self.fill = tag, el.get('data-role'), el.get('fill')
        want = {'path': ['data-role', 'fill', 'd'], 'circle': ['data-role', 'fill', 'cx', 'cy', 'r']}.get(tag)
        if want is None:
            raise SystemExit('%s: a <%s>, not a path or a circle' % (where, tag))
        if sorted(el.attrib) != sorted(want) or len(el):
            raise SystemExit('%s: a <%s> with attributes %s' % (where, tag, sorted(el.attrib)))
        self.attrs = [(k, el.get(k)) for k in want[2:]]
        if tag == 'circle':
            cx, cy, r = (float(el.get(k)) for k in ('cx', 'cy', 'r'))
            self.box = (cx - r, cy - r, cx + r, cy + r)
            self.reach = lambda x, y: math.hypot(cx - x, cy - y) + r
        else:
            segs = segments(el.get('d'), where)
            xs, ys, pts = [], [], []
            for sg in segs:
                if sg[0] == 'L':
                    xs += [sg[1][0], sg[2][0]]; ys += [sg[1][1], sg[2][1]]; pts += [sg[1], sg[2]]
                else:
                    q = sg[1:]
                    xs += _cubic_range(*(p[0] for p in q)); ys += _cubic_range(*(p[1] for p in q))
                    pts += [_bez(q, k / 256) for k in range(257)]
            self.box = (min(xs), min(ys), max(xs), max(ys))
            self.reach = lambda x, y: max(math.hypot(p[0] - x, p[1] - y) for p in pts)

    def svg(self, fill, knock=0):
        edge = ' stroke="%s" stroke-width="%s" stroke-linejoin="round"' % (fill, fmt(2 * knock)) if knock else ''
        return '<%s fill="%s"%s %s/>' % (self.tag, fill, edge, ' '.join('%s="%s"' % kv for kv in self.attrs))


def ink_svg(name, shapes, view):
    """The ink copy's mask: the drawing's shapes in white on a luminance mask, each run of one part first cut
    out of what lies behind it, INK_GAP all round, so the copy keeps its parts apart in one colour."""
    x, y, w, h = view.split()
    box = 'x="%s" y="%s" width="%s" height="%s"' % (x, y, w, h)
    runs = []
    for s in shapes:
        part = INK_PART.get(s.role, s.role)
        if runs and runs[-1][0] == part:
            runs[-1][1].append(s)
        else:
            runs.append((part, [s]))
    body = ['<rect %s fill="#000"/>' % box]
    for k, (_, run) in enumerate(runs):
        if k:
            body += [s.svg('#000', INK_GAP) for s in run]
        body += [s.svg('#FFF') for s in run]
    mid = 'wxk-' + name
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"><mask id="%s" maskUnits="userSpaceOnUse" %s>%s</mask>'
            '<rect %s fill="#FFF" mask="url(#%s)"/></svg>\n' % (view, mid, box, ''.join(body), box, mid))


def read_master(path, name, dark):
    root = ET.parse(path).getroot()
    if root.tag != NS + 'svg' or dict(root.attrib) != {'viewBox': '0 0 100 100'}:
        raise SystemExit('%s: the root must be <svg viewBox="0 0 100 100"> alone' % name)
    txt = open(path, encoding='utf-8').read()
    if re.search(r'\bid=|<style|<script|transform|stroke|clip|mask|href', txt):
        raise SystemExit('%s: an id, style, script, transform, stroke, clip, mask or link' % name)
    shapes = [Shape(el, name) for el in root]
    if not shapes:
        raise SystemExit('%s: draws nothing' % name)
    for s in shapes:
        if s.role not in dark:
            raise SystemExit('%s: a shape whose role (%s) the palette does not colour' % (name, s.role))
        if s.fill != dark[s.role]:
            raise SystemExit('%s: a %s filled %s, not the dark colourway\'s %s' % (name, s.role, s.fill, dark[s.role]))
    box = (min(s.box[0] for s in shapes), min(s.box[1] for s in shapes), max(s.box[2] for s in shapes), max(s.box[3] for s in shapes))
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    if abs(cx - 50) > 0.05 or abs(cy - 50) > 0.05:
        raise SystemExit('%s: not centred on (50, 50) (%.2f, %.2f)' % (name, cx, cy))
    return shapes, box


def fmt(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def frame(side):
    o = 50 - side / 2
    return ' '.join(fmt(v) for v in (o, o, side, side))


def build(src, outroot):
    pal = json.load(open(os.path.join(src, 'palette.json'), encoding='utf-8'))
    dark, light = pal['dark'], pal['light']
    if sorted(dark) != sorted(light):
        raise SystemExit('palette.json: the two colourways colour different roles')
    have = sorted(f[:-4] for f in os.listdir(src) if f.endswith('.svg'))
    if have != sorted(NAMES):
        raise SystemExit('the masters are not the 31 names: missing %s, extra %s' % (sorted(set(NAMES) - set(have)), sorted(set(have) - set(NAMES))))
    icons = {n: read_master(os.path.join(src, n + '.svg'), n, dark) for n in NAMES}
    longest = {n: max(b[2] - b[0], b[3] - b[1]) for n, (_, b) in icons.items()}
    biggest = max(NAMES, key=lambda n: longest[n])
    # the row frame: the largest icon at SPAN of it, kept to a whole hundredth either side of the centre
    rows_side = math.ceil(longest[biggest] / SPAN / 0.02 - 1e-9) * 0.02
    views = {'night': frame(NIGHT_SIDE), 'rows': frame(rows_side)}
    radius = NIGHT_SIDE / 2
    worst = max(NAMES, key=lambda n: max(s.reach(50, 50) for s in icons[n][0]))
    reach = max(s.reach(50, 50) for s in icons[worst][0]) / radius
    if reach > NIGHT_SAFE:
        raise SystemExit('%s reaches %.1f %% of the night circle\'s radius, past %d %%' % (worst, 100 * reach, 100 * NIGHT_SAFE))
    for folder, way, kind in SETS:
        colours = dark if way == 'dark' else light if way == 'light' else None
        out = os.path.join(outroot, folder)
        os.makedirs(out, exist_ok=True)
        for f in sorted(os.listdir(out)):
            if f.endswith('.svg') and f[:-4] not in NAMES:
                os.remove(os.path.join(out, f))
        for n in NAMES:
            if colours is None:
                txt = ink_svg(n, icons[n][0], views[kind])
            else:
                body = ''.join(s.svg(colours[s.role]) for s in icons[n][0])
                txt = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s</svg>\n' % (views[kind], body)
            with open(os.path.join(out, n + '.svg'), 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(txt)
    print('night-flat/       frame %s: the cloud pair at %.0f %% of the circle; farthest point %s at %.1f %% of the radius'
          % (views['night'], 100 * CLOUD_PAIR / NIGHT_SIDE, worst, 100 * reach))
    print('rows-flat-*/      frame %s: %s (longest side %.2f) at %.2f %% of it' % (views['rows'], biggest, longest[biggest], 100 * longest[biggest] / rows_side))
    for n in NAMES:
        r = max(s.reach(50, 50) for s in icons[n][0]) / radius
        print('  %-26s longest %5.2f  night %4.1f %% of the diameter, %4.1f %% of the radius' % (n, longest[n], 100 * longest[n] / NIGHT_SIDE, 100 * r))


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) > 2 or any(a.startswith('-') for a in args):
        print(__doc__); sys.exit(2)
    src = args[0] if args else os.path.join(HERE, 'flat')
    outroot = args[1] if len(args) > 1 else os.path.join(REPO, 'fids-current', 'logos', 'weather')
    build(src, outroot)
