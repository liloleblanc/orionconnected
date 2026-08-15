# Operations Brief

Condensed reference for running this system. Everything here was verified
against the live account and code on **2026-08-15** — not inferred from
comments, several of which are wrong (noted below).

Complements `DEPLOYMENT.md` (how to deploy) and `ARCHITECTURE.md` (how it's
built). This one is: *what's actually true, what's broken, what to watch.*

---

## 1. The two Workers

| | `fids` | `fids-proxy` |
|---|---|---|
| Serves | the boards (HTML/CSS/JS/assets) | all data, auth, config, media |
| Config | `wrangler.jsonc` (repo root) | `workers/wrangler.fids-proxy.jsonc` |
| Source | `worker-entry.js` + `fids-current/` | `workers/fids-proxy.js` |
| Live at | `fids.orionconnected.com` | `fids-proxy.n-leblanc1984.workers.dev` |
| Storage | none — read-only | KV ×3, R2 ×1, Workers AI |

`fids-proxy.js` is **esbuild output**, not hand-written source. Edit it
directly; there is no build step in this repo.

Until 2026-08-15 `fids-proxy` had **no deploy config in the repo** — it was
deployed by hand from one machine ("Source: Upload"). `workers/wrangler.fids-proxy.jsonc`
now fixes that, so anyone can deploy it.

### Bindings (verified from `env.X` usage, NOT from the file's own comment)

```
FIDS_USERS         KV  1ed38d7f081a4b58bd2811b12e217050   users, airport cfg, overrides, media
FIDS_LIVE_FLIGHTS  KV  23d2a25c9a614f07b7dc860ec4c89e3f   webhook flight cache (36h TTL)
CITY_BG_CACHE      KV  9aa58d273cc64dc08992a35b3c508c8f   AI backgrounds, destination info
FIDS_ASSETS        R2  fids-assets                        logos, uploaded media
AI                 Workers AI                             city/hotel images, destination text
```

Secrets (persist across deploys, never in config):
`JWT_SECRET`, `SEED_ADMIN_PASSWORD`, `ADB_KEY`, `ADB_WEBHOOK_SECRET`,
`AEROAPI_KEY`, `ACCOR_KEY`, `NINJAS_KEY`, `MCO_FEED_KEY`.

> ⚠️ The comment at the top of `fids-proxy.js` lists `FIDS_AIRPORT_CONFIG` and
> `FIDS_MEDIA` — **neither exists**; the code never touches them. It also omits
> `FIDS_LIVE_FLIGHTS`, which it does use. Deploying from that comment binds two
> phantom namespaces and misses a real one. Trust the table above.

---

## 2. Deploying

**Boards** — merge to `main`. Cloudflare auto-deploys; kiosks reload within
~5 minutes on their token poll. Branch protection means PR only.

A board change is not live until you bump **both**:
- `FIDS_BUILD_TAG` in `fids-current/js/fids-core.js`
- the matching `?v=` token in `gids.html` / `fids.html` / `bids.html`

Miss the token and kiosks keep the cached old file forever.

**Backend** — never `wrangler deploy` straight to production. Two steps:

```bash
cd workers
npx wrangler versions upload --config wrangler.fids-proxy.jsonc   # inactive, no traffic
# verify against the preview URL it prints, then:
npx wrangler versions deploy <VERSION_ID>@100% --config wrangler.fids-proxy.jsonc --yes
```

Do **not** run `wrangler triggers deploy` — that rewrites routes and custom
domains. Rollback is the same `versions deploy` with an older version ID.

Known-good rollback targets:
- `c7002ee7-5e45-458d-817c-b935f1b5485e` — four destructive routes guarded (live 2026-08-15)
- `f8b16d46-9474-4215-9857-7c48dd287c9c` — pre-security-fix baseline

---

## 3. Security state

**Fixed 2026-08-15** (live): six endpoints were reachable with no credentials.
All now require `?secret=<ADB_WEBHOOK_SECRET>`:

| Route | What it could do |
|---|---|
| `GET /admin/clear-cache` | wipe every AI background — and a **GET**, so a crawler or link preview could fire it |
| `POST /subscriptions/refill` | spend real API credits |
| `DELETE /subscriptions/webhook/:id` | **stop live flight data reaching the boards** |
| `DELETE /flights/cached/:icao` | empty the live-flight cache |
| `GET /subscriptions/balance` | leak credit balance + raw upstream headers |
| `GET /subscriptions/webhooks` | leak subscription IDs — the IDs needed to delete the feed |

**Open, deliberately:**

- **The auth gate is opt-in, not default-deny.** It matches
  `startsWith("/auth/users") || startsWith("/api/")`. Anything added outside
  those prefixes is public *by construction*. Put new admin routes under
  `/api/`, or they inherit nothing.
