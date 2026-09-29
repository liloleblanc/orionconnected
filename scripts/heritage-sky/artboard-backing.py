#!/usr/bin/env python3
"""
artboard-backing.py — put the artboard back behind a side-view aircraft drawing.

A drawing made on a white artboard can rely on that white without meaning to:
a shape drawn at partial opacity, or a sliver left between two shapes, reads
as white in the editor and as whatever is behind it once the file is shown
over a sky. This adds opaque white exactly where the artboard was showing
through inside the aeroplane, beneath all the artwork, so the file looks the
same over any background as it did on the artboard, and nothing outside the
aeroplane changes.

Two kinds of backing, both inserted as the first things drawn:
  1. a white copy of every shape whose fill is not fully opaque (opacity,
     fill-opacity, or a gradient with a stop-opacity below 1);
  2. a white band behind every enclosed gap: pixels that are transparent in
     a render but cannot be reached from the edge of the picture without
     crossing the drawing.

Usage: python3 scripts/heritage-sky/artboard-backing.py in.svg out.svg
       (macOS only: renders with qlmanage; needs Pillow)
"""
import os, re, subprocess, sys, tempfile
from PIL import Image, ImageChops, ImageFilter

PX = 4000            # render width in pixels
PAD_UNITS = 0.45     # how far a gap backing reaches under the neighbouring shapes
MIN_GAP_PX = 40      # ignore specks smaller than this many pixels at PX


def strip_root_size(s):
    m = re.search(r'<svg\b[^>]*>', s)
    tag = re.sub(r'\s(width|height)="100%"', '', m.group(0))
    return s[:m.start()] + tag + s[m.end():]


def viewbox(s):
    vb = re.search(r'<svg\b[^>]*\bviewBox="([^"]+)"', s).group(1)
    return [float(v) for v in re.split(r'[\s,]+', vb.strip())]


def translucent_shapes(s):
    grads = {}
    for m in re.finditer(r'<(linearGradient|radialGradient)\b([^>]*?)(/>|>(.*?)</\1>)', s, re.S):
        gid = re.search(r'\bid="([^"]+)"', m.group(2)).group(1)
        ops = [float(x) for x in re.findall(r'stop-opacity="([0-9.eE+-]+)"', m.group(4) or '')]
        href = re.search(r'href="#([^"]+)"', m.group(2))
        grads[gid] = (min(ops) if ops else None, href.group(1) if href else None)

    def gmin(g, depth=0):
        op, h = grads.get(g, (None, None))
        if op is None and h and depth < 8:
            return gmin(h, depth + 1)
        return 1.0 if op is None else op

    out = []
    for m in re.finditer(r'<(path|rect|ellipse|circle|polygon)\b[^>]*?/?>', s):
        t = m.group(0)
        op = re.search(r'\sopacity="([0-9.eE+-]+)"', t)
        fo = re.search(r'fill-opacity="([0-9.eE+-]+)"', t)
        fg = re.search(r'fill="url\(#([^)]+)\)"', t)
        a = min(float(op.group(1)) if op else 1.0, float(fo.group(1)) if fo else 1.0,
                gmin(fg.group(1)) if fg else 1.0)
        if a < 0.999 and 'fill="none"' not in t:
            out.append(t)
    return out


def white_copy(tag):
    t = re.sub(r'\s(class|id|fill|fill-opacity|opacity|stroke|stroke-width|style|mask|filter|clip-path)="[^"]*"', '', tag)
    t = t.rstrip('/>').rstrip() + ' fill="#fff" stroke="none"/>'
    return t


def render(svg_text, vb, bg, workdir, name):
    w, h = vb[2], vb[3]
    H = PX * h / w
    inner = re.sub(r'<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--.*?-->', '', svg_text, flags=re.S)
    inner = re.sub(r'<metadata>.*?</metadata>', '', inner, flags=re.S)
    m = re.search(r'<svg\b[^>]*>', inner)
    tag = re.sub(r'\s(width|height|x|y)="[^"]*"', '', m.group(0))
    tag = tag.replace('<svg', '<svg x="0" y="0" width="%d" height="%.3f"' % (PX, H), 1)
    inner = inner[:m.start()] + tag + inner[m.end():]
    wrap = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="%d" height="%d" viewBox="0 0 %d %d"><rect width="%d" height="%d" fill="%s"/>%s</svg>'
            % (PX, PX, PX, PX, PX, PX, bg, inner))
    p = os.path.join(workdir, name + '.svg')
    open(p, 'w').write(wrap)
    subprocess.run(['qlmanage', '-t', '-s', str(PX), '-o', workdir, p], capture_output=True)
    return Image.open(p + '.png').convert('RGB').crop((0, 0, PX, int(round(H))))


def alpha_of(svg_text, vb, workdir, tag):
    w = render(svg_text, vb, '#ffffff', workdir, tag + '-w')
    b = render(svg_text, vb, '#000000', workdir, tag + '-b')
    d = ImageChops.difference(w, b)
    r, g, bb = d.split()
    return ImageChops.invert(ImageChops.lighter(ImageChops.lighter(r, g), bb))


