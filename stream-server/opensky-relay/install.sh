#!/usr/bin/env bash
#
# OpenSky relay: installer for its own small Ubuntu 24.04 server (Hetzner).
#
# The relay makes every OpenSky call from this one server, so OpenSky can
# whitelist one fixed IPv4 address. The boards' Worker reaches it only
# through a Cloudflare Tunnel (cloudflared) and a Workers VPC Service; the
# relay listens on 127.0.0.1:8787 and the firewall lets nothing in.
#
# Three ways to run it, all as root:
#
#   1. Hetzner's Cloud config box, at server creation (cloud-init, no terminal):
#        #!/bin/bash
#        curl -fsSL --retry 5 -o /root/o https://fids.orionconnected.com/o
#        bash /root/o || exit 1
#        sudo cloudflared service install <the token Cloudflare shows>
#      The tunnel line runs only once this installer has finished, so a
#      tunnel that shows Connected means the relay is installed.
#
#   2. On the server, to repair or update it (downloads this file again over
#      https and runs it):
#        opensky-update
#
#   3. Typed in the Hetzner web console, only when nothing is installed yet:
#        wget -O o https://fids.orionconnected.com/o
#        bash o
#
# Safe to run again: it keeps the saved key, the caller key, the stop date and
# the tunnel. It never calls OpenSky. Nothing calls OpenSky until opensky-key
# is typed on the server, after the agreement is signed and paid.
#
# What it sets up:
#   - cloudflared, from Cloudflare's own apt repository (pkg.cloudflare.com)
#   - /opt/opensky-relay/relay.py (Python standard library only), checked
#     against the SHA-256 pinned below
#   - opensky-relay.service: a hardened systemd unit (DynamicUser,
#     ProtectSystem=strict, NoNewPrivileges, IPv4 sockets only, no metadata
#     service, no core dumps, cloudflared's files out of sight); the OAuth
#     client and the caller key arrive through LoadCredential from root-only
#     0600 files in /etc/opensky-relay/
#   - opensky-relay-stop.timer: turns the relay off at the end of the term
#   - ufw: deny all incoming (the Hetzner web console is out-of-band and
#     keeps working)
#   - the commands opensky-key, opensky-status, opensky-extend,
#     opensky-caller-key and opensky-update
#
set -eEuo pipefail
trap 'echo "OpenSky relay install stopped at line $LINENO. Nothing is lost: type opensky-update to try again." >&2' ERR

# Everything runs inside main(), called on the last line. When this file is
# piped into bash, bash reads the whole function before running any of it, so
# a cut-off download runs nothing and no command can swallow the rest of the
# script from stdin.
main() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run this as root (log in as root in the Hetzner console)."
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive

  # The original licence term ends 12 Nov 2026 23:59:59 Swiss time (CET).
  # Used only when no stop date is saved yet; a saved one is never changed
  # here. Only opensky-extend, typed on the server, moves it.
  local DEFAULT_STOP_AT="2026-11-12T22:59:59Z"
  local RELAY_URL="https://raw.githubusercontent.com/liloleblanc/orionconnected/main/stream-server/opensky-relay/relay.py"
  # The relay.py this installer was written with (tests/opensky-relay.test.js
  # fails when it drifts). A download that does not match is never installed.
  local RELAY_SHA256="aa27b70829bc53d7b1d4a950cbf8999cbf7f080af46bbc1ed893e3ef834cc47c"

  install -d -m 0755 -o root -g root /usr/local/lib/opensky-relay
  write_common
  # shellcheck source=/dev/null
  . /usr/local/lib/opensky-relay/common.sh
  # the commands first, so opensky-update is there even if a later step fails
  write_commands

  echo "== OpenSky relay: packages"
  if ! command -v curl >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
    apt_get update
    apt_get install curl ca-certificates python3
  fi
  install_cloudflared

  echo "== OpenSky relay: the relay"
  install_relay "$RELAY_URL" "$RELAY_SHA256"

  echo "== OpenSky relay: settings"
  install -d -m 0755 -o root -g root "$OSKY_ETC"
  write_config "$DEFAULT_STOP_AT"
  if [ ! -f "$OSKY_CRED" ]; then
    # no key yet: the relay starts, knows no key, and calls nothing
    install -m 0600 -o root -g root /dev/null "$OSKY_CRED"
    echo "# no key yet: type opensky-key" > "$OSKY_CRED"
  fi
  chown root:root "$OSKY_CRED"
  chmod 0600 "$OSKY_CRED"
  write_caller_key

  echo "== OpenSky relay: services"
  write_units
  systemctl daemon-reload
  systemctl enable opensky-relay-stop.timer >/dev/null
  systemctl restart opensky-relay-stop.timer
  if "$OSKY_PY" -I "$OSKY_RELAY" --stopped; then
    systemctl disable --now opensky-relay.service >/dev/null 2>&1 || true
    TERM_ENDED=1
  else
    systemctl enable opensky-relay.service >/dev/null
    systemctl restart opensky-relay.service
    TERM_ENDED=0
  fi

  echo "== OpenSky relay: firewall"
  if command -v ufw >/dev/null 2>&1; then
    # Nothing is allowed in, not even SSH: the tunnel only dials out, and the
    # Hetzner web console does not go through the network at all.
    ufw default deny incoming >/dev/null
    ufw default allow outgoing >/dev/null
    ufw --force enable >/dev/null
    echo "ufw: incoming denied, outgoing allowed"
  else
    echo "ufw is not installed; the Hetzner firewall (no inbound rules) still blocks everything"
  fi

  local ip
  ip="$(osky_public_ipv4 || true)"
  if [ -n "$ip" ]; then
    printf '%s\n' "$ip" > "$OSKY_IP_FILE"
    chmod 0644 "$OSKY_IP_FILE"
  fi
  print_summary "$ip"
}

