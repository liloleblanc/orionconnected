# Patch Notes v218.85

## Gate screen fresh pass
- Reworked the V2 gate aircraft column brand panel.
- Same-carrier flights now show a clean airline logo block instead of redundant "Operated by [same airline]" wording.
- True different-operator flights still show "Operated by" with the operator logo/name, for example Air Canada marketed flights operated by Jazz.
- Restored readable logo presentation with a white logo card so dark airline marks do not disappear on the gate screen.
- Added final CSS alignment overrides for the gate header, row-two flight fields, aircraft column spacing, livery image area, and status/time rows.
- Bumped cache query strings in `gids.html` and `fids.html` for the updated CSS and JS.

## Files changed
- `js/fids-core.js`
- `css/gids-v218.78.css`
- `gids.html`
- `fids.html`
