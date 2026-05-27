# Airport Display System — FIDS · GIDS · BIDS

![License](https://img.shields.io/badge/License-MIT-green)
![Static Site](https://img.shields.io/badge/Type-Static%20Site-blue)
![Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-orange)

A browser-based airport display system for **Greater Moncton Roméo LeBlanc
International Airport (YQM)**. It is a static site (HTML + CSS + JavaScript)
with an optional Cloudflare Worker for authenticated live flight data.

| Screen | File | Purpose |
|--------|------|---------|
| **FIDS** | `fids.html` | Flight Information — full departures/arrivals board |
| **GIDS** | `gids.html` | Gate Information — per-gate display, ads, weather, map |
| **BIDS** | `bids.html` | Baggage Information — carousel / belt assignments |

Entry flow: `index.html` → **DEMO** or **LOGIN** → `picker.html` → the
chosen screen.

## Running it locally

No build step. Serve the folder with any static web server:

```bash
python3 -m http.server 8099
# then open http://localhost:8099/index.html and click DEMO
```

> **Note on images:** the airline logos and background art live on the
> deployed Cloudflare site under `/logos/...` (they are too large to keep in
> this repo). Running locally without them is expected to show missing-image
> 404s in the console — the app degrades gracefully (gradient backgrounds,
> hidden broken images) and is still fully usable. To preview locally with
> art, sync the `logos/` folder down from Cloudflare into the repo root.

## Modes

- **DEMO** — no login, sample flight data, never calls the live API. Works
  fully offline (except Google Fonts / Leaflet map, which need internet).
- **LIVE** — login required; the Cloudflare Worker (`worker/fids-proxy.js`)
  validates a JWT and proxies AeroDataBox flight data. See `DEPLOY.md`.

## Deployment (Cloudflare Pages)

The repo root **is** the site root. Push to the connected branch, or:

```bash
wrangler pages deploy . --project-name=gids
```

`_headers` controls edge caching (HTML/JS/CSS revalidate immediately so
deploys go live without stale-cache delays). Full worker + auth setup,
roles, and user management are documented in `DEPLOY.md`.

## Project layout

```
index.html / picker.html      Entry + screen picker
fids.html / gids.html / bids.html   The three display screens
css/                          Stylesheets (shared, per-screen, mobile)
js/
  auth.js                     JWT auth, role checks
  fids-core.js                Core rendering engine (all screens)
  fids-v2.js                  v2 layout helpers
  menu.js                     In-app ☰ console (Display / Search / Customize)
worker/fids-proxy.js          Cloudflare Worker (live auth + API proxy)
logos/                        Image assets (hosted on Cloudflare, see note)
_headers                      Cloudflare Pages cache rules
DEPLOY.md                     Worker + auth deployment guide
```

## Customizing GIDS

The gate screen (`buildV2GateLayout` in `js/fids-core.js`) is composed of
discrete blocks that already exist independently:

- **Aircraft column** (left) — livery, flight, equipment, inbound panel
- **Media column** (center) — rotating ad / video carousel
- **Map column** (right) — route map + destination weather
- **Message strip** (bottom) — gate-change / override messages

Per-airport visual customization (colors, theme) is stored in the browser
under `localStorage['fids_customize_<IATA>']` and editable from the in-app
**☰ → Customize** panel. Airline advertisements are configured via the
`GATE_ADS_BY_AIRLINE` data table in `js/fids-core.js`.

## License

[MIT](LICENSE)
