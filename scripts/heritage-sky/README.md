# heritage-sky — the archive card's cloud fly-through, and the gate shelf's cloud strips

Everything the board's cloud scenes are built from lives here so they can be
rebuilt without the session that first made them. `build.sh` compiles the
tools; `render-clips.sh` reproduces the two archive-card clips byte-for-purpose;
`make-shelf-strips.sh` reproduces the gate shelf's v3 strips.

## The tools (src/)

| tool | does |
|---|---|
| `flythru` | renders a fly-through: every cloud a billboard at its own depth, a camera tracking past, seamless loop by construction, H.264 out via AVFoundation |
| `compose` | places cloud elements into a horizontally tileable strip (wrap-tiled, no mirror), with haze / whiten / feather |
| `segment` | splits a sheet of clouds into one PNG per cloud; groups on a dilated mask so a torn wisp stays one element; elliptical, per-edge feather |
| `stripe` | carries a livery stripe across a nacelle by transferring hue per row at the target pixel's own luminance |
| `shiftmeasure` | cross-correlates a band between two stills to measure how far it moved — how the reference's layer speeds were obtained |
| `unchecker` | recovers alpha from a preview that has the transparency checkerboard baked in |
| `grabframes` | pulls PNG frames from a movie at given times (also reads ProRes) |
| `alphahist` | alpha-channel histogram and corner check for an image |
| `tileify` | cross-fades an image's right end over its left start so it tiles horizontally |
| `alpharemap` | lifts an alpha floor out of a recovered sheet (`a' = ((a-floor)/(1-floor))^gamma`) |
| `ellfeather` | multiplies alpha by an elliptical falloff so a rectangular crop has no straight edge |
| `blurpng` | gaussian blur with an optional alpha floor (kills a residual checker) |
| `keyblue` | unmixes a white cloud from a vertical sky gradient fitted from the image's own margins |
| `lumakey` | alpha from brightness for a white cloud on a dark ground (blur the checker away first) |
| `flipcrop` | flips an alpha PNG both ways, crops rows, tints, resizes to a width (the top band) |
| `vfade` | fades alpha to zero across a row range so a crop never ends in a line |
| `vfadein` | fades alpha in from zero across a row range so a layer never starts as a line |
| `plate` | draws alpha layers onto a JPG background at fixed positions (the still sky plate) |
| `cropscale` | crops a region and scales it to a width, alpha kept (sips silently centres a zero offset and refuses a crop that reaches the edge) |
| `cleanplate` | removes an aircraft from a sky clip: mask traced from the clip itself, bob tracked on the aircraft's own pixels, hole filled from the surrounding sky |
| `cleanplate5` | the same removal with a motion-compensated fill: each cloud is carried through the hole at its own layer's speed, from the hole's own edges (the shelf clip since 2026-10) |

## The structure is measured, not tuned

Cross-correlating the reference hero clip, scaled to 1280 px wide:

    bottom bank   ~1 px/s      still
    top band      ~2 px/s      still
    veils        ~171 px/s     crossing the frame in ~7.5 s
    aircraft      no bob

A still sky with thin translucent veils crossing the aeroplane — **one moving
layer**. The clouds are stationary; the aircraft's speed shows only in what is
close enough to sweep the frame. The gate shelf's existing CSS layer system
already has this shape (a back plate plus scrolling front strips), which is
why it needs strips, not video.

## Rules that came out of building it

- **A still layer is drawn still** — placed once, no camera, no copies. A slow
  *scroller* pushed far back wallpapers the frame: the loop period shrinks on
  screen (2000 × 1000/30000 = 67 px) and every cloud repeats every 67 px.
- **Speed is focal/depth.** Closer is the only way to make a layer faster, and
  closer magnifies — recompute world size when a band moves.
- **The bob period must divide the loop duration** or the aircraft jumps at
  the seam. Sway on still layers is one sine over the whole loop.
- **Verify the seam numerically** (first frame vs last: 0 px on the aircraft,
  0 px on the bank) and **verify direction numerically** (a nose-left aircraft
  needs the world moving right).
- **Each layer names its elements.** Coverage as a proxy cannot tell a soft
  puff from a flat streak. Dense textured cumulus belongs in the banks and
  never in front; the veils are soft, smooth, light forms.
- **Whiten, not less haze.** Haze blends toward the sky, so backing it off
  leaves a grey cloud grey; a near cloud reads as lit only with an explicit
  lift toward white and low alpha.
