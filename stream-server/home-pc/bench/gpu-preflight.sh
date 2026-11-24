#!/usr/bin/env bash
# GPU preflight: can Chrome draw on the NVIDIA GPU (ANGLE over Vulkan) inside Xvfb?
# Runs stream 1 for about a minute on a throwaway display :93, demo board, billed
# paths blocked, output discarded, and prints PASS or FAIL with the reasons.
# usage: sudo gpu-preflight.sh OUT_DIR ["extra Chrome flags"]
set -uo pipefail
OUT="${1:-/var/lib/fids-home/bench/preflight}"
EXTRA="${2:-}"
UNIT=fids-gpu-preflight
install -d -o fidsstream -g fidsstream "$OUT"
rm -f "$OUT"/gpu-1.json "$OUT"/guard-1.json "$OUT"/frame.raw

runuser -u fidsstream -- env -u DISPLAY vulkaninfo --summary > "$OUT/vulkaninfo.txt" 2>&1
VK="$(grep -m1 'deviceName' "$OUT/vulkaninfo.txt" | sed 's/.*= *//')"
VKD="$(grep -m1 'driverID' "$OUT/vulkaninfo.txt" | sed 's/.*= *//')"
echo "vulkan: ${VK:-none} (${VKD:-?})"

{ cat /etc/fids-home/stream-1.env; echo
  echo "RENDER=gpu"; echo "ENCODER=x264"; echo "OUTPUT=null"; echo "MODE_OVERRIDE=demo"
  echo "NET_GUARD=1"; echo "CDP_PORT=9293"; echo "DISPLAY_NUM=93"; echo "BENCH_DIR=$OUT"
  echo "CHROME_EXTRA_ARGS=$EXTRA"; } > "$OUT/stream.env"
systemctl stop "$UNIT" 2>/dev/null; systemctl reset-failed "$UNIT" 2>/dev/null
T0="$(date '+%F %T')"
systemd-run --unit="$UNIT" --collect -p User=fidsstream -p Group=fidsstream -p SupplementaryGroups="video render" \
  -p EnvironmentFile="$OUT/stream.env" -p StateDirectory=fids-home/preflight -p RuntimeDirectory=fids-home/preflight \
  -p "Environment=TZ=Etc/UTC LANG=C.UTF-8" /opt/fids-home/bin/stream-run 1 >/dev/null
for _ in $(seq 1 30); do [ -s "$OUT/gpu-1.json" ] && break; sleep 2; done
sleep 20
nvidia-smi pmon -c 1 -s u > "$OUT/pmon.txt" 2>&1
CG="$(systemctl show -p ControlGroup --value "$UNIT")"
ONGPU=no
for p in $(awk '$2 ~ /^[0-9]+$/ { print $2 }' "$OUT/pmon.txt"); do
  grep -qx "$p" "/sys/fs/cgroup$CG/cgroup.procs" 2>/dev/null && ONGPU=yes
done
runuser -u fidsstream -- timeout 15 ffmpeg -hide_banner -nostdin -loglevel error -f x11grab -draw_mouse 0 -video_size 1920x1080 \
  -i :93 -frames:v 1 -vf scale=192:108,format=gray -f rawvideo - > "$OUT/frame.raw" 2>/dev/null
runuser -u fidsstream -- timeout 15 ffmpeg -hide_banner -nostdin -loglevel error -y -f x11grab -draw_mouse 0 -video_size 1920x1080 \
  -i :93 -frames:v 1 "$OUT/frame.png" 2>/dev/null
journalctl -u "$UNIT" --since "$T0" -o cat --no-pager > "$OUT/journal.txt" 2>&1
systemctl stop "$UNIT"

python3 - "$OUT" "$ONGPU" <<'PY'
import json, sys, os
out, ongpu = sys.argv[1], sys.argv[2]
why = []
try:
    info = json.load(open(os.path.join(out, "gpu-1.json")))
except Exception as e:
    info = {}
    why.append("no GPU info from Chrome (%s)" % e)
gpu = info.get("gpu", {})
fs = gpu.get("featureStatus", {})
ren = gpu.get("auxAttributes", {}).get("glRenderer", "")
if fs.get("gpu_compositing") != "enabled":
    why.append("gpu_compositing=%s" % fs.get("gpu_compositing"))
if not str(fs.get("rasterization", "")).startswith("enabled"):
    why.append("rasterization=%s" % fs.get("rasterization"))
if "Vulkan" not in ren or "NVIDIA" not in ren or "SwiftShader" in ren:
    why.append("renderer=%r" % ren)
if ongpu != "yes":
    why.append("no Chrome process listed by nvidia-smi pmon")
try:
    px = open(os.path.join(out, "frame.raw"), "rb").read()
    if not px or len(set(px)) < 4:
        why.append("the captured frame is uniform")
except OSError:
    why.append("no frame captured")
print("renderer: %s" % ren)
print("features: %s" % json.dumps({k: fs.get(k) for k in ("gpu_compositing", "rasterization", "vulkan", "webgl")}))
print("PASS" if not why else "FAIL: " + "; ".join(why))
sys.exit(0 if not why else 1)
PY
