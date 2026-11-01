#!/usr/bin/env python3
"""Build fids-current/data/taxi/<IATA>.json from OpenStreetMap.

Each file is one airport's taxiway network as a graph: the centrelines of its
taxiways (aeroway=taxiway), taxilanes (aeroway=taxilane) and stand lead-in
lines (aeroway=parking_position mapped as a line), joined where they meet. The
gate maps use it to taxi a landed aeroplane from its runway exit to its stand
along the taxiways it would really use, instead of jumping it to the gate.

    nodes  [[lat, lng], ...]            6 decimals (about 0.1 m)
    ways   [[kind, i0, i1, ...], ...]   kind 0 taxiway, 1 taxilane, 2 lead-in;
                                        consecutive node indices are an edge
    rwn    [i, ...]                     nodes that sit on a runway centreline
                                        (where a taxiway meets or crosses one):
                                        the places an aeroplane can turn off

Ways that share an OSM node meet there. Where a way's loose end stops short
of another (a lead-in line that ends a few metres off its taxilane, a
taxiway drawn up to but not on to another), it is joined to the nearest point
on the other within JOIN_M (LEAD_JOIN_M for lead-ins). Between junctions each
line is simplified (Douglas-Peucker, SIMPLIFY_M) so the file stays small.
Pieces of network too small to route on are dropped.

Data (c) OpenStreetMap contributors, ODbL 1.0 - the same database the gate
maps' street tiles and the gate files (build-gates.py) come from.

Usage:  python3 scripts/gates/build-taxi.py [IATA ...]
With no arguments it builds every airport that has a gate file
(fids-current/data/gates/). Standard library only. GATES_CACHE=<dir> keeps
each airport's raw Overpass answer (<IATA>.taxi.json) so a rebuild needs no
refetch.
"""
import importlib.util
import json
import math
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('build_gates', os.path.join(HERE, 'build-gates.py'))
bg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bg)

ROOT = bg.ROOT
OUT = os.path.join(ROOT, 'fids-current', 'data', 'taxi')
GATES = os.path.join(ROOT, 'fids-current', 'data', 'gates')
KINDS = {'taxiway': 0, 'taxilane': 1, 'parking_position': 2}
JOIN_M = 12.0          # a loose taxiway end this close to another line meets it
LEAD_JOIN_M = 30.0     # a lead-in line often stops short of its taxilane
SIMPLIFY_M = 1.0
MIN_PART_M = 400.0     # a piece of network shorter than this is not routable
CACHE = os.environ.get('GATES_CACHE')
# overpass-api.de first; when it is at capacity, the VK Maps public instance
# (on the Overpass project's list of public servers).
CURL_ENDPOINTS = bg.ENDPOINTS + ['https://maps.mail.ru/osm/tools/overpass/api/interpreter']


def query(prefix, where):
    # `out body geom`: node ids (to know where ways meet) and coordinates.
    return ('[out:json][timeout:180];%s'
            'way%s["aeroway"~"^(taxiway|taxilane|parking_position|runway)$"];'
            'out body geom;') % (prefix, where)


def overpass(q, label=''):
    """build-gates.py's polite POST; where Python's own TLS cannot reach the
    server (the macOS system Python's LibreSSL fails its handshake), the same
    POST through curl, retried the same way."""
    try:
        body = urllib.parse.urlencode({'data': q}).encode()
        req = urllib.request.Request(bg.ENDPOINTS[0], data=body, headers={'User-Agent': bg.UA})
        with urllib.request.urlopen(req, timeout=240) as r:
            return json.load(r)
    except (ssl.SSLError, urllib.error.URLError) as e:
        if not isinstance(getattr(e, 'reason', e), ssl.SSLError) and not isinstance(e, ssl.SSLError):
            return bg.overpass(q, label)
    last = None
    for attempt in range(7):
        for ep in CURL_ENDPOINTS:
            try:
                r = subprocess.run(['curl', '-sS', '--fail', '-m', '240', '-A', bg.UA, '--data-urlencode', 'data@-', ep],
                                   input=q.encode(), capture_output=True)
                if r.returncode:
                    raise RuntimeError('curl %d: %s' % (r.returncode, r.stderr.decode(errors='replace').strip()[:160]))
                d = json.loads(r.stdout)
                remark = str(d.get('remark') or '')
                if re.search(r'runtime (error|remark)|timed out|out of memory', remark, re.I):
                    raise RuntimeError('overpass remark: ' + remark.strip()[:200])
                return d
            except Exception as e:
                last = e
                print('  %s%s failed: %s' % (label and label + ' ', ep.split('/')[2], str(e)[:200]), file=sys.stderr, flush=True)
        wait = min(300, 15 * 2 ** attempt)
        print('  %sretry %d in %ds' % (label and label + ' ', attempt + 1, wait), file=sys.stderr, flush=True)
        time.sleep(wait)
    raise RuntimeError('overpass failed: %s' % last)


