#!/usr/bin/env python3
"""Build fids-current/data/gates/<IATA>.json from OpenStreetMap.

Each file holds where aircraft actually park at one airport: the stands
(aeroway=parking_position), the gate doors (aeroway=gate) and the terminal
buildings (aeroway=terminal, as centre points), keyed by the ref OSM carries,
normalised the same way the board normalises a feed's gate (_gateRefNorm in
fids-core.js). The gate maps use it to draw an aeroplane that has not left yet
at its own stand instead of over the middle of its route.

Data (c) OpenStreetMap contributors, ODbL 1.0 - the same database the gate
maps' street tiles are drawn from.

Usage:  python3 scripts/gates/build-gates.py [IATA ...]
With no arguments it builds every airport that has a live feed in the worker
(AUTHORITY_HANDLERS in workers/fids-proxy.js) plus the Atlantic and central
Canadian boards whose feeds live elsewhere. Standard library only.
"""
import json
import os
import re
import sys
import time
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


def overpass(query):
    body = urllib.parse.urlencode({'data': query}).encode()
    last = None
    for attempt in range(6):
        for ep in ENDPOINTS:
            try:
                req = urllib.request.Request(ep, data=body, headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=100) as r:
                    return json.load(r)
            except Exception as e:  # 429/504/timeouts: back off and try the next server
                last = e
                print('  retry %d after %s' % (attempt + 1, e), file=sys.stderr, flush=True)
                time.sleep(5 * (attempt + 1))
    raise RuntimeError('overpass failed: %s' % last)


WANT = '["aeroway"~"^(gate|parking_position|terminal)$"]'


CACHE = os.environ.get('GATES_CACHE')   # optional dir of raw Overpass answers, so a rebuild needs no refetch


def fetch(iata, coords):
    if CACHE:
        cp = os.path.join(CACHE, iata + '.json')
        if os.path.exists(cp):
            return json.load(open(cp, encoding='utf-8'))
    q = ('[out:json][timeout:80];'
         'area["aeroway"="aerodrome"]["iata"="%s"]->.a;'
         '(nwr(area.a)%s;);out center tags;') % (iata, WANT)
    d = overpass(q)
    if not d.get('elements') and iata in coords:
        # An aerodrome mapped as a node has no area; take a ~4 km box instead.
        lat, lng = coords[iata]
        q = '[out:json][timeout:80];(nwr(%f,%f,%f,%f)%s;);out center tags;' % (
            lat - 0.035, lng - 0.05, lat + 0.035, lng + 0.05, WANT)
        d = overpass(q)
    els = d.get('elements', [])
    if CACHE:
        os.makedirs(CACHE, exist_ok=True)
        json.dump(els, open(os.path.join(CACHE, iata + '.json'), 'w', encoding='utf-8'))
    return els


def dist_m(a, b):
    """Great-circle metres between two [lat, lng] points."""
    import math
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


# A ref OSM puts in two places more than this far apart is not one gate: the
# same number at two terminals (JFK T1/T7/T8 all have a gate 1). The board
# would have to guess which, so the ref is left out and the board falls back
# to the terminal or the airport instead.
AMBIGUOUS_M = 150


def build(iata, coords):
    els = fetch(iata, coords)
    seen = {'stands': {}, 'gates': {}}
    terminals = []
    for e in els:
        t = e.get('tags', {})
        c = e.get('center') or ({'lat': e['lat'], 'lon': e['lon']} if 'lat' in e else None)
        if not c:
            continue
        pt = [round(c['lat'], 5), round(c['lon'], 5)]
        kind = t.get('aeroway')
        if kind == 'terminal':
            terminals.append(pt)
            continue
        # "1;2", "45/46" and "C6/E2" name several gates at one place.
        refs = [norm_ref(r) for r in re.split(r'[;,/]', t.get('ref', '')) if norm_ref(r)]
        bucket = seen['stands' if kind == 'parking_position' else 'gates']
        for r in refs:
            bucket.setdefault(r, []).append(pt)
    out, dropped = {}, {}
    for kind, refs in seen.items():
        keep = {}
        for r, pts in refs.items():
            spread = max(dist_m(a, b) for a in pts for b in pts)
            if spread > AMBIGUOUS_M:
                dropped.setdefault(kind, []).append(r)
                continue
            keep[r] = pts[0]
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
        'ambiguous': {k: sorted(v) for k, v in sorted(dropped.items())},
    }


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
    return '%s  stands %d  gates %d  terminals %d  ambiguous-dropped %d' % (
        iata, len(f['stands']), len(f['gates']), len(f['terminals']), amb)


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
