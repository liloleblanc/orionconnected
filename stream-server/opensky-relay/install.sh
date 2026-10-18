#!/usr/bin/env bash
#
# OpenSky relay: installer for its own small Ubuntu 24.04 server (Hetzner).
#
# The relay makes every OpenSky call from this one server, so OpenSky can
# whitelist one fixed IPv4 address. It only ever calls OUT: to OpenSky, and
# to the boards' Worker (fids-proxy, its /osky/* routes), which it polls once
# a minute. Nothing calls in, no port is open, and there is no tunnel and no
# token to copy. The one secret made here, the relay key, stays on this
# server; the Worker keeps only its sha256, and takes it only from the
# address pinned in its secret OSKY_RELAY_IPV4 (typed in the Cloudflare
# dashboard from the address Hetzner shows for this server). The OpenSky
# client is never on this server's disk: the relay asks the Worker for it
# and keeps it in memory.
#
# How it runs: Hetzner's Cloud config box, at server creation (cloud-init,
# as root, no terminal), these two lines:
#
#        #!/bin/bash
#        curl -fsSL --retry 10 --retry-all-errors --retry-delay 15 -o /root/o https://raw.githubusercontent.com/liloleblanc/orionconnected/main/stream-server/opensky-relay/install.sh && bash /root/o
#
# cloud-init runs the Cloud config as a script only when it starts with #!,
# so the first line is needed. The download is retried (a 502 or a network
# blip at first boot) and runs only once it is whole: a pipe into bash would
# run nothing on a failure and still report success, and a retried transfer
# into a pipe would hand bash the script twice. On the server,
# opensky-update downloads this file again and runs it.
#
# Safe to run again: it keeps the relay key, the stop date (and a later one
# the Worker gave the relay) and the settings. It never calls OpenSky itself.
# The relay calls OpenSky only once the Worker switches it on (after the
# agreement is signed and paid) and hands it the OpenSky client.
#
# What it sets up:
#   - /opt/opensky-relay/relay.py (Python standard library only), checked
#     against the SHA-256 pinned below
#   - /etc/opensky-relay/relay-key: the relay key, made once (root, 0600)
#   - /etc/opensky-relay/relay.conf: STOP_AT, DAILY_CAP, CACHE_SECONDS,
#     HEADING, WORKER_URL (root-owned)
#   - opensky-relay.service: a hardened systemd unit (a dedicated throwaway
#     user via DynamicUser, ProtectSystem=strict, NoNewPrivileges, IPv4
#     sockets only, no metadata service, no core dumps); the relay key
#     arrives through LoadCredential
#   - no crash reports anywhere: apport masked, kernel.core_pattern=|/bin/false
#   - opensky-relay-stop.timer: turns the relay off once its stop date has
#     passed (checked at STOP_AT and every hour, so a later stop date the
#     Worker gave the relay is respected)
#   - ufw: deny all incoming, when ufw is there
#   - the commands opensky-status, opensky-extend and opensky-update
#
set -eEuo pipefail
trap 'echo "OpenSky relay install stopped at line $LINENO. Nothing is lost: run it again." >&2' ERR

