# v218.97 — Rouge brand fix + banner row 2 alignment overhaul

Two distinct fixes in this drop.

## 1. Rouge logo never replaces Air Canada

**Problem:** AC flights operated by Rouge (e.g. AC1987) were rendering with
the **Rouge logo on the banner and as the main brand on the aircraft column**.
That's wrong: passengers see the marketing carrier's identity at the gate,
with the operator listed as a small note only when it differs.

**Fix:** `gatePreferredBrandCode()` now always returns the marketing carrier
code. The previous logic ("if AC marketed and Rouge operated → swap brand to
RV") has been removed.

The `_buildV2AircraftCol` brand block was also rewritten so the **main logo
is always the marketing carrier**, never Rouge / Jazz / Encore. When the
operating carrier differs from the marketing carrier, a small
"Operated by Air Canada Rouge" line renders **beneath** the main logo —
never instead of it.

Result for AC1987 (Rouge-operated):
- Banner (row 1) → AIR CANADA logo
- Aircraft column brand block → AIR CANADA logo + small "Operated by Air
  Canada Rouge" line beneath
- Aircraft livery PNG → still uses the Rouge variant (e.g. `321r.png`)
  because the physical aircraft really is Rouge. Brand identity ≠ livery.

## 2. Banner row 2 alignment overhaul

**Problem:** Row 2 had accumulated CSS overrides v218.78→.94 that
positioned labels absolutely with reserved padding-top, sized icons in
fixed pixels different from text, and used `display:contents` in a way
that broke flex alignment. Visible result: flight plane icon parked low
on the row while AC8660 floated near the ceiling; each field sat at a
different vertical center; STATUS pill misaligned.

**Fix:** Scrapped all the absolute-positioned label trickery. Row 2 is
now a single horizontal flex strip:
- Every child has `align-items: center` (true vertical centering on a
  single line — no more "floor vs ceiling")
- Icons sized in viewport units (`clamp(38px, 4.4vh, 56px)`) so they
  match cap-height of the value text and scale together
- Labels stack ABOVE values inside each field via CSS grid, not via
  absolute positioning + padding-top reserve
- Row eats its full natural height — no wasted padding-top
- Value text fills the row aggressively via `clamp(38px, 5vh, 60px)`
- Status pill (the one field with no leading icon) uses a `:has()`
  override to stack as label-above-pill cleanly

Result: every field — FLIGHT #, EST. DEPARTURE, EST. ARRIVAL, BOARDING,
STATUS — sits at the same vertical baseline. Icons match text height.
Text touches the borders. Row takes the full strip height.

## Files touched
- `js/fids-core.js`
  - `gatePreferredBrandCode()` neutralized to always return marketing carrier
  - `_buildV2AircraftCol` brand block rewritten — marketing logo always
    wins; small "Operated by" note appears below only when operator differs
- `css/gids-v218.78.css`
  - v218.97 block appended with row 2 alignment overhaul + `.v2-op-by`
    small-note styling + status field `:has()` override
- `fids.html` — cache bumped to `v=21897`

## What was NOT changed
- The aircraft livery PNG system (`/aircraft/AC/321r.png`) is preserved.
  Rouge-operated AC flights still show the Rouge livery on the aircraft
  image — that's correct, the physical plane is what it is.
- Other "Operated by" cases (AC marketed / Jazz operated as `QK`) work
  the same way: the small operator note appears under the AIR CANADA
  logo. Never replaces it.
- Gate Theme editor (v218.96) untouched. All theme functionality still works.
