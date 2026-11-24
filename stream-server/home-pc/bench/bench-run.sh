#!/usr/bin/env bash
# Runs both streams at once for one bench case and measures them.
# Always mode=demo with the billed proxy paths blocked, and the video goes to
# local files only. Results land in /var/lib/fids-home/bench/ID.
# usage: sudo bench-run.sh ID RENDER ENCODER BITRATE [SECONDS]
#        sudo bench-run.sh --prune        (removes runs older than 14 days)
# Optional environment: BENCH_CPUS_1 / BENCH_CPUS_2 (AllowedCPUs for each stream),
#   BENCH_MUSIC_URL (audio input), HETZNER_REPLICA=1 (cloud box audio flags).
set -euo pipefail
ROOT=/var/lib/fids-home/bench
HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
if [ "${1:-}" = --prune ]; then
  find "$ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +14 -print -exec rm -rf {} +
  exit 0
fi
[ $# -ge 4 ] || { echo "usage: bench-run.sh ID RENDER ENCODER BITRATE [SECONDS]" >&2; exit 2; }
ID="$1"; RENDER="$2"; ENC="$3"; BR="$4"; DUR="${5:-600}"
D="$ROOT/$ID"
for N in 1 2; do systemctl is-active --quiet "fids-home-stream@$N" && { echo "fids-home-stream@$N is running; stop it first" >&2; exit 1; }; done
install -d -m 0755 -o fidsstream -g fidsstream "$D"
rm -f "$D"/*.csv "$D"/*.jsonl "$D"/*.json "$D"/s?.flv

for N in 1 2; do
  {
    cat "/etc/fids-home/stream-$N.env"; echo
    echo "# bench overrides"
    echo "MODE_OVERRIDE=demo"; echo "NET_GUARD=1"; echo "CDP_PORT=929$N"
    echo "OUTPUT=file:$D/s$N.flv"; echo "RENDER=$RENDER"; echo "ENCODER=$ENC"; echo "VIDEO_BITRATE=$BR"
    echo "BENCH_DIR=$D"; echo "HETZNER_REPLICA=${HETZNER_REPLICA:-0}"; echo "MUSIC_URL=${BENCH_MUSIC_URL:-}"
  } > "$D/stream-$N.env"
done

UNITS=()
for N in 1 2; do
  U="fids-bench-$ID-$N"
  systemctl stop "$U" 2>/dev/null || true; systemctl reset-failed "$U" 2>/dev/null || true
  CPUS_VAR="BENCH_CPUS_$N"; EXTRA=()
  [ -z "${!CPUS_VAR:-}" ] || EXTRA=(-p "AllowedCPUs=${!CPUS_VAR}")
  systemd-run --unit="$U" -p User=fidsstream -p Group=fidsstream -p SupplementaryGroups="video render" \
    -p EnvironmentFile="$D/stream-$N.env" -p StateDirectory="fids-home/bench-$N" -p RuntimeDirectory="fids-home/bench-$N" \
    -p "Environment=TZ=Etc/UTC LANG=C.UTF-8" -p CPUWeight=200 -p IOWeight=200 -p MemoryHigh=3G -p MemoryMax=4G -p Restart=always -p RestartSec=5 \
    -p KillMode=control-group -p TimeoutStopSec=15 "${EXTRA[@]}" /opt/fids-home/bin/stream-run "$N" >/dev/null
  UNITS+=("$U")
done
echo "$(date -Is) started ${UNITS[*]} for $DUR s (render=$RENDER encoder=$ENC bitrate=$BR)"
date +%s > "$D/start.txt"

"$HERE/sample.sh" "$D/sys.csv" "$DUR" "${UNITS[0]}" "${UNITS[1]}" &
SAMPLER=$!
nvidia-smi --query-gpu=timestamp,utilization.gpu,utilization.encoder,utilization.decoder,encoder.stats.sessionCount,encoder.stats.averageFps,temperature.gpu,power.draw,clocks.gr,memory.used,clocks_event_reasons.active \
  --format=csv,noheader,nounits -l 5 > "$D/gpu.csv" 2>&1 &
GPUMON=$!
sleep 60
nvidia-smi pmon -c 1 -s u > "$D/pmon.txt" 2>&1 || true
for N in 1 2; do
  cat "/sys/fs/cgroup$(systemctl show -p ControlGroup --value "${UNITS[$((N - 1))]}")/cgroup.procs" > "$D/procs-$N.txt" 2>/dev/null || true
done
wait "$SAMPLER" || true
for N in 1 2; do systemctl show -p NRestarts --value "${UNITS[$((N - 1))]}" > "$D/nrestarts-$N.txt"; done
systemctl stop "${UNITS[@]}"
kill "$GPUMON" 2>/dev/null || true
date +%s > "$D/end.txt"
journalctl -u "${UNITS[0]}" -u "${UNITS[1]}" -o short-iso --no-pager > "$D/journal.txt" 2>&1 || true
for N in 1 2; do
  if [ -s "$D/s$N.flv" ]; then
    ffprobe -v error -show_entries packet=stream_index,pts_time,size -of csv=p=0 "$D/s$N.flv" > "$D/pkts-$N.csv" 2>/dev/null || true
    ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height,avg_frame_rate,pix_fmt,color_space -of json "$D/s$N.flv" > "$D/streams-$N.json" 2>/dev/null || true
  fi
done
chown -R fidsstream:fidsstream "$D"
python3 "$HERE/analyze.py" "$D" "$BR" "$RENDER" | tee "$D/summary.txt"
