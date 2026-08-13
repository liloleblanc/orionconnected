# Repository file map

## Production web root: `fids-current/`

| Area | Contents |
| --- | --- |
| `*.html` | Nine active entry or support pages; no experiments or QA probes |
| `js/` | Browser runtime, menus, editor, auth, maps, and screen helpers |
| `css/` | Shared, flight, gate, baggage, mobile, and operator styling |
| `data/` | Small browser-readable reference data |
| `aircraft/` | Aircraft images addressed by airline and equipment code |
| `logos/` | Airlines, airports, hotels, ads, symbols, backgrounds, and Orion brand |
| `fonts/` | Only font files referenced by active stylesheets |
| `textures/` | Gate and information-plate textures used by active CSS |
| `assets/` | Asset browser and generated asset manifest |

## Repository-only areas

| Area | Contents |
| --- | --- |
| `docs/` | Architecture, deployment, operations, asset notes, and licences |
| `scripts/assets/` | Asset-manifest and branded-art generators |
| `tests/` | Node regression checks and the manual browser stability soak |
| `workers/` | Source for the separately deployed flight-data Worker |
| `stream-server/` | YouTube streaming server setup and maintenance tools |
| `worker-entry.js` | Static-site Worker routes |
| `wrangler.jsonc` | Static-site Worker configuration |

## Naming rules

- Use lowercase kebab-case for new web assets: `air-nova-cloud-wordmark.png`.
- Aircraft filenames remain uppercase equipment codes because the runtime
  derives those paths from flight data.
- Airline tile filenames remain ICAO codes for the same reason.
- Do not commit download suffixes such as ` (1)`, Finder copies such as ` 2`,
  generated-image timestamps, or folders named `misc`/`assorted`.
- Put developer scripts, source archives, licences, and notes outside
  `fids-current/`; that directory is public in production.
- Regenerate `fids-current/assets/asset-manifest.json` after asset changes.
