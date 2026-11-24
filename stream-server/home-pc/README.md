# Both YouTube streams from a home PC

This directory runs the two 24/7 board streams on a desktop PC with an NVIDIA
GPU (Ubuntu 24.04, proprietary driver), instead of on the two cloud boxes that
`../setup.sh` builds. Each stream draws on its own virtual screen, so nothing
depends on the monitor, the KVM or the desktop session.

| | Stream 1 (Moncton) | Stream 2 (tour) |
|---|---|---|
| Board | `rotate.html?ap=YQM&mode=live&stream=1&langs=en,fr&...` (as `setup.sh`) | `rotate.html?ap=MIA&mode=live&stream=2&langs=en,es&...` (as `STREAM_DESIRED`) |
| Virtual screen | Xvfb `:91`, 1920x1080 | Xvfb `:92`, 1920x1080 |
| Local relay | `127.0.0.1:1936` | `127.0.0.1:1937` |
| Units | `fids-home-rtmp@1`, `fids-home-stream@1` | `fids-home-rtmp@2`, `fids-home-stream@2` |

```
Xvfb :91 ── Chrome (kiosk, board) ── ffmpeg x11grab ─▶ nginx relay 127.0.0.1:1936 ─▶ YouTube
             (GPU: ANGLE on Vulkan)    (1080p30, CBR)      (fids-home-rtmp@1)          (push)
```

* **The key never sits in a command line.** ffmpeg sends to the local relay;
  only the relay config (root only, in `/run`) carries the YouTube address.
  A YouTube drop is retried by the relay while Chrome and ffmpeg keep running.
* **One process down means a clean restart.** `stream-run` starts Xvfb,
  Chrome and ffmpeg and waits on all three; when any of them ends it stops the
  others and systemd starts the stream again. A dead Chrome cannot leave
  ffmpeg sending a frozen screen.
* **A watchdog** (`fids-home-watchdog.timer`, every 30 s) restarts a stream
  whose encoder stalls or whose picture stays frozen or black for 3 minutes,
  restarts a relay with no connection out to YouTube for 2 minutes, and starts
  an enabled stream that is down. At most 4 of its restarts per stream per hour.

## Files

| Path on the PC | From |
|---|---|
| `/opt/fids-home/bin/` | `bin/` (stream-run, rtmp-render, set-stream-key, fids-watchdog, fids-diag, wait-desktop, progress-sink, cdp-guard.py) |
| `/opt/fids-home/bench/`, `/opt/fids-home/xorg/` | `bench/`, `xorg/` |
| `/etc/fids-home/stream-N.env` | `config/stream-N.env` (installed once, then local) |
| `/etc/fids-home/stream-N.override.env` | optional; read after the env file, so its lines win |
| `/etc/credstore/fids-stream-N.key` | written only by `set-stream-key` (root, 0600) |
| `/var/lib/fids-home/stream-N/` | Chrome profile (Local Storage keeps the Customize designs) |
| `/run/fids-home/` | progress files, the rendered relay configs, watchdog state |
| `/etc/systemd/system/fids-home-*` | `systemd/` |

Chrome runs as the system user `fidsstream`, never as root and never as the
desktop user.

## Install

```bash
sudo bash install.sh
```

It installs ffmpeg, Xvfb, nginx with the RTMP module and Google Chrome stable
(from the signed Google apt repository), creates the user and directories,
installs the units, and enables only the watchdog timer. It masks the stock
`nginx.service` first, because the Ubuntu package would otherwise start a web
server on port 80. It never touches Xorg, the network, automatic updates,
stream keys or the cloud boxes, and starts no stream. Run it again after
pulling changes. `CHROME_POLICY=1 sudo bash install.sh` also installs a Chrome
policy that turns off the translate bar and the default browser prompt (Chrome
then shows "Managed by your organization" on this PC).

## Test mode

```bash
sudo install -m 0644 /opt/fids-home/config/test-override.env /etc/fids-home/stream-1.override.env
sudo systemctl start fids-home-stream@1     # also starts fids-home-rtmp@1
sudo fids-diag
```

