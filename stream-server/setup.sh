#!/usr/bin/env bash
#
# Orion FIDS → YouTube Live — one-shot installer for an Ubuntu server (Hetzner Cloud).
#
# What it does: installs Google Chrome + ffmpeg + a virtual display, then sets
# up a systemd service that runs the FIDS board (stream mode) full-screen in
# headless Chrome and pushes it to YouTube 24/7. Auto-starts on boot and
# auto-restarts if anything hiccups.
#
# Run it (as root) on the server — SSH, or Hetzner's `>_` web console:
#     sudo bash setup.sh
#
# Requirements: Ubuntu 22.04 or 24.04, ~2 GB RAM (2 vCPU / 2-4 GB recommended
# for smooth 1080p30), and a YouTube stream key (YouTube Studio → Create →
# Go Live → Stream → "Stream key"). Enable live streaming on the channel at
# least 24 h before the first go-live — YouTube gates it for new channels.
#
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
# On a RE-RUN, reuse whatever was saved last time (resolution, bitrate, URL,
# key) so a plain `bash setup.sh` keeps your existing setup. Precedence per
# setting: env var you pass  >  saved value  >  default. To change one thing,
# just prepend it, e.g.  VIDEO_BITRATE=8000k bash setup.sh.
_saved() {  # read one KEY="value" line from the saved config, if present
  [ -f /opt/fids-stream/config.env ] || return 0
  sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" /opt/fids-stream/config.env | head -1
}

# The board to stream. rotate.html is the in-place rotator: it preloads all
# the boards once and cross-fades between them with no page reloads, so the
# cadence stays exact and nothing re-splashes. rotate= is the ordered cycle
# (Departures → Gates → Bags → Gates — gates shown between each) and dwell= is
# seconds per screen. For a single fixed board, point STREAM_URL at
# fids.html / gids.html / bids.html directly instead.
#
# &langs=en,es pins the board's two languages for an unattended screen. A
# streamer has no operator to press the language toggle, and the URL param
# outranks the saved/admin layers, so it survives a profile wipe or a server
# rebuild. Omit it and the board falls back to its regional default
# (en,fr in Canada; en,es only for the airports in ES_BOARD_AIRPORTS).
#
# The two live streams:
#   1. Moncton  (YQM) — English + French, the default below
#   2. Orlando  (MCO) — English + Spanish, see ORLANDO_URL under "Presets"
STREAM_URL="${STREAM_URL:-$(_saved STREAM_URL)}"
STREAM_URL="${STREAM_URL:-https://fids.orionconnected.com/rotate.html?ap=YQM&mode=live&stream=1&theme=mist&langs=en,fr&rotate=fids,gids,bids,gids&dwell=60}"

# ── Presets ───────────────────────────────────────────────────────────────
# Stream 2 — ORLANDO, English + Spanish (was Tampa). Use with:
#   STREAM_URL="$ORLANDO_URL" MUSIC_URL="$ORION_RADIO" bash setup.sh
ORLANDO_URL="https://fids.orionconnected.com/rotate.html?ap=MCO&mode=live&stream=1&theme=mist&langs=en,es&rotate=fids,gids,bids,gids&dwell=60"
# The station Nick uses for the stream's background audio.
ORION_RADIO="https://audio-edge-w4d68.yul.o.radiomast.io/ref-128k-mp3-stereo"

# Capture size + framerate + bitrate. Defaults (below) suit a 1 vCPU server:
# 720p @ 20 fps. On a 2+ vCPU box run once with 1080p and it sticks:
#   WIDTH=1920 HEIGHT=1080 FRAMERATE=30 VIDEO_BITRATE=6000k bash setup.sh
WIDTH="${WIDTH:-$(_saved WIDTH)}";                 WIDTH="${WIDTH:-1280}"
HEIGHT="${HEIGHT:-$(_saved HEIGHT)}";              HEIGHT="${HEIGHT:-720}"
FRAMERATE="${FRAMERATE:-$(_saved FRAMERATE)}";     FRAMERATE="${FRAMERATE:-20}"
VIDEO_BITRATE="${VIDEO_BITRATE:-$(_saved VIDEO_BITRATE)}"; VIDEO_BITRATE="${VIDEO_BITRATE:-3500k}"