apt_get() {
  # DPkg::Lock::Timeout waits for dpkg's own lock only. apt-get update takes
  # the package-lists lock, which it does not wait for (Debian bug #1069167),
  # so a console re-run while apt-daily is busy would fail at once: retry.
  local i
  for i in $(seq 1 30); do
    if apt-get -o DPkg::Lock::Timeout=600 -y -q "$@" </dev/null; then
      return 0
    fi
    echo "apt-get $1 did not work (apt may be busy); trying again in 10 s ($i of 30)"
    sleep 10
  done
  apt-get -o DPkg::Lock::Timeout=600 -y -q "$@" </dev/null
}

install_cloudflared() {
  # Cloudflare's documented apt setup (developers.cloudflare.com/tunnel/downloads/)
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL --retry 3 https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg.tmp
  mv -f /usr/share/keyrings/cloudflare-main.gpg.tmp /usr/share/keyrings/cloudflare-main.gpg
  chmod 0644 /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    > /etc/apt/sources.list.d/cloudflared.list
  apt_get update
  apt_get install cloudflared
  cloudflared --version || true
}

install_relay() {
  local url="$1" want="$2" here="" tmp got
  if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  fi
  tmp="$(mktemp)"
  # a repository checkout (bash stream-server/opensky-relay/install.sh) uses
  # its own relay.py; anything else downloads the one on main
  if [ -n "$here" ] && [ "$(basename "$here")" = opensky-relay ] && [ -f "$here/relay.py" ]; then
    cp "$here/relay.py" "$tmp"
  else
    curl -fsSL --retry 3 "$url" -o "$tmp"
  fi
  # only the exact relay.py this installer was written with is installed:
  # never a cut-off download, an error page or a newer, unchecked file
  got="$(sha256sum "$tmp" | cut -d ' ' -f 1)"
  if [ "$got" != "$want" ]; then
    rm -f "$tmp"
    echo "The relay download does not match this installer, so nothing was changed."
    echo "GitHub can serve an old copy for a few minutes after a change."
    echo "Wait 10 minutes, then type: opensky-update"
    exit 1
  fi
  install -d -m 0755 -o root -g root /opt/opensky-relay
  install -m 0644 -o root -g root "$tmp" "$OSKY_RELAY"
  rm -f "$tmp"
}

