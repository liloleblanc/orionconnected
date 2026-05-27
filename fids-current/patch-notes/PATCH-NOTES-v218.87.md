# v218.87 — Gate recovery pass

This is a conservative rollback/repair after the heavier v218.85/v218.86 gate overrides made the screen too oversized and dark.

## Restored
- Original gate V2 sizing for the header, middle banner, aircraft details, media/ad console, and map column.
- Existing ad carousel IDs and rotation hooks remain untouched: `gateAdCarousel` and `gateAdLogo`.
- Existing real aircraft PNG system remains untouched: `/aircraft/{airline}/{equipment}.png` with generic fallback, no cartoon SVG fallback.

## Kept
- Aircraft/livery image is still at the bottom of the aircraft column.
- Aircraft image sits edge-to-edge with no side gutters.
- Same-airline flights no longer show redundant `Operated by`.
- Different-operator flights still show `Operated by`, e.g. Air Canada marketed / Jazz operated.

## Reduced risk
- Removed the large override block that inflated text/cards and darkened the center console feel.
- Replaced it with a small CSS patch scoped only to the bottom aircraft image behavior.
