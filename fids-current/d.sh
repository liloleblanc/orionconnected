#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Diagnostics for the FIDS→YouTube streams on this server.
#   bash d.sh
# Prints service state, encoder settings, resources and recent log lines for
# every stream found. Stream keys are MASKED — only the last 4 characters are
# shown — so the output is safe to screenshot.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

line() { printf '%s\n' "------------------------------------------------------------"; }

echo
line
echo " RESOURCES"
line
uptime
echo
free -m | head -2
echo
echo "cores: $(nproc)"

line
echo " SERVICES"
line
systemctl list-units --type=service --all --plain --no-legend 2>/dev/null \
  | grep -Ei 'fids|stream' \
  | awk '{printf "  %-28s %-10s %-10s %s\n",$1,$3,$4,$5}' || echo "  none found"

line
echo " STREAMS"
line
for c in $(find /opt -name config.env 2>/dev/null); do
  d="$(dirname "$c")"
  url="$(sed -n 's/^STREAM_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  key="$(sed -n 's/^YT_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  ap="$(echo "$url"  | sed -n 's/.*[?&]ap=\([A-Z]\{3\}\).*/\1/p')"
  br="$(sed -n 's/^VIDEO_BITRATE="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  wh="$(sed -n 's/^WIDTH="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)x$(sed -n 's/^HEIGHT="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  mus="$(sed -n 's/^MUSIC_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
  echo "  $d"
  echo "     airport   : ${ap:-?}"
  echo "     size/rate : $wh @ ${br:-?}"
  echo "     key       : ${key:+…${key: -4}}${key:-(not set)}"
  echo "     music     : ${mus:+set}${mus:-none}"
  if [ -f "$d/run.sh" ]; then
    if grep -q 'nal-hrd' "$d/run.sh"; then
      echo "     encoder   : CBR padding PRESENT"
    else
      echo "     encoder   : NO CBR padding  <-- YouTube 'not enough video'"
    fi
    if grep -q 'rm -rf .*chrome-profile' "$d/run.sh"; then
      echo "     chrome    : cache wiped each start"
    else
      echo "     chrome    : STALE CACHE possible (old run.sh)"
    fi
  else
    echo "     run.sh    : MISSING"
  fi
  echo
done

line
echo " RECENT LOGS"
line
for s in $(systemctl list-units --type=service --all --plain --no-legend 2>/dev/null \
           | awk '{print $1}' | grep -Ei 'fids|stream'); do
  echo "  == $s =="
  journalctl -u "$s" -n 12 --no-pager 2>/dev/null | sed 's/^/    /' | tail -12
  echo
done

line
echo " PROCESSES"
line
ps -eo pcpu,pmem,etime,comm --sort=-pcpu 2>/dev/null | head -8 | sed 's/^/  /'
echo
