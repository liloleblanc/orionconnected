# Weather icons: Solid and Colour

The boards' **Weather icons** choice (Customize menu, per airport) draws on
three Vecteezy packs: solid black glyphs (87176261), flat colour icons
(76738870) and white line icons on teal circles (50207959).

| Look | Departures / arrivals rows | Gate screens and the weather card |
|---|---|---|
| Classic (default) | the original icons | the original icons |
| Solid | solid glyph, no circle | solid glyph on a circle in the airline's colour |
| Colour | solid glyph, no circle | colour icon on a white circle |
| Day & night | solid glyph, no circle | Colour by day, Solid at night (the airport's own sunrise and sunset) |

The rows never take a circle. The colour pack draws its clouds as a grey edge
with white behind them as the body, so it needs its white circle.

## Rebuild

1. `export.jsx` (Illustrator) saves each pack's EPS as `sheet.svg`.
2. `split.js` runs in headless Chrome on each sheet and measures every shape
   (`getBBox` × `getCTM`; boxes come out in screen pixels).
3. `python3 cluster.py <dir>` groups shapes into one file per icon. One-colour
   icons become a luminance mask, ink white and paper black **in drawing
   order**, so the solid pack's white cut-outs stay holes.
4. `python3 build.py <dir> ../../fids-current/logos/weather` writes the seven
   sets the boards read, one file per condition (23).

A condition a pack doesn't draw gets a stand-in: the line glyph drawn bolder
for Solid (partly cloudy night, overcast night, sleet, night thunderstorm),
the solid glyph in the colour pack's slate blue for Colour (11 conditions).
