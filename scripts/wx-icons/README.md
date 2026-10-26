# Weather icons: Solid, Colour and the flat set

The boards' **Weather icons** choice (Customize menu, per airport) draws on
three Vecteezy packs for the day circles: solid black glyphs (87176261),
flat colour icons (76738870) and white line icons on teal circles
(50207959). The departures and arrivals rows, and every circle at night,
draw a fourth: the flat set in the style of **Vecteezy pack 98703** (white
clouds, a `#CCCCCC` cloud behind, a `#F2A844` sun, moon and bolt). All four
are licensed (Vecteezy PRO), so no attribution is needed and none is shown.

| Look | Departures / arrivals rows | Gate screens and the weather card |
|---|---|---|
| Classic | the original icons | the original icons |
| Solid | the flat row sets, no circle | solid glyph on a circle in the airline's colour; at night the flat night icons |
| Colour | the flat row sets, no circle | colour icon on a light tint of the card's ground, day and night |
| Day & night (default) | the flat row sets, no circle | Colour by day, the flat night icons at night (the airport's own sunrise and sunset) |

The rows never take a circle. They wear one of two sets of the flat set,
the same shapes in two colourways (`rows-flat-white/`, `rows-flat-color/`,
built by `flat.py`): the white set (the pack's own colours) on a dark row,
the colour set (navy `#034C76` clouds, drops, flakes and lines, a `#307895`
cloud behind, a `#A0610B` sun, moon and bolt) on a light one.
`fids-core.js` `_fidsRowWxSet` picks icon by icon from the colour it really
sits on. First the set the row calls for: wherever white holds less than 3:1
there (WCAG 2.2 SC 1.4.11; any ground above a relative luminance of 0.30:
yellow Delayed, orange Final call, light Customize rows, an airline's yellow,
orange, lime or teal) the white set would vanish and the row calls for the
colour set; otherwise the row follows its own text ink (dark text: colour).
Then whether that drawing can be seen there (`_wxRowWear`), from each file's
pixels at the rows' 38 px (`_WX_ROW_PX`), part by part (a part is each
colour the file is filled with):

1. a drawing is worn where half of **each of its parts** that meets the
   ground stands at 3:1 or more on it (`_wxRowSeen`; the set the row calls
   for, then the other one). The sun, moon and bolt and the cloud behind
   must hold as well as the cloud: half of the drawing at 3:1 is not enough,
   or partly cloudy reads as plain cloud and a storm as rain (on Moncton's
   teal stripe the colour set's navy cloud holds 3.1:1 while its brown sun
   and bolt are at 1.7:1). The mercury, inside its tube, never meets the
   ground: the palette sets it against the tube;
2. where neither does, the **ink copy**: the drawing in one colour, the
   row's own text colour (navy on yellow and orange, white on blue and red),
   wherever a quarter of it stands at 3:1. Its mask is `rows-flat-ink/`
   (built by `flat.py`): the drawing's own shapes, each part cut back from
   the parts in front of it, so one colour still shows the sun behind the
   cloud, the bolt under it, the cloud behind and the mercury in its tube
   (the white file as a mask merged them into one shape);
3. where that colour is itself too faint (an operator's white text on a teal
   or gold row), the most legible of the drawings and the copies in the
   row's ink and the board's white or dark ink.

No list of themes or carriers is kept, and no drawing is redrawn or
filtered. The flat set's second colours hold 3:1 only on dark grounds (the
white set's orange to a luminance of about 0.12, its grey to 0.17) and on
light ones (the colour set's brown and blue from about 0.58). So on white,
light and yellow rows every icon shows in the colour set as drawn; on navy,
black and the darker reds every icon shows in the white set as drawn; on red
Cancelled the cloud icons show as drawn and those with an orange part in
white; and on the mid-tone grounds in between (the darker Delayed yellow,
orange Final call, Moncton's blue and teal stripes, an airline's teal, cyan,
blue, red or gold) every drawing in more than one colour shows as its ink
copy, in the row's own ink, and those in navy or white alone as drawn.
After a row file changes, run `rows-pixels.js` in headless Chrome on any
page served from `fids-current` and put the table it returns in
`fids-core.js` in place of `_WX_ROW_PX` (each entry carries its file's
SHA-1, and `tests/weather-rows-flat.test.js` fails until it is done).
The colour pack draws its clouds as a grey edge with white behind them as
the body, so on the gate and the card it needs its circle.

## Rebuild

1. `export.jsx` (Illustrator) saves each pack's EPS as `sheet.svg`.
2. `split.js` runs in headless Chrome on each sheet and measures every shape
   (`getBBox` × `getCTM`; boxes come out in screen pixels).
3. `python3 cluster.py <dir>` groups shapes into one file per icon. One-colour
   icons become a luminance mask, ink white and paper black **in drawing
   order**, so the solid pack's white cut-outs stay holes.
4. `python3 build.py <dir> ../../fids-current/logos/weather` writes the four
   sets the boards read (solid, solid-in-disc, disc-day, disc-night), one file
   per condition (23).

`build.py` frames every glyph on its own drawn geometry: the path data read
through its transforms (which are kept whole: trimming 0.2286 to 0.22 once
slid every glyph out of its box, cutting rain clouds, drops and wind lines),
plus 6% each side, centred, and never reaching past 46 of the circle's 50.
`tests/weather-icon-fit.test.js` measures every shipped file the same way.
The day circle (`disc-day`) is filled with `var(--wxc-disc, #FFFFFF)`: on the
weather card a light tint of the card's ground (fids-core.js `_wxDiscTint`),
white anywhere else.

A condition a pack doesn't draw gets a stand-in: the line glyph drawn bolder
for Solid (partly cloudy night, overcast night, sleet, night thunderstorm),
the solid glyph in the colour pack's slate blue for Colour (11 conditions).

## The flat set: the rows and the night circle (v24086)

The flat set in the style of Vecteezy pack 98703 replaced, in v24086, the
row and night icons drawn earlier for the boards: `night-flat/` replaced
`night-line/`, and `rows-flat-white/` and `rows-flat-color/` replaced
`rows-line-white/` and `rows-line-color/` (new folder names, so no cache can
serve an old file under the new look), and `rows-flat-ink/`, the ink copy's
mask, is new. The scripts that cut the earlier
drawings (`night-line.py`, `rows-line.py`, `rows-line-split.js`,
`rows-line-measure.js`) went with them; `rows-line-pixels.js` became
`rows-pixels.js`. The day sets (`flat/`, `disc-day/`, `disc-night/`,
`solid/`, `solid-in-disc/`, `animated/`) are unchanged.

**The source** is `flat/` here, the 31 masters and their palette:

- `flat/<name>.svg`: one master per condition name the boards draw (every
  name in `fids-v2.js` `WX_ROW_NAMES`, which holds `WX_LOOK_NAMES` and every
  name `fids-core.js` `_wxAnimIcon` and `_wmoAnimIcon` can give). Each is
  drawn on a 100-unit frame, centred on (50, 50), every shape a `<path>`
  (M L C Z) or a `<circle>` with a `data-role` and the dark colourway's fill.
  Six are the pack's own icons (partly cloudy, clear, snow, partly cloudy
  night, rain, storm with rain); the other 25 are composed from the pack's
  shapes in the same flat language. Every cloud icon keeps the pack's cloud
  pair 80 units across, so a cloud, a drop or a flake is one size in every
  icon (partly cloudy with snow alone is fitted to 80, its middle flake
  staggered low as in snow); the icons without a cloud are drawn 72 to 80
  across.
- `flat/palette.json`: the colours by role. `dark` is the pack's own colours
  (white, `#CCCCCC` for the cloud behind, `#F2A844` for the sun, its rays,
  the moon, the bolt and the thermometer's mercury), for dark rows and the
  night circle; `light` is for light rows (navy `#034C76`, `#307895` for the
  cloud behind, `#A0610B` for the sun, rays, moon, bolt and stars, each at
  3:1 or more on white and on the yellow Delayed row; the mercury, enclosed
  by its navy tube and never on the row's ground, keeps the pack's
  `#F2A844`). Its `mono` and `ratios` keys are notes; `flat.py` does not
  read them.

**The build**, `python3 flat.py` (deterministic: the files depend on the
masters alone), writes four folders of 31 files and removes any other
`.svg` in them. Each drawing is the master's shapes as written, in its
colourway, under its frame: no id, no style, no script, no `data-role`.

- `night-flat/` (dark colourway): **each file's frame is the night
  circle**, `-12.5 -12.5 125 125`, one frame for every icon. The boards draw
  their circle and place the file's frame on the whole of it, so the cloud
  pair spans 64 % of the circle's diameter, as the pack's icons sit in their
  tiles, and every icon keeps one scale (the longest sides run 57.6 to
  65.8 % of the diameter). The farthest point of any icon from the centre is
  extreme rain's lowest drop, at 85.6 % of the radius: inside the boards'
  92 % rule for circle sets, which `flat.py` checks.
- `rows-flat-white/` (dark colourway) and `rows-flat-color/` (light
  colourway): the same shapes and one square frame for both sets,
  `-9.09 -9.09 118.18 118.18`, centred on the masters' centre, so a row that
  swaps one set for the other never moves. The largest icon (extreme snow,
  82.30 tall) spans 69.64 % of the frame, the share the row icons have
  always taken (78 % of the box less 6 % each side), so the rows' layout
  does not move.
- `rows-flat-ink/`: the ink copy's mask, under the rows' frame. The master's
  shapes in white on a luminance mask (one id, `wxk-<name>`), each run of
  one part (its role; the rays are the sun's own) first cut out of what lies
  behind it, `INK_GAP` (3.2 units, about a pixel at the rows' 38 px) all
  round. It is only ever a CSS mask (`--wxr-m`), never inlined.

Rebuild after a master changes:

1. `python3 scripts/wx-icons/flat.py` (it prints each frame, and each
   icon's share of the circle and reach);
2. `scripts/wx-icons/rows-pixels.js` in headless Chrome on any page served
   from `fids-current` (`Runtime.evaluate` with `awaitPromise`); put the
   `src` it returns in `fids-core.js` in place of `_WX_ROW_PX` (the white
   set, the colour set and the masks, part by part);
3. `npm run assets:build`.

### On the boards (v24054)

At night, wherever the look draws its weather icons in a circle (Day & night
after dark, and Solid at night), the boards draw these icons:

- **The weather card** (`fids-core.js` `_wxCardIconDir`): a plate or an hour in
  darkness, or with no flag of its own (the day forecasts) the board at night,
  takes `night-flat/`. Each file is inlined and set in its circle by
  `_wxNightLineDisc`: a 100-unit circle filled with `var(--wxn-disc)`, the
  file's frame placed on the whole of it (`_WX_NIGHT_ICON` = 100).
  Each hour follows its own city's darkness, so at a destination's dawn or
  dusk one hours row shows these night icons for the dark hours and the day
  look (Colour) for the light ones; the 5-day screen follows the board's
  own day or night, not the destination's.
- **The gate screens' circle look** (`fids-v2.js` `wxIconHtml`) is wired the
  same way: a `.fids-wx-line` element whose round background is the circle
  (`--wxn-disc`) and whose `::after` is the icon on the whole circle
  (`inset: 0`, `css/display-overrides.css`). At night it draws a code's night
  form, the icon the card draws for the same code (`_wxAnimIcon`): the moon
  for a clear sky, the two clouds for WMO 3. **No element of today's gate
  layout shows it**: the header's `#hdrTemp`, the only gate element that
  asks for it, is hidden.
- A Solid chosen by day keeps its glyphs; the rows never take a circle; the
  day look (Colour, the light tint of the card's ground) is unchanged.

The circle's colour is **one choice**, `_WX_NIGHT_DISC` in `fids-core.js`:

| Value | Circle |
|---|---|
| `'airline'` (B, the default) | what the card paints under the circle, lifted a step toward a light tint of the airline (`_wxNightDiscTint`): the hue the card tints its ground with, as light as the day circle and with no more colour than that tint has nor than 0.035, laid at 10 % (`_WX_NIGHT_LIFT`) over the ground. The ground is the airline's near-black over the weather footage at 30 %, so it changes with the take; a circle of one fixed colour (Air Canada's `#33282B`) sat at 1.01 to 1.06:1 on it and read as no circle at all. The lift keeps it about 1.3:1 lighter on any take (measured on the card at 1920: Air Canada 1.25 to 1.29, Porter 1.28 to 1.34, WestJet 1.30 to 1.34), and the icons' white, grey and orange keep 3:1 on it (`_WX_NIGHT_INKS`, the dark colourway). Air Canada `rgba(249, 234, 238, 0.1)` (toward a faint wine), WestJet `rgba(213, 246, 247, 0.1)` (a faint teal), Porter `rgba(225, 240, 255, 0.1)` (a faint navy). |
| `'charcoal'` (A) | a charcoal circle, `#2B2B2A`. |

Known gaps at night, all upstream of this set: the server folds MET's sleet
onto freezing rain (WMO 66/67, drawn as rain) and its sleet showers onto snow
showers (85/86, drawn as cloud with snow), so the two sleets draw different
icons, each matching the words the card prints; every thunder code is WMO 95,
drawn as bolt and rain, snow with thunder included; no code draws cloud with
bolt and no rain yet (the set has the drawing, `thunderstorms`).

`tests/weather-night-flat.test.js` pins every MET symbol, read at night, to
its icon and that icon to a file in `night-flat/`, each file to its master
in the dark colourway, every file's frame to the circle, and measures every
file: nothing past its frame, nothing past 92 % of the circle's radius, one
scale for every icon. `tests/weather-rows-flat.test.js` pins the row sets:
the same names and shapes in both, one frame, the masks and their cuts, the
pixel table's SHA-1s and parts, and what each icon wears on every ground a
board can paint a row in (each part of a drawing worn at 3:1).