def outside_mask(A):
    """Transparent pixels reachable from the edge of the render: the sky."""
    W, H = A.size; a = A.load()
    clear = lambda x, y: a[x, y] < 60
    out = bytearray(W * H); st = []
    for x in range(W):
        for y in (0, H - 1):
            if clear(x, y) and not out[y * W + x]: out[y * W + x] = 1; st.append((x, y))
    for y in range(H):
        for x in (0, W - 1):
            if clear(x, y) and not out[y * W + x]: out[y * W + x] = 1; st.append((x, y))
    while st:
        x, y = st.pop()
        for c, d in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= c < W and 0 <= d < H and not out[d * W + c] and clear(c, d):
                out[d * W + c] = 1; st.append((c, d))
    m = Image.new('L', (W, H)); m.putdata([255 if v else 0 for v in out])
    return m


def gap_components(A, k=None):
    """Transparent pixels the sky cannot reach: gaps enclosed by the drawing."""
    sky = outside_mask(A)
    W, H = A.size; a = A.load(); s = sky.load()
    seen = bytearray(W * H); comps = []
    for y in range(H):
        for x in range(W):
            if a[x, y] < 60 and not s[x, y] and not seen[y * W + x]:
                st = [(x, y)]; seen[y * W + x] = 1; pts = []
                while st:
                    p, q = st.pop(); pts.append((p, q))
                    for c, d in ((p + 1, q), (p - 1, q), (p, q + 1), (p, q - 1)):
                        if 0 <= c < W and 0 <= d < H and not seen[d * W + c] and a[c, d] < 60 and not s[c, d]:
                            seen[d * W + c] = 1; st.append((c, d))
                if len(pts) >= MIN_GAP_PX:
                    comps.append(pts)
    return comps, sky


def band_polygon(pts, vb, scale, pad):
    cols = {}
    for x, y in pts:
        lo, hi = cols.get(x, (y, y)); cols[x] = (min(lo, y), max(hi, y))
    xs = sorted(cols)
    step = max(1, int(scale))            # about one drawing unit per vertex
    samp = xs[::step] + ([xs[-1]] if xs[-1] not in xs[::step] else [])
    def u(px_x, px_y):
        return (vb[0] + px_x / scale, vb[1] + px_y / scale)
    top, bot = [], []
    for i, x in enumerate(samp):
        near = [cols[c] for c in xs if abs(c - x) <= step]
        lo = min(v[0] for v in near); hi = max(v[1] for v in near)
        ux, uy0 = u(x + 0.5, lo); _, uy1 = u(x + 0.5, hi + 1)
        if i == 0: ux -= pad
        if i == len(samp) - 1: ux += pad
        top.append((ux, uy0 - pad)); bot.append((ux, uy1 + pad))
    ring = top + bot[::-1]
    return 'M' + ' L'.join('%.2f %.2f' % p for p in ring) + ' Z'


def main(src, dst):
    s = strip_root_size(open(src).read())
    vb = viewbox(s)
    scale = PX / vb[2]
    if re.search(r'\btransform="', s):
        sys.exit('drawing uses transforms; copy them onto the backing before trusting this')
    shapes = translucent_shapes(s)
    work = tempfile.mkdtemp()
    A = alpha_of(s, vb, work, 'src')
    comps, sky = gap_components(A)
    paths = [band_polygon(c, vb, scale, PAD_UNITS) for c in comps]
    backing = ['<g id="artboard-backing">']
    backing += ['  ' + white_copy(t) for t in shapes]
    backing += ['  <path fill="#fff" d="%s"/>' % d for d in paths]
    backing.append('</g>')
    # first thing drawn: straight after </defs> if there is one, else after <svg ...>
    m = re.search(r'</defs>', s) or re.search(r'<svg\b[^>]*>', s)
    before = re.sub(r'<defs\b.*?</defs>', '', s[:m.end()], flags=re.S)
    if re.search(r'<(path|rect|ellipse|circle|polygon|polyline|line|use|image|text)\b', before):
        sys.exit('artwork is drawn before </defs>; the backing would not be underneath it')
    out = s[:m.end()] + '\n' + '\n'.join(backing) + '\n' + s[m.end():]
    open(dst, 'w').write(out)
    # The backing must stay inside the aeroplane: white drawn where the sky
    # reaches would show. The sky is shrunk by a few pixels so the
    # aeroplane's own anti-aliased outline is not counted.
    A2 = alpha_of(out, vb, work, 'out')
    outside = ImageChops.multiply(sky.filter(ImageFilter.MinFilter(7)),
                                  ImageChops.subtract(A2, A).point(lambda v: 255 if v > 24 else 0))
    leak = sum(1 for v in outside.getdata() if v)
    print('translucent shapes backed: %d, gaps backed: %d (%s px), backing outside the outline: %d px'
          % (len(shapes), len(comps), '+'.join(str(len(c)) for c in comps), leak))
    if leak > 50:
        sys.exit('backing leaks outside the aeroplane; check ' + work)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
