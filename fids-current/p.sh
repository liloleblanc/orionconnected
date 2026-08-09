#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# STOP THE STREAM WIPING YOUR SAVED DESIGN.   bash p.sh
#
# run.sh currently does `rm -rf .../chrome-profile` on every start. That was
# meant to clear Chrome's stale cache so deploys actually reach the stream —
# but it deletes the whole profile, and Local Storage lives inside it. Local
# Storage is where a board keeps:
#
#     • the Customize design  (theme, palette, row size, layout)
#     • the saved per-airport languages  (fids_langs_MCO)
#
# So every restart quietly reset the BAGS board to the stock look and dropped
# Orlando back to English/French.
#
# This patches run.sh to delete only the CACHE directories and leave the rest
# of the profile alone. Backs up to run.sh.bak first. Safe to run twice.
#
# NOTE: this stops FUTURE wipes. It cannot bring back a design already
# deleted — that has to be set again on the board once, and then it sticks.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

mapfile -t RUNS < <(find /opt -name run.sh 2>/dev/null | sort)
if [ "${#RUNS[@]}" -eq 0 ]; then
  echo; echo "  No /opt/**/run.sh found — is this the right server?"; echo; exit 1
fi

MARK='oc-cache-only'
PATCHED=0; ALREADY=0; NOMATCH=0

for r in "${RUNS[@]}"; do
  if grep -q "$MARK" "$r" 2>/dev/null; then
    ALREADY=$((ALREADY+1)); continue
  fi
  if ! grep -qE '^rm -rf .*chrome-profile[[:space:]]*$' "$r" 2>/dev/null; then
    NOMATCH=$((NOMATCH+1)); continue
  fi
  cp "$r" "$r.bak"
  awk '
    /^rm -rf .*chrome-profile[[:space:]]*$/ {
      p = $3
      print "# " MARK ": caches only. Local Storage holds the board design and the"
      print "# saved per-airport languages, so the profile itself must survive."
      print "find " p " -maxdepth 3 \\( -name Cache -o -name \"Code Cache\" -o -name GPUCache -o -name ShaderCache \\) -type d -prune -exec rm -rf {} + 2>/dev/null || true"
      next
    }
    { print }
  ' MARK="$MARK" "$r.bak" > "$r"
  chmod --reference="$r.bak" "$r" 2>/dev/null || chmod +x "$r"
  PATCHED=$((PATCHED+1))
  echo "  patched: $r   (backup: $r.bak)"
done

echo
echo "  patched:$PATCHED  already-ok:$ALREADY  no-wipe-line:$NOMATCH"

if [ "$PATCHED" -eq 0 ]; then
  echo; echo "  Nothing changed — no restart needed."; echo; exit 0
fi

mapfile -t SVCS < <(systemctl list-units --type=service --plain --no-legend 2>/dev/null \
  | awk '{print $1}' | grep -Ei 'fids|stream')
if [ "${#SVCS[@]}" -gt 0 ]; then
  echo "  restarting: ${SVCS[*]}"
  systemctl restart "${SVCS[@]}" 2>/dev/null
fi

echo
echo "=============================================="
echo " DONE. Settings you set from now on will STICK"
echo " across restarts. Give YouTube ~2 minutes."
echo "=============================================="
echo
