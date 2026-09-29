#!/usr/bin/env python3
"""Build fids-current/data/gates/<IATA>.json from OpenStreetMap.

Each file holds where aircraft actually park at one airport: the stands
(aeroway=parking_position), the gate doors (aeroway=gate) and the terminal
buildings (aeroway=terminal, as the centroid of their outlines), keyed by the
ref OSM carries, normalised the same way the board normalises a feed's gate
(_gateRefNorm in fids-core.js). The gate maps use it to draw an aeroplane that
has not left yet at its own stand instead of over the middle of its route.

A stand is [lat, lng] or [lat, lng, hdg]. Most stands are mapped as the
stand's lead-in LINE (80-150 m, from the taxilane to where the nose wheel
stops), so the point is the line's STOP END - the end at the stand's own
door, else the end away from the taxilane it is entered from - and hdg is the
way the nose points once parked, degrees true. A stand mapped as a point
stays a point, with a heading only when its own door is beside it.

door_stands lists, for each gate door, the stands boarded through it, the
door's own stand first: a feed's "gate" is the door, and one door can serve
several stands (walk-outs through side doors). bridged lists the stands a jet
bridge reaches.

Data (c) OpenStreetMap contributors, ODbL 1.0 - the same database the gate
maps' street tiles are drawn from.

Usage:  python3 scripts/gates/build-gates.py [IATA ...]
With no arguments it builds every airport that has a live feed in the worker
(AUTHORITY_HANDLERS in workers/fids-proxy.js) plus the Atlantic and central
Canadian boards whose feeds live elsewhere. Standard library only.

GATES_CACHE=<dir> keeps each airport's raw Overpass answer (with geometry) so
a rebuild needs no refetch, and writes <IATA>.airside.geojson beside it: the
runways, taxiways, taxilanes, aprons, stands, doors, jet bridges, holding
points and terminal outlines, for later use. Neither belongs in the repo.
"""
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'fids-current', 'data', 'gates')
ENDPOINTS = ['https://overpass-api.de/api/interpreter']   # the kumi.systems mirror times out from here
UA = 'orionconnected-gate-builder/1.0 (+https://fids.orionconnected.com)'
EXTRA = ['YQM', 'YHZ', 'YUL', 'YYZ']


def norm_ref(ref):
    """Mirror of _gateRefNorm in fids-core.js: upper case, no 'GATE' prefix,
    no spaces/dashes/dots/underscores, no leading zeros on a digit run."""
    s = str(ref or '').upper().strip()
    s = re.sub(r'^GATE\s*', '', s)
    s = re.sub(r'[\s\-_.]', '', s)
    s = re.sub(r'(^|[A-Z])0+(\d)', r'\1\2', s)
    return s


def feed_airports():
    src = open(os.path.join(ROOT, 'workers', 'fids-proxy.js'), encoding='utf-8').read()
    i = src.index('const AUTHORITY_HANDLERS = {')
    depth, j = 0, src.index('{', i)
    while j < len(src):
        if src[j] == '{':
            depth += 1
        elif src[j] == '}':
            depth -= 1
            if not depth:
                break
        j += 1
    keys = re.findall(r'^  ([a-z0-9]{3}):', src[i:j], re.M)
    return sorted(set(k.upper() for k in keys) | set(EXTRA))


def airport_coords():
    """AIRPORT_COORDS from airport-coords.js, for the bounding-box fallback."""
    txt = open(os.path.join(ROOT, 'fids-current', 'js', 'airport-coords.js'), encoding='utf-8').read()
    return {m.group(1): (float(m.group(2)), float(m.group(3)))
            for m in re.finditer(r'\b([A-Z]{3}):\[(-?[\d.]+),(-?[\d.]+)\]', txt)}


