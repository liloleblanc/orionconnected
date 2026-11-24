#!/usr/bin/env bash
# Installs, checks or removes the NVIDIA settings that keep the desktop screen
# configured while the KVM is switched to the other computer (20-fids-kvm.conf).
#   --install   back up, then copy each monitor EDID and write the config file (no restart)
#   --apply     --install, then restart GDM and verify for up to 180 s in a
#               detached unit (fids-xorg-verify); it rolls back by itself on failure
#   --verify    the checks only: x11 session on seat0, Xorg on the GPU, the three
#               options in the Xorg log with no new (EE) lines, the outputs connected
#   --rollback  undo the last --install from its manifest, then restart GDM
#               (nothing is restarted when nothing was installed)
# Environment:
#   MONITORS       every DisplayPort output in use, as NVIDIA_NAME=EDID_SOURCE pairs
#                  separated by spaces (default: DFP-4=/sys/class/drm/card1-DP-2/edid).
#                  ConnectedMonitor overrides detection, so an output left out stays dark;
#                  --install refuses when more outputs are connected than listed.
#   EDID_MD5       the expected md5 of each EDID source, in the same order (optional)
#   XRANDR_OUTPUTS the X output names that must be connected after the restart (default DP-2)
# Never commit an EDID file: it carries the monitor serial number.
set -uo pipefail
HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CONF_SRC="$HERE/20-fids-kvm.conf"
CONF=/etc/X11/xorg.conf.d/20-fids-kvm.conf
EDID_DIR=/etc/X11/edid
MONITORS="${MONITORS:-DFP-4=/sys/class/drm/card1-DP-2/edid}"
read -ra MON <<< "$MONITORS"
read -ra MD5S <<< "${EDID_MD5:-}"
read -ra XOUTS <<< "${XRANDR_OUTPUTS:-DP-2}"
BACKUP_ROOT=/var/backups/fids-home
LAST=/var/lib/fids-home/xorg-last-backup
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
LOGF=""
log() { echo "apply-kvm-xorg: $*"; [ -z "$LOGF" ] || echo "$(date -Is) $*" >> "$LOGF"; return 0; }

# The names and files the config uses, from MONITORS.
CONNECTED=""; EDIDS=""; TARGETS=()
for m in "${MON[@]}"; do
  name="${m%%=*}"
  [[ "$name" =~ ^DFP-[0-9]+$ ]] || { echo "bad MONITORS entry: $m" >&2; exit 2; }
  f="$EDID_DIR/$(printf '%s' "$name" | tr 'A-Z' 'a-z').bin"
  CONNECTED="${CONNECTED:+$CONNECTED, }$name"
  EDIDS="${EDIDS:+$EDIDS; }$name:$f"
  TARGETS+=("$f")
