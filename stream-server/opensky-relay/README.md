# OpenSky relay

OpenSky only answers its paid account from an address it has whitelisted.
Cloudflare Workers have no fixed address, so a small server of our own makes
every OpenSky call from one fixed IPv4 address, and the boards' Worker asks
that server through a Cloudflare Tunnel.

- The server lets nothing in. The tunnel only dials out to Cloudflare.
- The relay calls nothing until the key is typed on the server with
  `opensky-key`, after the agreement is signed and paid.
- It answers only for the flights on screen: every request must name the
  flight (its callsign or icao24), and carry the relay's caller key.
- It stops by itself at the end of the term: **12 Nov 2026, 23:59 Swiss time
  (18:59 Moncton time)**.

Do the steps in this order. The tunnel comes before the server because its
install line goes into the server when the server is created.

> **Never add anything else to this tunnel.** No **Public hostname**, no
> **Private network** route, and no Worker binding to the whole tunnel (a
> "VPC Network"). The `opensky-relay` VPC Service in C is the only way in.
> Anything more would offer OpenSky's data onward, which the licence forbids.

---

## 0. Before you start

1. Open <https://fids.orionconnected.com/o> in your browser.
2. Check that it shows a page of plain text whose first line is
   `#!/usr/bin/env bash`.
   If it shows an error instead, this change is not live yet. Wait 10 minutes
   and open it again.
3. Once it shows the text, wait 10 more minutes before step B1. GitHub can
   serve an older copy of the relay for a few minutes after a change, and the
   installer refuses an older copy.

## A. Cloudflare: the tunnel

1. Open the Cloudflare dashboard at **Workers VPC**:
   <https://dash.cloudflare.com/?to=/:account/workers/vpc/tunnels>
2. Select the **Tunnels** tab.
3. Select **Create**.
4. Name it `opensky-relay`.
5. Select **Save tunnel**.
6. If it asks for an operating system, choose **Debian**. Any choice works:
   only the last line it shows is used.
7. Copy the one line that starts with `sudo cloudflared service install`.
   The long part at its end is the tunnel's token: treat it like a password.
   Paste it only into Hetzner (step B14), never into a chat or this repository.
8. Leave that page open. It shows **Connected** once the server is up.

## B. Hetzner: the server

1. Open <https://console.hetzner.cloud>.
2. Select **+ New project**.
3. Name it `opensky`.
4. Select **Add project**.
5. Open the `opensky` project.
6. Select **Create Server**.
7. Location: **Nuremberg**.
8. Image: **Ubuntu 24.04**.
9. Type: **Shared vCPU**, **x86**, **CX23**.
   If CX23 cannot be selected (out of stock): **Arm64**, **CAX11**.
10. Networking: leave **Public IPv4** ticked.
11. SSH keys: untick every key that is ticked, so none is selected.
    With a key selected, Hetzner does not email a root password, and the
    console login in D needs that password.
12. Firewalls: select **Create Firewall**.
    1. Name it `nothing-in`.
    2. Delete each rule it suggests (select the bin next to it), until no
       rule is left.
    3. Select **Create Firewall**.
    4. Back on the server page, tick `nothing-in`.
13. Backups: leave off.
14. **Cloud config**: paste these four lines. The fourth one is the line you
    copied in A7, pasted whole in place of the example:

    ```
    #!/bin/bash
    curl -fsSL --retry 5 -o /root/o https://fids.orionconnected.com/o
    bash /root/o || exit 1
    sudo cloudflared service install <the token from A7>
    ```

15. Name: `opensky-relay`.
16. Select **Create & Buy now**.
17. Wait ten minutes. The Cloudflare page from A8 must show the tunnel as
    **Connected** (Healthy).

The tunnel connects only after the relay has installed completely, so
**Connected** means the server is ready. If the tunnel is still not
**Connected** after fifteen minutes: delete the server (J1) and create it
again (B6 to B17). Do this before sending the address to OpenSky, because a
new server gets a new address. The tunnel token is too long to type in the
web console, so there is no point repairing it there.

## C. Cloudflare: the VPC Service

