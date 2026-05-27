# FIDS v218 — Complete Project Drop-in

This is the **entire project**, ready to deploy. All v218 changes baked in.

## Deploy

1. Upload everything to Cloudflare Pages (or sync your local copy)
2. Hard-reload to clear browser cache

That's it. Cache version already bumped to `v=305` in fids.html, gids.html, bids.html.

## What's new in v218

### 11 airlines now render emblem + wordmark combo
Breeze, Aeroméxico, Copa, Bahamasair, Avianca, LATAM, Volaris, VivaAerobus,
Virgin Atlantic, British Airways, GOL.

(VivaAerobus VIV.svg tile is missing from `logos/airline-tiles/` — falls back
to wordmark-only until that file is added.)

### Group B repositioning
- Porter (PD): slight right
- PAL Airlines (PB): slight right
- WestJet (WS): slight right + slightly bigger

### Subsidiary aliasing
- Q6 (Volaris Costa Rica) → Y4 Volaris
- 4C (LATAM Colombia) → LA LATAM

### Filtering
- NXC (NexGen Aviation) — Part 135 charter, blocked
- TJ/GPD (Tradewind Aviation) — Part 135 charter, blocked
- Removed bogus `'BD':'BERMUDAIR'` phantom code

### Hotel logo white-blob fix
`getLogoTreatment()` default changed from `'invert'` to `'color_card'`.
Unclassified hotel logos now render on a white card preserving brand colors
instead of being inverted into solid white blobs. Slugs ending in `-white`
auto-classify as `'no_filter'`.

### New wordmark files (20 total)
**logos/airlines/asian-other/**: aeromexico, copa, bahamasair, latam, volaris,
vivaaerobus, gol — each `-light.svg` and `-dark.svg`

**logos/airlines/us-major/**: breeze-airways `-light.svg` and `-dark.svg`
(replaced older versions with cleaner uploads)

**logos/airlines/european/**: virgin-atlantic, british-airways — each
`-light.svg` and `-dark.svg` (replaced older versions with cleaner uploads)

## Source attribution for new wordmarks

| File | Source |
|------|--------|
| breeze-airways-wordmark-* | Nick uploaded |
| aeromexico-wordmark-* | Nick uploaded |
| copa-wordmark-* | Nick uploaded |
| latam-wordmark-* | Nick uploaded |
| volaris-wordmark-* | Nick uploaded |
| virgin-atlantic-wordmark-* | Nick uploaded |
| british-airways-wordmark-* | Nick uploaded |
| bahamasair-wordmark-* | bahamasair.com |
| vivaaerobus-wordmark-* | content.vivaaerobus.com |
| gol-wordmark-* | cdn.worldvectorlogo.com |

Each `-light.svg` was recolored to white (#FFFFFF) for dark FIDS rows.
Each `-dark.svg` keeps the airline's native brand colors for light/cream themes.
