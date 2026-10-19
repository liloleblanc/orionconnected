# The Earth floor's pictures

The space under the rows of the departures and arrivals boards is the Earth
from orbit, as it is this minute (`fids-current/js/fids-earth.js`). Its
pictures are NASA's, cut into squares by the scripts here and served from our
own origin under `/earth/v1/`. **No screen ever contacts NASA**: the only
contact is this build, run by hand on the Mac.

## The sources

| layer | picture | resolution |
|---|---|---|
| `day-01` … `day-12` | NASA Earth Observatory, **Blue Marble: Next Generation** base map, one per month of 2004 (Reto Stöckli). No relief, no bathymetry, no clouds. | 21600 × 10800 (2 km) |
| `night` | NASA Earth Observatory, **Earth at Night (Black Marble) 2016**, colour | 13500 × 6750 (3 km) |

The exact URLs, with their bytes and sha256 pinned on the first fetch, are in
`sources.json`. The floor shows the day picture of the airport's own month.
Black Marble 2016 is NASA's newest colour night map; later Black Marble years
are science data, not pictures. There are no clouds on purpose: weather on the
boards comes from MET Norway only.

### The places on the floor

| what | source | licence |
|---|---|---|
| Positions of the places added in v24067 (`COORDS` in `fids-core.js`, `AIRPORT_COORDS` in `airport-coords.js`), the US state or Canadian province of each code (`_ROW_REGION`), the list of Québec airports (`BoardStrings.FR_FIRST`), and the English city names added to `CITY` in v24067 | **OurAirports**, ourairports.com/data (`airports.csv`, `regions.csv`; read 2026-10-19). The runway ends in `airport-runways.js` come from the same data. | Public domain (OurAirports dedicates its data to the public domain). No credit is required; it is credited here and in `docs/licenses/places-data.md`. |
| The clock of each place (`ZONE_LIST`, `ZONE_ONE` in `fids-earth.js`) | The **IANA tz database** (tz zone names; its `northamerica` file for Québec: Atlantic time east of Natashquan) | Public domain |
| French city names that differ from the English (`CITY_FR`, v24067 additions: Bakou, Beyrouth, Mascate, Malte …) | **Wikidata**, the French label of the place each airport serves | CC0 (public domain dedication) |

No screen reads any of these: they are copied into the tables by hand, and
`tests/earth-floor-places.test.js` and `tests/earth-zones.test.js` hold the
tables to them.

## Licence and credit

- Both are NASA images and **in the public domain** (works of the United
  States government). Commercial, public and streamed use is allowed.
- **No NASA insignia** (the "meatball", the "worm" or any other logo) may be
  used, and nothing may suggest that NASA **endorses** the boards. Promotional
  pictures of the boards must never present them as a NASA product.
- NASA asks for a credit. It is on the Credits page (`credits.html`, section
  `c-earth`, store keys `credEarthH`, `credNasa` and `credNasaLine` in all
  nine languages), not on the boards. The quoted line carries the credits the
  pictures ask for (checked 2026-10-18):
  - Blue Marble: Next Generation: the collection page asks anyone using it to
    credit "NASA Earth Observatory" (it was produced there by Reto Stöckli).
  - Black Marble 2016: NASA's Scientific Visualization Studio gives the credit
    as "NASA's Goddard Space Flight Center"; the Earth Observatory's own image
    credit reads "NASA Earth Observatory images by Joshua Stevens, using Suomi
    NPP VIIRS data from Miguel Román, NASA's Goddard Space Flight Center".
- NASA's media guidelines (nasa.gov, Images and Media): NASA content is
  generally not subject to copyright in the United States; it may be used
  publicly and commercially provided nothing implies NASA endorsement, and the
  insignia and logotype are not in the public domain.
- Collection pages, linked from the Credits page:
  - https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/
  - https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/

Everything else the floor shows is our own drawing: the projection, the
sunlight (the sub-solar point from `fids-sun.js`), the air glow, the faintly
moonlit land at night, the dusk band, the routes, dots, names and times.

## What gets stored

`fids-current/earth/v1/`, 13 layers × 91 files = **1,183 files, 140.2 MB**
(measured 2026-10-12 at JPEG quality 0.82):

```
world/<layer>.jpg              the whole Earth, 2048 × 1024
t16/<layer>/<S>_<W>.jpg        60° squares, 960 px (16 px a degree), 18 a layer
t32/<layer>/<S>_<W>.jpg        30° squares, 960 px (32 px a degree), 72 a layer
```

Plate carrée, row 0 at the north. `<S>_<W>` is the square's south-west
corner: it covers latitude [S, S+span] and longitude [W, W+span], pixel centres
half a pixel in from each edge (the convention `sampleInto` reads with). A day
month is about 11.2 MB, the night layer 6.8 MB. Each file is sRGB with no Exif,
ICC or Photoshop segment; the largest is under 0.4 MB.

They are static assets: they ship with the code that reads them, cost nothing
per request, and are within the Workers static-asset limits (25 MiB a file,
20,000 files on the free plan). The cheapest cut, if the repository weight
matters, is the 60° squares (234 files, about 30 MB): wide views would then read
four 30° squares instead of one.

**Not decided: where they live.** The repository is public and was about
938 MB packed (2.2 GB `.git`) on 2026-10-18 before this set; 136 MB of JPEGs
takes it past 1 GB, and every later change to a picture adds its whole size
again. The R2 bucket the worker already binds (`FIDS_ASSETS`) could hold them
instead, served under the same `/earth/v1/` paths, so `fids-earth.js` would not
change. The choice is open; until it is made they stay here.

## Rebuilding

Needs Node (fetch, manifest) and Swift (ImageIO / CoreGraphics; there is no
ffmpeg or PIL on this Mac, and none is needed).

```sh
export EARTH_CACHE=/somewhere/outside/the/repo      # a few hundred MB, never committed
node scripts/earth/fetch.mjs                        # --pin on the very first fetch only
swiftc -O -o /tmp/earth-tile scripts/earth/tile.swift
/tmp/earth-tile "$EARTH_CACHE" fids-current/earth/v1          # all 13 layers, ~30 s
swiftc -O -o /tmp/earth-verify scripts/earth/verify.swift
/tmp/earth-verify fids-current/earth/v1 --gibs                # seams, levels, and NASA GIBS's own copies
node scripts/earth/manifest.mjs                     # writes manifest.json, checks the set and its budget
npm run assets:build && npm test                    # tests/earth-imagery.test.js holds the disk to the manifest
```

- `fetch.mjs` downloads each source into its own empty directory in the cache,
  resumes a stopped download, and checks the pinned bytes and sha256.
- `tile.swift` decodes each picture straight to 11520 × 5760 and cuts the
  squares and the whole-Earth picture.
- `verify.swift` checks that every square's edges continue into its
  neighbours' (the ±180° seam between 60°S and 60°N: NASA's own picture does
  not join there nearer the poles), that the levels agree, and with `--gibs`
  that our August and night squares over Moncton, London and Hobart match the
  copies NASA GIBS serves (the product the approved preview read), better than
  the same square mirrored.
- `manifest.mjs` lists every file with its bytes, sha256 and size, and fails on
  a missing square, a wrong size, a file over 1 MB, anything extra, or a total
  over 160 MB.
