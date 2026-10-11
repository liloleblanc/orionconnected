import json, re, sys, os
base = sys.argv[1]

def rgb(s):
    m = re.match(r'rgb\((\d+), (\d+), (\d+)\)', s or '')
    return tuple(int(v) for v in m.groups()) if m else None

def clean(html):
    # drop the xmlns the serializer added, and any fill/stroke we decide ourselves
    return html.replace(' xmlns="http://www.w3.org/2000/svg"', '')

def wrap(it, inner):
    m = it['m']
    if m == [1, 0, 0, 1, 0, 0]:
        return inner
    return '<g transform="matrix(%s)">%s</g>' % (','.join(str(v) for v in m), inner)

def recolour(html, col):
    h = re.sub(r'\s(fill|stroke)="[^"]*"', '', html)
    return re.sub(r'^<(\w+)', r'<\1 fill="%s"' % col, h)

out = {}
for s in ('solid', 'flat', 'line'):
    d = json.loads(open(os.path.join(base, s, 'items.json')).readline())
    items = d['items']
    groups = []
    if s == 'line':
        discs = [it for it in items if it['tag'] in ('circle', 'ellipse') and rgb(it['fill']) == (71, 126, 145) and it['box'][2] - it['box'][0] > 100]
        for dc in discs:
            groups.append({'disc': dc, 'items': []})
        for it in items:
            if it in discs: continue
            cx, cy = (it['box'][0] + it['box'][2]) / 2, (it['box'][1] + it['box'][3]) / 2
            for g in groups:
                b = g['disc']['box']
                if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]:
                    g['items'].append(it); break
        for g in groups:
            g['box'] = g['disc']['box']
    else:
        gap = 12 if s == 'solid' else 30
        par = list(range(len(items)))
        def f(i):
            while par[i] != i:
                par[i] = par[par[i]]; i = par[i]
            return i
        for i, a in enumerate(items):
            for j in range(i + 1, len(items)):
                b = items[j]
                if a['box'][0] - gap <= b['box'][2] and b['box'][0] - gap <= a['box'][2] and a['box'][1] - gap <= b['box'][3] and b['box'][1] - gap <= a['box'][3]:
                    par[f(i)] = f(j)
        cl = {}
        for i, it in enumerate(items):
            cl.setdefault(f(i), []).append(it)
        for its in cl.values():
            bx = [min(i['box'][0] for i in its), min(i['box'][1] for i in its), max(i['box'][2] for i in its), max(i['box'][3] for i in its)]
            groups.append({'items': its, 'box': bx})
    # reading order: rows by centre y, then x
    groups.sort(key=lambda g: (round(((g['box'][1] + g['box'][3]) / 2) / (300 if s != 'flat' else 250)), g['box'][0]))
    icons = []
    for k, g in enumerate(groups):
        x0, y0, x1, y1 = g['box']
        w, h = x1 - x0, y1 - y0
        side = max(w, h)
        if s == 'line':
            pad = 0
        else:
            pad = side * 0.06
        vx, vy = (x0 + x1) / 2 - side / 2 - pad, (y0 + y1) / 2 - side / 2 - pad
        vs = side + 2 * pad
        vbox = '%.2f %.2f %.2f %.2f' % (vx, vy, vs, vs)
        if s == 'flat':
            body = ''.join(wrap(it, clean(it['html'])) for it in g['items'])
            svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s</svg>' % (vbox, body)
        else:
            # one colour: ink white in a luminance mask, paper black, in drawing order
            parts = []
            for it in g['items']:
                c = rgb(it['fill'])
                if c is None: continue
                lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
                ink = lum > 200 if s == 'line' else lum < 128
                parts.append(wrap(it, recolour(clean(it['html']), '#fff' if ink else '#000')))
            mid = '%s-%d' % (s, k)
            svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"><defs><mask id="m-%s" maskUnits="userSpaceOnUse" x="%.2f" y="%.2f" width="%.2f" height="%.2f">'
                   '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="#000"/>%s</mask></defs>'
                   '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="currentColor" mask="url(#m-%s)"/></svg>') % (
                vbox, mid, vx, vy, vs, vs, vx, vy, vs, vs, ''.join(parts), vx, vy, vs, vs, mid)
            if s == 'line':
                # the glyph's own share of the disc, so a new disc can be drawn at any size
                r = (g['disc']['box'][2] - g['disc']['box'][0]) / 2
                svg = svg.replace('<svg ', '<svg data-disc-r="%.2f" ' % r, 1)
        os.makedirs(os.path.join(base, s, 'icons'), exist_ok=True)
        open(os.path.join(base, s, 'icons', '%02d.svg' % k), 'w').write(svg)
        icons.append(k)
    out[s] = len(icons)
print(out)
