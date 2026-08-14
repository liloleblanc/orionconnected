# Orion weather icon set

Six 3D weather marks, in two inks. Nothing in the app points at this folder yet —
these are assets only, added so they survive. Wiring them into the board, the gate
screens or the baggage screens is a separate change.

## Source and licensing

The artwork is a Vecteezy asset Nick purchased and supplied
(`set-of-meteorological-3d-cartoon-icons-of-rain`, item 22347571, Adobe Illustrator
EPS). It was converted EPS → PDF → SVG and the six marks were separated out of the
mockup by paint order, so each one comes away with no card behind it and no fragments
of the temperature numerals that sat underneath.

**Check which Vecteezy license the download was made under before this ships.**
Under the Free License the artwork requires a visible "Vecteezy.com" credit. Under the
Pro License it does not. The license PDF shipped in the download states both cases but
does not say which one applies.

## Files

Names follow the existing icon vocabulary in `TIO_ICON` (fids-core.js) and
`WX_CODE_MAP` (fids-v2.js) so they can drop into the current pipeline without a
translation layer.

| file | WMO codes it covers |
|---|---|
| `clear-day` | 0 |
| `partly-cloudy-day` | 1, 2 |
| `partly-cloudy-night` | 1, 2 at night |
| `rain` | 51–55, 61–65, 80–82 |
| `snow` | 71–77, 85, 86 |
| `thunderstorms-rain` | 95, 96, 99 |

Each name exists twice:

- `<name>.svg` — original art. Drawn for a **dark** ground: near-white clouds, amber sun.
- `<name>-light.svg` — recoloured for a **light** ground. Clouds go to a mid slate-navy,
  the sun and bolt to a deeper amber. Same geometry, same file structure.

`png/` holds 128px transparent rasters of both inks, for places where the full vector is
heavier than it needs to be. The vectors run 230 KB–935 KB each because the 3D shading is
built from 60–130 stacked blend steps; that is inherent to the artwork, not padding.

## Why there are two inks

The board flips to a light ground on Delayed and Final-call rows, and the gate screens
have light states too. The original art disappears on those — this is the same problem
the Meteocons set already solves with its own `-light.svg` pairs
(`fids-current/logos/weather/animated/`), and the CSS that performs that swap lives at
`fids-current/css/fids-layout-fixes.css:6273`.

Any future wiring should follow that same pattern rather than inventing a new one.

## Coverage gaps

The set is six marks. The product's icon vocabulary is wider — there is nothing here for
fog, drizzle, sleet, hail, wind or overcast. Those codes would still fall through to the
existing Meteocons set, which means a mixed look on screen. Closing that gap needs more
source artwork.
