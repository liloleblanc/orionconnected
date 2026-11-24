#!/usr/bin/env bash
# Installs, checks or removes the NVIDIA settings that keep the desktop screen
# configured while the KVM is switched to the other computer (20-fids-kvm.conf).
#   --install   back up, then copy the monitor EDID and the config file (no restart)
#   --apply     --install, then restart GDM and verify for up to 180 s in a
#               detached unit (fids-xorg-verify); it rolls back by itself on failure
#   --verify    the checks only: x11 session on seat0, Xorg on the GPU, the three
#               options in the Xorg log with no new (EE) lines, the output connected
#   --rollback  undo the last --install from its manifest, then restart GDM
# Environment: EDID_SRC (default /sys/class/drm/card1-DP-2/edid), EDID_MD5 (the
# expected md5 of that file, checked when set), XRANDR_OUTPUT (default DP-2).
# Never commit the EDID file itself: it carries the monitor serial number.
set -uo pipefail
HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CONF_SRC="$HERE/20-fids-kvm.conf"
CONF=/etc/X11/xorg.conf.d/20-fids-kvm.conf
EDID_DIR=/etc/X11/edid
EDID="$EDID_DIR/dfp-4.bin"
EDID_SRC="${EDID_SRC:-/sys/class/drm/card1-DP-2/edid}"
XOUT="${XRANDR_OUTPUT:-DP-2}"
BACKUP_ROOT=/var/backups/fids-home
LAST=/var/lib/fids-home/xorg-last-backup
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
LOGF=""
log() { echo "apply-kvm-xorg: $*"; [ -z "$LOGF" ] || echo "$(date -Is) $*" >> "$LOGF"; return 0; }

seat_session() {   # prints "SESSION USER" for the active x11 user session on seat0
  local s
  for s in $(loginctl list-sessions --no-legend 2>/dev/null | awk '{print $1}'); do
    if [ "$(loginctl show-session "$s" -p Seat -p Type -p Active -p Class 2>/dev/null | sort | tr '\n' ' ')" \
         = "Active=yes Class=user Seat=seat0 Type=x11 " ]; then
      echo "$s $(loginctl show-session "$s" -p Name --value)"; return 0
    fi
  done
  return 1
}
xorg_log() { ls -t /home/*/.local/share/xorg/Xorg.*.log /var/log/Xorg.*.log 2>/dev/null | head -1; }
ee_lines() { grep -F '(EE)' "$1" 2>/dev/null | sed 's/^\[ *[0-9.]*\] //' | sort -u; }

edid_ok() {
  local f="$1" n
  [ -r "$f" ] || { log "cannot read $f"; return 1; }
  n=$(wc -c < "$f")
  { [ "$n" -ge 128 ] && [ $((n % 128)) -eq 0 ]; } || { log "EDID size $n is not a multiple of 128"; return 1; }
  [ "$(od -An -tx1 -N8 "$f" | tr -d ' \n')" = 00ffffffffffff00 ] || { log "EDID header missing"; return 1; }
  od -An -v -tu1 "$f" | tr -s ' ' '\n' | grep -v '^$' \
    | awk '{ s += $1; if (NR % 128 == 0) { if (s % 256) bad = 1; s = 0 } } END { exit bad }' \
    || { log "EDID block checksum is wrong"; return 1; }
  if [ -n "${EDID_MD5:-}" ] && [ "$(md5sum < "$f" | cut -d' ' -f1)" != "$EDID_MD5" ]; then
    log "EDID md5 differs from EDID_MD5"; return 1
  fi
  return 0
}

do_install() {
  local B L t
  edid_ok "$EDID_SRC" || { log "not installing: the EDID at $EDID_SRC failed its checks"; exit 1; }
  B="$BACKUP_ROOT/xorg-$(date +%Y%m%d-%H%M%S)"
  install -d -m 0700 "$B"
  {
    echo "created $(date -Is) by apply-kvm-xorg.sh --install"
    if [ -d "$EDID_DIR" ]; then echo "existed-dir $EDID_DIR"; else echo "new-dir $EDID_DIR"; fi
    for t in "$CONF" "$EDID"; do
      if [ -e "$t" ]; then cp -a "$t" "$B/"; echo "existed $t"; else echo "new $t"; fi
    done
  } > "$B/MANIFEST"
  L="$(xorg_log)"
  if [ -n "$L" ]; then ee_lines "$L" > "$B/ee-baseline.txt"; else : > "$B/ee-baseline.txt"; fi
  install -d -m 0755 /etc/X11/xorg.conf.d "$EDID_DIR"
  install -m 0644 "$EDID_SRC" "$EDID"
  install -m 0644 "$CONF_SRC" "$CONF"
  install -d -m 0755 "$(dirname "$LAST")"
  echo "$B" > "$LAST"
  log "installed $CONF and $EDID; backup and manifest in $B"
}

# check [SINCE_EPOCH] [basic]: 0 when every check passes, else prints the first failure
check() {
  local since="${1:-0}" basic="${2:-}" su user uid L B disp x
  su="$(seat_session)" || { echo "no active x11 user session on seat0"; return 1; }
  user="${su#* }"; uid="$(id -u "$user")"
  nvidia-smi 2>/dev/null | grep -q '/usr/lib/xorg/Xorg' || { echo "Xorg is not listed by nvidia-smi"; return 1; }
  [ "$basic" = basic ] && return 0
  L="$(xorg_log)"
  [ -n "$L" ] || { echo "no Xorg log found"; return 1; }
  [ "$(stat -c %Y "$L")" -ge "$since" ] || { echo "the newest Xorg log predates the restart"; return 1; }
  grep -qF 'Option "ConnectedMonitor" "DFP-4"' "$L" || { echo "ConnectedMonitor not in $L"; return 1; }
  grep -qF 'Option "CustomEDID" "DFP-4:/etc/X11/edid/dfp-4.bin"' "$L" || { echo "CustomEDID not in $L"; return 1; }
  grep -qF 'Option "LimitFrameRateWhenHeadless" "false"' "$L" || { echo "LimitFrameRateWhenHeadless not in $L"; return 1; }
  B="$(cat "$LAST" 2>/dev/null)"
  if [ -n "$B" ] && [ -f "$B/ee-baseline.txt" ]; then
    x="$(ee_lines "$L" | comm -23 - "$B/ee-baseline.txt")"
    [ -z "$x" ] || { echo "new (EE) lines in $L: $(echo "$x" | head -3 | tr '\n' ' ')"; return 1; }
  fi
  disp=""
  for x in /tmp/.X11-unix/X*; do [ "$(stat -c %u "$x" 2>/dev/null)" = "$uid" ] && { disp=":${x##*/X}"; break; }; done
  [ -n "$disp" ] || { echo "no X socket owned by the desktop user"; return 1; }
  runuser -u "$user" -- env DISPLAY="$disp" XAUTHORITY="/run/user/$uid/gdm/Xauthority" xrandr --query 2>/dev/null \
    | grep -Eq "^$XOUT connected.* [0-9]+x[0-9]+\+[0-9]+\+[0-9]+" || { echo "$XOUT is not connected with a mode"; return 1; }
  return 0
}