done

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
xrandr_desktop() {   # xrandr --query on the desktop screen, as the desktop user
  local su user uid x
  su="$(seat_session)" || return 1
  user="${su#* }"; uid="$(id -u "$user")"
  for x in /tmp/.X11-unix/X*; do
    [ "$(stat -c %u "$x" 2>/dev/null)" = "$uid" ] || continue
    runuser -u "$user" -- env DISPLAY=":${x##*/X}" XAUTHORITY="/run/user/$uid/gdm/Xauthority" xrandr --query 2>/dev/null
    return $?
  done
  return 1
}
xorg_log() { ls -t /home/*/.local/share/xorg/Xorg.*.log /var/log/Xorg.*.log 2>/dev/null | head -1; }
ee_lines() { grep -F '(EE)' "$1" 2>/dev/null | sed 's/^\[ *[0-9.]*\] //' | sort -u; }

edid_ok() {   # edid_ok FILE [MD5]
  local f="$1" n
  [ -r "$f" ] || { log "cannot read $f"; return 1; }
  n=$(wc -c < "$f")
  { [ "$n" -ge 128 ] && [ $((n % 128)) -eq 0 ]; } || { log "$f: EDID size $n is not a multiple of 128"; return 1; }
  [ "$(od -An -tx1 -N8 "$f" | tr -d ' \n')" = 00ffffffffffff00 ] || { log "$f: EDID header missing"; return 1; }
  od -An -v -tu1 "$f" | tr -s ' ' '\n' | grep -v '^$' \
    | awk '{ s += $1; if (NR % 128 == 0) { if (s % 256) bad = 1; s = 0 } } END { exit bad }' \
    || { log "$f: EDID block checksum is wrong"; return 1; }
  if [ -n "${2:-}" ] && [ "$(md5sum < "$f" | cut -d' ' -f1)" != "$2" ]; then
    log "$f: EDID md5 differs from the expected one"; return 1
  fi
  return 0
}

do_install() {
  local B L t i m n
  for i in "${!MON[@]}"; do
    m="${MON[$i]}"
    edid_ok "${m#*=}" "${MD5S[$i]:-}" || { log "not installing: the EDID at ${m#*=} failed its checks"; exit 1; }
  done
  n="$(xrandr_desktop | grep -c ' connected')"
  if [ "${n:-0}" -gt "${#MON[@]}" ]; then
    log "not installing: $n outputs are connected but MONITORS lists ${#MON[@]}; list every one (ConnectedMonitor turns the others off)"
    exit 1
  fi
  B="$BACKUP_ROOT/xorg-$(date +%Y%m%d-%H%M%S)"
  install -d -m 0700 "$B" || { log "cannot create the backup dir $B"; exit 1; }
  {
    echo "created $(date -Is) by apply-kvm-xorg.sh --install"
    if [ -d "$EDID_DIR" ]; then echo "existed-dir $EDID_DIR"; else echo "new-dir $EDID_DIR"; fi
    for t in "$CONF" "${TARGETS[@]}"; do
      if [ -e "$t" ]; then cp -a "$t" "$B/" || exit 1; echo "existed $t"; else echo "new $t"; fi
    done
  } > "$B/MANIFEST" || { log "backup failed; nothing installed"; exit 1; }
  L="$(xorg_log)"
  if [ -n "$L" ]; then ee_lines "$L" > "$B/ee-baseline.txt"; else : > "$B/ee-baseline.txt"; fi
  install -d -m 0755 /etc/X11/xorg.conf.d "$EDID_DIR" || exit 1
  for i in "${!MON[@]}"; do
    install -m 0644 "${MON[$i]#*=}" "${TARGETS[$i]}" || exit 1
  done
  sed -e "s|@CONNECTED@|$CONNECTED|" -e "s|@EDIDS@|$EDIDS|" "$CONF_SRC" > "$CONF.tmp" && chmod 0644 "$CONF.tmp" \
    && mv -f "$CONF.tmp" "$CONF" || exit 1
  install -d -m 0755 "$(dirname "$LAST")"
  echo "$B" > "$LAST"
  log "installed $CONF ($CONNECTED) and ${#TARGETS[@]} EDID file(s); backup and manifest in $B"
}

# check [SINCE_EPOCH] [basic]: 0 when every check passes, else prints the first failure
check() {
  local since="${1:-0}" basic="${2:-}" L B x xr o
  seat_session > /dev/null || { echo "no active x11 user session on seat0"; return 1; }
  nvidia-smi 2>/dev/null | grep -q '/usr/lib/xorg/Xorg' || { echo "Xorg is not listed by nvidia-smi"; return 1; }
  [ "$basic" = basic ] && return 0
  L="$(xorg_log)"
  [ -n "$L" ] || { echo "no Xorg log found"; return 1; }
  [ "$(stat -c %Y "$L")" -ge "$since" ] || { echo "the newest Xorg log predates the restart"; return 1; }
  grep -qF "Option \"ConnectedMonitor\" \"$CONNECTED\"" "$L" || { echo "ConnectedMonitor not in $L"; return 1; }
  grep -qF "Option \"CustomEDID\" \"$EDIDS\"" "$L" || { echo "CustomEDID not in $L"; return 1; }
  grep -qF 'Option "LimitFrameRateWhenHeadless" "false"' "$L" || { echo "LimitFrameRateWhenHeadless not in $L"; return 1; }
  B="$(cat "$LAST" 2>/dev/null)"
  if [ -n "$B" ] && [ -f "$B/ee-baseline.txt" ]; then
    x="$(ee_lines "$L" | comm -23 - "$B/ee-baseline.txt")"
    [ -z "$x" ] || { echo "new (EE) lines in $L: $(echo "$x" | head -3 | tr '\n' ' ')"; return 1; }
  fi
  xr="$(xrandr_desktop)" || { echo "xrandr on the desktop screen failed"; return 1; }
  for o in "${XOUTS[@]}"; do
    printf '%s\n' "$xr" | grep -Eq "^$o connected.* [0-9]+x[0-9]+\+[0-9]+\+[0-9]+" \
      || { echo "$o is not connected with a mode"; return 1; }
  done
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

# Restores the files of the last --install. Returns 1 when there was nothing to undo.
do_rollback_files() {
  local B kind path
  B="$(cat "$LAST" 2>/dev/null)"
  if [ -z "$B" ] || [ ! -f "$B/MANIFEST" ]; then
    [ -e "$CONF" ] || { log "nothing installed, nothing to undo"; return 1; }
    log "no manifest; removing $CONF only"; rm -f "$CONF"; return 0
  fi
  while read -r kind path; do
    case "$kind" in
      new) rm -f "$path" ;;
      existed) cp -a "$B/$(basename "$path")" "$path" ;;
    esac
  done < "$B/MANIFEST"
  grep -q "^new-dir $EDID_DIR\$" "$B/MANIFEST" && rmdir "$EDID_DIR" 2>/dev/null
  mv -f "$LAST" "$LAST.rolled-back"
  log "files restored from $B/MANIFEST"
  return 0
}

case "${1:-}" in
  --install) do_install ;;
  --verify)
    if why="$(check 0)"; then log "all checks passed"; else log "FAIL: $why"; exit 1; fi ;;
  --apply)
    do_install
    systemd-run --unit=fids-xorg-verify --collect -p Type=oneshot \
      -p "Environment=MONITORS=$MONITORS" -p "Environment=XRANDR_OUTPUTS=${XOUTS[*]}" \
      "$HERE/apply-kvm-xorg.sh" --restart-and-verify >/dev/null
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
    if do_rollback_files; then
      systemctl restart gdm
      log "GDM restarted on the previous settings"
    else
      log "GDM not restarted"
    fi ;;
  *) echo "usage: apply-kvm-xorg.sh --install | --apply | --verify | --rollback" >&2; exit 2 ;;
esac
