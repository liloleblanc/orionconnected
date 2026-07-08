#!/usr/bin/env bash
#
# Orion FIDS → YouTube Live — one-shot installer for an Ubuntu droplet.
#
# What it does: installs Google Chrome + ffmpeg + a virtual display, then sets
# up a systemd service that runs the FIDS board (stream mode) full-screen in
# headless Chrome and pushes it to YouTube 24/7. Auto-starts on boot and
# auto-restarts if anything hiccups.
#
# Run it (as root) on the droplet:
#     sudo bash setup.sh
#
# Requirements: Ubuntu 22.04 or 24.04, ~2 GB RAM (2 vCPU / 2-4 GB recommended
# for smooth 1080p30), and a YouTube stream key (YouTube Studio → Create →
# Go Live → Stream → "Stream key"). Enable live streaming on the channel at
# least 24 h before the first go-live — YouTube gates it for new channels.
#
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
# The board to stream. Change ap= for a different airport, or theme= /
# stream= flags. Keep mode=live for real flight data.
STREAM_URL="${STREAM_URL:-https://fids.orionconnected.com/fids.html?ap=YQM&mode=live&stream=1&theme=mist}"

# Capture size + framerate + bitrate. Defaults are tuned for a 1 vCPU
# droplet: 720p @ 20 fps is plenty for a departures board and a single core
# can encode it while holding a steady bitrate. If you resize the droplet to
# 2+ vCPU and want crisp 1080p, set these before running:
#   WIDTH=1920 HEIGHT=1080 FRAMERATE=30 VIDEO_BITRATE=6000k sudo bash setup.sh
WIDTH="${WIDTH:-1280}"
HEIGHT="${HEIGHT:-720}"
FRAMERATE="${FRAMERATE:-20}"
VIDEO_BITRATE="${VIDEO_BITRATE:-3500k}"

echo "== Orion FIDS → YouTube Live setup =="
echo "Streaming: $STREAM_URL"
echo

# ── 1. Stream key ───────────────────────────────────────────────────────────
# Re-running to apply an update? Reuse the key already on disk so you don't
# have to paste it again.
if [ -z "${YT_KEY:-}" ] && [ -f /opt/fids-stream/config.env ]; then
  YT_KEY="$( . /opt/fids-stream/config.env >/dev/null 2>&1; printf '%s' "${YT_KEY:-}" )"
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

cat > /opt/fids-stream/config.env <<CFG
STREAM_URL="$STREAM_URL"
YT_KEY="$YT_KEY"
CHROME_BIN="$CHROME_BIN"
WIDTH="$WIDTH"
HEIGHT="$HEIGHT"
FRAMERATE="$FRAMERATE"
VIDEO_BITRATE="$VIDEO_BITRATE"
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
"$CHROME_BIN" \
  --kiosk --no-sandbox --no-first-run --no-default-browser-check \
  --disable-infobars --disable-session-crashed-bubble \
  --disable-features=Translate --autoplay-policy=no-user-gesture-required \
  --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage \
  --force-device-scale-factor=1 --hide-scrollbars \
  --window-position=0,0 --window-size="${WIDTH},${HEIGHT}" "$STREAM_URL" &
CHROME_PID=$!
sleep 8   # let the board load its fonts + first data

# Capture the framebuffer + a silent audio track → YouTube RTMP.
#  -map: explicitly send BOTH the video (input 0) and the silent audio
#        (input 1). Without this the audio stream was dropped → YouTube
#        reported "audio bitrate 0".
#  -thread_queue_size: the capture thread was blocking on a 1-core box
#        ("Thread message queue blocking"); a bigger queue absorbs the jitter.
#  CBR:  a near-static departures board compresses to a tiny bitrate, which
#        YouTube reads as "not receiving enough video" and buffers. minrate=
#        maxrate=bitrate + nal-hrd=cbr pads to a constant bitrate so YouTube
#        always gets a full, smooth stream.
#  ultrafast: lightest CPU preset — lets a single core hold the framerate.
#  -draw_mouse 0: don't capture the headless browser's mouse cursor (it was
#                 showing as a pointer stuck in the middle of the stream).
ffmpeg -loglevel warning \
  -f x11grab -draw_mouse 0 -thread_queue_size 1024 -video_size "${WIDTH}x${HEIGHT}" -framerate "$FRAMERATE" -i :99 \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
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