def overpass(query, label=''):
    """One POST to overpass-api.de, retried politely: 15 s, 30 s, 60 s ...
    (or the server's Retry-After) between tries, each failure printed. A 200
    whose remark says the query ran out of time or memory is a failure too -
    its elements are cut short."""
    body = urllib.parse.urlencode({'data': query}).encode()
    last, tries = None, 7
    for attempt in range(tries):
        for ep in ENDPOINTS:
            try:
                req = urllib.request.Request(ep, data=body, headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=240) as r:
                    d = json.load(r)
                remark = str(d.get('remark') or '')
                if re.search(r'runtime (error|remark)|timed out|out of memory', remark, re.I):
                    raise RuntimeError('overpass remark: ' + remark.strip()[:200])
                return d
            except Exception as e:  # 429/504/timeouts/cut-short answers
                last = e
                if attempt == tries - 1:
                    break
                wait = min(300, 15 * 2 ** attempt)
                ra = e.headers.get('Retry-After') if isinstance(e, urllib.error.HTTPError) and e.headers else None
                if ra and ra.strip().isdigit():
                    wait = max(wait, min(600, int(ra)))
                print('  %sretry %d in %ds after %s' % (label and label + ' ', attempt + 1, wait, e), file=sys.stderr, flush=True)
                time.sleep(wait)
    raise RuntimeError('overpass failed: %s' % last)


# What the gate file is built from, and what the airside GeoJSON keeps.
GATE_KINDS = ('gate', 'parking_position', 'terminal')
AIRSIDE = ('runway', 'taxiway', 'taxilane', 'apron', 'parking_position', 'gate',
           'jet_bridge', 'holding_position', 'terminal')


def query(prefix, where):
    """Everything airside in one answer. Nodes and ways come with their
    geometry (`out tags geom`); relations need `out geom` - with `tags` alone
    Overpass drops their members, and a multipolygon terminal or apron would
    have no outline."""
    return ('[out:json][timeout:180];%s'
            '(nwr%s["aeroway"~"^(%s)$"];nwr%s["building"="terminal"];)->.x;'
            '(node.x;way.x;);out tags geom;'
            'rel.x;out geom;') % (prefix, where, '|'.join(AIRSIDE), where)


CACHE = os.environ.get('GATES_CACHE')   # optional dir of raw Overpass answers, so a rebuild needs no refetch


def fetch(iata, coords):
    cp = os.path.join(CACHE, iata + '.json') if CACHE else None
    if cp and os.path.exists(cp):
        d = json.load(open(cp, encoding='utf-8'))
        return d.get('elements', []) if isinstance(d, dict) else d
    has_gates = lambda els: any(e.get('tags', {}).get('aeroway') in GATE_KINDS for e in els)
    els = overpass(query('area["aeroway"="aerodrome"]["iata"="%s"]->.a;' % iata, '(area.a)'), iata).get('elements', [])
    if not has_gates(els) and iata in coords:
        # An aerodrome mapped as a node has no area; take a ~4 km box instead.
        lat, lng = coords[iata]
        box = '(%f,%f,%f,%f)' % (lat - 0.035, lng - 0.05, lat + 0.035, lng + 0.05)
        alt = overpass(query('', box), iata + ' box').get('elements', [])
        if has_gates(alt) or not els:
            els = alt
    if cp:
        os.makedirs(CACHE, exist_ok=True)
        json.dump(els, open(cp, 'w', encoding='utf-8'), separators=(',', ':'))
    return els


# ---------------------------------------------------------------- geometry

M_PER_DEG = 6371000 * math.pi / 180


def dist_m(a, b):
    """Great-circle metres between two [lat, lng] points."""
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def bearing(a, b):
    """Initial bearing from a to b, degrees true, 0 <= x < 360, 1 decimal."""
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    dlo = math.radians(b[1] - a[1])
    y = math.sin(dlo) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dlo)
    h = round(math.degrees(math.atan2(y, x)) % 360, 1)
    return 0.0 if h >= 360 else h


def _line(geom):
    return [[g['lat'], g['lon']] for g in (geom or []) if g and 'lat' in g]


def _rings(ways):
    """Join member ways end to end into closed rings."""
    ways = [w for w in ways if len(w) >= 2]
    rings = []
    while ways:
        ring = ways.pop(0)
        grown = True
        while ring[0] != ring[-1] and grown:
            grown = False
            for i, w in enumerate(ways):
                if w[0] == ring[-1]:
                    ring = ring + w[1:]
                elif w[-1] == ring[-1]:
                    ring = ring + w[-2::-1]
                elif w[-1] == ring[0]:
                    ring = w[:-1] + ring
                elif w[0] == ring[0]:
                    ring = w[:0:-1] + ring
                else:
                    continue
                ways.pop(i)
                grown = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def area_of(e):
    """(outer rings, inner rings) of a closed way or a multipolygon relation,
    else None."""
    if e.get('type') == 'way':
        pts = _line(e.get('geometry'))
        if len(pts) >= 4 and pts[0] == pts[-1]:
            return [pts], []
        return None
    if e.get('type') == 'relation':
        outer = [_line(m.get('geometry')) for m in e.get('members', []) if m.get('type') == 'way' and m.get('role') != 'inner']
        inner = [_line(m.get('geometry')) for m in e.get('members', []) if m.get('type') == 'way' and m.get('role') == 'inner']
        o = _rings(outer)
        return (o, _rings(inner)) if o else None
    return None


