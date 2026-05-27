# v218.81 — Gate Layout V2 sized against real production CSS

## What changed since v218.80

v218.80 was sized against a mockup HTML in isolation — not against the
real production CSS chain (fids.css + fids-v3.css + fids-layout-fixes.css).
Result: the deployed page looked nothing like the approved mockup because
the legacy CSS overrode my new sizing.

v218.81 was built with a local playwright test harness that loads the
actual production CSS chain plus the V2 override sheet. Iterated against
that, screenshotted at 1920x1080, and only shipped when the render
matched the approved mockup.

## Final type sizes (production-verified)

| Element                | Size  | Notes |
|------------------------|-------|-------|
| Calgary (YYC)          | 76px  | City name |
| (YYC) iata code        | 42px  | Subdued gray |
| WESTJET                | 56px  | Airline header |
| Gate number            | 84px  | Big single digit |
| FLIGHT label           | 30px  | Pseudo-label via ::before |
| WS813 flight number    | 64px  | Same size as field values |
| EST. DEPARTURE label   | 30px  | Distance-readable |
| 6:15 PM (value)        | 64px  | Hero — the answer |
| 8:40 PM, 5:40 PM       | 64px  | Same |
| Scheduled pill         | 38px  | Keeps semantic color |
| YOUR AIRCRAFT header   | 26px  | Section header |
| TYPE / REGISTRATION    | 20px  | Aircraft column labels |
| Boeing 737, C-GVRO     | 34px  | Aircraft column values |
| INBOUND AIRCRAFT       | 20px  | Teal accent |
| WS812 from Calgary     | 30px  | Inbound flight number |

## Key fixes vs v218.80

1. **Status pill no longer broken** — kept its semantic color class
   (`.scheduled` / `.ontime` / `.delayed` / `.boarding` / `.cancelled`)
   instead of forcing a white background. Pill bg now reflects flight
   state correctly.
2. **FLIGHT label present** — added via `::before` on `.g8-r2-left` so
   the legacy markup didn't need to change.
3. **Banner fits at 1920px** — field values dropped from 80px to 64px
   so all 5 fields fit comfortably with status pill not overlapping.
4. **Three-column gate area renders** — aircraft column has explicit
   `flex: 0 0 25%` in CSS so it actually takes 25% of the row.
5. **Field labels readable** — bumped from legacy 19px to 30px.

## Files

- `js/fids-core.js` — V2 builders unchanged from v218.80; build bumped
  to `v218.81`
- `css/gids-v218.78.css` — full rewrite, sized against real CSS chain
- HTML files — cache busters bumped to `?v=308`, V2 CSS to `?v=21881`

## Rollback

```js
localStorage.setItem('fids_gate_layout_v2', 'off'); location.reload();
```
