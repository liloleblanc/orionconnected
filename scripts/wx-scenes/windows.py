#!/usr/bin/env python3
"""Find cut windows in a stormscan TSV.

A take is L seconds long with an X-second crossfade seam and plays at SPEED,
so it consumes (L + X) * SPEED seconds of source starting at t0 (takes.swift).
A window qualifies when, at BOTH scene sizes, the field-mean transition count
inside every screen second (SPEED seconds of source) stays at or below LIMIT,
and the head and tail X*SPEED stretches (the crossfade) carry no transition,
so the seam is a blend of two calm frames.

Prints, per speed, the best non-overlapping windows: longest L first, then the
lowest peak, with the strikes (clusters of transitions, split at gaps > 0.35 s
of source) that fall inside.
usage: windows.py <scan.tsv> [limit=6]
"""
import sys

path = sys.argv[1]
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 6
RELAX = len(sys.argv) > 3 and sys.argv[3] == 'relax'
rows = [l.rstrip('\n').split('\t') for l in open(path)][1:]
t = [float(r[0]) for r in rows]
Y = [float(r[1]) for r in rows]
cols = {1.0: (2, 3), 0.65: (4, 5), 0.5: (6, 7)}
dens = {sp: ([int(r[a]) for r in rows], [int(r[b]) for r in rows]) for sp, (a, b) in cols.items()}
ev = {}
for l in open(path + '.events'):
    k, v = l.rstrip('\n').split('\t')
    if k in ('e842', 'e903'):
        ev[k] = [float(x) for x in v.split()] if v.strip() else []
    elif k == 'fps':
        fps = float(v)
allev = sorted(set(ev['e842']) | set(ev['e903']))
n = len(t)
dur = t[-1] + 1 / fps


def clusters(lo, hi):
    e = [x for x in allev if lo <= x < hi]
    out = []
    for x in e:
        if out and x - out[-1][-1] <= 0.35:
            out[-1].append(x)
        else:
            out.append([x])
    return out


def idx(sec):
    return min(n - 1, max(0, int(round(sec * fps))))


def check(t0, L, X, sp):
    span = (L + X) * sp
    if t0 + span > dur - 0.05:
        return None
    a, b = dens[sp]
    win = sp
    s0, s1 = idx(t0), idx(t0 + span - win)
    pk842 = max(a[s0:s1 + 1]) if s1 >= s0 else 0
    pk903 = max(b[s0:s1 + 1]) if s1 >= s0 else 0
    # also windows that end inside the span (shorter tail of the last second)
    if max(pk842, pk903) > LIMIT:
        return None
    head = [x for x in allev if t0 <= x < t0 + X * sp]
    tail = [x for x in allev if t0 + L * sp <= x < t0 + span]
    if (head or tail) and not RELAX:
        return None
    cl = clusters(t0, t0 + span)
    yv = Y[idx(t0):idx(t0 + span) + 1]
    return dict(t0=t0, L=L, X=X, sp=sp, pk842=pk842, pk903=pk903, strikes=len(cl),
                trans=sum(len(c) for c in cl), cl=cl, ymin=min(yv), ymax=max(yv))


print(f'# {path}  dur={dur:.2f}s fps={fps:.2f}  limit={LIMIT}  all transitions (either size): {len(allev)}')
print('#   strikes over the whole source:', ' '.join(f'{c[0]:.2f}-{c[-1]:.2f}({len(c)})' for c in clusters(0, dur)))
for sp in (1.0, 0.65, 0.5):
    found = []
    for L in (8.0, 7.0, 6.0, 5.0, 4.0, 3.5):
        X = 1.0
        step = 0.1
        t0 = 0.0
        best = []
        while t0 + (L + X) * sp <= dur - 0.05:
            r = check(round(t0, 2), L, X, sp)
            if r:
                best.append(r)
            t0 += step
        # keep windows that hold at least one strike first, then calm ones
        best.sort(key=lambda r: (-(1 if r['strikes'] >= 1 else 0), max(r['pk842'], r['pk903']), -r['strikes'], r['t0']))
        for r in best:
            if all(abs(r['t0'] - f['t0']) >= (f['L'] + f['X']) * f['sp'] * 0.6 for f in found):
                found.append(r)
            if len([f for f in found if f['L'] == L]) >= 3:
                break
        if len(found) >= 6:
            break
    print(f'## speed {sp}')
    if not found:
        print('   none')
    for r in found[:8]:
        cl = ' '.join(f'{c[0]:.2f}-{c[-1]:.2f}({len(c)})' for c in r['cl']) or 'calm'
        print(f"   t0={r['t0']:.2f}s L={r['L']:.1f} X={r['X']:.1f} src {r['t0']:.2f}-{r['t0'] + (r['L'] + r['X']) * r['sp']:.2f}  "
              f"F842={r['pk842']} F903={r['pk903']}  strikes={r['strikes']} [{cl}]  meanY {r['ymin']:.3f}..{r['ymax']:.3f}")