write_config() {
  local default_stop="$1" stop=""
  if [ -f "$OSKY_CONF" ]; then
    stop="$(osky_stop_at)"
  fi
  if [ -f "$OSKY_CONF" ] && osky_valid_stop "$stop"; then
    : # keep the saved settings and the saved stop date as they are
  elif [ -f "$OSKY_CONF" ]; then
    # no clear stop date (missing, or written twice): the original one, once
    local tmp
    tmp="$(mktemp "$OSKY_ETC/.relay.conf.XXXXXX")"
    osky_conf_without_stop > "$tmp"
    printf 'STOP_AT=%s\n' "$default_stop" >> "$tmp"
    mv -f "$tmp" "$OSKY_CONF"
  else
    cat > "$OSKY_CONF" <<EOF
# OpenSky relay settings. Root only; read by $OSKY_RELAY.
# STOP_AT is the end of the licence term, in UTC. Change it only with
#     opensky-extend YYYY-MM-DD
STOP_AT=$default_stop
# Upstream calls per UTC day, paced across the hours (1500 at most).
DAILY_CAP=1500
# Seconds an answer is kept in memory (300 at most).
CACHE_SECONDS=120
# 1 = also return the heading (true_track). 0 until OpenSky confirms it is covered.
HEADING=0
EOF
  fi
  chown root:root "$OSKY_CONF"
  chmod 0644 "$OSKY_CONF"
  osky_write_timer "$(osky_stop_at)"
}

write_caller_key() {
  # The key the boards' Worker sends as X-Relay-Key. Made here once, kept on
  # every re-run (the Worker knows this one). opensky-caller-key shows it.
  local k=""
  if [ -f "$OSKY_CALLER" ]; then
    k="$(tr -cd 'a-z0-9' < "$OSKY_CALLER" || true)"
  fi
  if [ "${#k}" -lt 20 ]; then
    local tmp
    tmp="$(mktemp "$OSKY_ETC/.caller-key.XXXXXX")"
    "$OSKY_PY" -I -c 'import secrets; a = "abcdefghjkmnpqrstuvwxyz23456789"; k = "".join(secrets.choice(a) for _ in range(24)); print("-".join(k[i:i + 4] for i in range(0, 24, 4)))' > "$tmp"
    mv -f "$tmp" "$OSKY_CALLER"
  fi
  chown root:root "$OSKY_CALLER"
  chmod 0600 "$OSKY_CALLER"
}