- **"Transparent" previews and conversions carry the checkerboard** — as JPEG
  pixels, or as real `<rect>` geometry in an SVG export. Check corner alpha
  before believing it. NSImage flattens SVG alpha; rasterise SVG in a browser.
- zsh does not word-split unquoted variables. `set -- $s` silently empties
  placement strings; use explicit strings.

## Elements

`elements/` holds the cut-out clouds the scenes are placed from: `p*` are
segmented from the licensed photographic cloud pack, `ai_*` from a licensed
vector set (its SVG export had the checkerboard drawn in as a
`<g id="background">`, removed before rasterising). The source packs are not
in the repository; these cut-outs are what the renders actually consume.

## The shelf's v4 veils (v23892)

The front veils were not selling the motion: too slow, too few, and the
layer behind the aeroplane too thin to match. v4 rebuilds both veil strips
from a licensed smoke-cloud sheet and a soft-cloud vector, nine wisps per
front tile and twelve per back tile, and puts the speed back up: 200 px/s
in front (1200 px / 6 s), 112 px/s behind (1350 px / 12 s). The bank is a
licensed cumulus bank cut to a band and cross-faded into a 1680 px tile; the
sky plate is a band of a licensed cirrus sky and is still.

A dark-checkerboard preview keeps a faint alpha haze after grid
reconstruction (the cloud is not white and the JPEG blurs the cells), and a
rectangular crop of it shows as a translucent box on the board. The chain
that works: `unchecker` → `blurpng 7 0.03` → `alpharemap 0.14 1.1` →
`blurpng 3 0.02` → crop → `ellfeather 0.55`. Check the strip composite over
sky before shipping: the boxes are invisible in the element viewer and
obvious in the scene.

## The shelf's three bands (v23893)

The scene is three bands. The top and bottom bands are the licensed
smoke-cloud sheet used as designed: it is a border layout, cloud along its
top and along its bottom with the middle clear, and both borders sit still
in the sky plate (v23896). Earlier tries — a flipped bank, a deck of thin
wisps, a row of cumulus — were substitutes for the artwork that had been
supplied for exactly this. Along the bottom, the still bank, its tops
under the aeroplane. Between them, the aeroplane's own band: the two fast
veil layers, one behind the airframe and one in front — light, translucent,
spanning the band's full height so the aeroplane flies inside them; filling
the band means height, not weight — and behind them a slower layer of medium-to-big clouds that
drifts at about 14 px/s. Nothing in the top or bottom band moves; the
aeroplane floats slowly and smoothly (9 s cycle, about ±10 px); a 5 s bob
read as jerky. Every layer's phase is written into the shelf's markup at
build time, so a rebuild never restarts a layer out of step.

## The border sheet, keyed by brightness (v23897)

The checkerboard reconstruction leaves a faint alpha floor across the whole
sheet. Cut out and feathered, a single wisp hides it; used whole as the top
and bottom bands, every crop showed on the board as a translucent box, and
the tiled copies met in visible seams. For a white cloud on a near-black
checker, brightness is the matte: blur the source about 9 px first, so the
13 px checker averages to one grey, then `lumakey 40 215`. The alpha is
clean to zero in the open sky. Cut the bands, fade their inner edges, and
cross-fade them into tiles (`tileify`) so the plate never shows a seam.
Judge the result on the stack composite at shelf scale, never on the sheet.

## The sky is the reference clip, aircraft removed (v23899)

The shelf no longer imitates the reference; it plays it. `cleanplate` takes the
reference fly-through and removes its aircraft using only the clip: the
aircraft is whatever is not sky in one reference frame, connected to a seed on
the fuselage; its own pixels are the template for tracking its bob; and across
every tenth frame aligned on that bob (38 for this clip), anything non-sky in
at least 80% of them is aircraft, while clouds, which move, drop out of the
mask. The hole is dilated, feathered and
filled from the sky around it. The clip was shot for a nose-right aircraft, so
the board mirrors it for the default nose-left one, and scales it 1.2x from
the top so the filled band sits behind the gate aircraft's fuselage.

Three layers of the supplied clouds pass over it, over the full height, never
one line across the aeroplane: big and slow far back (60 s), mixed sizes
behind (12 s), small in front (6 s). Recipes are in `make-shelf-strips.sh`.
`cropscale` crops from the top-left, as CGImage does; an earlier copy flipped
the offset and cut the wrong band whenever the offset was not zero.

