# OpenSky relay

OpenSky only answers its paid account from an address it has whitelisted.
Cloudflare Workers have no fixed address, so a small server of our own makes
every OpenSky call from one fixed IPv4 address.

The server only ever calls **out**: to OpenSky, and to the boards' Worker
(`fids-proxy`), which it asks once a minute what the boards want. Nothing
calls in to it, it opens no port, and its firewall lets nothing in. There is
no tunnel and no token for anyone to copy.

- The only secret on the server is the **relay key**. The server makes it
  itself, keeps it root-only, and proves itself to the Worker with it. The
  Worker keeps only its sha256 and the server's address.
- The OpenSky client (ID and secret) lives only in the Worker, as two Worker
  secrets. The relay asks for them and keeps them in memory.
- Nothing goes to OpenSky until the Worker's `OPENSKY_ON` is `1`, which is set
  in a change after the agreement is signed and paid.
- It answers only for the flights on screen, in boxes of at most 25 square
  degrees, at most 1,500 OpenSky calls a day.
- It stops by itself at the end of the term: **12 Nov 2026, 23:59 Swiss time
  (18:59 Moncton time)**, or at the Worker's stop date if that is earlier.

---

## The steps

Who does what: the account holder signs in (Hetzner) and pastes the two
OpenSky secrets (Cloudflare); Claude does all the clicking and checking in the
browser pane. Creating or deleting a server, merging the switch-on change, and
anything else that costs money waits for an explicit yes from the account
holder.

### 0. Before starting

1. Open <https://fids.orionconnected.com/o>. It must show plain text whose
   first line is `#!/usr/bin/env bash`, and the text must mention
   `/osky/status`. If it shows the old installer (it mentions `cloudflared`),
   this change is not live yet: wait 10 minutes and open it again.
2. Wait 10 more minutes after that. GitHub can serve an older copy of the
   relay for a few minutes after a change, and the installer refuses an older
   copy.
3. Open <https://fids-proxy.n-leblanc1984.workers.dev/osky/status>. It must
   show `"relay_registered":false`.

### 1. Hetzner: the server

The account holder signs in to <https://console.hetzner.cloud> in the
browser pane.
Claude then does the rest.

1. Open the `opensky` project (create it with **+ New project** if it is not
   there).
2. **The firewall first**, from the **Firewalls** page in the left menu, not
   from inside the server form: creating a firewall from inside the Create
   Server form loses the whole form.
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
9. Firewalls: tick `nothing-in`.
10. Backups: leave off.
11. **Cloud config**: these two lines, exactly. There is nothing secret in
    them and nothing to replace:

    ```
    #!/bin/bash
    curl -fsSL https://fids.orionconnected.com/o | bash
    ```

    The first line is needed: cloud-init runs the Cloud config only when it
    starts with `#!`. A lone `curl` line would be ignored.
12. Name: `opensky-relay`.
13. After an explicit yes, select **Create & Buy now**. Hetzner shows the price
    (about US$7 a month with the IPv4, billed by the hour).

### 2. Check that the relay registered

About five minutes after the server is created:

1. Open <https://fids-proxy.n-leblanc1984.workers.dev/osky/status>
   (or `curl -s` it). It shows counts only.
2. Check:
   - `"relay_registered": true`
   - `"relay_ip"` shows the first two numbers of the server's IPv4 as
     Hetzner shows it on the server's page (`a.b.x.x`).
   - `"relay_ip_sha256"` is the start of the sha256 of the whole address.
     Compare it with the address Hetzner shows:

     ```
     printf '%s' '<the IPv4 from Hetzner>' | shasum -a 256 | cut -c1-12
     ```

   - `"relay_report"` is there and its `"state"` is `"off"` (OpenSky is not
     switched on yet), with an `"at"` time from the last minute or two.
3. If `relay_registered` stays `false` after 15 minutes, the install did not
   run. Delete the server (step 5, after an explicit yes) and create it again
   from step 1.3, before anything is sent to OpenSky (a new server gets a new
   address).

### 3. The reply to OpenSky's technical contact

