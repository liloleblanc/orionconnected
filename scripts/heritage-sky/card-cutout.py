#!/usr/bin/env python3
"""
card-cutout.py — make an archive card's aeroplane picture from a supplied side drawing.

The card flies its aeroplane over the gate sky, so the picture has to be a
cut-out: the aeroplane and nothing else, with the sky showing all round it.
A supplied drawing usually arrives on its page, the page still in. This takes
the page off, crops the drawing to its own edges and scales it to the working
width of the card pictures (2272 px, as the DC-9s and the TriStars). Nothing
of the aeroplane is repainted.

THE PAGE COMES OFF IN TWO STEPS, because it is in the picture twice.

  1. The open page: the colour of the top-left corner, flooded in from the
     four edges. White INSIDE the aeroplane (a white fuselage, a white fin)
     is not reached, and stays.
  2. The page inside the outline. The last two pixels of the aeroplane all
     round are not aeroplane alone: the drawing was smoothed against its
     page, so each is part aeroplane and part page. Left as they are they
     make a pale rim round every dark part (a navy fin, a blue belly) the
     moment the picture is shown over a sky. Each is un-mixed instead: the
     aeroplane's colour is read just inside the outline, the pixel's share of
     page is worked out against it, the page's share is taken out of the
     colour and becomes clear. A pixel that is not such a mix (an antenna, a
     light, a line of its own colour at the very edge) keeps its colour.

A drawing that already comes as a cut-out (it has clear pixels) is first laid
on a white page, as its editor showed it, and then goes through the same two
steps, so body pixels a shade see-through come out solid as they looked on
white and a rim it brought with it is taken out too; where a pixel cannot be
un-mixed (white on white) its own opacity is kept.

It refuses to write a picture the page is still in: one whose corners are not
clear, or a cut-out that came with clear pixels shut inside the drawing (it
names the first; whether that is sky between two parts or a hole in the body
is a call for a person, never a guess here). What it cannot see is a pocket
of page shut inside a drawing that came ON its page (between the legs of an
undercarriage, under a pylon): the flood does not reach it and it stays as
drawn. Look for one before using the picture.

Usage: python3 scripts/heritage-sky/card-cutout.py drawing out.png [width] [tolerance]
       width      2272 unless given
       tolerance  how far from the page colour still counts as page, 10 of 255 unless given
       (needs Pillow)
"""
import sys
from PIL import Image, ImageChops, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None
HAZE = 6             # opacity at or under this is cleared: haze off the outline
RIM = 2              # how many pixels in from the page are part page
MIN_CONTRAST = 24    # an aeroplane colour nearer the page than this (per channel, about) cannot be un-mixed
MAX_OFF = 40         # a rim pixel further than this from any mix of page and aeroplane has a colour of its own


