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
- Languages: `&langs=en,es` — see below

## The two streams

| # | Airport | Languages | `STREAM_URL` |
|---|---------|-----------|--------------|
| 1 | Moncton `YQM` | English + French | `.../rotate.html?ap=YQM&mode=live&stream=1&theme=mist&langs=en,fr&rotate=fids,gids,bids,gids&dwell=60` |
| 2 | **Orlando `MCO`** | **English + Spanish** | `.../rotate.html?ap=MCO&mode=live&stream=1&theme=mist&langs=en,es&rotate=fids,gids,bids,gids&dwell=60` |

Stream 2 used to run Tampa (`TPA`); it's Orlando now. Both airports have a
native feed, so this is purely a URL change — no code or feed work.

### Why `&langs=`

An unattended streamer has nobody to press the language toggle, so the board's
languages have to come from the URL. `langs` outranks the saved-per-airport
choice and the admin config, so it survives a browser-profile wipe or a droplet
rebuild. Without it, `MCO` would fall back to the regional default of
English + French.

`langs` is deliberately separate from the temperature unit: Orlando stays in
**°F** on English + Spanish. (Adding `MCO` to the Spanish-board list would have
been the shorter change, but that list also drives Celsius.)

### Switching stream 2 to Orlando

On that droplet:

```bash
sudo nano /opt/fids-stream/config.env      # set STREAM_URL + MUSIC_URL
sudo systemctl restart fids-stream
```

Or in one shot, without hand-editing:

```bash
STREAM_URL="https://fids.orionconnected.com/rotate.html?ap=MCO&mode=live&stream=1&theme=mist&langs=en,es&rotate=fids,gids,bids,gids&dwell=60" \
MUSIC_URL="https://audio-edge-w4d68.yul.o.radiomast.io/ref-128k-mp3-stereo" \
sudo -E bash setup.sh
```

Both values are remembered in `config.env`, so later runs of `setup.sh` keep
them unless you pass new ones.

## Background music

YouTube gets a silent audio track by default. Two ways to change that —
`MUSIC_URL` wins if both are set:

**A live radio stream** (what stream 2 uses). Set `MUSIC_URL` to a **direct**
audio stream — Icecast/SHOUTcast/HLS/`.mp3` — not a YouTube, Spotify or web
page link:

```bash
MUSIC_URL="https://audio-edge-w4d68.yul.o.radiomast.io/ref-128k-mp3-stereo" \
sudo -E bash setup.sh
```

ffmpeg reconnects automatically if the station drops, and `-shortest` is
deliberately omitted so audio trouble can never end the video run.

**Local files** — drop audio into `/opt/fids-stream/music/`. They're normalized
to a common format once, then shuffled into a single seamless loop; each
`systemctl restart fids-stream` reshuffles the order.

Pass `MUSIC_URL=""` to clear a saved station and fall back to files, then
silence.

> Only stream audio you're licensed to rebroadcast — YouTube Content ID mutes
> or strikes copyrighted music.

## Notes

- The board updates itself live — no need to reload; ffmpeg captures whatever
  Chrome shows.
- If the picture is black: `journalctl -u fids-stream -f` and check Chrome
  launched. On a 1 GB droplet Chrome can OOM — size up to 2 GB+.