Sent by the account holder from their own mail, with the address from Hetzner
in it:

```
Hello,

Thank you. All OpenSky requests for Orion Connected will come from one
dedicated server with a fixed address:

    IPv4: <the server's IPv4>/32

The Cloudflare Worker never calls OpenSky itself. This server holds the
single OAuth2 client, keeps each answer for 2 minutes and shares it across
all screens. It only calls /states/all with a box of at most 25 square
degrees, only for the flights being shown, at most 1,500 calls a day, and it
turns itself off at the end of the term (12 November 2026, 23:59 Swiss
time).

Could you whitelist that address?

Best regards,
```

### 4. After signing and paying: the OpenSky secrets, then switching on

1. Claude opens the Cloudflare dashboard at **Workers & Pages → fids-proxy →
   Settings → Variables and Secrets**.
2. The account holder selects **Add**, chooses type **Secret**, and adds:
   - name `OPENSKY_CLIENT_ID`, value the Client ID from the OpenSky account
     page (API client);
   - name `OPENSKY_CLIENT_SECRET`, value the Client secret.

   Both are typed or pasted into the Cloudflare form only, never into a chat,
   a file or this repository.
3. `/osky/status` then shows `"creds_set": true`.
4. Claude opens a change that sets `"OPENSKY_ON": "1"` in
   `workers/wrangler.fids-proxy.jsonc`, and merges it only after an
   explicit yes. Within a minute of it going live, the relay's state in `/osky/status`
   turns from `off` to `idle` (nothing wanted yet) or `ready`.
   (The boards start asking for flights in a later change; until then the
   relay calls nothing.)

### 5. At the end

1. After an explicit yes, Claude deletes the server in Hetzner: open the server,
   **Delete**. If it asks about the Primary IP, delete that too. Deleting is
   what stops the bill.
2. The relay switches itself off at the stop time even if this is forgotten,
   and the Worker answers 410 on every `/osky/` route after its own stop
   date.

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

## Moving the registration to another server

The Worker accepts one relay. A second registration answers 409 until the
stored one is deleted, so a stray server can never take over. To move it (a
new server, a new address):

1. Delete the old server first.
2. Delete the registration, either way:
   - `npx wrangler kv key delete "osky:relay" --binding FIDS_LIVE_FLIGHTS --config workers/wrangler.fids-proxy.jsonc --remote`
   - or the Cloudflare dashboard: **Storage & Databases → KV →** the
     `FIDS_LIVE_FLIGHTS` namespace **→** key `osky:relay` **→ Delete**.
3. The new server registers by itself within a minute of starting (a relay
   that was refused asks again every 10 minutes).
4. Send OpenSky the new address.

## If OpenSky extends the term

Only after OpenSky has signed the written extension:

1. Worker: a change that moves `OSKY_STOP_AT` in
   `workers/wrangler.fids-proxy.jsonc`.
2. Server: its own stop date in `/etc/opensky-relay/relay.conf` moves only with
   `opensky-extend YYYY-MM-DD`, typed on the server, which needs the Hetzner
   console. The relay stops at the earlier of the two dates.

## How it works

