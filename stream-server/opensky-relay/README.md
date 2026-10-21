# OpenSky relay

OpenSky only answers its paid account from an address it has whitelisted.
Cloudflare Workers have no fixed address, so a small server of our own makes
every OpenSky call from one fixed IPv4 address.

The server only ever calls **out**: to OpenSky, and to the boards' Worker
(`fids-proxy`), which it asks once a minute what the boards want. Nothing
calls in to it, it opens no port, and its firewall lets nothing in. There is
no tunnel and no token for anyone to copy.

- **The address pin.** The Worker talks only to the server whose IPv4 is in
  its secret `OSKY_RELAY_IPV4`. Claude types that address into the Cloudflare
  dashboard from the one Hetzner shows for the server. It is not really a
  secret (OpenSky is sent it too), but a Worker secret survives every deploy
  and keeps the address out of this public repository. Until it is set,
  nothing can register, so a stranger who rents a Hetzner server can never
  take the relay's place.
- The only secret on the server is the **relay key**. The server makes it
  itself, keeps it root-only, and proves itself to the Worker with it. The
  Worker keeps only its sha256.
- The OpenSky client (ID and secret) lives only in the Worker, as two Worker
  secrets. The relay asks for them and keeps them in memory.
- Nothing goes to OpenSky until the Worker's `OPENSKY_ON` is `1`, which is set
  in a change after the agreement is signed and paid.
- It asks OpenSky only about the flights on screen: one box of at most 25
  square degrees per airport, at most 1,500 calls a day. When a flight is
  known only by its callsign, OpenSky's answer holds every aircraft in that
  box (it has no callsign filter); the relay keeps that answer in memory for
  at most 2 minutes and passes on only the flights asked for.
- It stops by itself at the end of the term: **12 Nov 2026, 23:59 Swiss time
  (18:59 Moncton time)**. A later stop date set in the Worker (one month's
  extension) moves it without the server console.

The status page, for checking any step below (counts and yes/no answers
only; nothing on it is secret):
<https://fids-proxy.n-leblanc1984.workers.dev/osky/status>, called
`/osky/status` below.

---

## The steps

Who does what: the account holder signs in (Hetzner) and pastes the two
OpenSky secrets (Cloudflare); Claude does all the clicking and checking in the
browser pane, and types the server's address into the Cloudflare form.
Creating or deleting a server or an IP, adding a Worker secret, merging the
switch-on change, and anything else that costs money waits for an explicit
yes from the account holder.

> **Why GitHub, not fids.orionconnected.com/o:** the orionconnected.com zone
> runs Cloudflare Bot Fight Mode, which challenges a data-centre server's
> `curl` (2026-10-18: the relay server's setup was challenged 11 times and
> never ran). GitHub serves the same file with no challenge. The relay
> itself talks to the fids-proxy workers.dev host, which has no zone and no
> Bot Fight Mode.

### 0. Before starting

1. Open <https://raw.githubusercontent.com/liloleblanc/orionconnected/main/stream-server/opensky-relay/install.sh>. It must show plain text whose
   first line is `#!/usr/bin/env bash`, and the text must mention
   `OSKY_RELAY_IPV4`. If it does not, this change is not live yet: wait 10
   minutes and open it again.
2. Wait 10 more minutes after that. GitHub can serve an older copy of the
   relay for a few minutes after a change. (The installer keeps trying for
   about 15 minutes, but there is no reason to lean on that.)
3. Open `/osky/status`. It must show `"relay_pin_set":false` and
   `"relay_registered":false`.

### 1. Hetzner: the server

The account holder signs in to <https://console.hetzner.cloud> in the
browser pane.
Claude then does the rest.

1. Open the `opensky` project (create it with **+ New project** if it is not
   there).
2. **The firewall first**, from the **Firewalls** page in the left menu, not
   from inside the server form: creating a firewall from inside the Create
   Server form loses the whole form. If a firewall named `nothing-in` with no
   inbound rule is already there (from the first attempt), use it as it is
   and skip to 3.
   1. Select **Create Firewall**.
   2. Name it `nothing-in`.
   3. Delete each inbound rule it suggests, until no rule is left.
   4. Select **Create Firewall**.
