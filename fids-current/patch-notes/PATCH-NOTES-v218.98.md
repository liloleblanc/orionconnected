# v218.98 — Banner consolidation + gids.html cache fix

Two distinct issues fixed in this drop. Together these should restore a
properly aligned, presentable gate screen.

## 1. gids.html was loading stale cache (the real "nothing works" cause)

**Problem:** v218.95 and v218.97 patch notes both said "fids.html cache
bumped". They didn't say "gids.html". So while fids.html got pulled
forward to v=21897, the dedicated gate page `gids.html` stayed pinned at
`v=21891` for both the CSS and the JS bundle:

    css/fids-layout-fixes.css?v=21840
    css/gids-v218.78.css?v=21891
    js/fids-core.js?v=21891

That means every time you opened gids.html, the browser served the
cached v218.91 era files — so none of the v218.92, v218.93, v218.94,
v218.95, v218.96, or v218.97 alignment work actually reached the screen.
The patch notes existed; the files were updated on disk; the browser
just never asked for them.

**Fix:** All three cache-busting query strings bumped to `v=21898` in
both gids.html and fids.html. Browser will fetch fresh files on next
load.

## 2. The row 2 banner CSS was a 900-line cascade of competing overrides

**Problem:** Between v218.97-fix1 and v218.97o, the CSS file accumulated
**15 successive override blocks** all targeting the same row 2
properties:

    fix1 → b → c → d → e → f → g → h → i → j → k → L → m → n → o

Each one declared `!important` on font-size, height, padding, gap,
and SVG dimensions. v218.97m additionally broke row 1, forcing it to
200px tall with 110px destination text and a 160px logo cap — which
overflowed long city names and contradicted the `--gate-logo-slot-h`
clamp variable in `fids-layout-fixes.css`.

Net visible result: row 1 floating high while row 2 floated low, icons
sized differently from text, status pill height not matching field
values, AM/PM clipping on some fields, and the body columns getting
squeezed because the banner ate 420px of vertical space.

**Fix:** Stripped lines 2113–3013 of `gids-v218.78.css` (the entire
fix1→o cascade) and replaced with a single ~250-line **v218.98**
block that establishes one coherent sizing system:

| Row    | Height                       | Text            | Notes                                |
| ------ | ---------------------------- | --------------- | ------------------------------------ |
| Row 1  | clamp(80px, 10vh, 120px)     | dest 44–80px    | Logo 56–92px, gate badge same height |
| Row 2  | clamp(96px, 11vh, 130px)     | values 34–56px  | Labels 11–16px, icons match cap-ht   |

All sizes use viewport-relative clamps so the screen renders sensibly
on a 1920×1080 gate display while staying graceful on smaller windows
during development. Total banner footprint on 1080p: ~228px (≈21% of
viewport, leaves the body columns the rest).

### Specific properties consolidated

- Row 1 destination text → 44–80px (was 110px hard, overflowed long names)
- Row 1 airline logo → 56–92px (was 160px hard, ignored slot variable)
- Row 1 gate badge → matches logo height visually
- Row 2 height → 96–130px (was 220px hard)
- Row 2 field values → 34–56px (was 64px hard, clipped AM/PM)
- Row 2 labels → 11–16px (was 30px, wildly out of proportion)
- Row 2 icons → 28–46px (was 58px, dwarfed value text)
- Status pill → 46–68px (was 70px hard with mismatched padding)
- Status pill colors preserved: ontime green, scheduled dark, boarding
  blue, delayed amber, cancelled crimson

### Layout principles preserved from v218.97 base

- Single horizontal flex strip, vertical centering on a common baseline
- Label-above-value stack inside each field, no absolute-positioning
- Icons sized to roughly match value cap-height
- The `:has()` override for the status field is preserved
- The pseudo-element label trick from v218.78 stays killed

## Files touched

- `css/gids-v218.78.css` — removed lines 2113–3013 (the fix1→o cascade),
  appended new v218.98 block. File is now 2370 lines (was 3013).
- `gids.html` — cache bumped to `v=21898` on all three of
  fids-layout-fixes.css, gids-v218.78.css, fids-core.js.
- `fids.html` — same cache bumps for consistency.

## What was NOT changed

- `js/fids-core.js` — untouched. The row 2 HTML structure built by
  `uxgGateHtml` is preserved exactly. This is a pure CSS-only fix.
- The aircraft column / media column / map column body layout is
  untouched (the v218.95 consolidation for those columns wasn't part
  of the cascade and still applies cleanly).
- The Rouge brand fix from v218.97 (marketing carrier always wins on
  the main logo) is untouched — that was a JS change in
  `_buildV2AircraftCol` and `gatePreferredBrandCode()`.
- The Gate Theme editor from v218.96 still works.
- Strike-through / revised time styling for delayed flights preserved.

## How to verify

1. Hard-refresh gids.html (Ctrl+F5 or equivalent) — the cache bump
   will pull fresh CSS regardless, but a hard refresh guarantees it.
2. Check that row 1 and row 2 are now reasonable heights (~110px each).
3. Check that the destination text, airline logo, and gate badge on
   row 1 sit on a common visual center line.
4. Check that on row 2, the flight number icon, "AC8660", the time
   icons, the times, and the status pill all sit at the same vertical
   center, with labels stacked tightly above their values.
5. Open `preview-gate.html` in a browser for a static reference of
   what the banner should look like with sample AC8660 data.

If something still looks off, the next debugging step is to check what
order the CSS files are loading — `gids-v218.78.css` must come AFTER
`fids-layout-fixes.css` in the HTML head so its overrides win at
equal selector specificity. That order is already correct in both
gids.html and fids.html.
