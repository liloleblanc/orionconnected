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
| `flipcrop` | flips an alpha PNG both ways, crops rows, tints, resizes to a width (the top band) |
| `vfade` | fades alpha to zero across a row range so a crop never ends in a line |
| `vfadein` | fades alpha in from zero across a row range so a layer never starts as a line |
| `plate` | draws alpha layers onto a JPG background at fixed positions (the still sky plate) |

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

The scene is three bands. Along the top, a still deck of soft cloud hung
from the top edge, baked into the sky plate (v23894; the flipped bank tried
first read as a flat strip with a hard lower edge on the board). Along the bottom, the still bank, its tops
under the aeroplane. Between them, the aeroplane's own band: the two fast
veil layers, one behind the airframe and one in front, filling the band from
top to bottom, and behind them a slower layer of medium-to-big clouds that
drifts at about 14 px/s. Nothing in the top or bottom band moves; the
aeroplane bobs a little more than before and faster (5 s cycle) so it is
seen to move; it does not need to climb and dive.