# Optional background music. Two ways (MUSIC_URL wins if both are set):
#   • MUSIC_URL = a DIRECT audio stream URL (Icecast/SHOUTcast/HLS/.mp3 stream),
#     e.g.  MUSIC_URL="https://example.com/stream.mp3" bash setup.sh
#     NOT a YouTube/Spotify/webpage link. Only use a stream you're licensed to
#     rebroadcast — YouTube Content ID mutes/strikes copyrighted audio.
#   • otherwise, audio files dropped in /opt/fids-stream/music/ (looped).
#   • otherwise, silent.
# Pass MUSIC_URL="" to clear a saved stream and fall back to files/silence.
MUSIC_URL="${MUSIC_URL-$(_saved MUSIC_URL)}"

echo "== Orion FIDS → YouTube Live setup =="
echo "Streaming: $STREAM_URL"
echo

# ── 1. Stream key ───────────────────────────────────────────────────────────
# Re-running to apply an update? Reuse the key already on disk so you don't
# have to paste it again.
if [ -z "${YT_KEY:-}" ]; then
  YT_KEY="$(_saved YT_KEY)"
  [ -n "$YT_KEY" ] && echo "Reusing the stream key already saved on this server."
fi
if [ -z "${YT_KEY:-}" ]; then
  read -rp "Paste your YouTube stream key: " YT_KEY
fi
[ -n "$YT_KEY" ] || { echo "No stream key given — aborting."; exit 1; }

# ── 2. Dependencies ─────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
echo "Installing packages (Chrome, ffmpeg, Xvfb, fonts)…"
apt-get update -y
apt-get install -y wget ca-certificates ffmpeg xvfb fonts-liberation \
  fonts-dejavu-core xdg-utils

# Google Chrome stable — more reliable headless than the chromium snap.
if ! command -v google-chrome >/dev/null 2>&1; then
  wget -q -O /tmp/chrome.deb \
    https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y /tmp/chrome.deb
  rm -f /tmp/chrome.deb
fi
CHROME_BIN="$(command -v google-chrome)"
echo "Chrome: $CHROME_BIN"

# ── 3. Config + launcher ────────────────────────────────────────────────────
install -d /opt/fids-stream
install -d /opt/fids-stream/music   # drop licensed audio files here for music

cat > /opt/fids-stream/config.env <<CFG
STREAM_URL="$STREAM_URL"
YT_KEY="$YT_KEY"
CHROME_BIN="$CHROME_BIN"
WIDTH="$WIDTH"
HEIGHT="$HEIGHT"
FRAMERATE="$FRAMERATE"
VIDEO_BITRATE="$VIDEO_BITRATE"
MUSIC_URL="$MUSIC_URL"
CFG
chmod 600 /opt/fids-stream/config.env   # keeps the stream key private

# Quoted heredoc — nothing expands here; values come from config.env at runtime.
cat > /opt/fids-stream/run.sh <<'RUN'
#!/usr/bin/env bash
set -euo pipefail
source /opt/fids-stream/config.env
export DISPLAY=:99

# Virtual framebuffer at the configured size
Xvfb :99 -screen 0 "${WIDTH}x${HEIGHT}x24" -nolisten tcp &
XVFB_PID=$!
sleep 2

# Full-screen kiosk Chrome pointed at the stream board. --disable-gpu et al.
# keep a 1-core box from wasting cycles on (failing) GPU init.
# CACHES ONLY — never the whole profile. rotate.html and the board HTML carry
# no cache token, and Chrome's persistent profile was pinning OLD copies across
# restarts, so deploys never reached the stream. The first fix for that was
# `rm -rf chrome-profile`, which ALSO deleted Local Storage — and Local Storage
# is where a board keeps its Customize design (theme, palette, row size) and its
# saved per-airport languages. So every restart silently reset the BAGS board to
# the stock look and dropped Orlando back to English/French.
#
# Deleting the cache directories does the whole job the stale-deploy fix needed
# and leaves the design alone. --disk-cache-size=1 below already keeps the disk
# cache at nothing; this clears whatever a previous run left behind.
rm -rf /opt/fids-stream/chrome-profile/Default/Cache \
       /opt/fids-stream/chrome-profile/Default/"Code Cache" \
       /opt/fids-stream/chrome-profile/GPUCache \
       /opt/fids-stream/chrome-profile/ShaderCache 2>/dev/null || true
