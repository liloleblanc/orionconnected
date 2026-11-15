# Vecteezy stock search & import

The Media Library (Console → Media → Library) can search Vecteezy's
royalty-free library and import photos, PNGs, vectors, and videos directly
into the FIDS media pipeline. Everything goes through the fids-proxy worker —
the browser never sees the Vecteezy credentials, and imported files are
copied into R2 like any other upload, so displays keep working even if the
Vecteezy resource later disappears.

Upstream API: Vecteezy API v2 — spec at
`https://www.vecteezy.com/api-docs/api/v2/swagger.json` (also served from
`https://api.vecteezy.com/api-docs/api/v2/swagger.json`). Access is granted
by Vecteezy per-account; see <https://www.vecteezy.com/developers>.

## Setup

Worker secrets (dashboard → fids-proxy → Settings → Variables and Secrets,
or `wrangler secret put`):

- `VECTEEZY_TOKEN` — the Vecteezy API bearer token
- `VECTEEZY_ACCOUNT_ID` — numeric account id (V2 URL path segment)

Until both are set, `/api/vecteezy/*` answers `503 Vecteezy not configured`
and nothing else in the worker changes. The menu surfaces that 503 as a
readable message in the search box. (A `VECTEEZY_RAPIDAPI_KEY` secret may
linger from a briefly-used fallback route removed the same day it was
added — Vecteezy does not support their RapidAPI listing, which only fronts
the retired V1 API. The code ignores that secret.)

### Known blocker: Vecteezy's firewall vs. Cloudflare Workers

Live-tested repeatedly on 2026-08-18: Vecteezy's own Cloudflare WAF rejects
Worker subrequests to `api.vecteezy.com` outright (403, "error code: 1106" —
banned-client family) **before the bearer token is evaluated**, and
identically for api-client, full-browser, and bare-bearer header sets — the
block keys on Worker-origin network signals that cannot be changed
client-side. The same requests from non-Cloudflare servers reach the API
normally. Until Vecteezy adds a firewall exception for this account's
Worker traffic (requests identify as `OrionConnected-FIDS/1.0`), every
search/import returns that 403. `GET /vecteezy/selftest` on the worker
reports the live status, including `cf-ray` ids their support can look up.

## Worker endpoints (both admin-JWT-gated, under `/api/`)

- `GET /api/vecteezy/search?term=…&content_type=video|photo|png|psd|svg|vector`
  — proxies `GET https://api.vecteezy.com/v2/{account_id}/resources`.
  Optional passthrough params: `page`, `per_page`, `sort_by`, `license_type`,
  `orientation`, `color`, `duration`, `ai_generated`, `family_friendly`.
  Returns a slimmed list: `{ page, lastPage, perPage, totalResources,
  resources: [{ id, contentType, title, thumbnailUrl, thumbnail2xUrl,
  previewUrl, dimensions }] }`. Results are never cached — Vecteezy's terms
  require thumbnail/preview URLs to be used fresh, not stored.

- `POST /api/vecteezy/import` — body `{ id, label?, category?,
  contentTypeHint? }`. Calls the `/download` endpoint (polling
  `download_status` when Vecteezy prepares the file asynchronously),
  downloads the file, stores it in R2 under `media-library/{uuid}.{ext}`,
  and appends a `media-library` item with `source: "vecteezy"`,
  `vecteezyId`, and an `attribution: { required, url }` block. Size caps
  match uploads: 100 MB video, 25 MB image.

Imported items behave exactly like uploads everywhere else (assignments,
players, delete — R2 object is removed with the item).

## Quotas and attribution

- Every search and download consumes Vecteezy API quota
  (`X-QUOTA-REMAINING` response headers upstream). The menu only searches
  on explicit clicks and never auto-refreshes results.
- Free-tier resources can require attribution. The import stores
  `attribution.required` / `attribution.url` on the library item and the
  library list shows "credit required" on such items — check before putting
  one on a public display.

## Gate card plates

The dark card of a gate (the cards of the rail and the cells of the boarding
shelf, on a gate whose airline discs would sink into a card of their own
colour) is drawn on one of these stock patterns. Licence: Vecteezy Pro, no
attribution required. The files are in `fids-current/textures/`, cut to
1744x616.

| File | Vecteezy item | Plate | Given to |
| --- | --- | --- | --- |
| `plate-grey-wave.jpg` | 85868529 | `grey-wave` | every other gate of the dark card (the default) |
| `plate-black-faint-waves.jpg` | 82498963 | `black-faint-waves` | TR, OS, DE, KQ |
| `plate-grey-shapes.jpg` | 63527784 | `grey-shapes` | PC, VY, RJ |
| `plate-black-fine-lines.jpg` | 69483591 | `black-fine-lines` | EK |
| `plate-brown-waves.jpg` | 80914976 | `brown-waves` | KL |
| `plate-brown-layers.jpg` | 88062392 | `brown-layers` | CX, EI, BR |
| `plate-black-fabric.jpg` | 55335613 | spare | nothing |
| `plate-black-stripes.jpg` | 7233631 | spare | nothing |

Where they are used: each wired plate is named once in
`window._GATE_CARD_PLATES` (`fids-current/js/fids-core.js`, with its base and
the paints the discs meet on it, measured on the rendered gate) and drawn by
one rule in `fids-current/css/display-overrides.css`, keyed on the body
attribute `data-gate-card="<plate>"`. The two spares are on disk and named by
no code. "Given to" is the first plate a carrier is tried on; the measure has
the last word (`window._gateCardPlate`): a gate whose discs do not stand clear
of that plate goes to the black faint waves where the airline has a black of
its own, then to the grey wave, then to the black faint waves. Royal Jordanian
and the reds, magentas, middle blues and deep greens given the grey wave are
drawn on the black faint waves for that reason. White figures read at 4.5 to 1
or better on the lightest 5th percentile of every plate.
`tests/gate-card-plates.test.js` holds this table, the files and the code
together.
