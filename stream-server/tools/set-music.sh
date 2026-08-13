#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Change (or silence) the background music on the ORLANDO stream.
#
#   bash tools/set-music.sh 1            # configured radio preset
#   bash tools/set-music.sh off          # no music
#   bash tools/set-music.sh <stream-url> # direct Icecast/SHOUTcast/.mp3
#
# Numbered presets exist so a long station URL never has to be typed into
# Hetzner's console, which is narrow enough that long lines get split mid-
# command. Send Claude a station link and it gets added here as a number.
#
# Only touches the config whose STREAM_URL contains ap=MCO, so the Moncton
# stream's audio is never affected. Backs up to <file>.bak first.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

P1="https://audio-edge-w4d68.yul.o.radiomast.io/ref-128k-mp3-stereo"

case "${1-}" in
  "")   echo; echo "  Usage: bash tools/set-music.sh 1 | off | <url>"; echo
        echo "  Current setting:"
        grep -h '^MUSIC_URL=' /opt/*/config.env 2>/dev/null | sed 's/^/    /' || echo "    (none)"
        echo; exit 0 ;;
  1)    NEW="$P1" ;;
  off|OFF|none|silent) NEW="" ;;
  http*) NEW="$1" ;;
  *)    echo; echo "  Not a stream URL. Use 1, off, or a link starting with http."; echo; exit 1 ;;
esac

# The Orlando config only.
mapfile -t HITS < <(grep -rl 'ap=MCO' /opt --include=config.env 2>/dev/null)
if [ "${#HITS[@]}" -eq 0 ]; then
  echo; echo "  NOTHING CHANGED — no config found with ap=MCO."; echo; exit 0
fi

for c in "${HITS[@]}"; do
  cp "$c" "$c.bak"
  sed -i '/^MUSIC_URL=/d' "$c"
  printf 'MUSIC_URL="%s"\n' "$NEW" >> "$c"
  echo "  updated: $c"
done

mapfile -t SVCS < <(systemctl list-units --type=service --plain --no-legend 2>/dev/null \
  | awk '{print $1}' | grep -Ei 'fids|stream')
[ "${#SVCS[@]}" -gt 0 ] && systemctl restart "${SVCS[@]}" 2>/dev/null

sleep 5
echo
echo "=============================================="
if [ -z "$NEW" ]; then
  echo " MUSIC OFF — the stream is silent now."
else
  echo " MUSIC CHANGED. Give YouTube ~2 minutes."
fi
echo "=============================================="
echo