The override loads the board with `mode=demo`, blocks the billed proxy paths
inside Chrome (`cdp-guard.py`, below) and keeps the video on the local relay.
Delete the override file to go back to the normal settings.

### The network guard (`NET_GUARD=1`)

Chrome starts on `about:blank` with DevTools on 127.0.0.1. `cdp-guard.py`
attaches to every page, frame and worker before it runs and pauses every
request to the flight proxy (`*.workers.dev`). Only board settings, media lists
and hotel offers are let through (`ALLOW_PATHS`); every other proxy path is
answered with `BlockedByClient`. A self-test request must be blocked before the
board loads, and a proxy response off the allow list stops the stream (exit 4).
Measured: the demo boards do ask for `flights`, `yqm`, `acinfo`, `fararr`,
`opinfo`, `proxy/flights` and `ai/citybg`, so demo mode alone is not free.

## Day to day

```bash
sudo fids-diag                               # one screen: both streams, push, key fingerprint, leak count
journalctl -u fids-home-stream@1 -f          # stream log (one progress line a minute)
journalctl -u fids-home-rtmp@1 -f            # relay log
journalctl -u fids-home-watchdog -n 20       # watchdog decisions
sudo systemctl restart fids-home-stream@1    # restart one stream
sudo systemctl disable --now fids-home-stream@1 fids-home-rtmp@1   # stop one stream
```

The watchdog starts an *enabled* stream that is down, so a stream is stopped
with `disable --now`, not with `stop` alone.

Change a board: edit `STREAM_URL` in `/etc/fids-home/stream-N.env`, then
restart that stream.

## Stream keys

```bash
sudo set-stream-key 1          # hidden input, asked twice; restarts the relay
sudo set-stream-key 1 --clear  # remove it
```

The key is read with `read -s` and written with shell builtins, so it is never
in an argument list. It is refused when it has characters other than letters,
digits and dashes, or when the other stream already uses it. Without a key, a
stream with `OUTPUT=youtube` stops at once with
`FATAL[stream-N]: no YouTube stream key for stream N on this PC` and exit
status 78, which systemd does not retry. `fids-diag` shows only the first
8 hex characters of the key sha256, and counts the journal lines that contain
the key (it must say 0).

No YouTube or Google sign-in is needed on this PC. YouTube Studio is used from
any signed-in device to copy keys, to create an unlisted test broadcast on a
new key, to turn Auto-stop off, and to watch stream health.

## Switchover (one stream at a time)

1. **Test broadcast on a new key.** In Studio create a new stream key and an
   unlisted broadcast on it. On the PC, keep the test override but replace
   `OUTPUT=local` with `OUTPUT=youtube`, run `sudo set-stream-key 1` with the
   test key, then `sudo systemctl start fids-home-stream@1` (start, not
   enable). Watch Studio stream health for a day; `fids-diag` must show push UP
   and a leak count of 0. End with
   `sudo systemctl stop fids-home-stream@1 fids-home-rtmp@1 && sudo set-stream-key 1 --clear`.
2. **Before the move:** set Auto-stop off on the public broadcast, so the short
   gap does not end it.
3. **Move stream 1.** Delete `/etc/fids-home/stream-1.override.env`. Run
   `sudo set-stream-key 1` with the real key. In the cloud console of box 1:
   `sudo systemctl disable --now fids-stream` and
   `sudo systemctl disable --now stream-agent.timer` (the agent would otherwise
   start the cloud stream again on the same key). Wait 15 s, then on the PC:
   `sudo systemctl enable --now fids-home-rtmp@1 fids-home-stream@1`.
4. **Rollback:** PC `sudo systemctl disable --now fids-home-stream@1 fids-home-rtmp@1`,
   wait 15 s, cloud box `sudo systemctl enable --now fids-stream stream-agent.timer`.
   Never run both on one key at once.