# Everything runs inside main(), called on the last line. When this file is
# piped into bash, bash reads the whole function before running any of it, so
# a cut-off download runs nothing and no command can swallow the rest of the
# script from stdin.
main() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run this as root."
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive

  # The original licence term ends 12 Nov 2026 23:59:59 Swiss time (CET).
  # Used only when no stop date is saved yet; a saved one is never changed
  # here. The relay follows the Worker's stop date (OSKY_STOP_AT): an earlier
  # one stops it for now, and a later one, by 40 days at most, moves its own
  # stop (saved in its state directory). A server made AFTER this date
  # starts stopped, so it moves in the same change as OSKY_STOP_AT in
  # workers/wrangler.fids-proxy.jsonc, and stays equal to it (a test checks).
  local DEFAULT_STOP_AT="2026-11-12T22:59:59Z"
  local RELAY_URL="https://raw.githubusercontent.com/liloleblanc/orionconnected/main/stream-server/opensky-relay/relay.py"
  # The relay.py this installer was written with (tests/opensky-relay.test.js
  # fails when it drifts). A download that does not match is never installed.
  local RELAY_SHA256="177ffc6f99c7f275aad36fd138cb1de24272ca47a54a0cfd374982266b34e1fb"

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

  echo "== OpenSky relay: the relay"
  install_relay "$RELAY_URL" "$RELAY_SHA256"

  echo "== OpenSky relay: settings"
  install -d -m 0755 -o root -g root "$OSKY_ETC"
  write_config "$DEFAULT_STOP_AT"
  # the relay key: made here once, kept on every re-run (the Worker knows
  # its sha256); root only, handed to the relay by systemd
  "$OSKY_PY" -I "$OSKY_RELAY" --make-key "$OSKY_KEY"
  chown root:root "$OSKY_KEY"
  chmod 0600 "$OSKY_KEY"
  remove_old_files

  echo "== OpenSky relay: no crash reports"
  no_crash_dumps

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
    # Nothing is allowed in, not even SSH: the relay only calls out.
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
  # so a run while apt-daily is busy would fail at once: retry.
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

install_relay() {
  local url="$1" want="$2" here="" tmp got
  if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  fi
  local tries=1 i
  tmp="$(mktemp)"
  # a repository checkout (bash stream-server/opensky-relay/install.sh) uses
  # its own relay.py; anything else (the Cloud config, opensky-update)
  # downloads the one on main
  if [ -n "$here" ] && [ "$(basename "$here")" = opensky-relay ] && [ -f "$here/relay.py" ]; then
    cp "$here/relay.py" "$tmp"
  else
    # GitHub can serve an old copy for a few minutes after a change: the
    # download is tried, and checked, again for about 15 minutes
    tries=16
  fi
  # only the exact relay.py this installer was written with is installed:
  # never a cut-off download, an error page or a newer, unchecked file
  for i in $(seq 1 "$tries"); do
    if [ "$tries" -gt 1 ]; then
      curl -fsSL --retry 3 --retry-all-errors "$url" -o "$tmp" || : > "$tmp"
    fi
    got="$(sha256sum "$tmp" | cut -d ' ' -f 1)"
    if [ "$got" = "$want" ] || [ "$i" -ge "$tries" ]; then
      break
    fi
    echo "The relay download does not match this installer yet ($i of $tries); trying again in 60 s."
    sleep 60
  done
  if [ "$got" != "$want" ]; then
    rm -f "$tmp"
    echo "The relay download does not match this installer, so nothing was changed."
    echo "GitHub can serve an old copy for a few minutes after a change."
    echo "Wait 10 minutes, then run it again (opensky-update)."
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
# STOP_AT is the end of the licence term, in UTC. The relay follows the
# Worker's stop date (OSKY_STOP_AT): an earlier one stops it for now, a later
# one (40 days later at most) moves its stop, saved in its state directory.
# On the server console only, if it is ever needed: opensky-extend YYYY-MM-DD
STOP_AT=$default_stop
# Upstream calls per UTC day, paced across the hours (1500 at most).
DAILY_CAP=1500
# Seconds an identical box shares one OpenSky call (120 at most: the Worker
# keeps a put 180 s, and the next one has to land first).
CACHE_SECONDS=120
# 1 = also send the heading (true_track). 0 until OpenSky confirms it is covered.
HEADING=0
# The boards' Worker the relay polls: https://<host> only.
WORKER_URL=$OSKY_DEFAULT_WORKER_URL
EOF
  fi
  chown root:root "$OSKY_CONF"
  chmod 0644 "$OSKY_CONF"
  osky_write_timer "$(osky_stop_at)"
}

remove_old_files() {
  # The first design (a Cloudflare Tunnel, PR #1049) kept the OpenSky client
  # and a caller key in files here and had two more commands. The client now
  # lives only in the Worker, so none of them is used any more.
  rm -f "$OSKY_ETC/credentials" "$OSKY_ETC/caller-key" \
    /usr/local/bin/opensky-key /usr/local/bin/opensky-caller-key
}

