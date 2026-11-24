#!/usr/bin/env bash
# Samples whole-system, per-stream and temperature figures every 5 s into a CSV.
# Per-stream CPU comes from the unit cgroup, so it covers every Chrome process.
# CPU is in percent of one core; sys_cpu_pct is percent of the whole machine.
# usage: sample.sh OUT.csv DURATION_S UNIT1 UNIT2
set -uo pipefail
OUT="$1"; DUR="$2"; U1="$3"; U2="$4"

cg()    { systemctl show -p ControlGroup --value "$1" 2>/dev/null; }
usage() { local c; c="$(cg "$1")"; awk '/^usage_usec/ { print $2; f = 1 } END { if (!f) print 0 }' "/sys/fs/cgroup$c/cpu.stat" 2>/dev/null || echo 0; }
mem()   { local c; c="$(cg "$1")"; cat "/sys/fs/cgroup$c/memory.current" 2>/dev/null || echo 0; }
hw() {
  local h
  for h in /sys/class/hwmon/hwmon*; do
    [ "$(cat "$h/name" 2>/dev/null)" = "$1" ] && { cat "$h/temp1_input" 2>/dev/null; return; }
  done
  echo 0
}
throttle() { cat /sys/devices/system/cpu/cpu*/thermal_throttle/package_throttle_count 2>/dev/null | awk '{ s += $1 } END { print s + 0 }'; }
stat_cpu() { awk '/^cpu / { t = 0; for (i = 2; i <= 9; i++) t += $i; print t, $5 + $6 }' /proc/stat; }

echo "epoch,sys_cpu_pct,load1,mem_used_mb,s1_cpu_pct,s1_mem_mb,s2_cpu_pct,s2_mem_mb,cpu_pkg_c,nvme_c,throttle" > "$OUT"
read -r T0 I0 < <(stat_cpu)
A0=$(usage "$U1"); B0=$(usage "$U2"); W0=$(date +%s%N)
END=$((SECONDS + DUR))
while [ "$SECONDS" -lt "$END" ]; do
  sleep 5
  read -r T1 I1 < <(stat_cpu)
  A1=$(usage "$U1"); B1=$(usage "$U2"); W1=$(date +%s%N)
  awk -v e="$(date +%s)" -v dt=$((T1 - T0)) -v di=$((I1 - I0)) -v da=$((A1 - A0)) -v db=$((B1 - B0)) \
      -v us=$(( (W1 - W0) / 1000 )) -v l1="$(cut -d' ' -f1 /proc/loadavg)" \
      -v mu="$(free -m | awk '/^Mem:/ { print $3 }')" -v ma="$(mem "$U1")" -v mb="$(mem "$U2")" \
      -v ct="$(hw coretemp)" -v nt="$(hw nvme)" -v th="$(throttle)" 'BEGIN {
        sys = (dt > 0) ? 100 * (dt - di) / dt : 0
        c1 = (us > 0 && da >= 0) ? 100 * da / us : 0
        c2 = (us > 0 && db >= 0) ? 100 * db / us : 0
        printf "%d,%.1f,%s,%d,%.1f,%d,%.1f,%d,%.1f,%.1f,%d\n", e, sys, l1, mu, c1, ma / 1048576, c2, mb / 1048576, ct / 1000, nt / 1000, th }' >> "$OUT"
  T0=$T1; I0=$I1; A0=$A1; B0=$B1; W0=$W1
done