5. **Stream 2** the same way after two stable days (on box 2 the unit may be
   `fids-stream-tpa`: check with `systemctl list-units 'fids*'`).
6. Keep the cloud boxes, units and agent timers disabled, for about two weeks
   before deleting them. Until then do not change `STREAM_CONTROL` or
   `STREAM_DESIRED` in the proxy.

### Direct output (emergency only)

`OUTPUT=direct` makes ffmpeg send straight to YouTube without the relay. The
key is then visible in the process list and can appear in ffmpeg error lines.
It needs the key as a unit credential:

```bash
sudo systemctl edit fids-home-stream@1   # add:  [Service]  LoadCredential=fids-stream-1.key:/etc/credstore/fids-stream-1.key
```

## Settings (`/etc/fids-home/stream-N.env`)

| Key | Values |
|---|---|
| `RENDER` | `gpu` (ANGLE on Vulkan, chosen by the bench) or `software` |
| `ENCODER` | `nvenc` (chosen by the bench; x264 is used for a start when the NVENC self-test fails) or `x264` (veryfast, padded CBR) |
| `VIDEO_BITRATE` | `8M` |
| `OUTPUT` | `youtube`, `local` (relay, no push), `file:/path`, `null`, `direct` |
| `NET_GUARD`, `MODE_OVERRIDE` | test mode, see above |
| `MUSIC_URL` | a live audio station (not a file); empty means generated silence. `music/loop.m4a` in the state directory is looped when present |

Audio is generated silence (`anullsrc`): YouTube needs one audio track, and a
local source cannot stall or end the run. The cloud boxes read a 300 s
`silence.wav` from the proxy with `-reconnect_at_eof`; the proxy (like
`python3 -m http.server`) ignores Range requests, and ffmpeg 6.1 then re-requests
the end of the file in a tight loop and the video stops: the bench replica (R1)
froze 300 s in. `MUSIC_URL` here is therefore read without `-reconnect_at_eof`,
with `apad` filling silence if the station ends. Video is tagged BT.709
limited range.

## Bench

```bash
sudo /opt/fids-home/bench/gpu-preflight.sh /var/lib/fids-home/bench/preflight
sudo /opt/fids-home/bench/bench-run.sh R2 gpu nvenc 8M 600
```

`bench-run.sh` runs both streams at once in demo mode with the guard on, to
local files, and scores minutes 2 to 10 (`analyze.py`):

| Gate | Pass when |
|---|---|
| G1 | the guard self-test passed and no blocked path got a response |
| G2 | ffmpeg speed at least 0.98 in 99% of samples, never under 0.95 |
| G3 | duplicated plus dropped frames at most 0.5% |
| G4 | requestAnimationFrame p99 at most 50 ms, at most 3 gaps over 250 ms |
| G5 | every 10 s of video at least 70% of the target bitrate |
| G6 | CPU at most 85 C, GPU at most 80 C, no throttling |
| G7 | no restarts and no component exits |
| G8 | Chrome reports GPU compositing on the NVIDIA GPU (gpu runs) |
| G9 | no audio gap over 100 ms |

### Results (both streams at once, 1080p30, demo boards, minutes 2 to 10)

| Run | Chrome | Encoder | rAF gaps over 50 / 250 ms (stream 1 + 2) | dup+drop | CPU (whole PC) | Stream CPU (cores) | Failed gates |
|---|---|---|---|---|---|---|---|
| R1 cloud replica | software, cloud flags | x264 ultrafast 6M, cloud audio input | 13+877 / 4+16 | 0 | 21% | 0.9 + 5.3 | G2, G4, G7 |
| R1, first 4.8 min | | | 2+572 / 0+9 | 0 | 22% | 1.4 + 2.0 | G4 |
| R0 replica, 2 threads each | software, cloud flags | x264 ultrafast 6M, silent audio | 8+54 / 0+13 | 0 | 9% | 0.6 + 0.9 | G4 |
| **R2** | **GPU** | **NVENC 8M** | **4+44 / 0+5** | **0** | **19%** | **1.3 + 1.7** | G4 (stream 2) |
| R2 again, performance profile | GPU | NVENC 8M | 3+52 / 0+9 | 0 | 19% | 1.2 + 1.7 | G4 (stream 2) |
| R3 | GPU | x264 veryfast 8M | 38+73 / 0+11 | 0 | 26% | 1.7 + 2.4 | G4 |

