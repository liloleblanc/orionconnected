"""Typeset a hotel name as outlined SVG paths (for a hotel that publishes no logo).
usage: wordmark.py <font.woff2> <weight> <hex> <out.svg> <line1> [<line2>]
Line 1 at full size, tracked 0.10 em; line 2 at 0.72 size, tracked 0.22 em, centred under line 1.
Glyphs are drawn from the font as they are (no kerning, letterspacing only)."""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

font_path, weight, colour, out = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]
lines = sys.argv[5:]
f = TTFont(font_path)
if 'fvar' in f:
    f = instancer.instantiateVariableFont(f, {'wght': weight})
gs = f.getGlyphSet(); cmap = f.getBestCmap(); hmtx = f['hmtx']
upm = f['head'].unitsPerEm
cap = getattr(f['OS/2'], 'sCapHeight', 700) or 700

def width(text, size, track):
    w = 0
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]; w += hmtx[g][0] * size / upm
        if i < len(text) - 1: w += track * size
    return w

def draw(text, size, track, x0, base, pen_out):
    x = x0
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]
        s = size / upm
        tp = TransformPen(pen_out, (s, 0, 0, -s, x, base))   # flip y: font up = SVG down
        gs[g].draw(tp)
        x += hmtx[g][0] * s + (track * size if i < len(text) - 1 else 0)

S1, T1 = 100.0, 0.10
w1 = width(lines[0], S1, T1)
paths = []
pen = SVGPathPen(gs); bpen = BoundsPen(gs)
class Both:
    def __init__(s, a, b): s.a, s.b = a, b
    def __getattr__(s, n):
        fa, fb = getattr(s.a, n), getattr(s.b, n)
        return lambda *x, **k: (fa(*x, **k), fb(*x, **k))
both = Both(pen, bpen)
base1 = S1 * cap / upm
draw(lines[0], S1, T1, 0, base1, both)
if len(lines) > 1:
    S2, T2 = S1 * 0.72, 0.22
    w2 = width(lines[1], S2, T2)
    base2 = base1 + S1 * 0.40 + S2 * cap / upm
    draw(lines[1], S2, T2, (w1 - w2) / 2, base2, both)
x0, y0, x1, y1 = bpen.bounds
d = pen.getCommands()
fmt = lambda v: ('%.2f' % v).rstrip('0').rstrip('.')
svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s">'
       '<path fill="%s" d="%s"/></svg>\n') % (fmt(x0), fmt(y0), fmt(x1 - x0), fmt(y1 - y0), colour, d)
open(out, 'w').write(svg)
print('viewBox', fmt(x0), fmt(y0), fmt(x1 - x0), fmt(y1 - y0), 'bytes', len(svg))