## Aircraft drawings: put the artboard back (`artboard-backing.py`)

A side-view aircraft drawn on a white artboard can lean on that white without
anyone meaning it to. A shape drawn at partial opacity (the caps-livery DC-9's
thrust reverser is a 67 % gradient, its intake ring fades to 37 %), or a sliver
left between two shapes (the white stripe above that DC-9's wing was an empty
gap), reads as white in Illustrator or Linearity and as blue sky on the archive
card.

    python3 scripts/heritage-sky/artboard-backing.py export.svg fids-current/aircraft/heritage/<name>.svg

The script adds a `<g id="artboard-backing">` as the first thing drawn. It holds:
- a white copy of every shape whose fill is not fully opaque;
- a white band behind every enclosed gap. A gap is a transparent pixel in a
  render that cannot be reached from the edge of the picture without crossing
  the drawing.

Over white, the result is pixel-identical to the export. It refuses if any of
the backing would land where the sky reaches. It runs on macOS only, rendering
with `qlmanage`, and needs Pillow.

`tests/heritage-card.test.js` checks two things for every drawing in
`aircraft/heritage/`:
- every see-through shape is backed;
- the drawing contains no embedded bitmap. Illustrator writes one when it
  cannot express some shading, as it did with the DC-9's engine.

## The shelf clip re-rendered: clouds carried through the hole (`cleanplate5`)

