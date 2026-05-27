# v218 Delta Patch — copy these files into your project, replacing existing ones

Cache version already bumped to v=305 in the included HTML files.

## What's in here (29 files)

### Code (3 files)
- `js/fids-core.js` — replaces existing
- `css/fids-v3.css` — replaces existing  
- `css/fids.css` — replaces existing (gate-screen IATA gray fix)

### HTML (3 files) — replace existing
- `fids.html` (cache v=305)
- `gids.html` (cache v=305)
- `bids.html` (cache v=305)

### Logos — drop into matching subfolders
**logos/airlines/asian-other/** — 15 files (NEW for these airlines):
- aeromexico-wordmark-{light,dark}.svg
- avianca-wordmark-{light,dark}.svg (REPLACE existing — cleaner version)
- bahamasair-wordmark-{light,dark}.svg
- copa-wordmark-{light,dark}.svg
- gol-wordmark-{light,dark}.svg
- latam-wordmark-{light,dark}.svg
- volaris-wordmark-{light,dark}.svg
- vivaaerobus-wordmark-{light,dark}.svg
- vivaaerobus-emblem.webp (NEW — Viva green leaf emblem)

**logos/airlines/european/** — 4 files (REPLACE existing):
- british-airways-wordmark-{light,dark}.svg
- virgin-atlantic-wordmark-{light,dark}.svg

**logos/airlines/us-major/** — 2 files (REPLACE existing):
- breeze-airways-wordmark-{light,dark}.svg

## What this fixes vs. what's already live

### Already live (skip — these went out earlier today):
- 11 airlines emblem+wordmark combo
- Group B sizing (Porter/PAL/WestJet)
- Subsidiary aliasing Q6→Y4, 4C→LA
- NXC + Tradewind filtered
- Hotel white-blob fix
- 16 wordmark SVGs + Group B CSS

### NEW in this patch:
- JRE (Jet Rescue Air Ambulance) filtered out
- Cleaner Avianca wordmark (the "double emblem" issue)
- VivaAerobus emblem (green leaf .webp) registered to IATA_TO_EMBLEM
- Per-airline sizing: AC bigger, AM smaller+right, CM right, BA right, LA bigger+right, AV bigger, Y4 bigger, VS bigger, VB bigger+right
- Cleaner Virgin Atlantic + British Airways wordmarks
- "Toronto-YYZ (YYZ)" double-IATA bug fixed (aircraft info panel)
- Gate-screen IATA suffix: muted gray instead of white-with-65%-opacity
- Cache version bumped to v=305
