# Weather — icon set and card design

Documentation and design source live here, at the repo root, **not** inside
`fids-current/`. That directory is the deployed asset root (see `wrangler.jsonc`) and
`tests/repository-cleanliness.test.js` rejects `.md` and `.py` files inside it.

The icons themselves ship as assets and do live under
`fids-current/logos/weather/orion/`.

---

## The icon set

Six weather marks, each in two inks. **Nothing in the app points at them yet** — they
are assets only. Wiring them into the board, the gate screens or the baggage screens is
a separate change.

### Source and licensing

The artwork is a Vecteezy asset Nick purchased and supplied
(`set-of-meteorological-3d-cartoon-icons-of-rain`, item 22347571, Adobe Illustrator
EPS). It was converted EPS → PDF → SVG, and the six marks were separated out of the
mockup **by paint order**. That detail matters: in the source the temperature numerals
sit *underneath* the icons, so cropping would have dragged fragments of "8" and "−2"
along with the clouds.

**Check which Vecteezy license the download was made under before this ships.** Under
the Free License the artwork requires a visible "Vecteezy.com" credit. Under the Pro
License it does not. The license PDF included in the download states both cases but does
not say which one applies.

### Files

Names follow the existing icon vocabulary in `TIO_ICON` (fids-core.js) and
`WX_CODE_MAP` (fids-v2.js), so they can drop into the current pipeline without a
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

### Why there are two inks

The board flips to a light ground on Delayed and Final-call rows, and the gate screens
have light states too. The original art disappears on those. This is the same problem the
Meteocons set already solves with its own `-light.svg` pairs
(`fids-current/logos/weather/animated/`); the CSS that performs the swap is at
`fids-current/css/fids-layout-fixes.css:6273`. Any future wiring should follow that
pattern rather than inventing a new one.

### Coverage gaps

Six marks. The product's icon vocabulary is wider — there is nothing here for fog,
drizzle, sleet, hail, wind or overcast. Those codes would still fall through to the
existing Meteocons set, which means a mixed look on screen. Closing that gap needs more
source artwork.

---

## The card design

`weather-cards-v3.svg` is the six-condition card sheet — full cards with a 7-day outlook
on top, board tiles underneath. It imports into Figma as editable layers.

`build-weather-cards.py` is the generator that produced it. It reads the extracted icons,
measures Inter with PIL so the degree symbol lands on real font metrics rather than
guesswork, and emits the sheet. It expects the intermediate extraction artefacts, so it is
kept as a record of how the sheet was made rather than as a one-command rebuild.

The sheet is laid out **1920 wide on purpose** — that is the shipping board width, so the
column grid in the design is the column grid on the board: margin 64, card 272, gutter 32,
which comes to exactly 1920.

Decisions baked into it:

- Card colour carries the **weather**; the airline is an 8px accent edge taken from
  `AIRLINE_ACCENT` (fids-core.js:5004). Driving the whole card off the carrier was the
  alternative and was rejected — on a board with a dozen carriers the colour would stop
  meaning anything about the weather.
- The minus slot in the temperature is always reserved, so −2 and 12 start on the same
  pixel and nothing reflows between refreshes.
- Units follow `displayTemp()` behaviour, so Orlando renders °F.
- Ink flips to navy automatically when a card's mean relative luminance goes above 0.50,
  which is what keeps the small text readable on the yellow and pale-cyan cards.
- Flair's green appears on the accent bar only, never on the carrier name, per the brand
  rule noted in fids-core.js.