3. Open **Servers**, then select **Add Server** (Create Server).
4. Location: **Nuremberg**.
5. Image: **Ubuntu 24.04**, not 26.04. Hetzner now offers 26.04 first; the
   relay is tested on 24.04.
6. Type: **Shared vCPU**, **x86**, **CX23**. If CX23 cannot be selected (out
   of stock): **Arm64**, **CAX11**.
7. Networking: leave **Public IPv4** ticked.
8. SSH keys: none. Untick any key that is ticked. Nobody logs in to this
   server.
9. Firewalls: tick `nothing-in` (the existing one; never a second one).
10. Backups: leave off.
11. **Cloud config**: these two lines, exactly. There is nothing secret in
    them and nothing to replace:

    ```
    #!/bin/bash
    curl -fsSL --retry 10 --retry-all-errors --retry-delay 15 -o /root/o https://raw.githubusercontent.com/liloleblanc/orionconnected/main/stream-server/opensky-relay/install.sh && bash /root/o
    ```

    The first line is needed: cloud-init runs the Cloud config only when it
    starts with `#!`. The download is retried if the site or the network
    hiccups at first boot, and the installer runs only once it has arrived
    whole.
12. Name: `opensky-relay`.
13. After an explicit yes, select **Create & Buy now**. Hetzner shows the price
    (about US$7 a month with the IPv4, billed by the hour).
14. **Keep the address.** Open **Primary IPs** in the left menu, open the
    server's IPv4, and turn **Auto delete** off. Then a rebuilt server can be
    given the same address (step 6), so OpenSky's whitelist and the pin stay
    right without any console. (A kept address costs the same small IPv4 fee
    while it exists; step 7 deletes it at the very end.)

### 2. Pin the server's address in the Worker

1. Claude reads the server's **public IPv4** on its Hetzner page (Overview,
   or Primary IPs).
2. After an explicit yes, Claude opens the Cloudflare dashboard at
   **Workers & Pages → fids-proxy → Settings → Variables and Secrets**,
   selects **Add**, type **Secret**, name `OSKY_RELAY_IPV4`, value that
   address exactly (four numbers with dots, nothing else), and deploys it.
   A secret, never a plain variable: a plain variable typed in the dashboard
   is wiped by the next deploy, and the address would have to go in this
   public repository to survive.

### 3. Check that the relay registered

Within about 15 minutes of the server being created (and a minute or two
after the pin):

1. Open `/osky/status`.
2. Check:
   - `"relay_pin_set":true`
   - `"relay_registered":true` (this can only be true for a server at the
     pinned address)
   - `"relay_report"` is there and its `"state"` is `"off"` (OpenSky is not
     switched on yet), with an `"at"` time from the last 10 minutes (the
     report is saved when something in it changes, or every 10 minutes).
3. If `relay_registered` stays `false` 15 minutes after the pin:
   - compare the pin with the address on the server's Hetzner page once
     more (retype it as a secret if it differs);
   - if it is the same, the install did not run. Delete the server (step 7.1
     only, after an explicit yes; keep the Primary IP) and create it again
     from step 1.3, choosing the kept Primary IP under Networking.

### 4. The reply to OpenSky's technical contact

Sent by the account holder from their own mail, with the address from Hetzner
in it:

```
Hello,

Thank you. All OpenSky requests for Orion Connected will come from one
dedicated server with a fixed address:

    IPv4: <the server's IPv4>/32

The Cloudflare Worker never calls OpenSky itself. This server holds the
single OAuth2 client, keeps each answer in memory for at most 2 minutes and
shares it across all screens. It only calls /states/all with one box of at
most 25 square degrees per airport shown, filtered by icao24 when the
aircraft is known and otherwise filtered on the server, so that only the
flights being shown are kept. At most 1,500 calls a day, and it turns
itself off at the end of the term (12 November 2026, 23:59 Swiss time).

Could you whitelist that address?

Best regards,
```