* **GPU drawing with NVENC is the setting in the env files.** It has the
  steadiest frames and the lowest CPU, and NVENC held 8000 kbps in every 10 s
  window, so CBR padding is not needed. GPU 48 C, 40 W, NVENC about 32%.
* **No run passes G4**, because of stream 2: the tour pauses the page main
  thread for 250 to 650 ms when a board or an airport loads (once a minute or
  so). It happens with every setting, including the cloud replica, so it comes
  from the page, not from the PC.
* **The cloud audio input stops the video.** In R1 the 300 s silence file
  ended, ffmpeg re-requested its end offset tens of thousands of times a minute,
  the video froze, both ffmpeg processes grew to 7 GB in under a minute and the
  kernel killed Chrome of stream 2 (out of memory). The home streams use
  generated silence and a 4 GB memory limit per stream.
* Demo boards are lighter than live ones (the gate screens show no data with
  the billed paths blocked). A 150 s live check of both boards on this PC
  (GPU, NVENC): 30 fps, speed 1.00, 0 duplicated or dropped frames, 8000 kbps,
  24% CPU (1.6 + 2.2 cores).
* Stream 2 tours from its saved resume point, so it shows different airports in
  different runs; stream 1 (Moncton) is the like for like comparison.

## KVM

`xorg/20-fids-kvm.conf` keeps the desktop X screen configured when the KVM
switches this PC away (a DisplayPort hot-unplug): `ConnectedMonitor` and
`CustomEDID` hold the monitor output, and `LimitFrameRateWhenHeadless false`
stops the 1 frame per second limit with no active display. The streams do not
use the desktop screen; this protects the desktop only.

```bash
sudo EDID_MD5=<md5 of the monitor EDID> /opt/fids-home/xorg/apply-kvm-xorg.sh --apply
journalctl -u fids-xorg-verify          # the result, within 3 minutes
sudo /opt/fids-home/xorg/apply-kvm-xorg.sh --verify
sudo /opt/fids-home/xorg/apply-kvm-xorg.sh --rollback
```

`--apply` backs up, copies the live EDID to `/etc/X11/edid/dfp-4.bin`, installs
the config, restarts GDM (the desktop logs out and auto-logs in again) and
checks for 180 s: an x11 session on seat0, Xorg on the GPU, the three options in
the Xorg log with no new `(EE)` lines, and the monitor output connected. On any
failure it rolls back by itself. Rollback by hand:
`sudo rm -f /etc/X11/xorg.conf.d/20-fids-kvm.conf && sudo systemctl restart gdm`.
DFP-4 is the DisplayPort socket in use; a monitor on the other socket needs its
own EDID and a `DFP-1` entry. The EDID file is never committed (it carries the
monitor serial number).

### Network

When a USB network adapter sits behind the KVM, the default route must not
use it, or a switch-away cuts the upload. Either turn its connection off, or
keep it as a non-default route:

```bash
nmcli connection modify <usb-connection> connection.autoconnect no && nmcli connection down <usb-connection>
# or
nmcli connection modify <usb-connection> ipv4.never-default yes ipv6.never-default yes ipv4.route-metric 600
```

`fids-diag` warns when the default route goes through a USB adapter.

## Updates

* **Chrome** is not updated by unattended-upgrades. Monthly:
  `sudo apt-get install --only-upgrade google-chrome-stable`, then restart
  stream 1, wait 2 minutes, and restart stream 2.
* **NVIDIA driver security updates** replace the user-space libraries before
  the next reboot. Until then the NVENC self-test fails and that stream uses
  x264, and Chrome may fall back to software drawing; the stream stays up.
  Reboot soon after such an update.
