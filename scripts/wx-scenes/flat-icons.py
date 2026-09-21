"""Flat weather icons in the style the owner chose: white puffy clouds, a lemon
sun with stubby rays, a lemon crescent moon, blue teardrops, blue wind curls,
a grey cloud behind for overcast. No outlines. Gently animated with SMIL so
they move inside an <img>. Every name the card's icon mappers can return gets
a file, plus the extras the old set had."""
import os, sys, math
OUT = sys.argv[1]
WHITE, GREY, SUN, BLUE, PALE = '#FFFFFF', '#AEB9C4', '#FFF200', '#3A78C7', '#DCEBFB'

def cloud(x=100, y=118, s=1.0, fill=WHITE, op=1.0, anim=True, dur='3.6s'):
    # three lobes on a rounded base; all one colour so the union reads as one shape
    g = (f'<g transform="translate({x} {y}) scale({s})" fill="{fill}" opacity="{op}">'
         f'<circle cx="-34" cy="6" r="24"/><circle cx="0" cy="-16" r="34"/><circle cx="34" cy="4" r="26"/>'
         f'<rect x="-58" y="6" width="116" height="30" rx="15"/>')
    if anim:
        g += (f'<animateTransform attributeName="transform" type="translate" additive="sum" '
              f'values="0 0;0 -3;0 0" dur="{dur}" repeatCount="indefinite"/>')
    return g + '</g>'

def sun(x=100, y=100, r=30, rays=True, anim=True):
    s = f'<g transform="translate({x} {y})">'
    if rays:
        s += f'<g stroke="{SUN}" stroke-width="9" stroke-linecap="round">'
        for i in range(8):
            a = math.radians(i * 45); r0, r1 = r + 11, r + 23
            s += (f'<line x1="{r0*math.cos(a):.1f}" y1="{r0*math.sin(a):.1f}" '
                  f'x2="{r1*math.cos(a):.1f}" y2="{r1*math.sin(a):.1f}"/>')
        if anim:
            s += '<animateTransform attributeName="transform" type="rotate" from="0" to="45" dur="18s" repeatCount="indefinite"/>'
        s += '</g>'
    s += f'<circle r="{r}" fill="{SUN}">'
    if anim: s += '<animate attributeName="r" values="{0};{1};{0}" dur="4s" repeatCount="indefinite"/>'.format(r, r + 1.5)
    s += '</circle></g>'
    return s

