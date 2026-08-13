#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Update the YouTube STREAM KEY on this server.
#
#   bash tools/update-stream-key.sh                      # list masked keys
#   bash tools/update-stream-key.sh <key>                # one stream
#   bash tools/update-stream-key.sh <key> <match>        # select MCO/YQM
#                                  # <match>, e.g. MCO or YQM
#
# The key is passed as an argument and is never stored in this file.
# config.env stays chmod 600.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

mapfile -t CFGS < <(find /opt -name config.env 2>/dev/null)
if [ "${#CFGS[@]}" -eq 0 ]; then
  echo; echo "  No /opt/**/config.env found — is this the right server?"; echo; exit 1
fi

mask() {  # show only the last 4 characters of a key
  local k="$1"
  [ -z "$k" ] && { echo "(not set)"; return; }
  echo "…${k: -4}"
}

show() {
  echo
  echo "  Streams on this server:"
  for c in "${CFGS[@]}"; do
    local url key ap
    url="$(sed -n 's/^STREAM_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
    key="$(sed -n 's/^YT_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$c" | head -1)"
    ap="$(echo "$url" | sed -n 's/.*[?&]ap=\([A-Z]\{3\}\).*/\1/p')"
    printf '    %-28s airport %-4s key %s\n' "$c" "${ap:-?}" "$(mask "$key")"
  done
  echo
}

NEWKEY="${1-}"
MATCH="${2-}"

if [ -z "$NEWKEY" ]; then
  show
  echo "  To set one:   bash tools/update-stream-key.sh <key>"
  echo "                bash tools/update-stream-key.sh <key> MCO"
  echo
  exit 0
fi

# Which config(s) are we changing?
TARGETS=()
if [ -n "$MATCH" ]; then
  for c in "${CFGS[@]}"; do
    grep -q "$MATCH" "$c" && TARGETS+=("$c")
  done
  if [ "${#TARGETS[@]}" -eq 0 ]; then
    echo; echo "  Nothing matched '$MATCH'."; show; exit 1
  fi
else
  if [ "${#CFGS[@]}" -gt 1 ]; then
    echo; echo "  More than one stream here — say which:"
    show
    echo "  e.g.  bash tools/update-stream-key.sh <key> MCO"; echo
    exit 1
  fi
  TARGETS=("${CFGS[0]}")
fi

for c in "${TARGETS[@]}"; do
  cp "$c" "$c.bak"
  sed -i '/^YT_KEY=/d' "$c"
  printf 'YT_KEY="%s"\n' "$NEWKEY" >> "$c"
  chmod 600 "$c"
  echo "  updated: $c   (backup: $c.bak)"
done

mapfile -t SVCS < <(systemctl list-units --type=service --plain --no-legend 2>/dev/null \
  | awk '{print $1}' | grep -Ei 'fids|stream')
if [ "${#SVCS[@]}" -gt 0 ]; then
  echo "  restarting: ${SVCS[*]}"
  systemctl restart "${SVCS[@]}" 2>/dev/null
fi

sleep 6
echo
echo "=============================================="
echo " KEY UPDATED — YouTube should reconnect in ~1 min."
echo "=============================================="
echo
