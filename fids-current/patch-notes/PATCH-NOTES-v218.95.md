# v218.95 — Gate Alignment + Presentability Consolidation

This pass consolidates the alignment fixes that v218.85–v218.94 kept retrying.
The screen is now presentable across all three render paths: boarding mode,
final-call / countdown mode, and the V2 three-column scheduled/on-time mode.

## What changed

### Aircraft column (left)
- Fixed the dead-slab problem where the column rendered with only the airline
  brand block and ~75% empty navy space below it.
- Switched to `justify-content: space-between` so brand → optional inbound →
  livery → equipment distribute vertically when all blocks are present.
- Added an `is-bare` placeholder state (CSS `::after` injected by JS) that
  fills the lower portion with a tasteful "AIRCRAFT DETAILS" label + soft
  radial gradient when neither registration, inbound, livery image, nor
  equipment type is available (most demo flights, and live flights where
  AeroDataBox hasn't returned tail data yet).

### Banner row 1 (city / airline / gate)
- Forced flex alignment so the destination, IATA code, airline logo, and
  gate badge sit on a common vertical center.
- Made the gate badge always read as a distinct white pill with a clear
  shadow, regardless of banner background color (was effectively
  white-on-white on light bg, lost in the dark navy banner).

### Banner row 2 (flight number + fields)
- Gave the status pill an opaque dark backplate so "Scheduled" / "On time"
  / "Boarding" / "Delayed" / "Cancelled" all read clearly on any airline
  accent (AC red, UA blue, WS teal, TS navy). Previously "Scheduled" on
  UA blue and "On time" on AC red were nearly invisible.
- Each status state has its own color: on-time green, delayed amber,
  cancelled crimson, default dark.

### Media column (center)
- Fixed the legacy `max-height: 140px` cap on `#gateAdLogo:not(:empty)`
  that was leaving the logo rail as a stranded 140px floating header
  above a giant empty rail below.
- Logo rail now spans the full column height (`align-self: stretch`),
  with a `:not(:empty)` selector matched at the same specificity so it
  wins against the legacy rule.
- Logo image cap raised from 200px to 240px so brand marks fill the rail
  appropriately.

### Map column (right)
- Contained the leaflet map with `overflow: hidden` and proper
  `position: absolute; inset: 0` on the map box, preventing tile bleed
  past the body row.

### Body / Footer
- Locked `.g8-wrap` to viewport height with `overflow: hidden`, so the
  three columns share a single content row and the footer is never
  overlapped by the map.
- Footer now has a consistent 56px min-height with clear separator and
  flex-aligned next-flight / clock.

## Files touched

- `css/gids-v218.78.css` — appended v218.95 consolidation block (~180
  lines at the end of the file).
- `js/fids-core.js` — `_buildV2AircraftCol` now tags the column with
  `is-bare` when no optional blocks rendered, so the CSS placeholder
  takes effect.
- `fids.html` — cache bumped to `v=21895` on `gids-v218.78.css` and
  `fids-core.js`.

## What was NOT changed

- The boarding-mode "Group 1 / Group 2" panels (the `row4Html` path)
  are untouched — they were already working correctly.
- The HTML structure built by `uxgGateHtml` and `buildV2GateLayout` is
  unchanged; this is a CSS-led patch with one minimal JS tag.
- The 11-airline emblem+wordmark logic from v218 is preserved.
- The aircraft livery image system (`/aircraft/{AL}/{eq}.png`) is
  preserved — when real reg/equipment data arrives, the livery block
  takes over and the `is-bare` placeholder is automatically dropped
  because `_hasAnyOptional` becomes true.