def moon(x=100, y=96, r=30):
    return (f'<defs><mask id="m"><rect x="0" y="0" width="200" height="200" fill="#fff"/>'
            f'<circle cx="{x+18}" cy="{y-12}" r="{r-2}" fill="#000"/></mask></defs>'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="{SUN}" mask="url(#m)"/>')

def drop(x, y, s=1.0, delay=0.0, dur=1.4, fill=BLUE):
    d = (f'<g transform="translate({x} {y}) rotate(14) scale({s})"><path fill="{fill}" '
         f'd="M0 -14 C 5 -6 9 -1 9 4 A 9 9 0 0 1 -9 4 C -9 -1 -5 -6 0 -14 Z"/>'
         f'<animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;0 14" dur="{dur}s" begin="{delay}s" repeatCount="indefinite"/>'
         f'<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.7;1" dur="{dur}s" begin="{delay}s" repeatCount="indefinite"/></g>')
    return d

def drops(n, y=150, spread=22, s=1.0):
    xs = [100 + (i - (n - 1) / 2) * spread for i in range(n)]
    return ''.join(drop(x, y + (10 if i % 2 else 0), s, delay=0.25 * i) for i, x in enumerate(xs))

def flake(x, y, r=9, delay=0.0, fill=WHITE):
    arms = ''.join(f'<line x1="{-r*math.cos(math.radians(a)):.1f}" y1="{-r*math.sin(math.radians(a)):.1f}" '
                   f'x2="{r*math.cos(math.radians(a)):.1f}" y2="{r*math.sin(math.radians(a)):.1f}"/>' for a in (0, 60, 120))
    return (f'<g transform="translate({x} {y})" stroke="{fill}" stroke-width="3.2" stroke-linecap="round">{arms}'
            f'<animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;3 12" dur="2.6s" begin="{delay}s" repeatCount="indefinite"/>'
            f'<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.75;1" dur="2.6s" begin="{delay}s" repeatCount="indefinite"/></g>')

def flakes(n, y=152, spread=24):
    xs = [100 + (i - (n - 1) / 2) * spread for i in range(n)]
    return ''.join(flake(x, y + (8 if i % 2 else 0), delay=0.5 * i) for i, x in enumerate(xs))

def bolt(x=104, y=140):
    return (f'<polygon points="{x-8},{y-2} {x+10},{y-2} {x+1},{y+16} {x+12},{y+16} {x-6},{y+44} {x-1},{y+22} {x-12},{y+22}" fill="{SUN}">'
            f'<animate attributeName="opacity" values="1;1;.25;1;1;1" keyTimes="0;.42;.47;.52;.6;1" dur="3.4s" repeatCount="indefinite"/></polygon>')

def wind(y=132):
    s = f'<g fill="none" stroke="{BLUE}" stroke-width="8" stroke-linecap="round">'
    for i, (x0, x1, cy, r) in enumerate([(36, 116, y - 22, 10), (28, 128, y, 12), (44, 108, y + 22, 9)]):
        s += (f'<path d="M{x0} {cy} H{x1} a{r} {r} 0 1 0 -{r} -{r}">'
              f'<animateTransform attributeName="transform" type="translate" values="0 0;4 0;0 0" dur="{2.2 + 0.4*i}s" repeatCount="indefinite"/></path>')
    return s + '</g>'

def fogbars(y=150):
    return ''.join(f'<rect x="{34 + 8*i}" y="{y + 16*i}" width="{132 - 16*i}" height="9" rx="4.5" fill="{WHITE}" opacity="{.95 - .2*i}">'
                   f'<animateTransform attributeName="transform" type="translate" values="0 0;{6 if i%2 else -6} 0;0 0" dur="{4 + i}s" repeatCount="indefinite"/></rect>' for i in range(3))

def hailstones(n=4, y=152):
    xs = [100 + (i - (n - 1) / 2) * 22 for i in range(n)]
    return ''.join(f'<circle cx="{x}" cy="{y + (8 if i%2 else 0)}" r="5.5" fill="{WHITE}">'
                   f'<animateTransform attributeName="transform" type="translate" values="0 0;0 16" dur="1.1s" begin="{0.2*i}s" repeatCount="indefinite"/>'
                   f'<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.7;1" dur="1.1s" begin="{0.2*i}s" repeatCount="indefinite"/></circle>' for i, x in enumerate(xs))

def svg(inner, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="{title}">'
            f'{inner}</svg>\n')

ICONS = {
  'clear-day':          sun(100, 100, 36),
  'clear-night':        moon(100, 100, 36),
  'partly-cloudy-day':  sun(132, 74, 27) + cloud(92, 118, .95),
  'partly-cloudy-night':moon(134, 76, 26) + cloud(92, 118, .95),
  'cloudy':             cloud(118, 104, .8, GREY, anim=False) + cloud(90, 124, .95),
  'overcast-day':       cloud(118, 104, .8, GREY, anim=False) + cloud(90, 124, .95),
  'overcast-night':     cloud(118, 104, .8, GREY, anim=False) + cloud(90, 124, .95),
  'overcast':           cloud(118, 104, .8, GREY, anim=False) + cloud(90, 124, .95),
  'fog':                cloud(100, 96, .85, WHITE, .9) + fogbars(140),
  'mist':               cloud(100, 96, .85, WHITE, .9) + fogbars(140),
  'drizzle':            cloud(100, 100, .95) + drops(3, 150, 24, .75),
  'rain':               cloud(100, 96, .95) + drops(4, 150, 22, .9),
  'extreme-rain':       cloud(100, 92, 1.0) + drops(5, 146, 20, 1.0) + drops(4, 172, 22, .8),
  'sleet':              cloud(100, 96, .95) + drop(76, 152, .8, 0) + flake(100, 158, 8, .6) + drop(124, 152, .8, .3),
  'hail':               cloud(100, 96, .95) + hailstones(4, 152),
  'snow':               cloud(100, 96, .95) + flakes(3, 152, 26),
  'extreme-snow':       cloud(100, 92, 1.0) + flakes(4, 148, 22) + flakes(3, 174, 26),
  'thunderstorms-day-rain':   sun(140, 66, 22) + cloud(96, 104, .95) + bolt(96, 136) + drop(66, 154, .8, .2) + drop(128, 154, .8, .5),
  'thunderstorms-night-rain': moon(142, 68, 22) + cloud(96, 104, .95) + bolt(96, 136) + drop(66, 154, .8, .2) + drop(128, 154, .8, .5),
  'thunderstorms-rain':       cloud(100, 100, 1.0) + bolt(100, 134) + drop(68, 152, .8, .2) + drop(132, 152, .8, .5),
  'thunderstorms':            cloud(100, 100, 1.0) + bolt(100, 134),
  'wind':                     wind(112),
  'wind-cloud':               cloud(112, 96, .85) + wind(150),
}
os.makedirs(OUT, exist_ok=True)
for name, inner in ICONS.items():
    open(os.path.join(OUT, name + '.svg'), 'w').write(svg(inner, name.replace('-', ' ')))
print(len(ICONS), 'icons written to', OUT)
