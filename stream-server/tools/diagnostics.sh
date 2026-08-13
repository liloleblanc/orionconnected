#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Compact diagnostics for the FIDS→YouTube streams.
# Usage: bash tools/diagnostics.sh
#
# Deliberately ~15 lines. Hetzner's web console has no scrollback and no copy,
# so anything longer scrolls the useful part off the top — which is exactly
# what happened with the first version of this script.
# Keys are masked; safe to screenshot.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

CORES=$(nproc 2>/dev/null || echo '?')
LOAD=$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)
MEM=$(free -m 2>/dev/null | awk '/^Mem:/{printf "%d/%dMB used", $3, $2}')
CPU=$(ps -eo pcpu= 2>/dev/null | awk '{s+=$1} END{printf "%d%%", s}')

echo
echo "CORES $CORES   LOAD $LOAD   MEM $MEM   CPU $CPU"
echo "------------------------------------------------------------"

for c in $(find /opt -name config.env 2>/dev/null | sort); do
  d="$(dirname "$c")"
  url="$(sed -n 's/^STREAM_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  key="$(sed -n 's/^YT_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  ap="$(echo "$url" | sed -n 's/.*[?&]ap=\([A-Z]\{3\}\).*/\1/p')"
  br="$(sed -n 's/^VIDEO_BITRATE="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  hw="$(sed -n 's/^WIDTH="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)x$(sed -n 's/^HEIGHT="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  svc="$(basename "$d")"
  st="$(systemctl is-active "${svc}.service" 2>/dev/null || echo '?')"
  cbr='NO-CBR!'; grep -q 'nal-hrd' "$d/run.sh" 2>/dev/null && cbr='cbr-ok'
  cch='STALE!';  grep -q 'rm -rf .*chrome-profile' "$d/run.sh" 2>/dev/null && cch='cache-ok'
  printf '%-4s %-9s %-10s %-8s %-8s key…%s\n' \
    "${ap:-?}" "$st" "$hw@${br:-?}" "$cbr" "$cch" "${key: -4}"
done

echo "------------------------------------------------------------"
for s in $(systemctl list-units --type=service --all --plain --no-legend 2>/dev/null \
           | awk '{print $1}' | grep -Ei 'fids|stream'); do
  n=$(journalctl -u "$s" --since '20 min ago' --no-pager 2>/dev/null | grep -ci 'error\|failed\|Broken pipe\|Connection reset')
  r=$(systemctl show "$s" -p NRestarts --value 2>/dev/null)
  printf '%-26s restarts:%-4s errors/20min:%s\n' "$s" "${r:-?}" "$n"
done
echo
