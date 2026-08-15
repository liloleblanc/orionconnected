# Current architecture

> **See also: [`OPERATIONS-BRIEF.md`](OPERATIONS-BRIEF.md)** — verified bindings,
> deploy/rollback commands, current security state, and the known traps.
> Several comments in the source contradict reality; the brief says which.


This document describes the system that is running now. The separate
[design-direction document](DESIGN-DIRECTION.md) describes the desired future
template-driven architecture.

## Runtime pieces

1. **Static display site** — everything under `fids-current/` is served by the
   `fids` Cloudflare Worker configured in `wrangler.jsonc`. `worker-entry.js`
   also provides same-origin map, weather, and fixed upstream routes.
2. **Flight-data Worker** — `workers/fids-proxy.js` contains authentication,
   AeroDataBox access, webhook handling, configuration, and media-library
   endpoints. It is a separate deployed Worker and is not governed by the root
   `wrangler.jsonc` file.
3. **Browser display engine** — `fids-current/js/fids-core.js` loads flight data,
   selects the current flight, and renders the flight, gate, and baggage views.
4. **Static assets** — aircraft art, logos, fonts, textures, and built-in media
   are served from `fids-current/`. The generated catalog is
   `fids-current/assets/asset-manifest.json`.
5. **Uploaded media and configuration** — uploaded items live behind the
   flight-data Worker. Some display choices also live in browser local storage.

## Request flow

```text
Display browser
  ├─ HTML/CSS/JS/images ──> fids.orionconnected.com (site Worker + assets)
  ├─ flight/config/media ─> fids-proxy Worker
  └─ maps/weather ────────> same-origin routes in worker-entry.js
```

## Active entry points

- `index.html` routes desktop users to the picker and mobile users to the
  companion app.
- `picker.html` selects FIDS, GIDS, or BIDS.
- `fids.html`, `gids.html`, and `bids.html` load the shared display engine.
- `designer.html` is the template designer opened by the capture workflow.
- `menu.html` is the shared operator menu markup.
- `rotate.html` keeps unattended streaming displays rotating without cutting
  media mid-playback.

## Known structural debt

The live renderer is still a large shared file and the display styling still
uses layered CSS. That is operational debt, but it is active code rather than
disposable clutter. Splitting it requires a staged migration with screenshot
and live-data regression testing; it should not be mixed into asset cleanup.
