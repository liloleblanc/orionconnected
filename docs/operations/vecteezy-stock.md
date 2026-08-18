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

Two worker secrets, set from the fids-proxy deploy directory:

```sh
wrangler secret put VECTEEZY_TOKEN        # bearer token from Vecteezy
wrangler secret put VECTEEZY_ACCOUNT_ID   # numeric account id (URL path segment)
```

Both are optional. Until they are set, `/api/vecteezy/*` answers
`503 Vecteezy not configured` and nothing else in the worker changes. The
menu surfaces that 503 as a readable message in the search box.

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