| Piece | What it does |
|---|---|
| `relay.py` | The relay. Python standard library only. A polling client: no listening socket. |
| `install.sh` | Served at `fids.orionconnected.com/o` (worker-entry.js, `STREAM_INSTALLERS`). Safe to run again; keeps the relay key, the stop date and the settings. Installs only the `relay.py` whose SHA-256 it pins. |
| `/etc/opensky-relay/relay-key` | The relay key (`secrets.token_urlsafe(32)`), made once at install, root only, `0600`. systemd hands it to the relay with `LoadCredential`. |
| `/etc/opensky-relay/relay.conf` | Root-owned settings: `STOP_AT`, `DAILY_CAP`, `CACHE_SECONDS`, `HEADING`, `WORKER_URL`. Exactly one `STOP_AT=` line, at the start of the line, or the relay counts itself stopped. |
| `/var/lib/opensky-relay/` | `state.json` (the UTC day, its call count, OpenSky's last wait), `status.json` (counts and states only) and `stopped` (the stop, once reached). |
| `opensky-relay.service` | The relay, as a throwaway system user (`DynamicUser`), read-only system, IPv4 sockets only, no metadata service, no core dumps. |
| `opensky-relay-stop.timer` | Turns the relay off at `STOP_AT`. |
| `opensky-status`, `opensky-extend`, `opensky-update` | For the server console, if it is ever needed. Nothing in the steps above uses them. |

**The Worker's side** (`workers/fids-proxy.js`, `handleOsky`), all answering
JSON with `Cache-Control: no-store` and no CORS header:

| Route | Who | What |
|---|---|---|
| `POST /osky/register` | the first caller from Hetzner (AS24940), IPv4 only | stores `{keyHash, ip, at}` in KV `osky:relay`; 409 once one is stored; works while `OPENSKY_ON` is `0` |
| `GET /osky/report` | the relay (key + address) | its counts, for `/osky/status`; answers `{on, stop_at}`; works while off |
| `GET /osky/creds` | the relay, `OPENSKY_ON=1` | `{client_id, client_secret}` from the Worker secrets, or 503 `no-key` |
| `GET /osky/wanted` | the relay, `OPENSKY_ON=1` | the boxes and flights the boards want (`oskyWant`), each lapsing after 10 minutes |
| `POST /osky/put` | the relay, `OPENSKY_ON=1` | reduced positions for a wanted box, checked field by field, kept 120 s in KV `osky:pos:<box>` and nowhere else |
| `GET /osky/status` | anyone | counts only: on/off, registered, the address as `a.b.x.x` plus a sha256 prefix, creds set, stop date, puts today, the relay's last report |

Every locked route needs both the `X-Relay-Key` header (compared as sha256)
and the registered address (`CF-Connecting-IP`, set by Cloudflare). A refusal
is always the same `403 {"error":"forbidden"}`. After `OSKY_STOP_AT` every
route answers 410.

**Limits the relay keeps by itself:**

- **Hard stop** at the earlier of its own `STOP_AT` and the Worker's stop
  date: nothing more to OpenSky, not even a login, and the relay exits. A
  missing, unsafe or unclear config counts as stopped. The stop is saved the
  first time it is reached, so a clock set back cannot undo it; only a later
  `STOP_AT` (`opensky-extend`) lifts it. OpenSky's own clock (its `Date`
  header, or the data's `time`) past the stop, or a 410 from the Worker,
  stops it too.
- **1,500 calls per UTC day**, paced across the hours (hour *h* of the day may
  have used at most 1500 × (*h* + 1) / 24). The count is saved before every
  call, so a restart cannot reset it, and a clock set back to an earlier day
  does not reset it either.
- **OpenSky's 429** is obeyed (`X-Rate-Limit-Retry-After-Seconds`, or
  `Retry-After`), across restarts too. A refused client or server (401, 403)
  holds every call for 10 minutes; an OpenSky server error, for a minute.
- **Shared answers**: the same box asked again within 120 s (never more than
  300 s) uses the earlier answer. Memory only; nothing is archived.
- **Reduced fields**: `icao24, callsign, lat, lon, baro_altitude,
  geo_altitude, on_ground, velocity, time_position, last_contact`, and
  `true_track` only when `HEADING=1` (0 until OpenSky confirms the heading is
  covered). Only the flights asked for.
- **IPv4 only**, to OpenSky and to the Worker, so the Worker sees the address
  OpenSky whitelists.
- **Logs**: one line an hour, counts only. Never coordinates, callsigns,
  answers, the relay key or the OpenSky secret.

The licence terms the relay follows: live positions, altitude and speed for
the aircraft of the flights being shown, server-side, one OAuth2 client from a
single server with a shared short-lived cache; no archive; no raw data or API
offered onward; "Data: OpenSky Network" on every map that uses it.

Tests: `tests/opensky-relay.test.js` runs the Worker's routes in-process, and
`relay.py` against the real Worker code behind a loopback server and a fake
OpenSky on 127.0.0.1. Nothing in the tests reaches OpenSky or Cloudflare.
