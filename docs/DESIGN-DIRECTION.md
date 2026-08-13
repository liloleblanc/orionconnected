# FIDS — long-term design direction

This is the target architecture, not a description of the current runtime.
Read [ARCHITECTURE.md](ARCHITECTURE.md) for the system that is deployed today.
The guidance below records **what rots and what works** as the renderer is
gradually moved toward templates.

---

## The One Rule

**Screens are data, not code. You edit data; you never patch the renderer.**

A gate screen, a board, a baggage screen — each is a **template** (a JSON
description of what to show and where). One small, generic renderer reads the
template and the live data and paints it. When something looks wrong, you change
the template or the data. **You do not add CSS on top of CSS. You do not touch
the renderer to fix one screen.**

The moment code knows a *specific* — a layout, one airline, one logo path, one
gate's quirk — that is the seed of the next nightmare. Push the specific into
data. Keep the code generic and ignorant.

---

## Why (the evidence)

The old gate screen was built as code (`buildV2GateLayout`) and styled as CSS
layered on CSS. It was good engineering — feature-flagged, mockup-driven,
screenshot-tested. **It rotted anyway:** 3 full CSS rewrites in 4 versions, then
~20 more patch layers, one element re-defined 35 times. Each fix fought the
legacy cascade with `!important` and knocked something else out of line, which
needed the next patch. A layout made of code/CSS-overrides cannot stop rotting,
because the only tool to change it is another override.

That is the trap. This document exists to not fall in it a third time.

---

## What WORKS — keep these (the bones)

These parts of the old system never rotted, because they are **data + a generic
reader**, not hardcoded layout:

- **Data engine** — AeroDataBox via the worker proxy; sequential fetch to avoid
  429s; codeshare/cargo filtering; time-based status.
- **The worker** — single-purpose endpoints, JWT auth with roles, R2 + KV.
- **Media library** — upload → R2 → a manifest in KV → a generic viewer lists it.
  This is the model. It is browsable and never became a patch-pile.
- **Airport config / overrides** — per-airport settings live in KV (data), read
  on boot. Never rotted.
- **Reference data** — airline/airport/city maps, livery folders, the logo tree.

## What ROTS — never again

- Layout written as code (`buildV2GateLayout`).
- CSS stacked on CSS, fighting a legacy cascade with `!important`.
- One giant file that knows every specific (the current shared core).
- Sizing against a mockup in isolation, then losing to the real CSS chain.
- Two near-duplicate cores drifting apart (`fids-core.js` + `fidscore.js`).

---

## The shape of the new system

Modeled on how mature display systems (e.g. Simpleway CX) are built:

- **CORE (permanent, small, generic):** data engine, asset library, the
  template store, auth, setup, and the **renderer** that binds tokens like
  `{flight.status}`, `{gate}`, `{aircraft.type}` into a template. The core has
  no opinion about looks and knows no specific screen.
- **TEMPLATES (data, disposable):** each screen is a template. Designed in the
  editor, stored as JSON, assigned to a display. Change the look by editing the
  template — never by editing the core.
- **ASSETS (data, browsable in ONE place):** uploaded media *and* logos live in
  one library with a manifest, so everything is visible, searchable, and
  documented in a single area. Logos get a generated manifest so they are
  browsable, not just reachable by exact URL.
- **CONFIG (data):** airport, airline, and per-display settings in KV.

A screen page is therefore tiny: load core → get its template → render. If a
screen breaks, no other screen cares.

## Tenants, modules, and access

- **Tenant = airport, by subdomain.** `yqm.orionconnected.com` is Moncton. The
  tenant is read from the hostname; the system loads that tenant's config,
  templates, and assets. New airports are new subdomains.
- **Module = a page within a tenant.** `flight.html`, `gate.html`,
  `checkin.html`, `baggage.html`… Each renders its own template and is
  independent. A module is added by existing as a page + template; it never
  touches the others. (This is the "connected only by the core" rule.)
- **Nothing exists until set up.** A fresh tenant starts **empty** — no demo,
  no fake data, no assumed defaults. An un-configured module shows a
  "configure this display" state, never a broken or pretend screen. (An empty
  system has no defaults to patch — this enforces The One Rule by construction.)
- **No demo — the live system IS the demo.** YQM is set up and live for
  everyone. A logged-out visitor sees real Moncton, read-only. There is no
  separate demo build to drift and rot — there is one system, shown through a
  permission lens.
- **Access decides the experience — not separate builds.** Logged out → YQM
  live, read-only (viewer): see everything, change nothing. Logged in → the
  same screens and core, with controls unlocked by role (operator/admin):
  setup, templates, assets, other tenants. The difference between a visitor and
  an admin is **their access level (data) read by one generic system** — never
  a second codebase. A logged-out and a logged-in user load the *same*
  `gate.html`; role hides or shows the controls.

> Two viewer/admin codebases would drift apart. Keep one role-gated system.

---

## The test before you commit any change

Ask: *am I about to hardcode a specific into code, or fight CSS with more CSS?*

- If **yes** → stop. Put it in a template, the asset manifest, or config instead.
- If the change is to **data** (a template, a manifest, a config value) → fine.
- If the change is to the **core/renderer**, it must be **generic** — true for
  every screen, every airline — or it doesn't belong there.

When something is wrong: **regenerate or edit the data. Do not patch.**

---

*Keep this short. A long rulebook gets skipped, and a skipped rulebook prevents
nothing. If this grows past two pages, cut it back.*
