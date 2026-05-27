# PATCH NOTES — v218.78 GATE LAYOUT REBUILD

## What changed

The gate screen (GIDS / dedicated gate view) has a new three-column layout
with a growable bottom message strip. Toggled via a feature flag — flip it
off if anything breaks and the old layout returns instantly.

## New layout — three columns

```
┌─────────────────────────────────────────────────────────┐
│  TOP BANNER (unchanged)                                 │
├──────────────┬──────────────────────┬───────────────────┤
│              │                      │                   │
│  AIRCRAFT    │   MEDIA / ADS        │   MAP             │
│  ~25%        │   ~50%               │   ~25%            │
│              │   (where bottom      │                   │
│  Livery img  │    strip used to be) │   Live SPD/ALT    │
│  Type / Reg  │                      │                   │
│  Op. by      │                      │                   │
│  Inbound     │                      │                   │
│              │                      │                   │
├──────────────┴──────────────────────┴───────────────────┤
│  MESSAGE STRIP — collapses to 0 height when no message  │
│  Grows to ~80px+ when a message is active               │
├─────────────────────────────────────────────────────────┤
│  AIRPORT NAME + CLOCK (unchanged)                       │
└─────────────────────────────────────────────────────────┘
```

The DOM ids `#gateAdCarousel`, `#gateAdLogo`, `#gateMapBox` are preserved
so the existing ad rotator, livery loader, and Leaflet map all continue
to work without modification — they just render into different positions.

## Feature flag — instant rollback

```js
// Open DevTools console on the gate screen, then run:
localStorage.setItem('fids_gate_layout_v2', 'off');
location.reload();
// You're back on the old layout. To return to v2:
localStorage.setItem('fids_gate_layout_v2', 'on');
location.reload();
```

Default is `on`. The flag is logged on every page load so you can see
which layout is active in the browser console.

## Files touched

- `js/fids-core.js` — added `GATE_LAYOUT_V2` flag, three new builder
  functions (`buildV2GateLayout`, `_buildV2AircraftCol`, `_buildV2MapCol`),
  and a flag-gated branch in `uxgGateHtml`'s idle-mode render path.
  Legacy v1 layout code is untouched — flipping the flag returns to it
  immediately.
- `css/gids-v218.78.css` — NEW file. Layout rules for the three columns,
  message strip transition, and a narrow-viewport fallback that stacks
  to one column under 900px wide.
- `gids.html` + `fids.html` — added the new CSS link AFTER
  `fids-layout-fixes.css` so v2 rules win.
- Translation table — added 4 new keys (`type`, `reg`, `inbound`, `from`)
  in all 9 supported languages (en, fr, es, de, it, pt, ja, zh, ar).
  All other v2 labels reuse existing translation keys.
- Build banner — `FIDS_BUILD = 'v218.78'`.

## What is NOT done yet (deferred — message-API scaffolding pass)

The message strip currently surfaces the same content the legacy
override message zone showed (`_ovMsg` — manual overrides + gate-change
auto-trigger). The full GIDS messages API + admin UI is the next pass:

- Worker endpoints `/api/gids-messages/:airport` (GET / PUT / DELETE)
- KV namespace `FIDS_GIDS_MSGS`
- Severity-based escalation (info → warn → announce → emergency-takeover)
- Admin UI at `/admin/messages.html` to manually push messages
- The custom-ad data model (`/api/custom-ads/:airport`) for user-uploaded
  images and videos in the media slot

That work was scoped out so this layout change can be tested in isolation
without the worker / admin UI needing to be deployed simultaneously.

## Verification

- ✅ `node --check js/fids-core.js` passes
- ✅ Each DOM id (`#gateAdCarousel`, `#gateAdLogo`, `#gateMapBox`) appears
  in both the v1 and v2 layout paths — neither breaks
- ✅ All 9 supported languages have entries for the new translation keys
- ✅ CSS file is purely additive — toggling the flag off and reverting
  the HTML link still works because v2 classes are not used by v1 code
- ✅ Worker file untouched (no backend changes in this pass)

## Known caveats

- The legacy `gateWxStrip` (weather panel that used to live in the
  bottom strip) is NOT present in the v2 layout. The weather is already
  surfaced in the top banner and other places; the standalone strip was
  redundant in the new column structure. If you want it back, it can be
  added to the bottom of the aircraft column.
- Aircraft column at 25% will be tight on a 1280×720 display. If you
  run GIDS on screens smaller than 1600 wide you may want to adjust to
  30/40/30 — change the `flex: 0 0 25%` values in `buildV2GateLayout`.
