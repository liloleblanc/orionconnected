# Weather icons: Solid and Colour

The boards' **Weather icons** choice (Customize menu, per airport) draws on
three Vecteezy packs: solid black glyphs (87176261), flat colour icons
(76738870) and white line icons on teal circles (50207959).

| Look | Departures / arrivals rows | Gate screens and the weather card |
|---|---|---|
| Classic | the original icons | the original icons |
| Solid | solid glyph, no circle | solid glyph on a circle in the airline's colour |
| Colour | solid glyph, no circle | colour icon on a white circle |
| Day & night (default) | solid glyph, no circle | Colour by day, Solid at night (the airport's own sunrise and sunset) |

The rows never take a circle. The colour pack draws its clouds as a grey edge
with white behind them as the body, so it needs its white circle.

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

## Night icons drawn for Orion Connected (`night-owner/`)

A set of 20 line icons drawn for Orion Connected (gold-gradient suns, moons
and bolts, blue clouds and rain, white snow, fog and wind), one Illustrator
sheet with each icon on a charcoal circle. `night-owner.py` cuts it into one
file per icon in `fids-current/logos/weather/night-owner/`:

- the artwork is untouched: the same path data, the same gradients and their
  clipping, the same thin light edge stroke on every shape;
- the charcoal circle is left out (the card draws its own circle), and so is
  the thin frame left around the bolt of the storm-with-rain icon;
- the sheet's shared `.cls-N` stylesheet is written onto each shape as
  attributes, and every gradient and clip id is the file's own
  (`wxo-<name>-g1`, `wxo-<name>-c1`), so an inlined icon brings nothing global
  with it;
- every file has the same square viewBox (318.89 sheet units: the widest
  icon, partly cloudy by day, plus 4 % each side), centred on the icon's own
  drawn extent. One size for the set keeps every line at the weight it was
  drawn with relative to the others.

On a circle, draw the frame at **84 % of the diameter**: the farthest point of
any icon (the moon's tip in partly cloudy night) then stays inside 92 % of the
radius, the rule the other circle sets follow. That is 92 % of the size each
icon was drawn at in its own circle on the sheet.

Files are named as the boards name conditions (`fids-v2.js` `WX_LOOK_NAMES`),
so the folder can stand in for `disc-night/` name for name. The other
condition names are copies (`ALIAS` in the script): drizzle, extreme-rain and
sleet take rain; extreme-snow and hail take snow; mist takes fog;
overcast-day and overcast-night take overcast (two clouds);
thunderstorms-day-rain and thunderstorms-night-rain take thunderstorms-rain;
wind-cloud takes wind. Eight icons have no condition yet and keep their
Meteocons names: sunrise, lightning-bolt, snowflake, thermometer-colder,
thermometer-warmer, partly-cloudy-day-snow, umbrella, tornado.

Rebuild: `python3 night-owner.py split WEATHER.svg <work>`, serve `<work>`
and run `night-owner-measure.js` in headless Chrome on a page there (it prints
each icon's drawn extent), save that as `measure.json`, then
`python3 night-owner.py build WEATHER.svg measure.json ../../fids-current/logos/weather/night-owner`.
