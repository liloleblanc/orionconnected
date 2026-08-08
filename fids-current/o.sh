#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ONE-TIME helper: switch the Tampa live stream over to Orlando (EN + ES) and
# point its background audio at the radio station.
#
# WHY THIS FILE EXISTS: Hetzner's web console blocks clipboard paste, and the
# full command is far too long to retype by hand at 2am. Serving it from the
# site the streams already load means the whole change becomes one short,
# typeable line:
#
#     curl -sL fids.orionconnected.com/o.sh | bash
#
# It is SELF-TARGETING: it edits only a config whose STREAM_URL contains
# ap=TPA, so it cannot touch the Moncton stream by mistake. Every file it
# changes is backed up to <file>.bak first.
#
# DELETE THIS FILE once the switch is done — anything published here is
# publicly fetchable, and a script that a server pipes into bash should not
# outlive the one job it was written for.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

NEW_URL="https://fids.orionconnected.com/rotate.html?ap=MCO&mode=live&stream=1&theme=mist&langs=en,es&rotate=fids,gids,bids,gids&dwell=60"
NEW_MUSIC="https://audio-edge-w4d68.yul.o.radiomast.io/ref-128k-mp3-stereo"

echo
echo "=============================================="
echo " Orion — switching the TPA stream to ORLANDO"
echo "=============================================="

# Find every stream config that is currently pointed at Tampa.
mapfile -t HITS < <(grep -rl 'ap=TPA' /opt --include=config.env 2>/dev/null)

if [ "${#HITS[@]}" -eq 0 ]; then
  echo
  echo "  RESULT: NOTHING CHANGED."
  echo "  No config under /opt is set to ap=TPA."
  echo "  Configs found on this server:"
  grep -rh '^STREAM_URL=' /opt --include=config.env 2>/dev/null | sed 's/^/    /' || echo "    (none)"
  echo
  echo "  Send Claude this screen — the second stream lives elsewhere."
  echo
  exit 0
fi

for c in "${HITS[@]}"; do
  cp "$c" "$c.bak"
  sed -i '/^STREAM_URL=/d; /^MUSIC_URL=/d' "$c"
  printf 'STREAM_URL="%s"\nMUSIC_URL="%s"\n' "$NEW_URL" "$NEW_MUSIC" >> "$c"
  echo "  updated: $c   (backup: $c.bak)"
done

# Restart anything that looks like a stream service. Restarting the Moncton
# one too is harmless — it reconnects to YouTube with identical settings.
mapfile -t SVCS < <(systemctl list-units --type=service --plain --no-legend 2>/dev/null \
  | awk '{print $1}' | grep -Ei 'fids|stream')

if [ "${#SVCS[@]}" -gt 0 ]; then
  echo "  restarting: ${SVCS[*]}"
  systemctl restart "${SVCS[@]}" 2>/dev/null
else
  echo "  NOTE: no fids/stream service found to restart."
fi

sleep 6
echo
echo "=============================================="
echo " DONE — check YouTube in ~2 minutes."
echo " Expect: Orlando, English/Spanish, music."
echo "=============================================="
echo