def fetch(iata, coords):
    cp = os.path.join(CACHE, iata + '.taxi.json') if CACHE else None
    if cp and os.path.exists(cp):
        return json.load(open(cp, encoding='utf-8'))
    has_taxi = lambda els: any(e.get('tags', {}).get('aeroway') in ('taxiway', 'taxilane') for e in els)
    els = overpass(query('area["aeroway"="aerodrome"]["iata"="%s"]->.a;' % iata, '(area.a)'), iata).get('elements', [])
    if not has_taxi(els) and iata in coords:
        lat, lng = coords[iata]
        box = '(%f,%f,%f,%f)' % (lat - 0.035, lng - 0.05, lat + 0.035, lng + 0.05)
        alt = overpass(query('', box), iata + ' box').get('elements', [])
        if has_taxi(alt) or not els:
            els = alt
    if cp:
        os.makedirs(CACHE, exist_ok=True)
        json.dump(els, open(cp, 'w', encoding='utf-8'), separators=(',', ':'))
    return els


def xy(p, lat0):
    """Local metres east/north of (0, 0) at latitude lat0 - fine across an airport."""
    return (p[1] * bg.M_PER_DEG * math.cos(math.radians(lat0)), p[0] * bg.M_PER_DEG)


def seg_proj(p, a, b, lat0):
    """(distance m, fraction along a->b) of p's nearest point on segment a-b."""
    px, py = xy(p, lat0)
    ax, ay = xy(a, lat0)
    bx, by = xy(b, lat0)
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    f = 0.0 if L2 <= 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    qx, qy = ax + dx * f, ay + dy * f
    return math.hypot(px - qx, py - qy), f


def dp(pts, keep_ix, tol, lat0):
    """Douglas-Peucker over pts (list of coords), always keeping indices in keep_ix."""
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    for i in keep_ix:
        keep[i] = True
    anchors = [i for i in range(len(pts)) if keep[i]]
    for s, e in zip(anchors, anchors[1:]):
        stack = [(s, e)]
        while stack:
            a, b = stack.pop()
            if b - a < 2:
                continue
            best, bi = -1.0, -1
            for i in range(a + 1, b):
                d, _ = seg_proj(pts[i], pts[a], pts[b], lat0)
                if d > best:
                    best, bi = d, i
            if best > tol:
                keep[bi] = True
                stack.append((a, bi))
                stack.append((bi, b))
    return [i for i in range(len(pts)) if keep[i]]


