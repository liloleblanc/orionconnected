#!/usr/bin/env python3
"""
fill-named-holes.py - close the named sky holes in the gate aircraft pictures.

    python3 scripts/aircraft-opacity/fill-named-holes.py [--dry-run]

Needs Pillow. Run it on the unrepaired art from the repository root, then run
tests/aircraft-opaque-body.test.js, which checks every picture. A second run
changes nothing.

Only the holes listed in SPOTS are touched; there is no global morphology,
so real sky outside an airframe (between a nacelle and a wing, under a
T-tail, a drawn gap that opens to the sky) is never painted over. A hole is
every 4-connected area of non-opaque pixels (alpha < 255) that does not reach
the canvas edge and lies wholly inside the spot's box.

Alpha goes to 255 on every hole pixel. The colour is left alone, with one
exception: a pixel that was at alpha 0 and stores pure black or pure white
carries no paint at all, so raising its alpha alone would draw a black or
white mark. Its colour is taken from the opaque pixels around it:
  1. the median, channel by channel, of the opaque pixels in its 5x5
     neighbourhood, placed from the hole's edge inwards. "Opaque" is the
     state after the alpha change: every hole pixel at alpha 1-254 counts,
     with its own colour, and so does a fill already placed;
  2. then SMOOTH passes set each of these pixels to the mean of its four
     neighbours (which are all opaque), so the medians leave no streaks
     across a slit. The pixels around them never change.
A hole pixel at alpha 1-254 keeps its own colour, so where a cut-out's
feathered edge stores near-white (the CRJ slits), the fill comes out the
near-white the drawing shows there over a white page.
Every other pixel, the canvas, and the placement are unchanged; the file's
other chunks (sRGB, eXIf, iTXt...) are copied byte for byte.
"""
import io, os, struct, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'fids-current', 'aircraft')

SMOOTH = 60
NO_PAINT = ((0, 0, 0), (255, 255, 255))

# box = (x0, y0, x1, y1), inclusive
SPOTS = {
    # alpha-0 slit between the wing-root fairing and the belly; on the real
    # CRJ the wing-to-body fairing closes it
    'CR7.png': (440, 250, 660, 290),
    'CR9.png': (440, 215, 620, 250),
    'CRK.png': (440, 215, 620, 250),      # the same file as CR9
    # dorsal-fin fillet knocked out by background removal (the 1 px outline
    # stroke above it stayed)
    'AS/73W.png': (1145, 305, 1235, 340),
}


def chunks(buf):
    assert buf[:8] == b'\x89PNG\r\n\x1a\n'
    p = 8
    out = []
    while p < len(buf):
        n, = struct.unpack('>I', buf[p:p + 4])
        out.append((buf[p + 4:p + 8], buf[p:p + 12 + n]))
        p += 12 + n
    return out


def encode(img, orig):
    """Re-encode RGBA img, keeping the original's other chunks verbatim."""
    oc = chunks(orig)
    ihdr = [c for t, c in oc if t == b'IHDR'][0]
    _, _, bd, ct, _, _, il = struct.unpack('>IIBBBBB', ihdr[8:21])
    assert (bd, ct, il) == (8, 6, 0), 'only 8-bit RGBA non-interlaced files are rewritten'
    b = io.BytesIO()
    img.save(b, 'PNG', compress_level=9, optimize=True)
    idat = b''.join(c for t, c in chunks(b.getvalue()) if t == b'IDAT')
    out, done = [orig[:8]], False
    for t, c in oc:
        if t == b'IDAT':
            if not done:
                out.append(idat)
                done = True
            continue
        out.append(c)
    return b''.join(out)


