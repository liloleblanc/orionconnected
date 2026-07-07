# Orion FIDS → YouTube Live (24/7)

Streams the Moncton FIDS departures board to YouTube from a small cloud
server — no laptop left running. Headless Chrome renders the board, ffmpeg
encodes it, systemd keeps it alive forever.

## Quick start

1. **Create the droplet** — DigitalOcean → Ubuntu 24.04, Basic, 2 vCPU / 2–4 GB
   (the $18–24/mo size; 1 GB is too tight for 1080p Chrome).

2. **Enable YouTube live** — YouTube Studio → **Create → Go Live**. First time
   only, YouTube takes ~24 h to unlock live streaming, so do this a day ahead.
   Then copy the **Stream key** (Stream tab).

3. **On the droplet** (SSH in as root), run:

   ```bash
   wget -O setup.sh https://raw.githubusercontent.com/liloleblanc/orionconnected/main/stream-server/setup.sh
   sudo bash setup.sh
   ```

   (If the repo is private and that URL 401s, just paste the contents of
   `setup.sh` into a file on the droplet and `sudo bash setup.sh`.)

   Paste your stream key when prompted. That's it — YouTube goes live within a
   minute.

## What gets installed

- **Google Chrome** (headless kiosk) rendering
  `fids.orionconnected.com/fids.html?...&stream=1&theme=mist`
- **Xvfb** — a virtual 1920×1080 display for Chrome to draw into
- **ffmpeg** — grabs that display + a silent audio track → YouTube RTMP
- **fids-stream.service** — systemd unit; starts on boot, restarts on crash

## Day-to-day

```bash
journalctl -u fids-stream -f        # live logs
systemctl restart fids-stream       # restart
systemctl stop fids-stream          # stop the stream
```

**Change what's streamed** (different airport, theme, or a gate/baggage screen):
edit `STREAM_URL` in `/opt/fids-stream/config.env`, then
`systemctl restart fids-stream`.

- Baggage board: `.../bids.html?ap=YQM&mode=live&stream=1&theme=mist`
- Darker theme: swap `theme=mist` for `theme=tus-teal-deep`
- Sharper text: raise `VIDEO_BITRATE` in `config.env` to `6000k`

## Add background music (optional)

YouTube gets a silent audio track by default. To loop royalty-free music
instead, drop an `.mp3` at `/opt/fids-stream/music.mp3` and in `run.sh` replace
the `-f lavfi -i anullsrc=...` line with:

```
  -stream_loop -1 -i /opt/fids-stream/music.mp3 \
```

Then `systemctl restart fids-stream`. (Use music you're licensed to stream, or
YouTube may mute/claim the video.)

## Notes

- The board updates itself live — no need to reload; ffmpeg captures whatever
  Chrome shows.
- If the picture is black: `journalctl -u fids-stream -f` and check Chrome
  launched. On a 1 GB droplet Chrome can OOM — size up to 2 GB+.