def box_centre(e):
    """Overpass's own 'center': the middle of the bounding box."""
    if 'lat' in e:
        return [e['lat'], e['lon']]
    if e.get('center'):
        return [e['center']['lat'], e['center']['lon']]
    b = e.get('bounds')
    if b:
        return [(b['minlat'] + b['maxlat']) / 2, (b['minlon'] + b['maxlon']) / 2]
    pts = _line(e.get('geometry')) or [p for m in e.get('members', []) for p in _line(m.get('geometry'))]
    if pts:
        return [(min(p[0] for p in pts) + max(p[0] for p in pts)) / 2,
                (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2]
    return None


def centroid(outers, inners):
    """Area-weighted centroid of an outline (holes subtracted), or None."""
    ref = outers[0][0]
    k = math.cos(math.radians(ref[0]))
    a2 = cx = cy = 0.0
    for sign, rings in ((1, outers), (-1, inners)):
        for ring in rings:
            ra = rx = ry = 0.0
            for p, q in zip(ring, ring[1:]):
                x0, y0 = (p[1] - ref[1]) * k, p[0] - ref[0]
                x1, y1 = (q[1] - ref[1]) * k, q[0] - ref[0]
                c = x0 * y1 - x1 * y0
                ra += c
                rx += (x0 + x1) * c
                ry += (y0 + y1) * c
            if ra:
                s = sign if ra > 0 else -sign   # either winding
                a2 += s * ra
                cx += s * rx
                cy += s * ry
    if abs(a2) < 1e-14:
        return None
    return [ref[0] + cy / (3 * a2), ref[1] + cx / (3 * a2) / k]


def _inside(p, ring):
    x, y, hit = p[1], p[0], False
    for a, b in zip(ring, ring[1:]):
        if (a[0] > y) != (b[0] > y) and x < a[1] + (y - a[0]) * (b[1] - a[1]) / (b[0] - a[0]):
            hit = not hit
    return hit


def _seg_m(p, a, b):
    """Metres from p to the segment a-b (local flat approximation)."""
    k = math.cos(math.radians(p[0])) * M_PER_DEG
    ax, ay = (a[1] - p[1]) * k, (a[0] - p[0]) * M_PER_DEG
    bx, by = (b[1] - p[1]) * k, (b[0] - p[0]) * M_PER_DEG
    dx, dy = bx - ax, by - ay
    t = 0.0 if not (dx or dy) else max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
    return math.hypot(ax + t * dx, ay + t * dy)


def to_outline_m(p, shape):
    """Metres from p to a terminal: 0 inside its outline, else to the nearest
    edge; a terminal mapped as a point is just a point."""
    if shape[0] == 'point':
        return dist_m(p, shape[1])
    outers, inners = shape[1]
    if any(_inside(p, r) for r in outers) and not any(_inside(p, r) for r in inners):
        return 0.0
    return min(_seg_m(p, a, b) for r in outers + inners for a, b in zip(r, r[1:]))


# ------------------------------------------------------------------ stands

# A stand's lead-in line ends at its door: YHZ's lines stop 11-24 m from the
# jet-bridge door with the same number. A same-numbered door further than
# this from both ends of the line is another terminal's gate of that number.
DOOR_NEAR_M = 250
# A stand mapped as a point gets a heading only from its own door beside it.
NODE_DOOR_M = 150
# A lead-in line starts on the taxilane it is entered from, so the end
# nearer a taxiway/taxilane centreline is the way in and the other end is
# where the aeroplane stops. Measured over the 59 airports (2026-09-28):
# where the stand's own door is within OWN_DOOR_SURE_M of the line and the
# ends differ by TAXI_GAP_M from the taxilanes, the two agree on 2807 lines
# of 2812. Where the taxilanes decide it, a door that is not the stand's own
# picks the same end only 65% of the time and the nearest terminal 58%, so
# those come last.
OWN_DOOR_SURE_M = 125
TAXI_GAP_M = 5
TAXI_REACH_M = 60
# The nose points along the last stretch of the line: lead-in lines curve off
# the taxilane and run straight into the stand, so the far end would tilt the
# heading by the curve.
HDG_BACK_M = 30


class TaxiNet:
    """Taxiway and taxilane centrelines, bucketed for 'how near' questions
    out to TAXI_REACH_M (farther counts as that far)."""
    CELL = 0.0005

    def __init__(self, lines):
        self.cells = {}
        c = self.CELL
        for l in lines:
            for a, b in zip(l, l[1:]):
                for i in range(int(math.floor(min(a[0], b[0]) / c)), int(math.floor(max(a[0], b[0]) / c)) + 1):
                    for j in range(int(math.floor(min(a[1], b[1]) / c)), int(math.floor(max(a[1], b[1]) / c)) + 1):
                        self.cells.setdefault((i, j), []).append((a, b))

    def dist(self, p):
        i, j = int(math.floor(p[0] / self.CELL)), int(math.floor(p[1] / self.CELL))
        return min([TAXI_REACH_M] + [_seg_m(p, a, b) for di in range(-2, 3) for dj in range(-2, 3)
                                     for a, b in self.cells.get((i + di, j + dj), ())])


def door_keys(refs):
    """The doors a stand boards from, best first: its own number, then the
    number without a letter (stand 1A boards from gate 1, as _gateParkSpot
    reads it)."""
    own = list(refs)
    bare = [m.group(1) for m in (re.match(r'^(.*\d)[A-Z]$', r) for r in refs) if m and m.group(1) not in own]
    return [own, bare]


def nose_bearing(seq):
    """Heading at the stop end of seq (far end first, stop end last): from the
    point HDG_BACK_M back along the line, or the far end if it is shorter."""
    stop, back, run = seq[-1], seq[0], 0.0
    for a, b in zip(seq[::-1], seq[-2::-1]):
        step = dist_m(a, b)
        if run + step >= HDG_BACK_M:
            t = (HDG_BACK_M - run) / step
            back = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
            break
        run += step
    return bearing(back, stop)


def stand_spot(e, refs, doors, terminals, net=None):
    """Where one stand element parks the aeroplane.

    Returns (point, how): point is [lat, lng] or [lat, lng, hdg] at the
    current precision, how says what fixed it (for the build log)."""
    rnd = lambda p: [round(p[0], 5), round(p[1], 5)]
    pts = _line(e.get('geometry')) if e.get('type') == 'way' else []
    if len(pts) >= 2 and pts[0] != pts[-1]:
        # A lead-in line: which end is the stop end?
        ends = (pts[0], pts[-1])

        def nearest(cands, dist, cap):
            best = None
            for c in cands:
                d0, d1 = dist(ends[0], c), dist(ends[1], c)
                d = min(d0, d1)
                if d <= cap and (best is None or d < best[0]):
                    best = (d, 0 if d0 <= d1 else 1)
            return best

        # 1. the end at its own door, when that door is beside the line;
        own = None
        for keys in door_keys(refs):
            own = own or nearest([p for k in keys for p in doors.get(k, [])], dist_m, DOOR_NEAR_M)
        pick, how = (own, 'own door') if own and own[0] <= OWN_DOOR_SURE_M else (None, None)
        # 2. else the end away from the taxilane the line is entered from;
        if not pick and net:
            t0, t1 = net.dist(ends[0]), net.dist(ends[1])
            if abs(t0 - t1) >= TAXI_GAP_M:
                pick, how = (0, 0 if t0 > t1 else 1), 'off taxilane'
        # 3. else its own door farther off, the nearest door, the nearest terminal.
        if not pick and own:
            pick, how = own, 'own door, far'
        if not pick:
            pick = nearest([p for ps in doors.values() for p in ps], dist_m, DOOR_NEAR_M)
            how = 'nearest door'
        if not pick and terminals:
            pick = nearest(terminals, to_outline_m, float('inf'))
            how = 'terminal'
        if not pick:
            c = box_centre(e)
            return (rnd(c), 'midpoint') if c else (None, None)
        seq = pts[::-1] if pick[1] == 0 else pts     # far end first, stop end last
        return rnd(seq[-1]) + [nose_bearing(seq)], how
    # A point, an outline or a centre-only answer: where it is, nose to its door.
    a = area_of(e)
    c = (centroid(*a) if a else None) or box_centre(e)
    if not c:
        return None, None
    for keys in door_keys(refs):
        near = sorted((dist_m(c, p), p) for k in keys for p in doors.get(k, []))
        if near and 3 <= near[0][0] <= NODE_DOOR_M:
            return rnd(c) + [bearing(c, near[0][1])], 'point to door'
    return rnd(c), 'point'


# A ref OSM puts in two places more than this far apart is not one gate: the
# same number at two terminals (JFK T1/T7/T8 all have a gate 1). The board
# would have to guess which, so the ref is left out and the board falls back
# to the terminal or the airport instead.
AMBIGUOUS_M = 150


# ------------------------------------------------------ doors to stands

# A stand belongs to its own door (same number, or the number without a
# letter) when that door is within this of it, else to the nearest door
# within the same reach - the board's own "stand at this door" distance.
# Farther than that is a bus gate or a pad, not a door's stand (YHZ's
# de-icing pads are 218-248 m from the nearest doors).
OWN_DOOR_M = 150
NOT_BOARDING = re.compile(r'^(DEICE|DEICING|ANTIICE)')
# One door under two numbers ("45/46") lists the stands of both. Doors that
# are merely close stay separate: of the doors with a jet-bridged stand, 466
# have another door within 15 m (a hold room's doors to neighbouring
# bridges), so nearness alone does not say two doors share their stands.
# Where they do, the airport says so in DOOR_STANDS_OVERRIDE.
DOOR_GROUP_M = 3

# LOCAL KNOWLEDGE, NOT OPENSTREETMAP: which stands each door serves, as the
# airport's operator describes it. OSM holds only where the doors and stands
# are, not who walks where, and at Moncton that is not enough: doors 1/2 and
# 3/4 are pairs 7 m apart onto shared hold rooms, and the lettered stands are
# walk-outs through side doors, so a door serves stands well away from it -
# by distance alone stand 3 is nearest door 1, stand 4 nearest door 3, and
# 6A is 103 m from door 4. The automatic rules give each door only its own
# or nearest stands. Each door's list is still ordered by the builder (its
# own stand first, then nearest).
DOOR_STANDS_OVERRIDE = {
    'YQM': {
        '1': ['1A', '1B', '2'],
        '2': ['1A', '1B', '2'],
        '3': ['3', '4', '5', '6A', '6B'],
        '4': ['3', '4', '5', '6A', '6B'],
    },
}


def _own(door, stand):
    return stand == door or (re.match(r'^.*\d[A-Z]$', stand) is not None and stand[:-1] == door)


def door_stands(iata, stands, gates):
    """{door: [stand, ...]} for every door that serves a stand on record."""
    over = DOOR_STANDS_OVERRIDE.get(iata)
    if over:
        out = {}
        for door, lst in over.items():
            miss = [s for s in lst if s not in stands]
            if miss:
                print('  %s door %s: override stand(s) %s not in the stands' % (iata, door, ', '.join(miss)), file=sys.stderr, flush=True)
            if door in gates:
                out[door] = _ordered(door, gates[door], [s for s in lst if s in stands], stands)
        return dict(sorted(out.items()))
    own = {}
    for s, p in stands.items():
        if NOT_BOARDING.match(s):
            continue
        best = None
        for d, q in gates.items():
            m = dist_m(p, q)
            key = (0 if _own(d, s) else 1, m)
            if m <= OWN_DOOR_M and (best is None or key < best[0]):
                best = (key, d)
        if best:
            own.setdefault(best[1], []).append(s)
    # One door under several numbers: single-linkage over DOOR_GROUP_M.
    keys = sorted(gates)
    group = {d: {d} for d in keys}
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            if group[a] is not group[b] and dist_m(gates[a], gates[b]) <= DOOR_GROUP_M:
                merged = group[a] | group[b]
                for d in merged:
                    group[d] = merged
    out = {}
    for d in keys:
        lst = [s for g in group[d] for s in own.get(g, [])]
        if lst:
            out[d] = _ordered(d, gates[d], lst, stands)
    return out


def _ordered(door, pos, lst, stands):
    def rank(s):
        dd = dist_m(pos, stands[s])
        tier = 0 if s == door and dd <= OWN_DOOR_M else 1 if _own(door, s) and dd <= OWN_DOOR_M else 2
        return (tier, dd, s)
    return sorted(set(lst), key=rank)


# ----------------------------------------------------------- jet bridges

# A stand is served by a jet bridge when a bridge's end or any other vertex
# lies this close to where the aeroplane stops (the stop end of a lead-in
# line, or the stand's point). The board gives bigger aircraft these stands;
# props often board by stairs at the walk-out stands.
BRIDGE_M = 25


def bridged(stands, bridges):
    """Sorted refs of the stands a jet bridge reaches."""
    return sorted(s for s, p in stands.items()
                  if any(dist_m(p, v) <= BRIDGE_M for b in bridges for v in b))


# ------------------------------------------------------------------- build

def is_terminal(t):
    return t.get('aeroway') == 'terminal'


def build(iata, coords, details=None):
    """The gate file for one airport, or None when OSM has nothing there.
    details, if a list, gets one record per stand element saying how its
    point was fixed - for checking a rebuild."""
    els = fetch(iata, coords)
    if CACHE:
        write_airside(iata, els)
    split = lambda t: [norm_ref(r) for r in re.split(r'[;,/]', t.get('ref', '')) if norm_ref(r)]
    # Doors first: a stand's stop end is found from them.
    doors = {}
    for e in els:
        t = e.get('tags', {})
        if t.get('aeroway') == 'gate':
            c = box_centre(e)
            if c:
                for r in split(t):
                    doors.setdefault(r, []).append([round(c[0], 5), round(c[1], 5)])
    # Terminals: the centroid of each aeroway=terminal outline for the file;
    # every terminal outline (building=terminal too) for finding stop ends.
    terminals, outlines = [], []
    for e in els:
        t = e.get('tags', {})
        if not (is_terminal(t) or t.get('building') == 'terminal'):
            continue
        a = area_of(e)
        c = (centroid(*a) if a else None) or box_centre(e)
        if not c:
            continue
        outlines.append(('area', a) if a else ('point', c))
        if is_terminal(t):
            terminals.append([round(c[0], 5), round(c[1], 5)])
    bridges = []
    for e in els:
        if e.get('tags', {}).get('aeroway') == 'jet_bridge':
            vs = _line(e.get('geometry')) or [p for m in e.get('members', []) for p in _line(m.get('geometry'))]
            c = None if vs else box_centre(e)
            bridges.append(vs or ([c] if c else []))
    net = TaxiNet([_line(e.get('geometry')) for e in els if e.get('type') == 'way'
                   and e.get('tags', {}).get('aeroway') in ('taxiway', 'taxilane')])
    seen = {'stands': {}, 'gates': doors}
    for e in els:
        t = e.get('tags', {})
        if t.get('aeroway') != 'parking_position':
            continue
        refs = split(t)
        if not refs:
            continue
        pt, how = stand_spot(e, refs, doors, outlines, net)
        if not pt:
            continue
        for r in refs:
            seen['stands'].setdefault(r, []).append(pt)
        if details is not None:
            details.append({'id': '%s/%s' % (e.get('type'), e.get('id')), 'refs': refs, 'pt': pt, 'how': how,
                            'centre': box_centre(e), 'line': _line(e.get('geometry')) if e.get('type') == 'way' else None})
    out, dropped = {}, {}
    for kind, refs in seen.items():
        keep = {}
        for r, pts in refs.items():
            spread = max(dist_m(a, b) for a in pts for b in pts)
            if spread > AMBIGUOUS_M:
                dropped.setdefault(kind, []).append(r)
                continue
            # One stand mapped twice (a point and a line): the one with a heading.
            keep[r] = next((p for p in pts if len(p) == 3), pts[0])
        out[kind] = dict(sorted(keep.items()))
    if not (out['stands'] or out['gates'] or terminals):
        return None
    return {
        'iata': iata,
        'source': 'OpenStreetMap contributors (ODbL 1.0)',
        'copyright': '\u00a9 OpenStreetMap contributors',
        'license': 'ODbL-1.0',
        'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/',
        'attribution_url': 'https://www.openstreetmap.org/copyright',
        'built': time.strftime('%Y-%m-%d'),
        'stands': out['stands'],
        'gates': out['gates'],
        'terminals': sorted(terminals),
        'door_stands': door_stands(iata, out['stands'], out['gates']),
        'bridged': bridged(out['stands'], bridges),
        'ambiguous': {k: sorted(v) for k, v in sorted(dropped.items())},
    }


# ------------------------------------------------------- airside GeoJSON

AIRSIDE_TAGS = ('aeroway', 'building', 'ref', 'name', 'width')
AREA_KINDS = ('apron', 'terminal', 'parking_position', 'jet_bridge')


def _gj(pts):
    return [[round(p[1], 6), round(p[0], 6)] for p in pts]


def _geometry(e, t):
    if e.get('type') == 'node' and 'lat' in e:
        return {'type': 'Point', 'coordinates': [round(e['lon'], 6), round(e['lat'], 6)]}
    if e.get('type') == 'way':
        pts = _line(e.get('geometry'))
        if len(pts) >= 4 and pts[0] == pts[-1] and (
                t.get('aeroway') in AREA_KINDS or 'building' in t or t.get('area') == 'yes'):
            return {'type': 'Polygon', 'coordinates': [_gj(pts)]}
        if len(pts) >= 2:
            return {'type': 'LineString', 'coordinates': _gj(pts)}
    if e.get('type') == 'relation':
        a = area_of(e)
        if a:
            polys = [[o] for o in a[0]]
            for ring in a[1]:
                host = next((p for p in polys if _inside(ring[0], p[0])), None)
                if host:
                    host.append(ring)
            return {'type': 'MultiPolygon', 'coordinates': [[_gj(r) for r in p] for p in polys]}
        lines = [_line(m.get('geometry')) for m in e.get('members', []) if m.get('type') == 'way']
        lines = [l for l in lines if len(l) >= 2]
        if lines:
            return {'type': 'MultiLineString', 'coordinates': [_gj(l) for l in lines]}
    c = box_centre(e)
    return {'type': 'Point', 'coordinates': [round(c[1], 6), round(c[0], 6)]} if c else None


def write_airside(iata, els):
    feats = []
    for e in els:
        t = e.get('tags', {})
        if t.get('aeroway') not in AIRSIDE and t.get('building') != 'terminal':
            continue
        g = _geometry(e, t)
        if not g:
            continue
        props = {'osm': '%s/%s' % (e.get('type'), e.get('id'))}
        props.update((k, t[k]) for k in AIRSIDE_TAGS if k in t)
        feats.append({'type': 'Feature', 'properties': props, 'geometry': g})
    fc = {'type': 'FeatureCollection', 'iata': iata,
          'source': 'OpenStreetMap contributors (ODbL 1.0)', 'license': 'ODbL-1.0',
          'built': time.strftime('%Y-%m-%d'), 'features': feats}
    with open(os.path.join(CACHE, iata + '.airside.geojson'), 'w', encoding='utf-8') as fh:
        json.dump(fc, fh, separators=(',', ':'))


def build_one(iata, coords):
    try:
        f = build(iata, coords)
    except Exception as e:
        return '%s  FAILED  %s' % (iata, e)
    path = os.path.join(OUT, iata + '.json')
    if not f:
        if os.path.exists(path):
            os.remove(path)
        return '%s  nothing mapped' % iata
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(f, fh, separators=(',', ':'))
        fh.write('\n')
    amb = sum(len(v) for v in f['ambiguous'].values())
    return '%s  stands %d (%d with heading, %d bridged)  gates %d  terminals %d  doors with stands %d  ambiguous-dropped %d' % (
        iata, len(f['stands']), sum(1 for p in f['stands'].values() if len(p) == 3), len(f['bridged']),
        len(f['gates']), len(f['terminals']), len(f['door_stands']), amb)


def main(argv):
    from concurrent.futures import ThreadPoolExecutor
    os.makedirs(OUT, exist_ok=True)
    coords = airport_coords()
    todo = [a.upper() for a in argv] or feed_airports()
    # One at a time by default: the public server answers a busy spell with
    # 504s, and a second query in flight only makes more of them.
    with ThreadPoolExecutor(max_workers=int(os.environ.get('GATES_WORKERS', '1'))) as ex:
        for line in ex.map(lambda a: build_one(a, coords), todo):
            print(line, flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
