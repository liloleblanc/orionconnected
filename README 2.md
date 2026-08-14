# Orion Connected Airport Displays

Browser-based FIDS, GIDS, and BIDS displays for airport operations. The live
site is [fids.orionconnected.com](https://fids.orionconnected.com).

## Main screens

| Screen | Page | Purpose |
| --- | --- | --- |
| FIDS | `fids-current/fids.html` | Departures and arrivals board |
| GIDS | `fids-current/gids.html` | Gate-specific flight display |
| BIDS | `fids-current/bids.html` | Baggage carousel display |
| Companion | `fids-current/app.html` | Phone-friendly passenger view |
| Rotator | `fids-current/rotate.html` | Unattended multi-screen rotation |

The public web root is `fids-current/`. Developer tools, tests, Worker source,
and documentation live outside that directory so they are not published as
static assets.

## Work locally

```bash
python3 -m http.server 8099 --directory fids-current
```

Then open `http://127.0.0.1:8099/gids.html?mode=live&ap=YQM&gate=4`.

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
- [Asset library](docs/assets/logo-library.md)

## Safety

- Never commit API keys, passwords, JWT secrets, webhook secrets, or stream
  keys.
- Treat `fids-current/` as production: every file in it is public after a site
  deployment.
- Run the tests and asset check before publishing.