wait_for() {   # wait_for SINCE [basic]
  local i why
  for i in $(seq 1 36); do
    sleep 5
    if why="$(check "$1" "${2:-}")"; then log "checks passed after $((i * 5)) s"; return 0; fi
  done
  log "checks still failing after 180 s: $why"
  return 1
}

do_rollback_files() {
  local B line
  B="$(cat "$LAST" 2>/dev/null)"
  if [ -z "$B" ] || [ ! -f "$B/MANIFEST" ]; then
    log "no manifest; removing $CONF only"; rm -f "$CONF"; return 0
  fi
  while read -r kind path; do
    case "$kind" in
      new) rm -f "$path" ;;
      existed) cp -a "$B/$(basename "$path")" "$path" ;;
    esac
  done < "$B/MANIFEST"
  grep -q "^new-dir $EDID_DIR\$" "$B/MANIFEST" && rmdir "$EDID_DIR" 2>/dev/null
  log "files restored from $B/MANIFEST"
}

case "${1:-}" in
  --install) do_install ;;
  --verify)
    if why="$(check 0)"; then log "all checks passed"; else log "FAIL: $why"; exit 1; fi ;;
  --apply)
    do_install
    systemd-run --unit=fids-xorg-verify --collect -p Type=oneshot "$HERE/apply-kvm-xorg.sh" --restart-and-verify >/dev/null
    log "GDM restarts now; the result is in: journalctl -u fids-xorg-verify" ;;
  --restart-and-verify)
    LOGF="$(cat "$LAST")/verify.log"
    T0=$(date +%s)
    log "restarting gdm"
    systemctl restart gdm
    if wait_for "$T0"; then log "RESULT ok: the KVM settings are active"; exit 0; fi
    log "rolling back"
    do_rollback_files
    T1=$(date +%s)
    systemctl restart gdm
    if wait_for "$T1" basic; then log "RESULT rolled back: the desktop is up on the old settings"; else log "RESULT rolled back but the desktop did not come back: check the PC"; fi
    exit 1 ;;
  --rollback)
    do_rollback_files
    systemctl restart gdm
    log "GDM restarted on the previous settings" ;;
  *) echo "usage: apply-kvm-xorg.sh --install | --apply | --verify | --rollback" >&2; exit 2 ;;
esac
