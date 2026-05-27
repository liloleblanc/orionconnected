# /logos folder layout

This is the organized airline logo library for FIDS, built from four
source packs:
  - soaring-symbols-main  (86 airlines, both icon and full lockup variants)
  - airline-tails-main    (~125 vertical tail designs)
  - AirlineIcons-main     (283 ICAO-keyed tail icons)
  - palairlines_ca        (PAL Airlines source files)

All carrier files are renamed by IATA code (e.g. AC.svg, WS.svg, KL.svg)
so FIDS can look them up directly from a flight's airline code.

---

## ⚠️ Quick reference: how to update a carrier logo for FIDS rows

The FIDS row tile (the colored airline square in the flight table) is
loaded from **/logos/airline-tiles/{ICAO}.svg**, NOT /logos/icao-icons/.

If you want to change an airline's tile (e.g., new AC rondelle, new
Porter "p"), edit the file in `airline-tiles/` and bump the cache
version in fids.html / gids.html / bids.html.

The IATA → ICAO map that drives this lives in:
  `js/fids-core.js` → `const IATA_TO_TILE_ICAO = { ... }` (around line 6471)

So `'AC':'ACA'` means: Air Canada (IATA `AC`) loads `airline-tiles/ACA.svg`.

The `icao-icons/` folder is an ARCHIVE COPY of the same files. Editing
files there has NO visible effect — code never reads from it.

---

## Active sets (used by FIDS)

### airline-tiles/{ICAO}.svg                         — 284 files (ACTIVE)
Square colored brand tiles with a white symbol baked in. **This is the
folder the FIDS row reads from.** Used as Priority 1 in `mkLogo()`,
keyed by ICAO via the IATA_TO_TILE_ICAO map.
Includes a custom `PB.svg` for PAL Airlines (Newfoundland) — Nick's
custom file, since PAL doesn't appear in the source pack.
See `airline-tiles/MANIFEST.json` and `MANIFEST.csv` for the full
ICAO → IATA → Name catalog.

### symbols/airlines/{IATA}.svg                     — 73 files
Single-color circular brand symbols, native brand color baked in.
Source: soaring-symbols-main (icon.svg).
Used by mkLogo() in fids-core.js for the airline column on the FIDS table
(lower priority than airline-tiles).

Coverage: AC, WS, UA, AS, WN, KL, LH, BA, EK, QR, EI, AF, AM, AR, AT, AV,
BT, BI, CM, CX, ET, EW, FI, FJ, FR, GA, HV, IB, JL, JQ, JU, JX, KC, KE,
KQ, KU, LA, LO, LX, MF, MH, MK, NZ, OZ, PG, PR, QF, QH, QP, RC, RO,
RX, SK, SN, SQ, SV, TG, TK, TP, TR, TS, UB, UO, UX, VA, VJ, VN, VS,
W6, WY, XY, ZB, ZP, plus a few regional carriers.

NOT covered (need fallback): AA, DL, NK, B6, F9, HA, SY, PD, F8, PB, WG.
For these, FIDS should fall back to existing /logos/{file}.svg or use
tails-modern/ which DOES have most of them.

### symbols/airlines-mono/{IATA}.svg                — 22 files
Mono variants of the above (single black/white path).
Use when you need to recolor the symbol via CSS `fill: currentColor`.
Only some carriers have mono variants in the source.

## Reference / alt-style sets

### wordmarks/{IATA}.svg                            — 80 files
Full lockup (symbol + airline name) in native colors.
For headers, banners, gate-screen branding — NOT for the small FIDS cell.

### wordmarks-mono/{IATA}.svg                       — 39 files
Mono variants of the wordmark lockups.

### tails-modern/{IATA}.svg                         — 95 files
Vertical tail design, current/modern livery.
Source: airline-tails-main (modern.svg).
Use these for Big Picture branding moments (e.g. gate aircraft card).

This set FILLS GAPS in soaring-symbols, including:
AA, DL, NK, B6, F9, HA, PD, F8, WG, RV (AC Rouge), Y9 (Lynx), WO (Swoop),
NH (ANA), OS (Austrian), CA (Air China), MU (China Eastern), CZ (China
Southern), CI (China Airlines), AY (Finnair), G4 (Allegiant), 5J (Cebu),
SG (SpiceJet), VX (Virgin America), etc.

### tails-fake/{IATA}.svg                           — 1 file
Stylized "fake" tail variants. Only one survived from the source.

## Historical / source files

### tails-modern/_*.svg                             — 11 files
Defunct or non-IATA carriers kept by slug name (Canjet, Jetsgo, Zoom,
Greyhound Air, US Airways, Virgin America, Vanilla Air, Swissair etc).
For nostalgia / archive.

### icao-icons/{ICAO}.svg                           — 283 files (ARCHIVE)
ICAO-keyed single-tail icons (e.g. ACA = Air Canada, BAW = British
Airways, RYR = Ryanair). Source: AirlineIcons-main.
**NOT read by FIDS code — this is an archive copy of airline-tiles/.**
Editing files here has no visible effect on the running app.
Kept as a backup library and as the original source-pack snapshot.
See `icao-icons/MANIFEST.json` for the catalog.

### source-pal-airlines/                            — 3 files
PAL Airlines logo source files (.ai, .cdr, .eps).
Not directly usable on the web — open in Illustrator and export to SVG/PNG.

## Carrier lookup in FIDS (proposed mkLogo cascade)

1. /logos/airline-tiles/{ICAO}.svg                    ← active (this folder)
2. /logos/symbols/airlines/{IATA}.svg                 ← Soaring Symbols
3. /logos/{file}.svg via existing LOCAL_TRANSPARENT_LOGOS map
4. /logos/tails-modern/{IATA}.svg                     ← fills gaps
5. wway.io @svg                                       ← external fallback
6. text logo span                                     ← final fallback