def hole_pixels(A, W, H, box):
    x0, y0, x1, y1 = box
    seen = bytearray(W * H)
    found = []
    for sy in range(y0, y1 + 1):
        for sx in range(x0, x1 + 1):
            s = sy * W + sx
            if A[s] == 255 or seen[s]:
                continue
            comp, stack, edge = [], [s], False
            seen[s] = 1
            while stack:
                i = stack.pop()
                comp.append(i)
                x, y = i % W, i // W
                if x in (0, W - 1) or y in (0, H - 1):
                    edge = True
                for j in ((i - 1) if x > 0 else -1, (i + 1) if x < W - 1 else -1,
                          (i - W) if y > 0 else -1, (i + W) if y < H - 1 else -1):
                    if j >= 0 and not seen[j] and A[j] < 255:
                        seen[j] = 1
                        stack.append(j)
            inside = all(x0 <= i % W <= x1 and y0 <= i // W <= y1 for i in comp)
            if not edge and inside:
                found.extend(comp)
    return found


def fix(rel, box):
    path = os.path.join(ROOT, rel)
    orig = open(path, 'rb').read()
    im = Image.open(io.BytesIO(orig))
    im.load()
    assert im.mode == 'RGBA', rel + ': expected RGBA'
    W, H = im.size
    px = im.load()
    A = im.getchannel('A').tobytes()
    hole = hole_pixels(A, W, H, box)
    if not hole:                                   # already repaired
        return dict(hole=0), orig
    hset = set(hole)
    # the pixels that get a colour: alpha 0 storing pure black or white
    paint = [i for i in hole if A[i] == 0 and px[i % W, i // W][:3] in NO_PAINT]
    pset = set(paint)

    def opaque(j, col):
        """Colour of pixel j once the hole's alpha is 255, or None while it has none yet."""
        if j in col:
            return col[j]
        if j in pset or (A[j] < 255 and j not in hset):
            return None
        return px[j % W, j // W][:3]

    # 1. median of the opaque 5x5 neighbours, from the hole's edge inwards
    col = {}
    left = set(paint)
    while left:
        nxt = {}
        for i in left:
            x, y = i % W, i // W
            rs, gs, bs = [], [], []
            for yy in range(max(0, y - 2), min(H, y + 3)):
                for xx in range(max(0, x - 2), min(W, x + 3)):
                    c = opaque(yy * W + xx, col)
                    if c is not None:
                        rs.append(c[0]); gs.append(c[1]); bs.append(c[2])
            if rs:
                rs.sort(); gs.sort(); bs.sort()
                m = len(rs) // 2
                nxt[i] = tuple(v[m] if len(v) % 2 else (v[m - 1] + v[m] + 1) // 2 for v in (rs, gs, bs))
        assert nxt, rel + ': a hole pixel has no opaque pixel anywhere near it'
        col.update(nxt)
        left -= set(nxt)

    # 2. smoothing: each painted pixel becomes the mean of its four neighbours
    col = {i: tuple(float(v) for v in c) for i, c in col.items()}
    for _ in range(SMOOTH):
        nxt = {}
        for i in col:
            x, y = i % W, i // W
            acc = [0.0, 0.0, 0.0]
            for j in (i - 1, i + 1, i - W, i + W):   # a hole never reaches the canvas edge
                c = opaque(j, col)
                assert c is not None, rel + ': a hole pixel borders a non-opaque pixel'
                acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            nxt[i] = (acc[0] / 4, acc[1] / 4, acc[2] / 4)
        col = nxt

    new = im.copy()
    npx = new.load()
    for i in hole:
        x, y = i % W, i // W
        r, g, b, a = px[x, y]
        npx[x, y] = (tuple(int(round(v)) for v in col[i]) if i in pset else (r, g, b)) + (255,)

    data = encode(new, orig)
    chk = Image.open(io.BytesIO(data))
    assert chk.size == (W, H) and chk.mode == 'RGBA'
    assert chk.tobytes() == new.tobytes(), rel + ': re-encode mismatch'
    # nothing outside the hole changed; colour changed only where alpha was 0
    ob, nb = im.tobytes(), chk.tobytes()
    recoloured = 0
    for i in range(W * H):
        o = i * 4
        if ob[o:o + 4] != nb[o:o + 4]:
            assert i in hset, rel + ': pixel outside the hole changed'
            if ob[o:o + 3] != nb[o:o + 3]:
                assert i in pset, rel + ': colour changed on a pixel that was not at alpha 0'
                recoloured += 1
    stats = dict(hole=len(hole), alpha0=sum(1 for i in hole if A[i] == 0),
                 alpha0_painted=len(paint), alpha0_recoloured=recoloured,
                 alpha1_254_alpha_only=sum(1 for i in hole if A[i] > 0),
                 bytes=(len(orig), len(data)))
    return stats, data


if __name__ == '__main__':
    dry = '--dry-run' in sys.argv[1:]
    for rel, box in SPOTS.items():
        stats, data = fix(rel, box)
        print('%-11s %s' % (rel, stats))
        if not dry:
            open(os.path.join(ROOT, rel), 'wb').write(data)
