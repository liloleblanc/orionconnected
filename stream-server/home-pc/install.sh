#!/usr/bin/env bash
# Installs the two home streams on an Ubuntu 24.04 desktop PC with an NVIDIA GPU.
# Safe to run again. It never touches Xorg, the network, automatic updates,
# stream keys or the cloud servers, and it starts no stream. Besides its own
# files it changes three system settings: a journald drop-in (persistent
# journal, 2 GB, 2 months; journald is restarted), an apport ignore list (no
# crash reports for nginx and ffmpeg, which hold the stream key in memory), and
# the masked stock nginx.service.
# usage (from this directory): sudo bash install.sh
#   CHROME_POLICY=1  also installs the Chrome managed policy (Chrome then
#                    shows "Managed by your organization" on this PC)
#   POWER_KEY=1      also makes a short press of the power key do nothing and
#                    records which device sends one (see README, Power key)
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo bash install.sh" >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] || { echo "Ubuntu 24.04 only" >&2; exit 1; }
nvidia-smi -L >/dev/null 2>&1 || { echo "nvidia-smi failed: install the NVIDIA driver first" >&2; exit 1; }

APP=/opt/fids-home
CHROME_FPR=EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796   # Google Linux package signing key

# ---- 1. packages -------------------------------------------------------------
# The nginx package starts a web server on port 80 as it installs. Mask that
# unit first and hold service starts during the install; the relays run their
# own nginx instances on 127.0.0.1 only.
systemctl mask nginx.service >/dev/null 2>&1 || true
POLICY=/usr/sbin/policy-rc.d
POLICY_ADDED=0
if [ ! -e "$POLICY" ]; then
  printf '#!/bin/sh\nexit 101\n' > "$POLICY"; chmod 0755 "$POLICY"; POLICY_ADDED=1
fi
cleanup() { [ "$POLICY_ADDED" = 1 ] && rm -f "$POLICY"; return 0; }
trap cleanup EXIT

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ffmpeg xvfb xauth python3-websocket vulkan-tools mesa-utils sysstat \
  nginx libnginx-mod-rtmp fonts-liberation fonts-dejavu-core curl ca-certificates gnupg

# Google Chrome stable from the signed Google apt repository.
if ! command -v google-chrome-stable >/dev/null 2>&1; then
  install -d -m 0755 /etc/apt/keyrings
  KEYTMP="$(mktemp)"; GNUPGTMP="$(mktemp -d)"
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub -o "$KEYTMP"
  # Only the key with the expected fingerprint is exported into the keyring,
  # whatever else the downloaded file holds.
  gpg --homedir "$GNUPGTMP" --quiet --import "$KEYTMP" 2>/dev/null || true
  gpg --homedir "$GNUPGTMP" --export "$CHROME_FPR" > /etc/apt/keyrings/google-chrome.gpg
  gpg --homedir "$GNUPGTMP" --show-keys --with-colons /etc/apt/keyrings/google-chrome.gpg 2>/dev/null \
      | grep -q "^fpr:::::::::$CHROME_FPR:" || {
    echo "the downloaded Google key does not have the expected fingerprint $CHROME_FPR" >&2
    rm -rf "$KEYTMP" "$GNUPGTMP" /etc/apt/keyrings/google-chrome.gpg; exit 1; }
  chmod 0644 /etc/apt/keyrings/google-chrome.gpg
  rm -rf "$KEYTMP" "$GNUPGTMP"
  # Settings read by the Chrome package scripts. They do not stop the package
  # from writing its own signed google-chrome.sources at install (seen on the
  # test PC); that file is accepted below.
  printf 'repo_add_once="false"\nrepo_reenable_on_distupgrade="false"\n' > /etc/default/google-chrome
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list
  apt-get update -y
  apt-get install -y google-chrome-stable
  # The Chrome package then writes its own signed source (google-chrome.sources,
  # same Google key) and removes the list above; drop the now unused keyring.
  if [ -e /etc/apt/sources.list.d/google-chrome.sources ]; then
    rm -f /etc/apt/sources.list.d/google-chrome.list /etc/apt/keyrings/google-chrome.gpg
  fi
fi
cleanup; POLICY_ADDED=0

# ---- 2. user and directories ---------------------------------------------------
id fidsstream >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/fids-home \
  --no-create-home --shell /usr/sbin/nologin fidsstream
usermod -a -G video,render fidsstream
install -d -m 0755 "$APP" "$APP/bin" "$APP/config" "$APP/bench" "$APP/xorg" /etc/fids-home /var/lib/fids-home
install -d -m 0755 -o fidsstream -g fidsstream /var/lib/fids-home/bench
install -d -m 0700 -o root -g root /etc/credstore

