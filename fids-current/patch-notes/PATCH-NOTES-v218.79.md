# PATCH NOTES — v218.79 GATE LAYOUT HOTFIX

Bug-fix pass on the v218.78 three-column layout based on real-display feedback.

## Fixed

### 1. Aircraft livery image not rendering
`aircraftImgTag()` takes `(airlineCode, equipCode, opts)` — I called it with
the arguments reversed (`(equipCode, airlineCode)`), so the path resolver
got `WS` as the aircraft code and `737` as the airline. No image lookup
matched and nothing rendered. Now corrected — Boeing 737 / Air Canada
liveries / WestJet / Porter / etc. all show again in the v2 aircraft
column.

### 2. Empty dark box at top of media column
The `#gateAdLogo` slot was reserving 60px of fixed height even when the
current slide had no logo (e.g. the airline amenities slide, YouTube
videos). It now:
- Positions absolutely as a banner overlay at the top of the carousel
- Collapses to zero (display: none) via CSS `:empty` rule when the
  legacy ad code clears its innerHTML
- Has padding only when it has actual content

So slides without a logo (amenities, YouTube) get the full column height.
Slides with a logo (hotel ads, airline-themed slides) get an 80px banner
overlay across the top.

### 3. Hardcoded English in amenities + status labels
Three i18n leaks fixed:

- `buildGateAmenities()` had 8 hardcoded English strings — `Free Wi-Fi`,
  `Wi-Fi ($)`, `Entertainment`, `Power`, `Meals`, `Food ($)`, `Beverages`,
  `Inflight amenities` — they now route through `adTL()` with full
  9-language entries added to AD_I18N.
- Two `stLabel` assignments (lines 3855 + 4269) hardcoded English via
  `(SS[stKey] || {}).en` instead of `SL(stKey)` — the status pill in the
  top banner would always say "Scheduled" / "Boarding" / "Delayed" in
  English even when the page was in French. Now properly localized.

## Files touched

- `js/fids-core.js`:
  - Fixed argument order on `aircraftImgTag()` call in `_buildV2AircraftCol`
  - Restructured `#gateAdLogo` to absolute-positioned overlay in v2 media col
  - Wrapped 8 amenity labels in `adTL()`
  - Replaced 2 `(SS[stKey] || {}).en` patterns with `SL(stKey)`
  - Added 8 new entries to AD_I18N (Wi-Fi paid, Entertainment, Power,
    Meals, Food, Beverages, Inflight amenities — all 9 languages)
  - Build version → `v218.79`
- `css/gids-v218.78.css`:
  - Added `:empty` rule for `#gateAdLogo` so it truly disappears
  - Added padding/border rule for when it has content
  - Added defensive rule for empty livery box in aircraft column
- `fids.html` / `gids.html` / `bids.html`: cache buster `v=305 → v=306`,
  `gids-v218.78.css?v=21878 → ?v=21879`

## What you should now see on real hardware

Looking at the WS813 Calgary screenshot you sent:

| Before | After |
|---|---|
| Boeing 737 / WESTJET text only — no plane image | WS livery image at `/aircraft/WS/737.png` renders |
| Dark void above amenities slide | Media column starts at top edge, full height |
| "Inflight amenities", "Free Wi-Fi", "Entertainment", "Power", "Food ($)" all English on a French page | "Services à bord", "Wi-Fi gratuit", "Divertissement", "Prises", "Restauration (payante)" |
| "Scheduled" status pill in English | "Prévu" (FR) / "Programado" (ES) / etc per active language |

## Feature flag (reminder)

Still gated by `localStorage.fids_gate_layout_v2`. Default `on`. Flip to
`'off'` and reload to fall back to legacy layout.
