# Orion paper-cut weather icon set

Twenty weather marks at `fids-current/logos/weather/orion-papercut/`. **Assets only —
nothing in the app points at them yet.** Wiring them into the board, the gate screens or
the baggage screens is a separate change.

## Why this set

Nick supplied eight candidate sets. This one won on three counts:

1. **It covers everything.** Twenty marks including the six conditions no other set had —
   fog, wind, sleet, drizzle, overcast, and day/night variants throughout. The set already
   in `logos/weather/orion/` covers six conditions; everything else fell through to
   Meteocons and the screen showed a mixed look.
2. **One set works on both grounds.** The icons are saturated colour rather than white, so
   they read on the board's navy `#0E2748` *and* on the amber `#EDBB00` of a Delayed or
   Final-call row. The 3D set needs a separate `-light.svg` pair for exactly that reason.
   Verified by rendering all twenty on both grounds.
3. **Same artist as the set already in the repo**, so the house style is consistent even
   though the technique differs.

## Files

PNG with alpha, longest edge 512px, ~120 KB each.

| file | WMO codes |
|---|---|
| `clear-day` | 0 |
| `clear-night` | 0 at night |
| `clear-night-stars` | 0 at night, alternate |
| `partly-cloudy-day` | 1, 2 |
| `partly-cloudy-night` | 1, 2 at night |
| `overcast` | 3 |
| `fog` | 45, 48 |
| `drizzle` | 51, 53, 55 |
| `rain` | 61, 63, 65, 80, 81, 82 |
| `rain-night` | as above, at night |
| `sleet` | 56, 57, 66, 67 |
| `snow` | 71, 73, 75, 77, 85, 86 |
| `thunderstorms` | 95 |
| `thunderstorms-rain` | 96, 99 |
| `wind`, `wind-cloud` | windy conditions |
| `snowflake`, `rainbow`, `thermo-cold`, `thermo-hot` | decorative / auxiliary |

Names follow the existing `TIO_ICON` and `WX_CODE_MAP` vocabulary so they can drop into the
current pipeline without a translation layer. **Hail is the only condition with no artwork**
in any set Nick supplied.

## PNG rather than SVG, deliberately

The source EPS is built from gradient meshes and transparency groups. Both Ghostscript and
Cairo flatten it to raster on conversion — a straight EPS→SVG gives nine image tiles and
zero paths, so there is no vector to preserve. Rendered instead at 150 dpi (the full sheet
is 5900 × 4425, each icon roughly 1000px square), then cut, white-matted and downsampled to
512px.

512px is 3× the largest place an icon is used today (the 172px hero on the gate card) and
10× the 48px board cell, so there is headroom.

## How the white was removed

The artwork sits on a white background with soft paper-cut shadows. A hard white key would
have cut the shadows off and left a hard edge. These are un-composited instead — alpha
derived per pixel as `1 − min(R,G,B)/255`, colour recovered as `(px − 255(1−a))/a`. Shadows
survive as genuine partial alpha, so they fall on whatever the icon is placed over.

Consequence worth knowing: any pure-white content in the source becomes transparent. That
affects only the two thermometers, whose bodies are near-white. Every condition icon is
saturated and came through intact.

## Known rough edge

Five icons — `rain`, `sleet`, `thunderstorms-rain`, `rain-night`, `wind-cloud` — use the
source's dark purple-grey cloud. On the navy board they are legible but muddy, since dark
grey on dark navy is a narrow contrast band. Brightening those five is a small colour pass
and has not been done, because it changes the artist's palette and that is Nick's call.

## Licensing

Same open question as the other set. Vecteezy ships an identical boilerplate PDF with every
download that explains both the Free and the Pro licence without stating which applies. Under
Free the artwork needs a visible "Vecteezy.com" credit; under Pro it does not. Only the
Vecteezy account's download history answers it. Worth settling before these reach a screen.

## The older set

`fids-current/logos/weather/orion/` still holds the six-condition 3D set with its dark and
light variants. Nothing references either folder. Once this set is wired in, that one can be
deleted — left in place for now rather than removing artwork Nick paid for on an assumption.