no_crash_dumps() {
  # LimitCORE=0 in the unit stops a core FILE only. Ubuntu pipes every crash
  # to apport, which runs as root outside the unit's sandbox and writes a
  # report holding the process's memory (the OpenSky client, the token) to
  # /var/crash, and the kernel pipes whatever RLIMIT_CORE says. So: no
  # apport, and a core pattern that throws every core away.
  systemctl disable --now apport.service >/dev/null 2>&1 || true
  systemctl mask apport.service apport-forward.socket >/dev/null 2>&1 || true
  cat > /etc/sysctl.d/60-opensky-relay-no-core.conf <<'EOF'
# OpenSky relay: no core dumps and no crash reports on this server
kernel.core_pattern=|/bin/false
fs.suid_dumpable=0
EOF
  chmod 0644 /etc/sysctl.d/60-opensky-relay-no-core.conf
  sysctl -q -p /etc/sysctl.d/60-opensky-relay-no-core.conf >/dev/null 2>&1 || true
}

write_common() {
  cat > /usr/local/lib/opensky-relay/common.sh <<'EOF'
# Shared by install.sh and the opensky-* commands.
OSKY_ETC=/etc/opensky-relay
OSKY_CONF=$OSKY_ETC/relay.conf
OSKY_KEY=$OSKY_ETC/relay-key
OSKY_IP_FILE=$OSKY_ETC/public-ipv4
OSKY_RELAY=/opt/opensky-relay/relay.py
OSKY_PY=/usr/bin/python3
OSKY_TIMER=/etc/systemd/system/opensky-relay-stop.timer
OSKY_STATE_DIR=/var/lib/opensky-relay
OSKY_STATE=$OSKY_STATE_DIR/state.json
OSKY_STATUS=$OSKY_STATE_DIR/status.json
OSKY_STOP_MARKER=$OSKY_STATE_DIR/stopped
# Straight from GitHub: the orionconnected.com zone runs Bot Fight Mode, which
# challenges a data-centre server's curl (it blocked the first relay's setup).
OSKY_INSTALLER_URL=https://raw.githubusercontent.com/liloleblanc/orionconnected/main/stream-server/opensky-relay/install.sh
OSKY_DEFAULT_WORKER_URL=https://fids-proxy.n-leblanc1984.workers.dev

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

# the timer that turns the relay off once its stop date has passed: at
# STOP_AT ($1), and every hour (the relay may hold a later stop date from
# the Worker; the service checks relay.py --stopped before turning it off)
osky_write_timer() {
  local when="${1%Z}"
  when="${when/T/ } UTC"
  cat > "$OSKY_TIMER" <<UNIT
[Unit]
Description=Turn the OpenSky relay off at the end of the licence term

[Timer]
OnCalendar=$when
OnCalendar=hourly
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
Description=OpenSky relay (polls the boards' Worker; every OpenSky call from this server's IPv4)
After=network-online.target
Wants=network-online.target
ConditionPathExists=/opt/opensky-relay/relay.py

[Service]
Type=simple
ExecStart=/usr/bin/python3 -I /opt/opensky-relay/relay.py
Environment=OSKY_PRODUCTION=1
UnsetEnvironment=OSKY_TEST_MODE OSKY_TEST_TOKEN_URL OSKY_TEST_API_BASE OSKY_TEST_WORKER_URL OSKY_TEST_CONFIG_DIR OSKY_TEST_CLOCK_FILE OSKY_TEST_LOOP_S
# the relay key, from a root-only 0600 file
LoadCredential=relay-key:/etc/opensky-relay/relay-key
# a dedicated throwaway system user, made for this service only
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
# no metadata service (Hetzner serves the Cloud config at its link-local
# address); loopback stays open for the local DNS resolver
IPAddressDeny=link-local
InaccessiblePaths=-/var/lib/cloud -/var/log/cloud-init.log -/var/log/cloud-init-output.log -/run/dbus
# a crash never writes the OpenSky client or OpenSky's data to disk
LimitCORE=0
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
MemoryMax=128M
TasksMax=32
# it exits by itself (status 0) once the term has ended: no restart then
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/opensky-relay-stop.service <<'EOF'
[Unit]
Description=Turn the OpenSky relay off (end of the licence term)

[Service]
Type=oneshot
# only once the relay's own stop date (relay.conf, or a later one the Worker
# gave it) has passed: relay.py --stopped exits 0 then
ExecStart=/bin/sh -c 'if /usr/bin/python3 -I /opt/opensky-relay/relay.py --stopped; then /usr/bin/systemctl disable --now opensky-relay.service; fi'
EOF
}

write_commands() {
  cat > /usr/local/bin/opensky-status <<'EOF'
#!/usr/bin/env bash
# opensky-status: relay ON or OFF, its state, calls today, OpenSky's last
# answer, the stop date (Swiss and Moncton time) and this server's public
# IPv4. Never a key. (The same counts show at the Worker's /osky/status.)
set -uo pipefail
. /usr/local/lib/opensky-relay/common.sh
relay_state="$(systemctl is-active opensky-relay.service 2>/dev/null)"
if [ "$relay_state" = active ]; then on="ON"; else on="OFF ($relay_state)"; fi
ip="$(osky_public_ipv4 || true)"
if [ -n "$ip" ] && [ "$(id -u)" -eq 0 ]; then printf '%s\n' "$ip" > "$OSKY_IP_FILE"; fi
echo "OpenSky relay"
echo "  Relay:        $on"
"$OSKY_PY" -I -c '
import json, sys
try:
    j = json.load(open(sys.argv[1]))
    assert isinstance(j, dict)
except Exception:
    print("  State:        unknown (the relay has not written its status yet)")
    sys.exit(0)
for label, key in (("State", "state"), ("Registered", "registered"), ("OpenSky on", "on"),
                   ("Calls today", "calls_today"), ("Cap", "cap"), ("Last answer", "last_status"),
                   ("Hold (s)", "hold_seconds"), ("Puts today", "puts_today"), ("Stop date", "stop_at"),
                   ("Worker stop", "worker_stop_at"), ("At", "at")):
    print("  %-13s %s" % (label + ":", j.get(key)))
' "$OSKY_STATUS" 2>/dev/null
echo "  relay.conf STOP_AT (the relay may hold a later one from the Worker, above):"
osky_show_time "$(osky_stop_at)"
echo "  Public IPv4:  ${ip:-unknown (no internet?)}"
echo "  The relay's own log: journalctl -u opensky-relay"
EOF

  cat > /usr/local/bin/opensky-extend <<'EOF'
#!/usr/bin/env bash
# opensky-extend YYYY-MM-DD: move the relay's stop to 23:59:59 Swiss time on
# that date. Only once OpenSky has signed a written extension of the term.
# The Worker's own stop date (OSKY_STOP_AT) has to move too, in a change.
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

  cat > /usr/local/bin/opensky-update <<'EOF'
#!/usr/bin/env bash
# opensky-update: download the installer again, over https, and run it. It
# keeps the relay key, the stop date and the settings, and installs the
# relay.py that installer was written for.
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

  chmod 0755 /usr/local/bin/opensky-status /usr/local/bin/opensky-extend /usr/local/bin/opensky-update
  chown root:root /usr/local/bin/opensky-status /usr/local/bin/opensky-extend /usr/local/bin/opensky-update
}

print_summary() {
  local ip="${1:-}"
  echo
  echo "============================================================"
  echo " OpenSky relay installed."
  if [ "${TERM_ENDED:-0}" = 1 ]; then
    echo " The licence term has ended, so the relay is OFF."
  else
    echo " It registers with the boards' Worker by itself once the"
    echo " Worker's OSKY_RELAY_IPV4 secret holds this server's address,"
    echo " and calls OpenSky only once the Worker switches it on."
  fi
  if [ -n "$ip" ]; then
    echo
    echo " This server's public IPv4:   $ip"
    echo " Send OpenSky this address:   $ip/32"
  fi
  echo " Check it from anywhere: $OSKY_DEFAULT_WORKER_URL/osky/status"
  echo "============================================================"
}

main "$@"
