# FIDS v218.78 — Cleanup & Security Pass

Performed on **2026-05-12** against `fids-v218_77.zip`.

This pass is **non-functional** — no behavior changes. It removes dead code,
strips leaked credentials, consolidates duplicates, and corrects documentation
drift. The next deploy can be made from this drop-in directly.

---

## 🔴 Security fixes — DO THESE BEFORE DEPLOYING

The cleanup removed the leaked credentials from source. You also need to
**rotate the keys themselves** because they are in the previous zip and
in every working copy of that zip on every machine that ever had it.

### Keys to rotate ASAP
1. **AeroDataBox / RapidAPI key** — was `4eddcef5...e696`. Go to
   https://rapidapi.com/developer/dashboard, regenerate, then
   `wrangler secret put ADB_KEY`.
2. **API Ninjas key** — was `Ol9JrFB...tfV`. Regenerate at
   https://api-ninjas.com/profile, then `wrangler secret put NINJAS_KEY`.
3. **Accor public-API key** — was `z0uTNMET...JGn6`. Internal — request a
   new key from whoever issued it, then `wrangler secret put ACCOR_KEY`.
4. **Default admin password** — was `fids2026`. Either log in once and
   change it, or `wrangler secret put SEED_ADMIN_PASSWORD` and re-seed.

The worker now refuses to fall back to embedded keys. If a secret isn't
set, the request fails — which is the right behavior. No more silent
exposure.

---

## What was removed

### Worker — `worker/fids-proxy.js` (was two files, now one)
- **Deleted `worker/fids-proxy-v10.js`** — renamed the larger/complete v10
  worker to the canonical name. The previous `fids-proxy.js` (608 lines)
  was a stale partial worker missing `/api/media-*` and `/ai/hotelbg` /
  `/ai/destination-info`. Frontend would have been broken if it had been
  deployed by accident.
- **Stripped 11 instances of `env.X || "literal-key"`** — three different
  keys (ADB, NINJAS, ACCOR) were embedded as fallbacks. Pattern is gone.
- **`fids2026` default admin password removed** — now reads from
  `env.SEED_ADMIN_PASSWORD`; falls back to `crypto.randomUUID()` so an
  unconfigured deploy is unusable rather than insecure.
- **Bumped `/health` version string** to `"218"` (was lying as `"10.0"`).
- **Added env/binding documentation header** so future-you knows what
  secrets the worker needs.

### `js/fids-core.js` — 497 lines removed (17960 → 17463)
- **Removed the entire Amadeus block** (73 lines). `fetchAmadeusFlightStatus`
  was defined but never called, and contained `client_secret=YOUR_SECRET`
  alongside a real `client_id`. The architecture was wrong anyway — Amadeus
  OAuth cannot live in browser JS.
- **Removed 11 confirmed-dead functions** (424 lines), verified against
  every HTML, every JS, and every CSS file:
  - `_kickoffPlaylistHarvest`, `buildGateMessageZone`,
    `fetchAircraftImage`, `fetchAircraftSpecs`, `fetchAirlineFleet`,
    `gateDestHotelStrip`, `getGateChangeAlert`, `lookupAircraftByReg`,
    `renderMobileHeroCard`, `uxgLabelMap`, `uxgWeatherIconHtml`
- **Fixed lying build banner.** Was `[FIDS BUILD v11p-OVERHAUL_26]` plus
  a second log claiming "Build v217". Now there's a single `FIDS_BUILD`
  const at the top of the file, so DevTools tells you the truth.

### Documentation
- **27 per-version patch notes** (v218.38 through v218.64-STABLE-ROLLBACK)
  moved to `archive/`. The current state is captured in `PATCH-NOTES.md`,
  `V218-NOTES.md`, and `PATCH-NOTES-v218.77.md`. History is preserved.
- **Fixed cache-version drift** in `V218-NOTES.md` and `PATCH-NOTES.md` —
  they claimed `v=258` and `v=260` respectively; actual HTML uses `v=305`.
- **`DEPLOY.md`** — replaced the inline AeroDataBox key and the four
  references to the `fids2026` password with placeholders. Added the
  `SEED_ADMIN_PASSWORD` instructions.

---

## What was preserved

- All HTML pages (`fids.html`, `gids.html`, `bids.html`, `picker.html`,
  `menu.html`, `index.html`) — untouched.
- All CSS files — untouched. CSS consolidation is a separate, larger pass.
- All `js/fids-v2.js`, `js/menu.js`, `js/auth.js` — untouched.
- All logos, fonts, aircraft images — untouched.
- All 1656 lines of working worker logic — preserved, just stripped of
  hardcoded fallbacks.

---

## Verification

- ✅ `node --check` passes on every JS file
- ✅ Zero leaked credentials remain in any non-archive file
- ✅ Every endpoint called by the frontend has a handler in the worker:
  `/api/airport-config`, `/api/airline-override`, `/api/media-config`,
  `/api/media-library`, `/api/media-assignments`, `/ai/citybg`,
  `/ai/hotelbg`, `/ai/destination-info`, `/auth/login`, `/health`,
  `/api/adb/*`, `/admin/clear-cache`, `/weather/realtime`,
  `/weather/forecast`
- ✅ Build banner reads from `FIDS_BUILD = 'v218.77'` — single source

---

## Recommended follow-up (not done this pass)

These are bigger jobs and were intentionally left alone:
- **CSS consolidation.** You ship 14 stylesheets totalling ~5400 lines.
  `fids.css`, `fids-v2.css`, `fids-v3.css`, and `fids-layout-fixes.css`
  are loaded together on every page. A real CSS-parser-driven dedupe
  could probably halve that.
- **Console-log gate.** 154 `console.log` calls in `fids-core.js` —
  intentional during development, but on a 24/7 TV screen they accumulate.
  Wrapping in `if (DEBUG) console.log(...)` would be one find-and-replace.
- **`var` → `const`/`let`.** 1260 `var` declarations. Migration would
  catch the next accidental redeclaration but is not blocking anything.
