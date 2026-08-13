# Deployment

The repository contains two distinct Cloudflare Workers. Deploying one does
not deploy the other.

## Before any deployment

```bash
npm test
npm run assets:check
git status --short
```

Confirm that the intended commit is on the intended branch and that no secrets
or local configuration files are present.

## Static display site

`wrangler.jsonc` configures the `fids` Worker:

- Worker entry: `worker-entry.js`
- Static asset directory: `fids-current/`
- Production site: `https://fids.orionconnected.com`

Deploy from the repository root with the current supported Wrangler version:

```bash
npx wrangler deploy
```

Because `fids-current/` is the asset directory, every file inside it becomes a
public production asset. Documentation, tests, scripts, and private source
material must stay outside that directory.

## Flight-data Worker

`workers/fids-proxy.js` is the source snapshot for the separately deployed
flight-data Worker. Its production configuration, bindings, and secrets are
not represented by the root `wrangler.jsonc`, so do not deploy it using the
site command above.

Required secret values belong in Cloudflare, never in Git. They include the
AeroDataBox key, JWT signing secret, webhook secret, and any seed credentials.

## Production smoke check

After a site deployment, verify:

1. `index.html`, `fids.html`, `gids.html`, and `bids.html` load without missing
   local CSS, JavaScript, fonts, or images.
2. YQM gate screens show the correct operating date for next-day flights.
3. The left and right status panels agree.
4. Aircraft enrichment replaces its temporary state with the resolved type.
5. Boarding text remains still for at least twelve seconds.
6. The FIDS and BIDS layouts still render at 1920×1080 and on a phone.

No deployment is complete until those checks pass on the production hostname.