write_common() {
  cat > /usr/local/lib/opensky-relay/common.sh <<'EOF'
# Shared by install.sh and the opensky-* commands.
OSKY_ETC=/etc/opensky-relay
OSKY_CONF=$OSKY_ETC/relay.conf
OSKY_CRED=$OSKY_ETC/credentials
OSKY_CALLER=$OSKY_ETC/caller-key
OSKY_IP_FILE=$OSKY_ETC/public-ipv4
OSKY_RELAY=/opt/opensky-relay/relay.py
OSKY_PY=/usr/bin/python3
OSKY_TIMER=/etc/systemd/system/opensky-relay-stop.timer
OSKY_STATE_DIR=/var/lib/opensky-relay
OSKY_STATE=$OSKY_STATE_DIR/state.json
OSKY_STOP_MARKER=$OSKY_STATE_DIR/stopped
OSKY_INSTALLER_URL=https://fids.orionconnected.com/o

# The saved STOP_AT, read exactly the way relay.py reads it: one line that
# starts with STOP_AT=, and no other line that could be read as one (lower
# case, a leading space, spaces around =). Anything else prints nothing,
# and the relay counts that as stopped.
osky_stop_at() {
  local exact any
  exact="$(grep -c '^STOP_AT=' "$OSKY_CONF" 2>/dev/null || true)"
  any="$(grep -ciE '^[[:space:]]*stop_at[[:space:]]*=' "$OSKY_CONF" 2>/dev/null || true)"
  if [ "$exact" = 1 ] && [ "$any" = 1 ]; then
    sed -n 's/^STOP_AT=//p' "$OSKY_CONF" 2>/dev/null \
      | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"*//' -e 's/"*$//' -e "s/^'*//" -e "s/'*\$//"
  fi
}

# relay.conf without any line that could be read as a STOP_AT line
osky_conf_without_stop() {
  grep -viE '^[[:space:]]*stop_at[[:space:]]*=' "$OSKY_CONF" 2>/dev/null || true
}

osky_valid_stop() {
  [[ "${1:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]
}

# $1 = YYYY-MM-DD; prints 23:59:59 Swiss time on that day, in UTC (GNU date)
osky_swiss_day_end() {
  date -u -d "TZ=\"Europe/Zurich\" $1 23:59:59" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true
}

# $1 = a STOP_AT value; prints it in Swiss time and in Moncton time
osky_show_time() {
  local e=""
  if osky_valid_stop "${1:-}"; then
    e="$(date -u -d "$1" +%s 2>/dev/null || true)"
  fi
  if [ -z "$e" ]; then
    echo "   (no stop date saved)"
    return 0
  fi
  printf '   %s  (Swiss time)\n' "$(TZ=Europe/Zurich date -d "@$e" '+%a %d %b %Y, %H:%M:%S %Z')"
  printf '   %s  (Moncton time)\n' "$(TZ=America/Moncton date -d "@$e" '+%a %d %b %Y, %H:%M:%S %Z')"
}

# the timer that turns the relay off at STOP_AT ($1)
osky_write_timer() {
  local when="${1%Z}"
  when="${when/T/ } UTC"
  cat > "$OSKY_TIMER" <<UNIT
[Unit]
Description=Turn the OpenSky relay off at the end of the licence term

[Timer]
OnCalendar=$when
Persistent=true
AccuracySec=1s
Unit=opensky-relay-stop.service

[Install]
WantedBy=timers.target
UNIT
}

# this server's public IPv4, as Cloudflare sees it (never asks OpenSky)
osky_public_ipv4() {
  local ip o
  ip="$(curl -4 -fsS --max-time 10 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p' | head -n 1 || true)"
  [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || return 1
  for o in ${ip//./ }; do
    [ "$((10#$o))" -le 255 ] || return 1
  done
  printf '%s\n' "$ip"
}
EOF
  chmod 0644 /usr/local/lib/opensky-relay/common.sh
}

write_units() {
  cat > /etc/systemd/system/opensky-relay.service <<'EOF'
[Unit]
Description=OpenSky relay (one fixed IPv4 for OpenSky; 127.0.0.1:8787 only)
After=network-online.target
Wants=network-online.target
ConditionPathExists=/opt/opensky-relay/relay.py

[Service]
Type=simple
ExecStart=/usr/bin/python3 -I /opt/opensky-relay/relay.py
Environment=OSKY_PRODUCTION=1
UnsetEnvironment=OSKY_TEST_MODE OSKY_TEST_TOKEN_URL OSKY_TEST_API_BASE OSKY_TEST_PORT OSKY_TEST_CONFIG_DIR OSKY_TEST_CLOCK_FILE
# the OAuth client (client_id + client_secret) and the caller key, from
# root-only 0600 files
LoadCredential=credentials:/etc/opensky-relay/credentials
LoadCredential=caller-key:/etc/opensky-relay/caller-key
DynamicUser=yes
StateDirectory=opensky-relay
StateDirectoryMode=0700
UMask=0077
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RemoveIPC=yes
# IPv4 only: an IPv6 socket cannot even be opened
RestrictAddressFamilies=AF_INET AF_UNIX AF_NETLINK
# no metadata service: Hetzner serves the Cloud config (with the tunnel
# token) to any local process at its link-local metadata address. Loopback
# stays open: the relay listens there.
IPAddressDeny=link-local
# cloudflared's token sits in its unit's ExecStart and in cloud-init's
# copies of the Cloud config, and the system bus would read ExecStart out
# too: none of them is the relay's business
InaccessiblePaths=-/etc/systemd/system/cloudflared.service -/etc/cloudflared -/var/lib/cloud -/var/log/cloud-init.log -/var/log/cloud-init-output.log -/run/dbus
# a crash never writes the secret or OpenSky's data to disk
LimitCORE=0
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
MemoryMax=256M
TasksMax=128
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/opensky-relay-stop.service <<'EOF'
[Unit]
Description=Turn the OpenSky relay off (end of the licence term)

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl disable --now opensky-relay.service
EOF
}

write_commands() {
  cat > /usr/local/bin/opensky-key <<'EOF'
#!/usr/bin/env bash
# opensky-key: save the OpenSky API client on this server, restart the relay
# and test ONE login (no data call). The secret is read hidden and kept in
# /etc/opensky-relay/credentials (root only, 0600); systemd hands it to the
# relay. Only its length and its last 4 characters are ever shown.
set -euo pipefail
. /usr/local/lib/opensky-relay/common.sh
if [ "$(id -u)" -ne 0 ]; then echo "Log in as root first, then type opensky-key."; exit 1; fi
if [ ! -t 0 ]; then echo "Type opensky-key in the server console."; exit 1; fi
if [ ! -f "$OSKY_RELAY" ]; then echo "The relay is not installed. Type opensky-update first."; exit 1; fi
if "$OSKY_PY" -I "$OSKY_RELAY" --stopped; then
  echo "The licence term has ended, so no key was saved."
  echo "After OpenSky signs an extension: opensky-extend YYYY-MM-DD"
  exit 1
fi
echo "Your OpenSky API client (OpenSky account page, API client)."
IFS= read -r -p "Client ID: " cid
IFS= read -r -s -p "Client secret (nothing shows while you type): " secret
echo
cid="${cid//[[:space:]]/}"
secret="${secret//[[:space:]]/}"
if [ -z "$cid" ] || [ -z "$secret" ]; then
  echo "Nothing saved: both are needed. Type opensky-key to try again."
  exit 1
fi
umask 077
tmp="$(mktemp "$OSKY_ETC/.credentials.XXXXXX")"
printf 'client_id=%s\nclient_secret=%s\n' "$cid" "$secret" > "$tmp"
chown root:root "$tmp"
chmod 0600 "$tmp"
mv -f "$tmp" "$OSKY_CRED"
echo "Saved."
echo "  Client ID:      ${#cid} characters, ends in ...${cid: -4}"
echo "  Client secret:  ${#secret} characters, ends in ...${secret: -4}"
echo "Compare both with your OpenSky account page."
unset secret
systemctl restart opensky-relay.service
rc=0
"$OSKY_PY" -I "$OSKY_RELAY" --check-login "$OSKY_CRED" || rc=$?
case "$rc" in
  0) echo "Next: type opensky-status" ;;
  1|4) echo "Type opensky-key to try again."; exit 1 ;;
  *) echo "Next: type opensky-status"; exit 1 ;;
esac
EOF

  cat > /usr/local/bin/opensky-status <<'EOF'
#!/usr/bin/env bash
# opensky-status: relay ON or OFF, key set, calls today, OpenSky's last
# answer, the stop date (Swiss and Moncton time), this server's public IPv4
# and the tunnel. Never the secret.
set -uo pipefail
. /usr/local/lib/opensky-relay/common.sh
relay_state="$(systemctl is-active opensky-relay.service 2>/dev/null)"
tunnel_state="$(systemctl is-active cloudflared.service 2>/dev/null)"
health="$(curl -s --max-time 3 http://127.0.0.1:8787/health 2>/dev/null)"
if [ "$relay_state" = active ]; then on="ON"; else on="OFF ($relay_state)"; fi
if [ "$(id -u)" -ne 0 ]; then key="(log in as root to see)"
elif grep -qE '^client_secret=.+' "$OSKY_CRED" 2>/dev/null; then key="yes"
else key="no"; fi
ip="$(osky_public_ipv4 || true)"
if [ -n "$ip" ] && [ "$(id -u)" -eq 0 ]; then printf '%s\n' "$ip" > "$OSKY_IP_FILE"; fi
echo "OpenSky relay"
echo "  Relay:        $on"
echo "  Key set:      $key"
if ! "$OSKY_PY" -I -c '
import json, sys
from datetime import datetime, timezone
try:
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("America/Moncton")
except Exception:
    tz = timezone.utc
def when(iso):
    try:
        d = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return d.astimezone(tz).strftime("%a %d %b, %H:%M %Z")
    except Exception:
        return str(iso)
try:
    j = json.loads(sys.argv[1])
    assert isinstance(j, dict)
except Exception:
    sys.exit(1)
STATES = {
    "ready": "ready",
    "no-key": "waiting for the key (type opensky-key, only after signing and paying)",
    "no-caller-key": "no caller key (type opensky-update)",
    "stopped": "stopped: the licence term has ended (it answers 410)",
    "config-missing": "stopped: no clear stop date in relay.conf (type opensky-update)",
    "count-unreadable": "no calls until 00:00 UTC: the saved count cannot be read",
    "clock-behind": "no calls: the server clock is behind the day of the saved count",
    "backoff": "OpenSky asked it to wait: %s s left" % j.get("backoff_seconds"),
    "hold": "waiting after an OpenSky refusal or error: %s s left" % j.get("hold_seconds"),
    "capped": "the day is used up: calls again after 00:00 UTC",
}
def hint(code):
    code = str(code)
    if "403" in code:
        return "OpenSky refused this server: ask OpenSky whether this IPv4 is whitelisted."
    if code in ("login-400", "login-401", "upstream-401"):
        return "OpenSky did not accept the key: type opensky-key again."
    if code in ("upstream-429",):
        return "OpenSky asked the relay to wait. It does, by itself."
    if "-5" in code:
        return "A problem on OpenSky side. The relay tries again by itself."
    if code in ("unreachable", "timeout", "login-unreachable"):
        return "OpenSky could not be reached. The relay tries again by itself."
    return "The relay tries again by itself."
state = j.get("state")
print("  State:        %s" % STATES.get(state, state))
print("  Caller key:   %s" % ("set" if j.get("caller_key_set") else "MISSING (type opensky-update)"))
print("  Calls today:  %s / %s   (UTC day %s)" % (j.get("calls_today"), j.get("cap"), j.get("date")))
print("  Last OpenSky answer OK:  %s" % (when(j["last_ok_at"]) if j.get("last_ok_at") else "none yet"))
if j.get("last_error"):
    print("  Last OpenSky problem:    %s, %s" % (j["last_error"], when(j.get("last_error_at"))))
    print("    %s" % hint(j["last_error"]))
' "$health" 2>/dev/null; then
  saved="$("$OSKY_PY" -I -c '
import json, sys
try:
    j = json.load(open(sys.argv[1]))
    print("%s (UTC day %s)" % (j.get("count"), j.get("date")))
except Exception:
    print("")
' "$OSKY_STATE" 2>/dev/null)"
  echo "  Calls today:  ${saved:-unknown}   (the relay is not answering)"
fi
echo "  Stops at:"
osky_show_time "$(osky_stop_at)"
echo "  Public IPv4:  ${ip:-unknown (no internet?)}"
echo "  Tunnel:       $tunnel_state"
echo "  The relay's own log: journalctl -u opensky-relay"
EOF

  cat > /usr/local/bin/opensky-extend <<'EOF'
#!/usr/bin/env bash
# opensky-extend YYYY-MM-DD: move the relay's stop to 23:59:59 Swiss time on
# that date. Only once OpenSky has signed a written extension of the term.
set -euo pipefail
. /usr/local/lib/opensky-relay/common.sh
MAX_DAYS=40     # one extension is one month; a mistyped year is caught here
if [ "$(id -u)" -ne 0 ]; then echo "Log in as root first."; exit 1; fi
if [ ! -t 0 ]; then echo "Type opensky-extend in the server console."; exit 1; fi
day="${1:-}"
if ! [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Usage: opensky-extend YYYY-MM-DD    for example: opensky-extend 2026-12-12"
  exit 1
fi
new="$(osky_swiss_day_end "$day")"
if ! osky_valid_stop "$new"; then
  echo "$day is not a date."
  exit 1
fi
new_s="$(date -u -d "$new" +%s)"
now_s="$(date -u +%s)"
if [ "$new_s" -le "$now_s" ]; then
  echo "That date has already passed."
  exit 1
fi
cur="$(osky_stop_at)"
base_s="$now_s"
if osky_valid_stop "$cur"; then
  cur_s="$(date -u -d "$cur" +%s)"
  if [ "$cur_s" -gt "$base_s" ]; then base_s="$cur_s"; fi
fi
days=$(( (new_s - base_s) / 86400 ))
if [ "$new_s" -gt "$base_s" ] && [ "$days" -gt "$MAX_DAYS" ]; then
  echo "$day is $days days after the current stop date (or today)."
  echo "One extension is one month: check the year and the month."
  echo "Nothing changed."
  exit 1
fi
echo "The relay stops now at:"
osky_show_time "$cur"
echo "It would stop at:"
osky_show_time "$new"
if [ "$new_s" -gt "$base_s" ]; then
  echo "That is $days more days."
fi
echo "Only do this once OpenSky has signed the written extension."
read -r -p "Type yes to move the stop date: " answer
if [ "$answer" != yes ]; then echo "Nothing changed."; exit 1; fi
tmp="$(mktemp "$OSKY_ETC/.relay.conf.XXXXXX")"
osky_conf_without_stop > "$tmp"
printf 'STOP_AT=%s\n' "$new" >> "$tmp"
chown root:root "$tmp"
chmod 0644 "$tmp"
mv -f "$tmp" "$OSKY_CONF"
# the relay keeps a stop it has reached (a clock set back cannot undo it);
# the new date lifts it
rm -f "$OSKY_STOP_MARKER"
osky_write_timer "$new"
systemctl daemon-reload
systemctl enable opensky-relay-stop.timer >/dev/null 2>&1 || true
systemctl restart opensky-relay-stop.timer
systemctl enable opensky-relay.service >/dev/null
systemctl restart opensky-relay.service
echo "Done. Type opensky-status to check."
EOF

  cat > /usr/local/bin/opensky-caller-key <<'EOF'
#!/usr/bin/env bash
# opensky-caller-key: show the key the boards' Worker sends to this relay
# (X-Relay-Key). Without it, /states answers 403, whoever reaches the tunnel.
set -euo pipefail
. /usr/local/lib/opensky-relay/common.sh
if [ "$(id -u)" -ne 0 ]; then echo "Log in as root first."; exit 1; fi
if [ ! -s "$OSKY_CALLER" ]; then echo "No caller key yet. Type opensky-update."; exit 1; fi
echo "The relay's caller key:"
echo
echo "    $(cat "$OSKY_CALLER")"
echo
echo "Type it into Cloudflare only when the change that connects the boards"
echo "asks for it. Never paste it into a chat or the repository, and do not"
echo "film or photograph this screen."
EOF

  cat > /usr/local/bin/opensky-update <<'EOF'
#!/usr/bin/env bash
# opensky-update: download the installer again, over https, and run it. It
# keeps the key, the caller key, the stop date and the tunnel, and installs
# the relay.py that installer was written for.
set -uo pipefail
. /usr/local/lib/opensky-relay/common.sh
if [ "$(id -u)" -ne 0 ]; then echo "Log in as root first."; exit 1; fi
if ! curl -fsSL --retry 3 -o /root/o.new "$OSKY_INSTALLER_URL"; then
  rm -f /root/o.new
  echo "The installer could not be downloaded. Try again in a few minutes."
  exit 1
fi
mv -f /root/o.new /root/o
exec bash /root/o
EOF

  chmod 0755 /usr/local/bin/opensky-key /usr/local/bin/opensky-status /usr/local/bin/opensky-extend \
    /usr/local/bin/opensky-caller-key /usr/local/bin/opensky-update
  chown root:root /usr/local/bin/opensky-key /usr/local/bin/opensky-status /usr/local/bin/opensky-extend \
    /usr/local/bin/opensky-caller-key /usr/local/bin/opensky-update
}

print_summary() {
  local ip="${1:-}" tunnel
  tunnel="$(systemctl is-active cloudflared.service 2>/dev/null || true)"
  echo
  echo "============================================================"
  echo " OpenSky relay installed."
  if [ "${TERM_ENDED:-0}" = 1 ]; then
    echo " The licence term has ended, so the relay is OFF."
  else
    echo " It calls nothing until the key is typed in: opensky-key"
    echo " (only after the agreement is signed and paid)."
  fi
  echo
  if [ -n "$ip" ]; then
    echo " This server's public IPv4:   $ip"
    echo " Send OpenSky this address:   $ip/32"
  else
    echo " Public IPv4: not found yet. Type opensky-status in a minute."
  fi
  echo
  if [ "$tunnel" = active ]; then
    echo " Tunnel to Cloudflare: connected."
  else
    echo " Tunnel to Cloudflare: not connected yet. The last line of the"
    echo " Cloud config connects it, right after this installer."
  fi
  echo
  echo " Next:"
  echo "   1. Send the address above to OpenSky."
  echo "   2. After signing and paying, type:  opensky-key"
  echo "   3. Then type:  opensky-status"
  echo "============================================================"
}

main "$@"