def flood(open_, W, H):
    """The pixels reachable from the four edges through open pixels (bytearray of 0/1), by runs."""
    seen = bytearray(W * H)
    stack = [(x, y) for y in (0, H - 1) for x in range(W)] + [(x, y) for x in (0, W - 1) for y in range(H)]
    while stack:
        x, y = stack.pop()
        row = y * W
        if not open_[row + x]:
            continue
        a = open_.rfind(0, row, row + x) + 1 or row
        b = open_.find(0, row + x, row + W)
        if b < 0:
            b = row + W
        n = b - a
        seen[a:b] = b'\x01' * n
        open_[a:b] = bytes(n)
        for r2 in (row - W, row + W):
            if r2 < 0 or r2 >= W * H:
                continue
            lo, hi = r2 + (a - row), r2 + (b - row)
            j = open_.find(1, lo, hi)
            while j >= 0:
                stack.append((j - r2, r2 // W))
                e = open_.find(0, j, hi)
                if e < 0:
                    break
                j = open_.find(1, e, hi)
    return seen


def mask(seen, W, H):
    return Image.frombytes('L', (W, H), bytes(seen)).point(lambda v: 255 if v else 0)


def positions(img):
    """Indices of the set pixels of an L image."""
    data, out = img.tobytes(), []
    i = data.find(b'\xff')
    while i >= 0:
        out.append(i)
        i = data.find(b'\xff', i + 1)
    return out


def take_page_off(im, tol):
    had = im.mode in ('RGBA', 'LA', 'PA') and im.convert('RGBA').getchannel('A').getextrema()[0] < 255
    own = None
    if had:
        rgba = im.convert('RGBA')
        own = rgba.getchannel('A')
        W, H = rgba.size
        clear = bytearray(own.point(lambda v: 1 if v <= HAZE else 0).tobytes())
        still = bytearray(clear)
        outside = flood(clear, W, H)
        shut = [i for i in range(W * H) if still[i] and not outside[i]]
        if shut:
            sys.exit('%d clear pixels are shut inside the drawing, the first at (%d, %d): sky or a hole, look before using it'
                     % (len(shut), shut[0] % W, shut[0] // W))
        bg = (255, 255, 255)
        flat = Image.new('RGBA', rgba.size, bg + (255,))
        flat.alpha_composite(rgba)
        rgb = flat.convert('RGB')
    else:
        rgb = im.convert('RGB')
        bg = rgb.getpixel((0, 0))
    # a drawing cropped tight has no page left beyond its outermost pixels, and they are rim too:
    # the page is put back all round before it is taken off
    rgb = ImageOps.expand(rgb, border=RIM + 1, fill=bg)
    if own:
        own = ImageOps.expand(own, border=RIM + 1, fill=0)
    W, H = rgb.size

    # 1. the open page
    d = ImageChops.difference(rgb, Image.new('RGB', rgb.size, bg)).split()
    far = ImageChops.lighter(ImageChops.lighter(d[0], d[1]), d[2])
    page_bytes = flood(bytearray(far.point(lambda v: 1 if v <= tol else 0).tobytes()), W, H)
    page = mask(page_bytes, W, H)
    share = sum(page_bytes) / float(W * H)

    # 2. the page inside the outline: the rim, ring by ring, outermost first
    body = ImageChops.invert(page)
    rings, reach = [], page
    for k in range(RIM):
        grown = reach.filter(ImageFilter.MaxFilter(3))
        rings.append(ImageChops.multiply(body, ImageChops.subtract(grown, reach)))
        reach = grown
    inside = ImageChops.multiply(body, ImageChops.invert(reach))

    px = rgb.load()
    alpha = body.copy()
    al = alpha.load()
    ownpx = own.load() if own else None
    inpx = inside.load()
    colour = {}                       # the aeroplane colour read for a rim pixel
    fixed = kept = 0
    for depth in range(RIM - 1, -1, -1):
        for i in positions(rings[depth]):
            x, y = i % W, i // W
            r = g = b = n = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    xx, yy = x + dx, y + dy
                    if xx < 0 or yy < 0 or xx >= W or yy >= H or not (dx or dy):
                        continue
                    if depth == RIM - 1 and inpx[xx, yy]:
                        c = px[xx, yy]
                    else:
                        c = colour.get(yy * W + xx) if depth < RIM - 1 else None
                    if c:
                        r += c[0]; g += c[1]; b += c[2]; n += 1
            c = px[x, y]
            f = (r / float(n), g / float(n), b / float(n)) if n else None
            a = None
            if f:
                colour[i] = f
                v = (f[0] - bg[0], f[1] - bg[1], f[2] - bg[2])
                n2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
                if n2 >= 3 * MIN_CONTRAST * MIN_CONTRAST:
                    t = ((c[0] - bg[0]) * v[0] + (c[1] - bg[1]) * v[1] + (c[2] - bg[2]) * v[2]) / n2
                    t = 0.0 if t < 0 else 1.0 if t > 1 else t
                    off = max(abs(c[k] - (bg[k] + t * v[k])) for k in range(3))
                    if off <= MAX_OFF:
                        a = t
            if a is None:
                # not a mix that can be read: its colour stays, and its own opacity if it came with one
                kept += 1
                al[x, y] = ownpx[x, y] if ownpx else (128 if depth == 0 else 255)
                continue
            fixed += 1
            if a >= 0.5:
                px[x, y] = tuple(max(0, min(255, int(round(bg[k] + (c[k] - bg[k]) / a)))) for k in range(3))
            else:
                px[x, y] = tuple(int(round(f[k])) for k in range(3))
            al[x, y] = int(round(255 * a))
    out = rgb.convert('RGBA')
    out.putalpha(alpha)
    return out, had, share, fixed, kept


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 2272
    tol = int(sys.argv[4]) if len(sys.argv) > 4 else 10

    im = Image.open(src)
    cut, had, share, fixed, kept = take_page_off(im, tol)

    # haze off, then the drawing's own edges
    a = cut.getchannel('A').point(lambda v: 0 if v <= HAZE else v)
    cut.putalpha(a)
    cut = cut.crop(a.getbbox())

    # scaled with its colour weighted by its opacity, so a clear pixel lends no colour to the edge
    w, h = cut.size
    out = cut.convert('RGBa').resize((width, int(round(h * width / float(w)))), Image.LANCZOS).convert('RGBA')
    a = out.getchannel('A').point(lambda v: 0 if v <= HAZE else v)
    out.putalpha(a)

    W, H = out.size
    corners = [a.getpixel(p) for p in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1))]
    if any(corners):
        sys.exit('the page is still in: a corner of the picture is not clear (opacity %s)' % corners)

    out.save(dst, optimize=True)
    print('%s: %s -> %s; %s; the open page was %.1f%% of it; %d rim pixels un-mixed, %d kept as drawn'
          % (dst, im.size, out.size, 'came as a cut-out, laid on white first' if had else 'came on its page',
             100 * share, fixed, kept))


if __name__ == '__main__':
    main()
