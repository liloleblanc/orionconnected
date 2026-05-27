# v218.80 — Gate Layout V2 sized to mockup

## Approved mockup landed in code

The V2 gate layout finally matches the approved mockup. Previous V2 cut had
inline styles that capped type around 12-18px — invisible from across a
gate area. v218.80 routes everything through `css/gids-v218.78.css` with
distance-readable sizes.

## Typography tiers

Four sizes, each with a clear job:

| Tier  | Range    | Used for                                        |
|-------|----------|-------------------------------------------------|
| HERO  | 80px     | flight number, time values, ad headline         |
| ID    | 44-72px  | destination city, airline, gate, status pill    |
| DATA  | 30-44px  | aircraft type/reg/op, inbound flight, clock     |
| LABEL | 22-30px  | section + field labels                          |

## Banner row 2 — 5-field structure

Each field follows: LABEL on top, ICON + VALUE side-by-side beneath.

- ✈ **FLIGHT** → WS813
- ↗ **EST. DEPARTURE** → 6:15 PM
- ↘ **EST. ARRIVAL** → 8:40 PM
- ⏱ **BOARDING** → 5:40 PM
- ⓘ **STATUS** → Scheduled

The FLIGHT field previously had no label — now it does, via a CSS `::before`
on `.g8-r2-flight` so the existing HTML doesn't have to change shape.

## Aircraft column

CSS-class-based markup replacing inline styles:
- `.v2-col-hdr` header bar
- `.v2-livery-box` for the plane image
- 3x `.v2-ac-row` with `.v2-ac-lbl` / `.v2-ac-val` for TYPE / REGISTRATION /
  OPERATED BY
- `.v2-inbound` panel at bottom with teal accent

Labels now spelled out fully:
- `REG` → `REGISTRATION`
- `INBOUND` → `INBOUND AIRCRAFT`
- `inMin` ("in 15m") → "Arriving in 15m"

All nine languages updated.

## Media column

Added `FEATURED` header. Carousel + logo overlay kept their existing IDs
(`#gateAdCarousel`, `#gateAdLogo`) so `renderGateAd()` keeps writing into
the same elements.

## Map column

Added `FLIGHT PATH` header. SPD/ALT pill upsized to 30px monospace with
proper readout positioning.

## Files

- `js/fids-core.js` — V2 builders rewritten; build → v218.80
- `css/gids-v218.78.css` — full rewrite with mockup proportions
- `fids.html`, `gids.html`, `bids.html`, `picker.html`, `menu.html`,
  `index.html` — cache busters bumped to `?v=307` (CSS file bumped to
  `?v=21880`)

## Flag

`window.GATE_LAYOUT_V2` defaults to **ON**. To roll back instantly:

```js
localStorage.setItem('fids_gate_layout_v2', 'off');
location.reload();
```

The legacy V1 path is unchanged and still works.
