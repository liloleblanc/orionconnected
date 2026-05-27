# FIDS v11p Cleanup Pass — Summary

Performed on **2026-04-20** against `fids-v11p-OVERHAUL_7.zip`.

## Totals
- **Before:** 13,536 lines across HTML/JS/CSS
- **After:** ~12,505 lines
- **Removed:** ~1,030 lines of dead code

---

## HTML — `fids.html`, `gids.html`, `bids.html`

1. **Removed the duplicate-ID `<div id="lobbyScreen">…</div>` block** (~138 lines × 3 pages = 414 lines). This was leftover lobby/picker markup — now owned by `picker.html`. Two elements with the same ID was invalid HTML (only the first would ever be found by `getElementById`).
2. **Removed dead `lobbyAp` boilerplate** from each page's `DOMContentLoaded` script.

## CSS — `css/fids.css`

3. **Legacy top toolbar (`.ctrl`) is now hidden by a CSS rule** rather than an inline `<style>` block in each HTML page. The sidebar menu (see `menu.html`) is the primary UI. The toolbar's DOM is kept because `fids-core.js` reads from `#apSel`, `#modeBadge`, `#searchInput`, etc. — hiding visually is safer than removing.
4. **Removed 29 confirmed-dead rules**:
   - All `.lobby-*` rules (lobby is a separate page now)
   - `.g8-wx-main`, `.g8-wx-temp`, `.g8-wx-extra`, `.g8-r3-left`, `.g8-r3-right` — unused variants
   - Dead `#lobbyScreen` ID selectors

## CSS — `css/shared.css`

5. Removed 8 orphan classes: `.fids-btn`, `.fids-dropdown`, `.fids-input`, `.fids-select`, `.live-indicator`, `.mode-btn`, `.section-label`, `.status-pill`.

## CSS — `css/menu.css`

6. Removed 2 orphan classes: `.board-wrapper`, `.sm-close` (not to be confused with `.sm-close-btn` which is used). Push-layout rules for `body.sidebar-open #fidsBoard { margin-left: 380px }` preserved.

## JS — `js/fids-core.js`

7. Rewrote `enterFIDS()` as a no-op stub — the page-level init scripts bootstrap the board; the lobby entry flow is handled by `picker.html`.
8. Rewrote `returnToLobby()` to navigate to `picker.html` via `window.location.href`.
9. Rewrote the Escape key handler:
   - Close airport panel if open
   - Close any open autocomplete dropdown
   - Close the sidebar menu if open
   - Otherwise, return to picker
10. Simplified the login-success path — no more lobby-overlay coordination.
11. Simplified autocomplete from 3-way (`lobby`/`ctrl`/`menu`) to 2-way (`ctrl`/`menu`).
12. Cleaned `initApInputs()` — removed dead `lobbyApInput` branch.
13. Removed dead `.lobby-enter-btn` and `.lobby-gold-line` selectors from the dynamic theme-CSS strings.
14. Removed 19 uncalled functions (`toggleGateControls`, `applyGradient`, `gateWxIcon`, `getAirlineBrand`, `getEmblemUrl`, `getOperatedBy`, `getZoneLabel`, `uxgFormatStatusLine`, `uxgMinutesText`, `uxgTimeBlock`, `uxgFitDestSize`, `uxgInlineWeatherHtml`, `uxgInboundOriginName`, `UX`, `getFleetAircraft`, `toggleFilterDrawer`, `onFilterChange`, `clearFilters`, `switchMobileTab`).

## JS — `js/menu.js`

15. Replaced `XMLHttpRequest` + dual `setTimeout` menu loader with a clean `async/await` + `fetch()`. The race conditions from timeout-based init are gone — init runs only after the fragment is in the DOM.
16. Removed dead `.lobby-gold-line` from the dynamic theme-CSS string.
17. Removed 2 uncalled functions: `menuChangeAirport`, `_darken`.

## Deleted files

- **`js/router.js`** — never loaded, leftover SPA router from before the page split (193 lines).

## Files untouched (verified intact)

- `js/auth.js`
- `css/entry.css`, `css/font.css`, `css/airport-fonts.css`, `css/leaflet-embed.css`
- `index.html`, `picker.html`, `menu.html`
- All aircraft livery images, airline logos, fonts

## Verification

