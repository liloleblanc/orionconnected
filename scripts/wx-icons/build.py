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
  disc-day/<c>.svg       white circle + colour icon at 76% (Colour)
  disc-night/<c>.svg     circle + solid glyph at 80% coloured by CSS variables
                         --wx-disc / --wx-ink (Solid on the weather card, which
                         inlines its icons, so the variables reach them)
Where a pack has no icon for a condition, a stand-in is used: the line
pack's glyph drawn bolder for Solid, the solid glyph in the pack's slate
blue for Colour.
"""
import os, re, sys

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
# a line glyph sits in its old disc's box, about two thirds of it
LINE_FILL = 0.66

def load(i):
    d = {'s': 'solid', 'l': 'line', 'f': 'flat'}[i[0]]
    svg = open(os.path.join(SPLIT, d, 'icons', i[1:] + '.svg')).read()
    vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
    inner = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    inner = re.sub(r'(\d+\.\d{2})\d+', r'\1', inner)            # 2 decimals is plenty
    return vb, inner

def glyph(i, size, fill=None, style=None, bold=False, uid=''):
    """The icon placed centred in a 100x100 box at `size` (percent)."""
    vb, inner = load(i)
    if i[0] == 'l':
        size = min(100.0, size / LINE_FILL)
    if bold:
        inner = inner.replace('fill="#fff"', 'fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round"')
    if i[0] != 'f':
        if style:
            inner = inner.replace('fill="currentColor"', 'style="fill:%s"' % style)
        else:
            inner = inner.replace('fill="currentColor"', 'fill="%s"' % fill)
        inner = inner.replace('id="m-', 'id="m%s-' % uid).replace('url(#m-', 'url(#m%s-' % uid)
    off = (100 - size) / 2
    return '<svg x="%.2f" y="%.2f" width="%.2f" height="%.2f" viewBox="%s">%s</svg>' % (off, off, size, size, vb, inner)

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
    write('disc-day', '<circle cx="50" cy="50" r="50" fill="#FFFFFF"/>' + day)
    write('disc-night', '<circle cx="50" cy="50" r="50" style="fill:var(--wx-disc, #033F77)"/>'
          + glyph(sid, 80, style='var(--wx-ink, #FFFFFF)', bold=bold))
print(len(MAP), 'conditions x 4 sets written to', OUT)