`cleanplate` filled the hole on each frame from the sky around it (dilate,
feather, push-pull). Every cloud that drifted through the removed band played
as a bright, flat glow that did not travel: on veil pixels inside the hole the
texture was a third of the surroundings' (high-pass ratio 0.32) and the change
from frame to frame was not a translation (it was explained 2.4x by moving at
the clip's speeds, against 5.9x around it). The first frame has no cloud in the
band, so the poster and every still looked clean.

What the reference does, measured (1920 wide):

- The aircraft only bobs vertically: 60 px in all (about +-30), eased, and the
  last frame steps to the first by 0 px. No sideways drift.
- The sky painting is still. White, see-through veils cross it leftward at
  constant speed with no vertical motion. They are LAYERS: about 205 and
  395 px/s through the fuselage's rows (both at once), 455 px/s just below
  them, 165 px/s over the bottom bank (110 to 303 px/s at 1280 wide). Each
  cloud keeps one speed; a map of the layers by cloud is `--layer-map`. The
  earlier single 171 px/s is superseded.
- The band the aircraft covers is nearly empty of veils at both ends of the
  clip, so the loop is seamless there.

`cleanplate5` keeps the mask, the bob tracking and the output geometry of
v23899 (1824 px at x 48 scaled to 1140x674, 25 fps, frame k = reference frame
k), so the CSS is unchanged. Inside the cover (the mask with its letter and
window holes filled, dilated 16 px):

1. The still sky is each pixel's mean over its uncovered, veil-free frames.
   Pixels the aircraft always hides, and pixels it uncovers for fewer than 150
   frames, get a membrane fill. **The bob reveals a strip above and below the
   fuselage only around 7 s, under a passing veil: trusted as "still", that
   strip came out 45 grey too bright and drew a lit slab with a hard edge along
   the fuselage.**
2. Every visible point of the band gets a soft membership in each layer
   (165, 205, 300, 395, 455 px/s): how well its optical depth matches its own
   past and future shifted at that speed, over a window of 33x17 px and 13
   frames. A flat, saturated cloud interior, where the speeds hardly differ,
   takes the confident memberships around it (the cloud's own edges), and only
   failing that the row's usual layer.
3. Each layer is carried through the hole at its own speed, from the hole's
   own edges: a hidden pixel x at frame t is what the first visible point
   along its track showed, to its right (x + v d, d frames earlier) and to its
   left (x - v d, d frames later), in its own row, round the seamless loop.
   The track ends wherever the hole ends in that row at that moment: the nose
   and the tail for the fuselage's rows, the fin's edges for the fin's rows,
   the engine's for the engine's, a few frames back for a row the bob has just
   covered. The two ends are interpolated along the track and the layers add.
   Samples are taken at whole frames (Catmull-Rom along x), not at one column
   at fractional times, which would blur the veils along x by v px per frame.
4. Near the top and bottom of each column's hidden run, where the edge runs
   along x (the fuselage's lines, the engine's), the clip's own pixels
   reflected about the row just outside it, weighted against the transport by
   inverse squared distance (for the transport: to the row's run end, or 14 px),
   so the fill meets the clip there too. Not at a slanted edge (the fin's
   leading edge, the nose), where the row's run end is about as near: there
   the reflection pulled in sky from beside the edge and drew a line along it.
   Under a narrow notch (the antenna's) the reflection is about the fuselage
   line beside it.
5. Colour is S + beta (255 - S) per channel; the cover edge is feathered 6 px.

Rules that came out of building it:

- **Carry each cloud at its own speed.** The first version used one pair of
  source columns, just outside the hole's widest extent, and one speed
  (205 px/s) for every row. A 395 px/s cloud carried at 205 px/s is squeezed to
  half its width, so its soft sides turn steep: it came out a box with straight
  sides, its top cut flat along the fuselage line (1.2 to 4.8 s). Rows whose
  hidden run is short (the fin, the engine, the nose) got clouds copied from
  600 px away that did not match the clouds crossing their own edges, so the
  fin's outline showed as a cloud (4.2 to 4.8 s). Straight vertical edges (10
  px or more at one column) came 11 per 1000 px of fill, against 2 in the
  reference sky. The layer memberships fix the first; tracks that end at each
  row's own edge fix the second.
- **A track that ends at the row's own edge does not make horizontal edges once
  the speed is right.** Per-row columns did, when every row was carried at one
  speed: the rows then disagreed by the speed error times a different distance.
  With each cloud at its own speed, the rows of one cloud agree.
- **Never spread the edge mismatch over the hole.** A Laplace or push-pull
  correction from the hole's rim made the glow again; reflection and transport
  do not.
- **Least squares into rigid layers does not work here.** The strips beside
  the hole are 190 px wide and the veils are broad and overlap, so the split
  between layers is not determined: the fits matched the visible pixels to 2-6 %
  and put horizontal cigars and streaks in the hole. A soft membership per
  point, from that point's own motion, does work.
- **Hold-outs** (a second cover where the truth is known; `--holdout DY` and
  `--holdout-strip` reproduce them): mean error 10.8 grey with the copy 150 px
  lower (the still sky alone 12.0; the first version 13.7), 4.5 with it 150 px
  higher (9.1; 6.5), 2.2 with the left strip hidden for 4 s (10.2; 10.7). On
  moving-veil pixels: 7.1, 10.1 and 5.3 grey (first version 15.1, 16.0, 41.0).

Result on the shipped clip, with the probes used for the smear:

- straight vertical edges in the fill 0.9 per 1000 px (reference sky 2.0; the
  first version 11.0; the spatial fill 0.01);
- change from frame to frame explained by translation 6.6x against 5.8x around
  the hole (the first version 4.6x against 5.5x; the spatial fill 2.4x against
  5.9x); frame-to-frame step in the hole 1.45 grey against 1.39 around it;
- texture on veil pixels in the hole 0.64 of the surroundings' (untouched
  pixels score 0.91; the spatial fill 0.32). The first version's 0.85 came
  partly from its box edges;
- outside the cover the clip is the reference's own (median difference 0.52
  grey, codec noise); last frame to first in the hole 0.48 grey against an
  ordinary step of 1.28.

### Where the fill shows on the gate shelf

Checked on the board itself (YQM gate 3, 1920x1080, by day, with test flights
of a Rouge A320, a Jazz and a Porter Dash 8-400 and a Jazz CRJ900), with every
layer and the clip paused at the same moments (1.5, 3, 4.5, 7.5 and 10.5 s) on
the live build and on this one, then again with the gate aircraft hidden.

- The removed band sits behind the gate aircraft, but no gate aircraft covers
  all of it. The A320 leaves a strip under its fuselage, engine and wing open;
  the Dash 8-400s and the CRJ900 are slimmer and leave much more of it open,
  and with no aircraft at the gate (the carrier mark holding its place) all of
  it shows. So the fill has to hold up on its own: judge it with the aircraft
  hidden as well as in place.
- On the live build the band shows the glow. With this clip it shows clouds of
  the same kind as the rest of the sky, moving with it, mirrored or not; no box
  shapes and no outline of the removed fin, engine or fuselage, including at
  the moments the one-speed attempt showed them (3 and 4.5 s).
- The first frame is clean on every clip; judge at moments when a cloud
  crosses the band.