1. Back on **Workers VPC**, select the **VPC Services** tab.
2. Select **Create**.
3. Service name: `opensky-relay`.
4. Tunnel: `opensky-relay`.
5. Host or IP address: `127.0.0.1`. Type the numbers, not the word
   localhost: the relay answers on IPv4 only.
6. Ports: select **Provide port values**.
7. HTTP port: `8787`.
8. HTTPS port: leave the box empty, so only plain HTTP inside the tunnel
   works. (If the page will not accept an empty box, leave what it had:
   nothing answers there.)
9. DNS Resolver, if it is shown: leave **Use tunnel as resolver**. It does not
   matter for an IP address.
10. Select **Create service**.
11. Copy the **Service ID** and send it back. It is an ID, not a secret. The
    next change connects the boards to it.

## D. Log in to the server console

1. In Hetzner, open the `opensky` project, then the `opensky-relay` server.
2. Select **>_** (Console). A black window opens.
3. At `login:`, type `root` and press Enter.
4. At `Password:`, type the password from Hetzner's email and press Enter.
   Nothing shows while you type; that is normal.
5. The first time only, it asks for the current password again: type the
   emailed password once more and press Enter.
6. Then it asks for a new password twice: choose one, type it, Enter, type it
   again, Enter. Keep it in your Passwords app. Every later login uses it.

## E. Read the server's IPv4

1. In Hetzner, on the server's page, the **IPv4** is at the top.
2. In the console (D), type `opensky-status` and press Enter.
3. Check that its **Public IPv4** line shows the same address.

Send only the IPv4, as `/32`. The relay never uses IPv6.

## F. The reply to OpenSky's technical contact

Put the address from E in the second paragraph and add your name.

```
Hello,

Thank you. All OpenSky requests for Orion Connected will come from one
dedicated server with a fixed address:

    IPv4: <the address from step E>/32

The Cloudflare Worker never calls OpenSky itself. It will ask this server,
which holds the single OAuth2 client, keeps each answer for 2 minutes and
shares it across all screens. It only calls /states/all with a box of at
most 25 square degrees, only for the flights being shown, at most 1,500
calls a day, and it turns itself off at the end of the term
(12 November 2026, 23:59 Swiss time).

Could you whitelist that address?

Best regards,
```

## G. After signing and paying: the key

1. Log in to the console (D1 to D4, with your new password).
2. Type `opensky-key` and press Enter.
3. Type the **Client ID** from your OpenSky account page (API client) and
   press Enter.
4. Type the **Client secret** and press Enter. Nothing shows while you type;
   that is normal.
5. It shows how many characters each one has and their last 4 characters.
   Compare them with your OpenSky account page.
6. It shows `OpenSky login: OK`.
   - If it says `try again`, the ID or the secret was mistyped: go back to G2.
   - If it says `refused (answer 403)`, the key is saved but OpenSky has not
     whitelisted this server yet: ask OpenSky.
7. Type `opensky-status`. It should show Relay **ON**, Key set **yes** and
   Tunnel **active**.

The next change, which connects the boards, will also ask you to type the
relay's caller key into Cloudflare. `opensky-caller-key` shows it. There is
nothing to do with it before then.

## H. If OpenSky extends the term

Only after OpenSky has signed the written extension:

1. Log in to the console (D1 to D4).
2. Type `opensky-extend 2026-12-12`, with the new last day, and press Enter.
3. Check the two dates it shows.
4. Type `yes` and press Enter.

It refuses a date more than 40 days after the current stop date, which
catches a mistyped year.

## I. Repair or update the relay

If `opensky-status` shows something wrong, or a later change asks for it:

1. Log in to the console (D1 to D4).
2. Type `opensky-update` and press Enter. It downloads the installer again
   over https and runs it. It keeps the key, the caller key, the stop date
   and the tunnel.
3. Type `opensky-status` and press Enter.

If `opensky-update` answers `command not found`, the first install never
started. Type these two lines instead:

```
wget -O o https://fids.orionconnected.com/o
bash o
```

To read the relay's own log (one line an hour, counts only), type
`journalctl -u opensky-relay` and press `q` to leave it.

## J. At the end

1. In Hetzner, open the server and select **Delete**. If it asks about the
   Primary IP, delete that too. Deleting is what stops the bill.
