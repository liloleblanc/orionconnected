#!/usr/bin/env bash
# Orion stream 2 (the Orlando / "tpa" box): Orlando -> Miami + royalty-free
# music. Finds the config that actually carries ap=MCO, so it can only ever
# touch the Orlando stream — Moncton is never restarted or changed.
set -uo pipefail
MUSIC="https://ec3.yesstreaming.net:3585/stream"

echo "== BEFORE =="
grep -rhE '^(STREAM_URL|MUSIC_URL)=' /opt/*/config.env 2>/dev/null

mapfile -t HITS < <(grep -rl 'ap=MCO' /opt --include=config.env 2>/dev/null)
if [ "${#HITS[@]}" -eq 0 ]; then
  echo
  echo "!! No config has ap=MCO (already Miami?). Nothing changed."
  exit 0
fi

RESTART=()
for c in "${HITS[@]}"; do
  cp "$c" "$c.bak" 2>/dev/null || true
  sed -i 's/ap=MCO/ap=MIA/g' "$c"
  grep -q '^MUSIC_URL=' "$c" && sed -i '/^MUSIC_URL=/d' "$c"
  printf 'MUSIC_URL="%s"\n' "$MUSIC" >> "$c"
  echo "updated: $c"
  RESTART+=( "$(basename "$(dirname "$c")").service" )   # e.g. fids-stream-tpa.service
done

for s in "${RESTART[@]}"; do
  if systemctl restart "$s" 2>/dev/null; then
    echo "restarted: $s"
  else
    echo "could not restart $s by name — restarting all stream services"
    mapfile -t ALL < <(systemctl list-units --type=service --all --plain --no-legend 2>/dev/null \
      | awk '{print $1}' | grep -Ei 'fids|stream')
    [ "${#ALL[@]}" -gt 0 ] && systemctl restart "${ALL[@]}" 2>/dev/null || true
  fi
done

sleep 4
echo
echo "== AFTER =="
grep -rhE '^(STREAM_URL|MUSIC_URL)=' /opt/*/config.env 2>/dev/null
echo
for s in "${RESTART[@]}"; do printf '%s -> %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null)"; done
echo
echo "DONE: Miami + music. YouTube catches up in ~2 min."