### 5. After signing and paying: the OpenSky secrets, then switching on

**Stop rule.** Never paste the OpenSky secrets, and never switch on, unless
`/osky/status` shows `"relay_pin_set":true` and `"relay_registered":true`
**and** the pin was typed from the address Hetzner shows for `opensky-relay`
today (Claude opens the server's Hetzner page and checks it again right
before). If anything does not match, stop and sort that out first.

1. Claude opens the Cloudflare dashboard at **Workers & Pages → fids-proxy →
   Settings → Variables and Secrets**.
2. The account holder selects **Add**, chooses type **Secret**, and adds:
   - name `OPENSKY_CLIENT_ID`, value the Client ID from the OpenSky account
     page (API client);
   - name `OPENSKY_CLIENT_SECRET`, value the Client secret.

   Both are typed or pasted into the Cloudflare form only, never into a chat,
   a file or this repository.
3. `/osky/status` then shows `"creds_set":true`.
4. Before switching on, Claude checks the Cloudflare plan (**Workers & Pages
   → Plans**, or the account's billing page). Once on, the relay stores one
   position document per OpenSky call (up to 1,500 a day) in the same KV
   namespace as the FR24 budget counters. Workers Paid allows a million KV
   writes a month; Workers Free allows 1,000 a day for the whole account,
   which this would use up (and the FR24 counters would quietly stop being
   saved). On Free, stop and ask first.
5. Claude opens a change that sets `"OPENSKY_ON": "1"` in
   `workers/wrangler.fids-proxy.jsonc`, and merges it only after an explicit
   yes. Before merging, check in the same file that `OSKY_STOP_AT` is still a
   whole date like `2026-11-12T22:59:59Z`: a value that cannot be read stops
   every route (410).
6. After it is merged: the Worker build can take 5 to 10 minutes to go live.
   Then, within about 2 minutes, `/osky/status` shows `"on":true` and the
   relay's state turns from `off` to `idle` (nothing wanted yet) or `ready`.
   It must answer 200, not 410. The relay calls OpenSky only for the boxes
   the boards ask for (`/oskypos`, below); with no gate showing a flight it
   calls nothing.

### 6. If OpenSky extends the term (or moves its start)

Only after OpenSky has signed the written amendment, and **before** the
current stop date is reached (a relay past its stop has turned itself off):

1. Claude opens a change that moves `OSKY_STOP_AT` in
   `workers/wrangler.fids-proxy.jsonc`, by at most 40 days at a time (one
   month is about 30), and `DEFAULT_STOP_AT` in `install.sh` to the same
   date (a rebuilt server starts from it; a test keeps the two equal).
   Check that the new value is a whole date like `2026-12-12T22:59:59Z`
   (23:59:59 Swiss time is 22:59:59Z in winter). Merge after an explicit
   yes.
2. After it is live, `/osky/status` shows the new `"stop_at"`, and within
   about 10 minutes `"relay_report"` shows the same `"stop_at"`: the relay
   took the later date from its heartbeat and saved it. Nothing to do on the
   server. A date more than 40 days later is ignored by the relay (a
   mistyped year never extends it); move it in steps instead.
3. A date moved **earlier** works the same way: the relay stops at it.

If the stop date has already passed: the same change, then (after an
explicit yes) the server is deleted and created again from step 1.3, with the
kept Primary IP chosen under Networking. It starts from the new
`DEFAULT_STOP_AT`, the pin stays right, it registers by itself, and
OpenSky's whitelist still holds.

If `/osky/status` ever answers 410 before the term has ended,
`OSKY_STOP_AT` cannot be read or is too early: fix it in a change. The relay
waits, calling nothing, and carries on once the date is right.

### 7. At the end

1. After an explicit yes, Claude deletes the server in Hetzner: open the
   server, **Delete**. Deleting is what stops the bill.
2. Then **Primary IPs**: delete the kept IPv4 (it was set not to delete
   itself in step 1.14). Do this last.
3. The relay switches itself off at the stop time even if this is forgotten,
   and the Worker answers 410 on every `/osky/` route after its own stop
   date. The `OSKY_RELAY_IPV4` and OpenSky secrets can then be deleted from
   the Worker too.

### Leftovers from the first design (a Cloudflare Tunnel)

Remove these, after an explicit yes:

- **The first server** in the Hetzner `opensky` project (made for the tunnel
  design; its tunnel never connected). Delete it before creating the new one,
  or at least before step 2, so only one server is billed.
- **The inactive tunnel** `opensky-relay` in the Cloudflare dashboard
  (**Zero Trust → Networks → Tunnels**, or **Workers VPC → Tunnels**). Delete
  it, and the VPC service of the same name if one was made. Nothing uses them
  any more.

---

## Moving the relay to another server

- **The same address** (the kept Primary IP): delete the old server, create
  the new one with that Primary IP. It registers by itself with a new relay
  key, which replaces the old one; nothing else changes.
- **A new address**: create the new server, put its address in
  `OSKY_RELAY_IPV4` (step 2), delete the old server and its address, and send
  OpenSky the new address. The new server's registration replaces the old
  record by itself. Nothing in KV has to be deleted by hand.

## How it works

| Piece | What it does |
|---|---|
| `relay.py` | The relay. Python standard library only. A polling client: no listening socket. |
| `install.sh` | Served at `fids.orionconnected.com/o` (worker-entry.js, `STREAM_INSTALLERS`). Safe to run again; keeps the relay key, the stop date and the settings. Installs only the `relay.py` whose SHA-256 it pins. |
| `/etc/opensky-relay/relay-key` | The relay key (`secrets.token_urlsafe(32)`), made once at install, root only, `0600`. systemd hands it to the relay with `LoadCredential`. |
| `/etc/opensky-relay/relay.conf` | Root-owned settings: `STOP_AT`, `DAILY_CAP`, `CACHE_SECONDS`, `HEADING`, `WORKER_URL`. Exactly one `STOP_AT=` line, at the start of the line, or the relay counts itself stopped. |
| `/var/lib/opensky-relay/` | `state.json` (the UTC day, its call count, OpenSky's last wait), `status.json` (counts and states only), `extended` (a later stop date from the Worker) and `stopped` (the stop, once reached). |
| `opensky-relay.service` | The relay, as a throwaway system user (`DynamicUser`), read-only system, IPv4 sockets only, no metadata service, no core dumps. |
| `opensky-relay-stop.timer` | At `STOP_AT` and every hour: turns the relay off once its own stop date (or the later one from the Worker) has passed. |
| crash reports | none: apport is masked and `kernel.core_pattern` is `\|/bin/false`, so a crash never writes the relay's memory (the OpenSky client) to disk. |
| `opensky-status`, `opensky-extend`, `opensky-update` | For the server console, if it is ever needed. Nothing in the steps above uses them. |

**The Worker's side** (`workers/fids-proxy.js`, `handleOsky`; deployed with
`workers/wrangler.fids-proxy.jsonc`), all answering JSON with
`Cache-Control: no-store` and no CORS header:

| Route | Who | What |
|---|---|---|
| `POST /osky/register` | the pinned address only (`OSKY_RELAY_IPV4`; Hetzner's network, IPv4, a JSON body) | stores `{keyHash, ip, at}` in KV `osky:relay`; a new key from the pinned address replaces the old one; 503 `no-pin` while no address is pinned; works while `OPENSKY_ON` is `0` |
| `GET /osky/report` | the relay (address + key) | its counts, for `/osky/status`, saved on a change or every 10 minutes; answers `{on, stop_at}`; works while off |
| `GET /osky/creds` | the relay, `OPENSKY_ON=1` | `{client_id, client_secret}` from the Worker secrets, or 503 `no-key` |
| `GET /osky/wanted` | the relay, `OPENSKY_ON=1` | the boxes and flights the boards want (`oskyWant`), each lapsing after 10 minutes |
| `POST /osky/put` | the relay, `OPENSKY_ON=1`, a JSON body | reduced positions for a wanted box, checked field by field, kept 180 s in KV `osky:pos:<box>` and nowhere else |
| `GET /osky/status` | anyone | counts and yes/no only: on/off, pin set, registered, creds set, stop date, wanted boxes, the relay's last report. Never the address. |

**The boards' side** (v24078): `GET /oskypos?ap=&f=&cs=&hex=&p=` (`handleOskyPos`),
outside `/osky/` because it answers our own pages (the board hosts, by name,
never `*`; any other page gets a bare 403). A gate asks it for its own
flight's position before Flightradar24, and asks Flightradar24 only when it
has nothing. The Worker draws the box itself, around the board's airport
(25 sq deg or less, on a half-degree grid, shared by an airport well inside
another's box), opens a new box only while the relay has room at its pace
(`oskyBoxBudget`: the calls left today over the hours left, from the relay's
report; 2 boxes without one), hands the relay the boxes with a gate's tracked
flight first, and answers one flight, reduced (position, altitude in feet,
speed in knots, the fix's age, its callsign). `{ "on": false }` while
`OPENSKY_ON` is not `1` or after `OSKY_STOP_AT`: the boards then stop asking
for 10 minutes and use Flightradar24. Tests: `tests/opensky-boards.test.js`.

Every locked route needs the caller to be at the pinned address
(`CF-Connecting-IP`, set by Cloudflare), a registration from that address,
and the `X-Relay-Key` header (compared as sha256). A refusal is always the
same `403 {"error":"forbidden"}`. The relay key alone opens nothing (it only
works from the pinned address), so even if Cloudflare's own request logs
ever kept the header, it would be of no use elsewhere. After `OSKY_STOP_AT`
every route answers 410.

**Limits the relay keeps by itself:**

- **Hard stop** at its own stop date: nothing more to OpenSky, not even a
  login, and the relay exits. A missing, unsafe or unclear config counts as
  stopped. The stop is saved the first time it is reached, so a clock set
  back cannot undo it. OpenSky's own clock (its `Date` header, or the data's
  `time`) past the stop stops it too.
- **The Worker's stop date**: an earlier one, or any 410, stops it for now
  (nothing to OpenSky; it keeps asking the Worker, so a corrected date
  resumes it). A later one, by at most 40 days, becomes its own stop date.
- **1,500 calls per UTC day**, paced across the hours (hour *h* of the day may
  have used at most 1500 × (*h* + 1) / 24). The count is saved before every
  call, so a restart cannot reset it, and a clock set back to an earlier day
  does not reset it either.
- **OpenSky's 429** is obeyed (`X-Rate-Limit-Retry-After-Seconds`, or
  `Retry-After`), across restarts too. A refused client or server (401, 403)
  holds every call for 10 minutes; an OpenSky server error, for a minute.
- **Shared answers**: the same box asked again within 120 s (never more) uses
  the earlier answer. Memory only; nothing is archived. The Worker keeps the
  passed-on positions 180 s, so a fresh put always lands before the last one
  lapses.
- **Reduced fields**: `icao24, callsign, lat, lon, baro_altitude,
  geo_altitude, on_ground, velocity, time_position, last_contact`, and
  `true_track` only when `HEADING=1` (0 until OpenSky confirms the heading is
  covered). Only the flights asked for leave the server.
- **IPv4 only**, to OpenSky and to the Worker, so the Worker sees the address
  OpenSky whitelists.
- **Logs**: one line an hour, counts only. Never coordinates, callsigns,
  answers, the relay key or the OpenSky secret.

The licence terms the relay follows: live positions, altitude and speed for
the aircraft of the flights being shown, server-side, one OAuth2 client from a
single server with a shared short-lived cache, small area queries; no
archive; no raw data or API offered onward; "Data: OpenSky Network" on every
map that uses it.

Tests: `tests/opensky-relay.test.js` runs the Worker's routes in-process, and
`relay.py` against the real Worker code behind a loopback server and a fake
OpenSky on 127.0.0.1. Nothing in the tests reaches OpenSky or Cloudflare. The
installer is checked by parsing, by running its config and helper functions
in a sandbox, and statically; it has not been run on a real Ubuntu 24.04
server by the tests.
