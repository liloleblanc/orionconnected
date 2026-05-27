# v218.82 — No SVG cartoon aircraft fallback. Ever.

## What changed

The `gateAircraftFallbackTag()` function used to render a cartoon SVG plane
silhouette when the real livery PNG was unavailable. That looked
unprofessional on a real airport gate display and has been seen in
production. **Removed entirely.**

- Function is now neutralized — returns empty string regardless of args.
  Any code that still calls it (V1 legacy path, anything else) gets
  nothing back.
- V2 builder no longer attempts a fallback at all. If no real livery
  image is available, the livery box simply doesn't render. Aircraft
  data rows (TYPE / REGISTRATION / OPERATED BY) sit at the top of the
  column and the rest of the column is empty space.
- CSS rule `.v2-livery-box:empty` collapses the box to zero height so
  data rows slide up to the top of the column.

## Other fixes in this build

- Removed column header chrome (YOUR AIRCRAFT / FEATURED / FLIGHT PATH) —
  content fills each column for a more uniform rhythm.
- Status pill `.scheduled` forced to high-contrast dark-bg/white-text so
  it's readable on any airline accent banner (AC red, etc).
- Routed Rouge/Express subbrand livery lookups through the parent AC
  folder — `aircraftImgTag('AC', '319r')` instead of failing on `RV`.

## Files

- `js/fids-core.js` — V2 builders cleaned; `gateAircraftFallbackTag()`
  neutralized; build → v218.82
- `css/gids-v218.78.css` — empty livery box collapses
- HTML cache busters → `?v=309`, V2 CSS → `?v=21882`

## Rollback

```js
localStorage.setItem('fids_gate_layout_v2', 'off'); location.reload();
```
