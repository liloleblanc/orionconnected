# Orion Connected Airport Displays

Browser-based FIDS, GIDS, and BIDS displays for airport operations. The live
site is [fids.orionconnected.com](https://fids.orionconnected.com).

## Main screens

| Screen | Page | Purpose |
| --- | --- | --- |
| FIDS | `fids-current/fids.html` | Departures and arrivals board |
| GIDS | `fids-current/gids.html` | Gate-specific flight display |
| BIDS | `fids-current/bids.html` | Baggage carousel display |
| Airport Display Studio | `fids-current/studio/index.html` | Isolated designer for FIDS, GIDS, BIDS, Check-in, and Baggage Ops — drag-and-resize modules, live data tokens, states, undo/redo, and local-only display staging |
| Companion | `fids-current/app.html` | Phone-friendly passenger view |
| Rotator | `fids-current/rotate.html` | Unattended multi-screen rotation |

The public web root is `fids-current/`. Developer tools, tests, Worker source,
and documentation live outside that directory so they are not published as
static assets.

## Work locally

```bash
python3 -m http.server 8099 --directory fids-current
```

Then open `http://127.0.0.1:8099/gids.html?mode=live&ap=YQM&gate=4` for a
display or `http://127.0.0.1:8099/studio/` for the isolated Studio.
Use `http://127.0.0.1:8099/studio/?airport=yhz` to preview another airport's
isolated site context during local development.

The private YQM data pilot is opt-in:

```text
http://127.0.0.1:8099/studio/?airport=yqm&data=pilot
```

That link reads the same shared flight router as the current displays, but it
has no publish or assignment path. The Studio labels operational data as
`READ-ONLY FLIGHTS`. If the router is unavailable, it visibly switches to
`PREVIEW FALLBACK` so sample data cannot be mistaken for a live feed. Ordinary
Studio links remain on preview data. Check-in and Baggage Ops stay visibly in
preview until their dedicated data contracts are connected.

Useful checks:

```bash
npm test
npm run assets:check
```

Rebuild the browsable asset catalog after adding or removing artwork:

```bash
npm run assets:build
```

## Documentation

- [Current architecture](docs/ARCHITECTURE.md)
- [File map and naming rules](docs/FILE-MAP.md)
- [Cleanup record](docs/CLEANUP-REPORT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Long-term design direction](docs/DESIGN-DIRECTION.md)
- [Flight webhook operations](docs/operations/flight-webhooks.md)
- [Studio private-pilot runbook](docs/operations/studio-pilot.md)
- [Asset library](docs/assets/logo-library.md)

## Safety

- Never commit API keys, passwords, JWT secrets, webhook secrets, or stream
  keys.
- Treat `fids-current/` as production: every file in it is public after a site
  deployment.
- Run the tests and asset check before publishing.
