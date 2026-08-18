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

- `VECTEEZY_TOKEN` — the Vecteezy API bearer token (always required)
- `VECTEEZY_RAPIDAPI_KEY` — RapidAPI key for `vecteezy-api.p.rapidapi.com`
  (**preferred route**; see below)
- `VECTEEZY_ACCOUNT_ID` — numeric account id, only used by the direct route

Until a working combination is set, `/api/vecteezy/*` answers
`503 Vecteezy not configured` and nothing else in the worker changes. The
menu surfaces that 503 as a readable message in the search box.

### Why RapidAPI is the preferred route

Live-tested 2026-08-18: Vecteezy's own Cloudflare WAF rejects Worker
subrequests to `api.vecteezy.com` outright (403, "error code: 1106" —
banned-client family), with or without browser-like headers, before the
bearer token is even evaluated. The same API is published through RapidAPI
at `vecteezy-api.p.rapidapi.com` (`/v1/...`, no account_id path segment;
the v1 swagger matches v2 field-for-field on everything this integration
reads), the gateway forwards our `Authorization` bearer to Vecteezy, and
Worker→RapidAPI traffic is already proven daily by the AeroDataBox proxy.
When `VECTEEZY_RAPIDAPI_KEY` is set the worker uses RapidAPI; otherwise it
falls back to the direct route (kept for the day their WAF allows Workers).

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