- **`/proxy/`, `/airlines/`, `/airports/`, `/aircrafts/`, `/accor/`,
  `/weather/`, `/ai/*` are open and burn metered keys.** They cannot simply be
  authenticated — the boards are anonymous kiosks with no credential. The
  control is rate limiting or an origin check, not auth.
- **CORS echoes any `Origin`** with no allowlist, so any web page can call the
  above from a visitor's browser.
- **JWT lives 24h with no revocation check.** Removing a user leaves them
  working for up to a day.

**Passwords:** PBKDF2-SHA256, 210k iterations, unique salt per user, as of
v23169. Legacy unsalted-SHA-256 records still verify and upgrade silently on
next login — nobody is reset. `hashPassword()` survives *only* to read legacy
records; never create one with it.

---

## 4. Things that will surprise you

**localStorage outranks the server on every setting.** Moving a setting
server-side changes nothing until that precedence is inverted — a manager's
change will appear to save and then not apply at the next station. This is the
single highest-risk part of the planned scoped-config work.

**Airline colour has no storage layer at all.** It lives in a source file and
the runtime override hook is a dead stub. Server-side airline theming is
net-new work, not a migration.

**Live aircraft positions are dead.** `api.airplanes.live` returns **403**
(requires registration) and sends no CORS headers. So:
- the map runs on clock estimates, not real positions
- the runway-aligned landing view can never trigger (needs a fix within 25nm)
- "landed" detection can never fire (needs a ground fix within 6nm)
- `_liveTrack` is fetched and read by nothing

Fix = register with a provider, then **proxy it through the worker**. Today
each browser calls the API directly, so traffic scales with viewers; server-side
with a cache it stays flat.

**There's an orphaned comment** in the router reading *"Gate theme admin
endpoint"* with no endpoint under it. Someone started server-side theming and
stopped.

**Cloudflare resources not used by FIDS:** D1 `openapi-template-db` (0 tables —
a good fit for users/roles/scopes and an audit trail), worker `orionconnected`
(duplicate of `fids`, nothing routes to it), R2 `accor-brand-library`.
`QA_USERS` and `luxury-proxy` belong to a different project — leave them.

---

## 5. Display behaviour

- Kiosks poll their own HTML every 5 min for a new `?v=` token, then reload once.
- `rotate.html` keeps **all three boards alive simultaneously** in stacked
  iframes. Use `window._ocEvery(fn, ms)` or check `window._ocIdle()` for any
  periodic work — a raw `setInterval` runs in all three hidden boards forever
  and starves the visible one.
- The stream runs **24/7 unattended** on a 2-vCPU droplet that is also encoding
  with ffmpeg. Never gate a visible change on a bare `setTimeout`: same-origin
  iframes share one main thread, and a starved timer once froze the rotation.
  Record a due time and let the Web Worker heartbeat complete it.
- No GPU on the droplet — WebGL falls back to software rendering there, so
  MapLibre/three.js would be *slower* than the current 2D map. Measure before
  proposing it.

---

## 6. Gotchas that cost real time

- `getBoundsZoom()` derives from the map's **current** zoom, so `fitBounds()` is
  **not idempotent** — repeated calls ratchet the zoom. Compute the view from
  the container size instead.
- Detaching a DOM node **cancels** its CSS animations; re-attaching starts
  **new** ones. Anything preserved across a rebuild replays its entry animation.
- Airport marks are built by string concatenation
  (`'/logos/airports/' + icao + '-white.svg'`), so **grep cannot see them**.
  Verify before deleting any asset.
- Browser-pane tabs report `visibilityState: 'hidden'`, which pauses rAF,
  animations and transitions. Any FPS or timing measured there is an artifact.

---

## 7. Open decisions

1. **Promote v23169?** (PBKDF2 + the two ops routes.) Uploaded as
   `3ad19d58-4075-45e7-aaf9-9a7bcc04d527`, **not yet live**. Needs one test
   only the owner can do: confirm a real login still works.
2. **ADS-B provider** — register with airplanes.live, or move to adsb.fi /
   OpenSky / FlightAware. Then proxy through the worker.
3. **Scoped roles** — public / airline user / airline manager / airport user /
   admin. Needs a `{role, scope}` pair, not a role alone. Requires config to
   move server-side first.
4. **Canvas gate map** — approved direction, parked on `feat/canvas-gate-map`.
   Keep: route line, airport dots + codes, aircraft, runway approach, halftone,
   place names, built-in coastlines. Cut: street tiles, rain radar, surrounding
   traffic, dark scrim.
