#!/usr/bin/env bash
#
# Orion FIDS stream — add background music tracks by URL.
#
# Pulls one or more DIRECT audio-file URLs straight onto the stream box, drops
# them in the music folder, and restarts the stream so they start looping. Use
# it with Pixabay (or any royalty-free source) download links so you never have
# to copy files onto the server by hand.
#
#   HOW TO GET A PIXABAY LINK:
#     On https://pixabay.com/music/ open a track → click Download → right-click
#     the download button and "Copy link address". That link (a
#     cdn.pixabay.com/download/audio/… URL) is what you paste here. Only pick
#     tracks whose page doesn't show a Content-ID / "may be claimed" warning —
#     a claimed track can still interrupt a YouTube LIVE stream.
#
#   USAGE (run on the droplet, as root):
#     bash add-music.sh "https://cdn.pixabay.com/…/track1.mp3" "https://…/track2.mp3"
#   or feed a file with one URL per line:
#     bash add-music.sh --file my-tracks.txt
#   or pipe them in (note the trailing '-' to read stdin):
#     cat my-tracks.txt | bash add-music.sh -
#
#   Flags:
#     --replace   empty the music folder first (swap the whole playlist)
#     --no-restart  download only; don't restart the stream (batch several runs)
#
# Downloaded tracks OVERRIDE the generated ambient bed. To go back to the bed,
# empty /opt/fids-stream/music/ and re-run setup.sh (or `--replace` with no URLs
# won't restart to the bed — use setup.sh for that).
#
set -euo pipefail

MUSIC_DIR=/opt/fids-stream/music
MIXED=/opt/fids-stream/music.m4a
SERVICE=fids-stream

REPLACE=0
RESTART=1
URLS=()

# ── Parse args: flags, inline URLs, and --file / stdin URL lists ─────────────
while [ "$#" -gt 0 ]; do
  case "$1" in
    --replace)    REPLACE=1 ;;
    --no-restart) RESTART=0 ;;
    --file)
      shift
      [ -n "${1:-}" ] && [ -f "$1" ] || { echo "add-music: --file needs a readable file path" >&2; exit 1; }
      while IFS= read -r line; do
        line="${line%%#*}"; line="$(echo "$line" | tr -d '[:space:]')"
        [ -n "$line" ] && URLS+=("$line")
      done < "$1"
      ;;
    -)  # explicit "read URLs from stdin" (e.g. cat urls.txt | add-music.sh -)
      while IFS= read -r line; do
        line="${line%%#*}"; line="$(echo "$line" | tr -d '[:space:]')"
        [ -n "$line" ] && URLS+=("$line")
      done
      ;;
    http://*|https://*) URLS+=("$1") ;;
    *) echo "add-music: ignoring unrecognized argument '$1'" >&2 ;;
  esac
  shift
done

install -d "$MUSIC_DIR"

if [ "$REPLACE" -eq 1 ]; then
  echo "Clearing existing tracks in $MUSIC_DIR (--replace)…"
  rm -f "$MUSIC_DIR"/* 2>/dev/null || true
fi

if [ "${#URLS[@]}" -eq 0 ]; then
  echo "No URLs given. Nothing downloaded."
  echo "Example:  bash add-music.sh \"https://cdn.pixabay.com/…/track.mp3\""
  exit 0
fi

# ── Download each URL ────────────────────────────────────────────────────────
# A track that fails to download or won't decode is skipped (not fatal) so one
# bad link can't stop the rest — and can't take the stream down.
have_ffprobe=0; command -v ffprobe >/dev/null 2>&1 && have_ffprobe=1
ok=0; fail=0
for url in "${URLS[@]}"; do
  # Derive a clean filename from the URL (strip query string); fall back to a
  # counter, and force an audio extension if the URL didn't carry one.
  base="${url##*/}"; base="${base%%\?*}"
  case "$base" in
    *.mp3|*.m4a|*.aac|*.wav|*.flac|*.ogg) : ;;
    *) base="track-$((ok + fail + 1)).mp3" ;;
  esac
  # De-URL-encode spaces/%20 and sanitize to a safe filename.
  base="$(printf '%s' "$base" | sed 's/%20/ /g' | tr -c 'A-Za-z0-9 ._-' '_')"
  dest="$MUSIC_DIR/$base"

  echo "↓ $base"
  tmp="$dest.part"
  if curl -fsSL --retry 3 --retry-delay 2 --max-time 300 -o "$tmp" "$url"; then
    if [ "$have_ffprobe" -eq 1 ] && ! ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$tmp" 2>/dev/null | grep -q audio; then
      echo "  ✗ downloaded but has no decodable audio — skipped"
      rm -f "$tmp"; fail=$((fail + 1)); continue
    fi
    mv -f "$tmp" "$dest"
    ok=$((ok + 1))
  else
    echo "  ✗ download failed — skipped"
    rm -f "$tmp"; fail=$((fail + 1))
  fi
done

echo
echo "Added $ok track(s); $fail failed/skipped. Library now:"
ls -1 "$MUSIC_DIR" 2>/dev/null | sed 's/^/  /' || true

# New tracks changed the library → drop the cached blend so run.sh rebuilds it.
[ "$ok" -gt 0 ] && rm -f "$MIXED"

# ── Restart the stream so the new playlist takes effect ──────────────────────
if [ "$RESTART" -eq 1 ] && [ "$ok" -gt 0 ]; then
  if command -v systemctl >/dev/null 2>&1; then
    echo "Restarting $SERVICE…"
    systemctl restart "$SERVICE" && echo "✅ Streaming the new playlist. YouTube reflects it within a minute."
  else
    echo "systemctl not found — restart the stream however you run it to pick up the new tracks."
  fi
elif [ "$ok" -gt 0 ]; then
  echo "Downloaded (no restart requested). Run:  systemctl restart $SERVICE"
fi