# ---- 3. files ------------------------------------------------------------------
install -m 0755 "$SRC"/bin/stream-run "$SRC"/bin/rtmp-render "$SRC"/bin/set-stream-key \
  "$SRC"/bin/fids-watchdog "$SRC"/bin/fids-diag "$SRC"/bin/wait-desktop "$SRC"/bin/progress-sink \
  "$SRC"/bin/cdp-guard.py "$APP/bin/"
install -m 0644 "$SRC"/config/rtmp.conf.tmpl "$SRC"/config/test-override.env \
  "$SRC"/config/stream-1.env "$SRC"/config/stream-2.env "$APP/config/"
install -m 0755 "$SRC"/bench/bench-run.sh "$SRC"/bench/sample.sh "$SRC"/bench/analyze.py \
  "$SRC"/bench/gpu-preflight.sh "$APP/bench/"
install -m 0755 "$SRC"/xorg/apply-kvm-xorg.sh "$APP/xorg/"
install -m 0644 "$SRC"/xorg/20-fids-kvm.conf "$APP/xorg/"
for N in 1 2; do
  if [ ! -e "/etc/fids-home/stream-$N.env" ]; then
    install -m 0644 "$SRC/config/stream-$N.env" "/etc/fids-home/stream-$N.env"
  elif ! cmp -s "$SRC/config/stream-$N.env" "/etc/fids-home/stream-$N.env"; then
    echo "Kept /etc/fids-home/stream-$N.env; it differs from the shipped copy:"
    diff -u "$SRC/config/stream-$N.env" "/etc/fids-home/stream-$N.env" || true
  fi
done
install -m 0644 "$SRC"/systemd/fids-home-stream@.service "$SRC"/systemd/fids-home-rtmp@.service \
  "$SRC"/systemd/fids-home-watchdog.service "$SRC"/systemd/fids-home-watchdog.timer /etc/systemd/system/
install -d -m 0755 /etc/systemd/journald.conf.d
install -m 0644 "$SRC"/config/journald-60-fids-home.conf /etc/systemd/journald.conf.d/60-fids-home.conf
# Ubuntu crash reports (apport) copy the whole process memory and can be sent
# to errors.ubuntu.com from a desktop prompt. nginx (the relay) and ffmpeg
# (OUTPUT=direct) hold the stream key, so apport ignores them. The units also
# set LimitCORE=0.
if [ -d /etc/apport ]; then
  install -d -m 0755 /etc/apport/report-ignore
  printf '%s\n' "$(readlink -f /usr/sbin/nginx)" "$(readlink -f /usr/bin/ffmpeg)" > /etc/apport/report-ignore/fids-home
  chmod 0644 /etc/apport/report-ignore/fids-home
fi
if [ "${CHROME_POLICY:-0}" = 1 ]; then
  install -d -m 0755 /etc/opt/chrome/policies/managed
  install -m 0644 "$SRC"/config/chrome-policy.json /etc/opt/chrome/policies/managed/fids-home.json
fi
if [ "${POWER_KEY:-0}" = 1 ]; then
  install -m 0755 "$SRC"/bin/power-key-log "$APP/bin/"
  install -m 0644 "$SRC"/systemd/fids-powerkey-log.service /etc/systemd/system/
  install -d -m 0755 /etc/systemd/logind.conf.d
  install -m 0644 "$SRC"/config/logind-60-power-key.conf /etc/systemd/logind.conf.d/60-power-key.conf
fi
ln -sfn "$APP/bin/set-stream-key" /usr/local/sbin/set-stream-key
ln -sfn "$APP/bin/fids-diag" /usr/local/bin/fids-diag

systemctl daemon-reload
systemctl restart systemd-journald
systemctl enable --now fids-home-watchdog.timer >/dev/null
if [ "${POWER_KEY:-0}" = 1 ]; then
  systemctl reload systemd-logind
  systemctl enable --now fids-powerkey-log.service >/dev/null
fi

cat <<'NEXT'

Installed. No stream is running and no key is saved.
  Test mode (demo board, local relay only, billed paths blocked):
    sudo install -m 0644 /opt/fids-home/config/test-override.env /etc/fids-home/stream-1.override.env
    sudo systemctl start fids-home-stream@1
  Status:  sudo fids-diag
  Logs:    journalctl -u fids-home-stream@1 -f
  Going live is a checklist in README.md (switchover); the key is set with
    sudo set-stream-key 1
NEXT
