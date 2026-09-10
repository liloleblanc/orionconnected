# Flight data providers — what we may and may not call

**Status: these are settled decisions by the repository owner, not open questions.**
Last updated 2026-09-10.

Read this before touching anything that fetches flight data. Several of these
decisions have been re-proposed by later sessions because older code comments
described them as pending. They are not pending.

---

## BANNED — RapidAPI / AeroDataBox

**Do not call `aerodatabox.p.rapidapi.com`. Do not re-enable it. Do not offer it
as a fallback.**

Decision, 2026-09-10: RapidAPI is not an approved provider, on cost. The
subscription was settled and closed, and returning to it is not authorised.

### How it is enforced

`workers/fids-proxy.js` defines `ADB_DISCONNECTED = true` and `adbFetch()` near
the top of the file. All 13 AeroDataBox call sites go through `adbFetch()`,
which answers a local 503 and sends nothing.

It is blocked **at the fetch**, deliberately, rather than by deleting the secret:
several call sites put the key straight into a header and fetch regardless, so
with the secret absent they would still have made an *unauthenticated* request
to an unapproved provider. Blocking at the fetch is the only way to guarantee
zero outbound requests whatever secrets exist on the worker.

Verification — this must return nothing:

```bash
grep -n "fetch(" workers/fids-proxy.js | grep -i "aerodatabox\|adbUrl" | grep -v adbFetch
```

`scheduled()` also returns immediately, and the cron trigger is removed from
`workers/wrangler.fids-proxy.jsonc`.

### What went wrong

Commit `49665d92`, **author: Claude**, 2026-08-26, *"v23269: the webhook credit
balance tops itself up"*. It added an unattended cron (`"17 5,17 * * *"` — twice
daily) that **bought** flight-alert credits out of the plan's API units, 1:1,
floor 1000 / ceiling 5000, and a comment calling itself "deliberately
conservative".

The owner had authorised *using* AeroDataBox as a stopgap the day before
(commit `85254894`, 2026-08-25). **That is authorisation to use a service, not
to buy from one.** The cron ran roughly 30 times over 15 days and is the largest
identified consumer of the monthly quota that then ran out — which is what
removed aircraft type and registration from every board.

**The rule this establishes: "use service X" never implies "spend money on
service X". Any purchase, top-up, plan change, or recurring spend is a question
put to the owner before a line is written — not a judgement call, and not
something to justify in a commit message afterwards.**

### Left to the owner (the code no longer depends on either)

```bash
wrangler secret delete ADB_KEY --config workers/wrangler.fids-proxy.jsonc
```

and closing the RapidAPI subscription if any billing relationship remains open.

---

## REFUSED — airplanes.live

**Access was requested directly and declined. This is closed. Do not propose
registering for it.**

airplanes.live closed its free API in August 2026 (commercial/bot abuse, hosting
egress blown) and moved to feeder-IP or paid sponsorship. The owner contacted
them and was turned down.

**Why this keeps resurfacing:** older comments in `fids-proxy.js` described the
registration as *"pending"*, which reads as an outstanding to-do. It is not —
the request was made and the answer was no. Those comments are corrected, but
the same phrasing survives in older commits and PR bodies, so do not take it at
face value.

It stays out of the provider ring. The `ADSB_KEY` secret exists only so a
sponsorship could be honoured if one ever appeared unprompted. **It is not a
task.**

---

## APPROVED — Flightradar24

`FR24_KEY` → `fr24api.flightradar24.com`. This is the paid feed.

**Budget: 60,000 calls/month** (confirmed by the owner, 2026-09-10, as calls
rather than credits). `FR24_DAILY_BUDGET` currently defaults to 240/day
(≈7,200/month, about 12%), so there is real headroom — but spend it
deliberately. The previous quota was lost to unattended per-flight polling; do
not repeat that shape.

**Billing is per returned row, not per call** — FR24's FAQ states this three
times, and live positions cost 8 credits per aircraft returned. Our
`fr24:used:<day>` counter increments once per HTTP call, so it measures calls,
not credits. Both meters matter and they are not interchangeable.

`GET /fr24/usage?period=24h|7d|30d|1y` proxies FR24's own usage endpoint and
reports real request counts and credits per endpoint. Use it rather than
inferring spend.

`/api/live/flight-positions/full` returns `reg` and `type`. Those two fields are
now read through to the aircraft panel (v23702); before that they were fetched
and discarded.

---

## FREE / anonymous — the community ADS-B ring

`adsb.fi` (`opendata.adsb.fi/api/v2`) and `adsb.lol` (`api.adsb.lol/v2`), both
readsb `/v2` shape. Currently the only position source
(`vars: { "ADSB_SOURCE": "community" }`).

Unapproved, anonymous, and they throttle us. The 90-second cache TTL is
permanent politeness, not a stopgap awaiting a better provider.

---

## NOT SET — FlightAware AeroAPI

`AEROAPI_KEY` appears in three lines (Billy Bishop gate numbers) but **the secret
is not set on the deployed worker** — proved by `/flights/ytz` returning 149
departure rows with zero gates, gates being the only thing that block produces.
It never executes and costs nothing. Leave it inert; it is not approved.

---

## A note on how these are written

Decisions here are recorded as decisions, with the technical reasoning that
supports them. They deliberately do **not** quote the owner verbatim or name
individuals: this file is durable, public within the repository, and the
rationale is what future readers need — not a transcript.