- ✅ All JS passes `node --check` (valid syntax)
- ✅ All CSS files have balanced braces
- ✅ All HTML files have matching `<body>` / `<html>` tags
- ✅ Zero remaining references to removed lobby/router elements in live code
- ✅ Sidebar menu push layout (`body.sidebar-open #fidsBoard`) preserved and functional
- ✅ Search is available via the sidebar menu's "Search" tab (live flight lookup via Cloudflare Worker proxy)

## Known follow-ups (not done)

- **Deeper CSS orphan removal.** ~120 more classes in `fids.css` are likely orphan (old gate screen variants, filter drawer, `.uxg-*` leftovers) but safe removal requires a real CSS parser — naive comma-splitting breaks on `rgba(r,g,b,a)` values.
- The legacy top toolbar's DOM could be stripped from the HTML pages in a future pass after carefully re-homing the `#apSel`, `#modeBadge`, `#liveLabel`, etc. elements (or pointing `fids-core.js` at sidebar equivalents).

---

# Follow-up session — Gate screen fixes (2026-04-21)

## Top banner — "Operated by rouge · ROU1983" line removed
Under the flight number (AC1983), the secondary "Opéré par rouge · ROU1983" row was cluttering the banner. The `operatedByHtml` builder has been stripped from `uxgGateHtml()`. The `_opCode`/`_opName` derivation is still computed because the equipment panel ("Your Aircraft") uses it.

## Aircraft Arrival Data panel — rebuilt
- Removed the "AIRCRAFT ARRIVAL DATA" section title entirely.
- Renamed the first panel header to **"YOUR INCOMING FLIGHT INFORMATION"** (larger, white, bold).
- Switched from a 3-column grid to a cleaner 2-column layout:
  - Row 1: **Flight** / **From**
  - Row 2: **Scheduled Departure** / **Scheduled Arrival**
  - Row 3: **Flight Time** / **Arriving In**
- All values are now 22px bold white (was 17px mixed), labels are 11px muted.
- Introduced a `_timeCell(sched, rev)` helper that renders **consistent strikethrough-original + orange-revised** formatting on BOTH dep and arr when delayed. The dep-side previously had inconsistent styling.

## "Your Aircraft" section — formalized
Renamed from "EQUIPMENT PROFILE". The "Operated by:" row is now the canonical operator display across the app: **34px-tall logo + 20px white carrier name**. Consistent with the new larger text in the panel. `Type:` and `Reg:` lines also get 20px white values.

## Map SPD/ALT overlay — always visible
Previously, the speed and altitude readout on the top of the map only rendered when live telemetry was present. Now it renders **whenever there's an inbound flight**, and shows "—" placeholders when no live data is available. The box position and size stays stable regardless of tracking state.

## Rouge livery fix
When a flight is operated by Air Canada Rouge (`_opCode === 'RV'`), the aircraft image lookup now appends an `r` suffix to the equipment IATA code (e.g. `321` → `321r`), which matches the existing `/aircraft/AC/321r.png`, `/aircraft/AC/320r.png`, `/aircraft/AC/319r.png`, `/aircraft/AC/7M8r.png` files in the repo. Previously Rouge flights always showed the mainline Air Canada livery.

`aircraftImgTag()` was also hardened to accept pre-normalised codes with a lowercase variant suffix (`/^[A-Z0-9]{3}[a-z]$/`) so they pass through without being re-mangled by `aircraftCodeToIata()`.

## Verified
- All JS passes `node --check`.
- Grep confirms "YOUR INCOMING FLIGHT INFORMATION", "YOUR AIRCRAFT", and `_liveryEq` appear in the output.
- No top-banner injection point remaining (`operatedByHtml` variable removed from output).

---

# Logo upload — 2026-04-21

Merged 18 new logo files into /logos/ from user upload (Jazz.svg, flair.png, Aeroplan2.svg, 
star-alliance.svg, skyteam.svg, Skyteam.png, Oneworld-Logo.png, starlink.svg, + hotel brands).

- `Jazz.svg` renamed to `jazz.svg` for consistency with existing lowercase naming
- `LOCAL_LOGO_OVERRIDE['QK'] = '/logos/jazz.svg'` enabled in js/fids-core.js
- Next Jazz-operated flight (AC8xxx / AC76xx-79xx) will show the custom Jazz logo in "Operated By:"
- To add Rouge/Encore/etc later: drop the file in /logos/ and uncomment the matching line in LOCAL_LOGO_OVERRIDE