def build(iata, coords):
    els = fetch(iata, coords)
    pos = {}
    lines = []          # [kind, [node ids]]
    rw_ids = set()
    for e in els:
        if e.get('type') != 'way':
            continue
        t = e.get('tags', {})
        ids, geom = e.get('nodes') or [], e.get('geometry') or []
        if len(ids) < 2 or len(ids) != len(geom):
            continue
        for nid, g in zip(ids, geom):
            if g and 'lat' in g:
                pos[nid] = (g['lat'], g['lon'])
        if any(nid not in pos for nid in ids):
            continue
        aw = t.get('aeroway')
        if aw == 'runway':
            rw_ids.update(ids)
            continue
        if aw not in KINDS:
            continue
        closed = ids[0] == ids[-1]
        if closed and (aw == 'parking_position' or t.get('area') == 'yes'):
            continue   # an outline, not a centreline
        lines.append([KINDS[aw], list(ids)])
    if not lines:
        return None
    lat0 = sum(p[0] for p in pos.values()) / len(pos)

    # Loose ends: join each to the nearest point of another line within reach.
    use = {}
    for k, ids in lines:
        for nid in ids:
            use[nid] = use.get(nid, 0) + 1
    next_id = [-1]

    def bucket(p):
        x, y = xy(p, lat0)
        return (int(x // 60), int(y // 60))

    grid = {}
    for li, (k, ids) in enumerate(lines):
        for si in range(len(ids) - 1):
            a, b = pos[ids[si]], pos[ids[si + 1]]
            ba, bb = bucket(a), bucket(b)
            for gx in range(min(ba[0], bb[0]) - 1, max(ba[0], bb[0]) + 2):
                for gy in range(min(ba[1], bb[1]) - 1, max(ba[1], bb[1]) + 2):
                    grid.setdefault((gx, gy), set()).add((li, ids[si], ids[si + 1]))
    joins = []   # (line index, a id, b id, f, end node id)
    for li, (k, ids) in enumerate(lines):
        for end in (ids[0], ids[-1]):
            if use.get(end, 0) > 1 or end in rw_ids:
                continue
            reach = LEAD_JOIN_M if k == 2 else JOIN_M
            p = pos[end]
            gb = bucket(p)
            best = None
            for (lj, a, b) in grid.get(gb, ()):
                if lj == li or a == end or b == end:
                    continue
                d, f = seg_proj(p, pos[a], pos[b], lat0)
                if d <= reach and (best is None or d < best[0]):
                    best = (d, lj, a, b, f)
            if best:
                joins.append((best[1], best[2], best[3], best[4], end))
    # Apply joins: split the target segment at the projection (or reuse a vertex).
    for lj, a, b, f, end in joins:
        ids = lines[lj][1]
        try:
            si = next(i for i in range(len(ids) - 1) if ids[i] == a and ids[i + 1] == b)
        except StopIteration:
            # the segment was split by an earlier join: find a near vertex instead
            best = min(ids, key=lambda n: bg.dist_m(pos[n], pos[end]))
            lines.append([lines[lj][0], [end, best]])
            continue
        pa, pb = pos[a], pos[b]
        q = (pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f)
        if bg.dist_m(q, pa) < 2:
            tgt = a
        elif bg.dist_m(q, pb) < 2:
            tgt = b
        else:
            tgt = next_id[0]
            next_id[0] -= 1
            pos[tgt] = q
            ids.insert(si + 1, tgt)
        if tgt != end:
            lines.append([lines[lj][0], [end, tgt]])

    # Degree over the whole network: junctions survive simplification.
    deg = {}
    for k, ids in lines:
        for i, nid in enumerate(ids):
            deg[nid] = deg.get(nid, 0) + (2 if 0 < i < len(ids) - 1 else 1)
    keep_node = lambda nid: deg.get(nid, 0) != 2 or nid in rw_ids
    simp = []
    for k, ids in lines:
        pts = [pos[n] for n in ids]
        must = [i for i, n in enumerate(ids) if keep_node(n)]
        kept = dp(pts, must, SIMPLIFY_M, lat0)
        simp.append([k, [ids[i] for i in kept]])

    # Connected parts, by length; drop the ones too small to route on.
    parent = {}

    def find(x):
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x

    for k, ids in simp:
        for a, b in zip(ids, ids[1:]):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
    plen = {}
    for k, ids in simp:
        L = sum(bg.dist_m(pos[a], pos[b]) for a, b in zip(ids, ids[1:]))
        r = find(ids[0])
        plen[r] = plen.get(r, 0) + L
    ok = {r for r, L in plen.items() if L >= MIN_PART_M}
    simp = [w for w in simp if find(w[1][0]) in ok]
    if not simp:
        return None

    index, nodes = {}, []
    ways = []
    for k, ids in simp:
        row = [k]
        for nid in ids:
            if nid not in index:
                index[nid] = len(nodes)
                p = pos[nid]
                nodes.append([round(p[0], 6), round(p[1], 6)])
            row.append(index[nid])
        # a way that collapsed to one point carries nothing
        if len(set(row[1:])) >= 2:
            ways.append(row)
    rwn = sorted(index[n] for n in rw_ids if n in index)
    return {
        'iata': iata,
        'source': 'OpenStreetMap contributors (ODbL 1.0)',
        'copyright': '© OpenStreetMap contributors',
        'license': 'ODbL-1.0',
        'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/',
        'attribution_url': 'https://www.openstreetmap.org/copyright',
        'built': time.strftime('%Y-%m-%d'),
        'nodes': nodes,
        'ways': ways,
        'rwn': rwn,
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
    by = [0, 0, 0]
    for w in f['ways']:
        by[w[0]] += 1
    return '%s  nodes %d  taxiways %d  taxilanes %d  lead-ins %d  on-runway %d  %d bytes' % (
        iata, len(f['nodes']), by[0], by[1], by[2], len(f['rwn']), os.path.getsize(path))


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    coords = bg.airport_coords()
    todo = [a.upper() for a in argv] or sorted(n[:-5] for n in os.listdir(GATES) if n.endswith('.json'))
    for a in todo:
        print(build_one(a, coords), flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
