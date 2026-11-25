#!/usr/bin/env bash
# Installs the ADS-B receiver on the home PC (Ubuntu 24.04): the stick becomes a
# radio receiver, readsb is built from a pinned commit, and one unit runs it.
# Safe to run again. It opens no port, adds no web server, feeds no network and
# touches nothing of the streams. The unit starts at once and at every boot, and
# keeps trying while the stick is unplugged.
# usage (from this directory): sudo bash install.sh
# Undo: sudo bash install.sh --remove   (keeps the Ubuntu packages)
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo bash install.sh" >&2; exit 1; }
APP=/opt/fids-receiver
UNIT=/etc/systemd/system/fids-receiver.service
MODPROBE=/etc/modprobe.d/adsb-stick.conf

if [ "${1:-}" = --remove ]; then
  systemctl disable --now fids-receiver.service 2>/dev/null || true
  rm -f "$UNIT" "$MODPROBE" /usr/local/bin/fids-planes
  rm -rf "$APP"
  systemctl daemon-reload
  echo "Removed. The stick is a TV tuner again after it is plugged in anew."
  exit 0
fi

. /etc/os-release
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] || { echo "Ubuntu 24.04 only" >&2; exit 1; }

# ---- 1. packages ---------------------------------------------------------------
# NEEDRESTART_SUSPEND: no service of this PC is restarted by this install.
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1
apt-get update -y
apt-get install -y --no-install-recommends --no-upgrade rtl-sdr curl ca-certificates \
  gcc make libc6-dev pkg-config libusb-1.0-0-dev librtlsdr-dev zlib1g-dev libzstd-dev

# ---- 2. the stick ----------------------------------------------------------------
install -m 0644 "$SRC/config/adsb-stick.conf" "$MODPROBE"
# Unload the TV driver if it is in (it stays in when a TV tuner is in use).
for m in rtl2832_sdr dvb_usb_rtl28xxu; do
  if [ -d "/sys/module/$m" ]; then modprobe -r "$m" || echo "could not unload $m; unplug the stick and run this again" >&2; fi
done
# Give a stick that is already plugged in the plugdev group (rule of rtl-sdr).
udevadm control --reload
for d in /sys/bus/usb/devices/*; do
  [ -r "$d/idVendor" ] || continue
  if [ "$(cat "$d/idVendor"):$(cat "$d/idProduct")" = 0bda:2838 ]; then udevadm trigger --action=change "$d"; fi
done

# ---- 3. program and unit -----------------------------------------------------------
install -d -m 0755 "$APP" "$APP/bin"
install -m 0755 "$SRC/bin/receiver-build" "$SRC/bin/fids-planes" "$APP/bin/"
"$APP/bin/receiver-build"
install -m 0644 "$SRC/systemd/fids-receiver.service" "$UNIT"
ln -sfn "$APP/bin/fids-planes" /usr/local/bin/fids-planes
systemctl daemon-reload
systemctl enable fids-receiver.service >/dev/null
systemctl restart fids-receiver.service

cat <<'NEXT'

Installed and running.
  What it hears now:  fids-planes
  Its messages:       journalctl -u fids-receiver
  Stop:               sudo systemctl disable --now fids-receiver
NEXT
