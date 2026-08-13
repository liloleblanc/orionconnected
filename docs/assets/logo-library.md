# Logo and brand asset library

The public library is `fids-current/logos/`. Its generated, browsable catalog
is `fids-current/assets/asset-manifest.json`.

## Main groups

| Folder | Purpose |
| --- | --- |
| `airline-tiles/` | ICAO-keyed square icons used by FIDS rows |
| `symbols/airlines/` | IATA-keyed airline emblems |
| `wordmarks/` and `wordmarks-mono/` | Header and gate wordmarks |
| `tails-modern/` | Decorative airline tail art |
| `airlines/` | Carrier-specific fallback logos and programme marks |
| `airports/` | Airport identity marks |
| `hotels/` | Hotel and loyalty brands used by destination media |
| `advertisements/` | Built-in display media |
| `Backgrounds/` | Airline and screen background art |
| `weather/` | Weather icons |
| `brand/` | Orion Connected identity assets |

## Airline lookup

FIDS row tiles use `/logos/airline-tiles/{ICAO}.svg`. The IATA-to-ICAO mapping
is in `fids-current/js/fids-core.js`. Aircraft and airline aliases often point
to identical artwork intentionally; do not deduplicate code-keyed files solely
because their hashes match.

## Adding artwork

1. Put the file in the narrowest meaningful folder.
2. Use lowercase kebab-case unless the runtime derives the filename from an
   uppercase airline, airport, or equipment code.
3. Do not add ZIP, EPS, CDR, notebook, source-kit, or Finder-copy files to the
   public directory.
4. Run `npm run assets:build`.
5. Run `npm test` and `npm run assets:check`.

The old hand-maintained inventory was removed because it became stale. The
generated manifest is now the source of truth.