"$CHROME_BIN" \
  --kiosk --no-sandbox --no-first-run --no-default-browser-check \
  --user-data-dir=/opt/fids-stream/chrome-profile --disk-cache-size=1 \
  --disable-infobars --disable-session-crashed-bubble \
  --disable-features=Translate --autoplay-policy=no-user-gesture-required \
  --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage \
  --force-device-scale-factor=1 --hide-scrollbars \
  --window-position=0,0 --window-size="${WIDTH},${HEIGHT}" "$STREAM_URL" &
CHROME_PID=$!
sleep 8   # let the board load its fonts + first data

# Audio source, in priority order:
#   1. MUSIC_URL — a live audio stream (radio-style). Reconnect flags keep it
#      going if the stream briefly drops.
#   2. audio files dropped in /opt/fids-stream/music/ (looped).
#   3. silent track.
#   IMPORTANT: only use audio you're licensed to broadcast (YouTube Audio
#   Library, a stream-safe/royalty-free service, a track you own, etc.).
#   Copyrighted music — including most internet radio — gets caught by YouTube
#   Content ID and the stream is muted or the channel struck.
MUSIC_DIR=/opt/fids-stream/music
PLAYLIST=/opt/fids-stream/playlist.txt
# nullglob → unmatched patterns vanish (no literal '*.wav'); nocaseglob → .MP3 too
shopt -s nullglob nocaseglob
MUSIC_FILES=("$MUSIC_DIR"/*.mp3 "$MUSIC_DIR"/*.m4a "$MUSIC_DIR"/*.aac \
             "$MUSIC_DIR"/*.wav "$MUSIC_DIR"/*.flac "$MUSIC_DIR"/*.ogg)
shopt -u nullglob nocaseglob
if [ -n "${MUSIC_URL:-}" ]; then
  echo "Music: live audio stream — $MUSIC_URL"
  # -reconnect* → survive brief drops; -nostdin so a stalled input can't hang.
  AUDIO_IN=(-nostdin -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 \
            -reconnect_delay_max 5 -i "$MUSIC_URL")
elif [ "${#MUSIC_FILES[@]}" -gt 0 ]; then
  # Pre-blend all tracks into ONE uniform file and loop that, instead of
  # looping a live concat playlist. Files off the internet have mixed sample
  # rates / channel counts, and the live concat demuxer quit at the seam
  # between two mismatched tracks — ffmpeg exited and systemd restarted the
  # whole stream every couple of minutes. Baking one clean AAC file offline
  # (tolerant re-encode) removes every seam, so the live loop can't choke.
  # Cached: only rebuilt when a track is added/changed. If the bake fails for
  # any reason, we fall back to silence so the STREAM never goes down.
  MIXED=/opt/fids-stream/music.m4a
  WORK=/opt/fids-stream/_musicwork
  STAMP="$WORK/.normalized"
  # Step 1 (cached): normalize EACH track on its own to identical AAC/44.1k/stereo.
  # One-at-a-time (not via a mixed concat) means a weird or half-downloaded file
  # just gets skipped instead of killing the whole blend. The normalized tracks are
  # KEPT in $WORK between runs and only rebuilt when a track is added/changed, so a
  # plain restart doesn't pay the ~minute re-encode.
  if [ ! -e "$STAMP" ] || [ -n "$(find "${MUSIC_FILES[@]}" -newer "$STAMP" 2>/dev/null)" ]; then
    echo "Music: normalizing ${#MUSIC_FILES[@]} track(s) (first run takes ~a minute)…"
    rm -rf "$WORK"; mkdir -p "$WORK"
    i=0
    for f in "${MUSIC_FILES[@]}"; do
      if ffmpeg -y -hide_banner -loglevel error -i "$f" -vn -ar 44100 -ac 2 \
           -c:a aac -b:a 128k -f mp4 "$WORK/$i.m4a" 2>/dev/null; then :; else
        echo "Music: skipped (won't decode) $(basename "$f")"
      fi
      i=$((i + 1))
    done
    touch "$STAMP"
  fi
  # Step 2 (EVERY start): shuffle the normalized tracks into a fresh RANDOM order and
  # stitch them into one clean loop. This is a fast stream copy (no re-encode), so
  # every `systemctl restart fids-stream` reorders the playlist — that's how you get
  # a new random order. -f mp4 forces the muxer so the .part temp name can't confuse
  # ffmpeg's format detection (that instant 'blend failed' was ffmpeg unable to guess
  # a format for 'music.m4a.part').
  shopt -s nullglob; NORM=("$WORK"/*.m4a); shopt -u nullglob
  if [ "${#NORM[@]}" -gt 0 ]; then
    printf '%s\n' "${NORM[@]}" | shuf | sed "s/.*/file '&'/" > "$PLAYLIST"
    if ffmpeg -y -hide_banner -loglevel error \
         -f concat -safe 0 -i "$PLAYLIST" -c copy -f mp4 "$MIXED.part"; then
      mv -f "$MIXED.part" "$MIXED"
    else
      rm -f "$MIXED.part"
    fi
  fi
  if [ -s "$MIXED" ]; then
    echo "Music: looping ${#MUSIC_FILES[@]} track(s) from $MUSIC_DIR"
    AUDIO_IN=(-stream_loop -1 -i "$MIXED")
  else
    echo "Music: blend failed — streaming silent audio (stream stays up)"
    AUDIO_IN=(-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100)
  fi
else
  echo "Music: none set — streaming silent audio"
  AUDIO_IN=(-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100)
fi

# Capture the framebuffer + the audio track → YouTube RTMP.
#  -map: explicitly send BOTH the video (input 0) and the audio (input 1).
#        Without this the audio stream was dropped → YouTube reported
#        "audio bitrate 0".
#  -thread_queue_size: the capture thread was blocking on a 1-core box
#        ("Thread message queue blocking"); a bigger queue absorbs the jitter.
#  CBR:  a near-static departures board compresses to a tiny bitrate, which
#        YouTube reads as "not receiving enough video" and buffers. minrate=
#        maxrate=bitrate + nal-hrd=cbr pads to a constant bitrate so YouTube
#        always gets a full, smooth stream.
#  ultrafast: lightest CPU preset — lets a single core hold the framerate.
#  -draw_mouse 0: don't capture the headless browser's mouse cursor (it was
#                 showing as a pointer stuck in the middle of the stream).
#  -shortest is deliberately omitted so the (looped) music never ends the run.
ffmpeg -loglevel warning \
  -f x11grab -draw_mouse 0 -thread_queue_size 1024 -video_size "${WIDTH}x${HEIGHT}" -framerate "$FRAMERATE" -i :99 \
  "${AUDIO_IN[@]}" \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
  -b:v "$VIDEO_BITRATE" -minrate "$VIDEO_BITRATE" -maxrate "$VIDEO_BITRATE" -bufsize "$VIDEO_BITRATE" \
  -x264-params "nal-hrd=cbr:force-cfr=1" \
  -g "$((FRAMERATE * 2))" -r "$FRAMERATE" -c:a aac -b:a 128k -ar 44100 \
  -f flv "rtmp://a.rtmp.youtube.com/live2/$YT_KEY"

# ffmpeg exited → tear down so systemd restarts from a clean slate
kill "$CHROME_PID" "$XVFB_PID" 2>/dev/null || true
RUN
chmod +x /opt/fids-stream/run.sh

# ── 4. systemd service ──────────────────────────────────────────────────────
cat > /etc/systemd/system/fids-stream.service <<'SVC'
[Unit]
Description=Orion FIDS -> YouTube Live
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/opt/fids-stream/run.sh
Restart=always
RestartSec=5
User=root
# give Chrome a moment to die between restarts
TimeoutStopSec=10
KillMode=mixed

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable fids-stream.service
# restart (not just 'enable --now') so RE-RUNNING this installer actually
# applies the new run.sh — '--now' alone won't touch an already-running service.
systemctl restart fids-stream.service

echo
echo "✅ Streaming. YouTube Studio should show the feed 'live' within a minute."
echo
echo "  Watch logs:   journalctl -u fids-stream -f"
echo "  Restart:      systemctl restart fids-stream"
echo "  Stop:         systemctl stop fids-stream"
echo "  Change board: edit /opt/fids-stream/config.env, then restart"
echo "  Music (files):  put licensed audio in /opt/fids-stream/music/, restart"
echo "  Music (stream): MUSIC_URL=\"https://…/stream.mp3\" bash setup.sh"
echo "                  (direct audio stream only; both must be music you're"
echo "                   licensed to rebroadcast — YouTube Content ID mutes/"
echo "                   strikes copyrighted audio, incl. most internet radio)"