2. In Cloudflare **Workers VPC**, delete the `opensky-relay` VPC Service.
3. Then delete the `opensky-relay` tunnel.

The relay switches itself off at the stop time even if this is forgotten.

---

## How it works

| Piece | What it does |
|---|---|
| `relay.py` | The relay. Python standard library only. Listens on `127.0.0.1:8787`. |
| `install.sh` | Served at `fids.orionconnected.com/o` (worker-entry.js, `STREAM_INSTALLERS`). Safe to run again; keeps the key, the caller key and the stop date. Installs only the `relay.py` whose SHA-256 it pins. |
| `/etc/opensky-relay/relay.conf` | Root-owned settings: `STOP_AT`, `DAILY_CAP`, `CACHE_SECONDS`, `HEADING`. Exactly one `STOP_AT=` line, at the start of the line, or the relay counts itself stopped. |
| `/etc/opensky-relay/credentials` | The OAuth client (`client_id`, `client_secret`), root only, `0600`. systemd hands it to the relay with `LoadCredential`. |
| `/etc/opensky-relay/caller-key` | The key the boards' Worker must send as `X-Relay-Key`. Made at the first install, root only, `0600`, handed over with `LoadCredential`. |
| `/var/lib/opensky-relay/` | `state.json` (the UTC day, its call count, OpenSky's last wait) and `stopped` (the stop, once reached). |
| `opensky-relay.service` | The relay, as a throwaway system user (`DynamicUser`), read-only system, IPv4 sockets only, no metadata service, no core dumps, cloudflared's files out of reach. |
| `opensky-relay-stop.timer` | Turns the relay off at `STOP_AT`. |
| `opensky-key`, `opensky-status`, `opensky-extend`, `opensky-caller-key`, `opensky-update` | The commands above. |

**Endpoints** (only through the tunnel):

- `GET /states?lamin=&lomin=&lamax=&lomax=&callsign=` (or `&icao24=`):
  needs the `X-Relay-Key` header (403 without it), one box of at most 25
  square degrees (400 without one), and at least one callsign or icao24, at
  most 4 in all (400 `filter-required` without one). Only the aircraft named
  come back, so the relay never hands out the surrounding traffic. Each comes
  back with `icao24, callsign, lat, lon, baro_altitude, geo_altitude,
  on_ground, velocity, time_position, last_contact`, and `true_track` only
  when `HEADING=1` (0 until OpenSky confirms the heading is covered).
- `GET /health`: counts, the stop date, whether the keys are set, OpenSky's
  last answer, the public IPv4. No secrets, no positions.

**Limits it keeps by itself:**

- **Hard stop** at `STOP_AT`: from then on `/states` answers 410 and nothing
  goes to OpenSky, not even a login. A missing, unsafe or unclear config
  counts as stopped. The stop is saved the first time it is reached, so a
  clock set back cannot undo it; only `opensky-extend` lifts it. OpenSky's own
  clock (its `Date` header, or the data's `time`) past `STOP_AT` stops it too.
- **1,500 calls per UTC day**, paced across the hours (hour *h* of the day may
  have used at most 1500 × (*h* + 1) / 24). The count is saved before every
  call, so a restart cannot reset it, and a clock set back to an earlier day
  does not reset it either. Over the cap: 429.
- **OpenSky's 429** is obeyed (`X-Rate-Limit-Retry-After-Seconds`, or
  `Retry-After`), across restarts too. A refused key or server (401, 403)
  holds every call for 10 minutes; an OpenSky server error, for a minute.
- **Memory cache only**, 120 s (never more than 300 s); an expired answer is
  dropped within a second. Requests for the same box share one call,
  whatever flight they ask about. Nothing is archived.
- **IPv4 only**, so the whitelisted address always matches.
- **Logs**: one line an hour, counts only. Never coordinates, callsigns,
  answers or the secret.

The licence terms the relay follows: live positions, altitude and speed for
the aircraft of the flights being shown, server-side, one OAuth2 client from a
single server with a shared short-lived cache; no archive; no raw data or API
offered onward; "Data: OpenSky Network" on every map that uses it.

Tests: `tests/opensky-relay.test.js` runs `relay.py` against a fake OpenSky on
127.0.0.1. Nothing in the tests reaches OpenSky.
