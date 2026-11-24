#!/usr/bin/python3
"""Scores one bench run against the gates G1 to G9.

usage: analyze.py RUN_DIR TARGET_BITRATE RENDER [UNTIL_SECONDS]
The gates use minute 2 to the end of each stream (the first 2 minutes are the
board loading and settling), or to UNTIL_SECONDS when given. Writes
RUN_DIR/summary.json (summary-UNTIL.json with a limit) and prints a table.
"""
import csv
import json
import os
import re
import statistics
import sys

WARMUP = 120
UNTIL = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9


def bitrate_bps(s):
    m = re.fullmatch(r"([0-9.]+)\s*([kKmM]?)", s.strip())
    if not m:
        raise SystemExit("bad bitrate " + s)
    return float(m.group(1)) * {"": 1, "k": 1e3, "K": 1e3, "m": 1e6, "M": 1e6}[m.group(2)]


def read_csv(path):
    """Rows of a CSV whose first column is a number (a restarted writer repeats the header)."""
    try:
        with open(path) as fh:
            rows = list(csv.DictReader(fh))
    except OSError:
        return []
    return [r for r in rows if re.fullmatch(r"[0-9]+", (r.get("epoch") or "").strip())]


def pct(values, p):
    if not values:
        return None
    v = sorted(values)
    k = min(len(v) - 1, max(0, int(round(p / 100.0 * (len(v) - 1)))))
    return v[k]


def stream_stats(d, n, target, render, start_epoch):
    out = {"stream": n}
    # ffmpeg progress, every 5 s
    prog = [r for r in read_csv(os.path.join(d, "progress-%d.csv" % n)) if r.get("epoch")]
    t0 = int(prog[0]["epoch"]) if prog else start_epoch
    win = [r for r in prog if WARMUP <= int(r["epoch"]) - t0 <= UNTIL]
    speeds = []
    for r in win:
        try:
            speeds.append(float(r["speed"]))
        except ValueError:
            pass
    out["speed_samples"] = len(speeds)
    out["speed_min"] = min(speeds) if speeds else None
    out["speed_ok_frac"] = (sum(1 for s in speeds if s >= 0.98) / len(speeds)) if speeds else 0
    if len(win) >= 2:
        frames = int(win[-1]["frame"]) - int(win[0]["frame"])
        dd = (int(win[-1]["dup"]) + int(win[-1]["drop"])) - (int(win[0]["dup"]) + int(win[0]["drop"]))
        secs = int(win[-1]["epoch"]) - int(win[0]["epoch"])
    else:
        frames, dd, secs = 0, 0, 0
    out["frames_in_window"] = frames
    out["encode_fps"] = round(frames / secs, 2) if secs else None
    out["dup_drop"] = dd
    out["dup_drop_limit"] = int(frames * 0.005)

    # requestAnimationFrame intervals, collected every 10 s
    iv = []
    try:
        with open(os.path.join(d, "raf-%d.jsonl" % n)) as fh:
            for line in fh:
                rec = json.loads(line)
                if WARMUP + 10 <= rec["t"] - t0 <= UNTIL:
                    iv.extend(x for x in rec.get("iv") or [] if isinstance(x, (int, float)))
    except OSError:
        pass
    out["raf_frames"] = len(iv)
    out["raf_fps"] = round(1000.0 / statistics.mean(iv), 1) if iv else None
    out["raf_p50"] = pct(iv, 50)
    out["raf_p95"] = pct(iv, 95)
    out["raf_p99"] = pct(iv, 99)
    out["raf_max"] = max(iv) if iv else None
    out["raf_over50"] = sum(1 for x in iv if x > 50)
    out["raf_over250"] = sum(1 for x in iv if x > 250)

    # packets written to the FLV
    vid, aud = [], []
    vindex = "0"
    try:
        for st in json.load(open(os.path.join(d, "streams-%d.json" % n))).get("streams", []):
            if st.get("codec_type") == "video":
                vindex = str(st.get("index"))
                out["video_stream"] = {k: st.get(k) for k in ("codec_name", "width", "height", "avg_frame_rate",
                                                              "pix_fmt", "color_space")}
    except (OSError, ValueError):
        pass
    try:
        with open(os.path.join(d, "pkts-%d.csv" % n)) as fh:
            for row in csv.reader(fh):
                if len(row) < 3 or row[1] in ("", "N/A"):
                    continue
                (vid if row[0] == vindex else aud).append((float(row[1]), int(row[2])))
    except OSError:
        pass
    vid.sort()
    aud.sort()
    vw = [p for p in vid if WARMUP <= p[0] <= UNTIL]
    if vw:
        span = vw[-1][0] - vw[0][0]
        out["file_fps"] = round((len(vw) - 1) / span, 2) if span > 0 else None
        gaps = [b[0] - a[0] for a, b in zip(vw, vw[1:])]
        out["video_max_gap_ms"] = round(max(gaps) * 1000, 1) if gaps else None
        buckets = {}
        for t, size in vw:
            buckets[int(t // 10)] = buckets.get(int(t // 10), 0) + size
        full = [k for k in sorted(buckets) if k * 10 >= WARMUP and (k + 1) * 10 <= vw[-1][0]]
        rates = [buckets[k] * 8 / 10.0 for k in full]
        out["kbps_min"] = round(min(rates) / 1000) if rates else None
        out["kbps_mean"] = round(statistics.mean(rates) / 1000) if rates else None
        out["kbps_max"] = round(max(rates) / 1000) if rates else None
        out["low_windows"] = sum(1 for r in rates if r < 0.7 * target)
        out["windows"] = len(rates)
    aw = [p for p in aud if WARMUP <= p[0] <= UNTIL]
    if len(aw) > 1:
        out["audio_max_gap_ms"] = round(max(b[0] - a[0] for a, b in zip(aw, aw[1:])) * 1000, 1)
    else:
        out["audio_max_gap_ms"] = None

    guard = {}
    try:
        guard = json.load(open(os.path.join(d, "guard-%d.json" % n)))
    except (OSError, ValueError):
        pass
    out["guard_selftest"] = guard.get("selftest")
    out["guard_blocked"] = guard.get("blocked", {})
    out["guard_leaks"] = len(guard.get("leaks", []) or [])
    out["guard_seen"] = guard.get("seen_proxy_paths", {})
    out["page_env"] = guard.get("env", {})

    gpu = {}
    try:
        gpu = json.load(open(os.path.join(d, "gpu-%d.json" % n))).get("gpu", {})
    except (OSError, ValueError):
        pass
    fs = gpu.get("featureStatus", {})
    out["chrome_gpu_compositing"] = fs.get("gpu_compositing")
    out["chrome_renderer"] = gpu.get("auxAttributes", {}).get("glRenderer")

    try:
        out["restarts"] = int(open(os.path.join(d, "nrestarts-%d.txt" % n)).read().strip() or 0)
    except (OSError, ValueError):
        out["restarts"] = None
    exits = 0
    try:
        with open(os.path.join(d, "journal.txt")) as fh:
            for line in fh:
                if ("[stream-%d]" % n) in line and " exited (status" in line:
                    exits += 1
    except OSError:
        pass
    out["component_exits"] = exits

    g = {}
    g["G1"] = out["guard_selftest"] == "passed" and out["guard_leaks"] == 0
    g["G2"] = bool(speeds) and out["speed_ok_frac"] >= 0.99 and out["speed_min"] >= 0.95
    g["G3"] = frames > 0 and dd <= out["dup_drop_limit"]
    g["G4"] = bool(iv) and out["raf_p99"] <= 50 and out["raf_over250"] <= 3
    g["G5"] = out.get("windows", 0) > 0 and out.get("low_windows", 1) == 0
    g["G7"] = out["restarts"] == 0 and exits == 0
    if render == "gpu":
        ren = out["chrome_renderer"] or ""
        g["G8"] = out["chrome_gpu_compositing"] == "enabled" and "NVIDIA" in ren and "SwiftShader" not in ren
    g["G9"] = out["audio_max_gap_ms"] is not None and out["audio_max_gap_ms"] <= 100
    out["gates"] = g
    return out


def system_stats(d, start_epoch):
    rows = [r for r in read_csv(os.path.join(d, "sys.csv")) if r.get("epoch")]
    win = [r for r in rows if WARMUP <= int(r["epoch"]) - start_epoch <= UNTIL]
    f = lambda k: [float(r[k]) for r in win if r.get(k) not in (None, "")]
    s = {}
    for k in ("sys_cpu_pct", "s1_cpu_pct", "s2_cpu_pct", "s1_mem_mb", "s2_mem_mb", "cpu_pkg_c", "nvme_c", "load1"):
        v = f(k)
        s[k + "_mean"] = round(statistics.mean(v), 1) if v else None
        s[k + "_max"] = round(max(v), 1) if v else None
    th = f("throttle")
    s["throttle_growth"] = int(th[-1] - th[0]) if len(th) > 1 else 0
    gpu = []
    try:
        with open(os.path.join(d, "gpu.csv")) as fh:
            for row in csv.reader(fh):
                if len(row) >= 11:
                    gpu.append([c.strip() for c in row])
    except OSError:
        pass
    num = lambda i: [float(r[i]) for r in gpu if re.fullmatch(r"[0-9.]+", r[i] or "")]
    for name, i in (("gpu_util", 1), ("gpu_enc", 2), ("gpu_temp", 6), ("gpu_power", 7), ("gpu_mem_mb", 9)):
        v = num(i)
        s[name + "_mean"] = round(statistics.mean(v), 1) if v else None
        s[name + "_max"] = round(max(v), 1) if v else None
    bad = 0
    for r in gpu:
        try:
            bad |= int(r[10], 16) & (0x8 | 0x20 | 0x40 | 0x80)
        except ValueError:
            pass
    s["gpu_bad_reasons"] = hex(bad)
    s["G6"] = (s["cpu_pkg_c_max"] or 0) <= 85 and (s["gpu_temp_max"] or 0) <= 80 \
        and s["throttle_growth"] == 0 and bad == 0
    return s


def main():
    d, target, render = sys.argv[1], bitrate_bps(sys.argv[2]), sys.argv[3]
    try:
        start = int(open(os.path.join(d, "start.txt")).read().strip())
    except (OSError, ValueError):
        start = 0
    res = {"run": os.path.basename(d.rstrip("/")), "target_bps": target, "render": render,
           "streams": [stream_stats(d, n, target, render, start) for n in (1, 2)],
           "system": system_stats(d, start)}
    gates = {}
    for s in res["streams"]:
        for k, v in s["gates"].items():
            gates[k] = gates.get(k, True) and v
    gates["G6"] = res["system"]["G6"]
    res["gates"] = dict(sorted(gates.items()))
    res["pass"] = all(gates.values())
    name = "summary.json" if UNTIL >= 1e9 else "summary-%d.json" % UNTIL
    json.dump(res, open(os.path.join(d, name), "w"), indent=1)

    print("run %s  render=%s target=%d kbps  PASS=%s" % (res["run"], render, target / 1000, res["pass"]))
    print("gates " + " ".join("%s=%s" % (k, "ok" if v else "FAIL") for k, v in res["gates"].items()))
    for s in res["streams"]:
        print("stream %d: speed min %s ok %.1f%% | enc fps %s file fps %s dup+drop %s/%s | rAF fps %s p50 %s p99 %s max %s >50ms %s >250ms %s"
              % (s["stream"], s["speed_min"], 100 * s["speed_ok_frac"], s["encode_fps"], s.get("file_fps"),
                 s["dup_drop"], s["dup_drop_limit"], s["raf_fps"], s["raf_p50"], s["raf_p99"], s["raf_max"],
                 s["raf_over50"], s["raf_over250"]))
        print("          kbps min/mean/max %s/%s/%s low windows %s/%s | video max gap %s ms audio max gap %s ms | restarts %s exits %s"
              % (s.get("kbps_min"), s.get("kbps_mean"), s.get("kbps_max"), s.get("low_windows"), s.get("windows"),
                 s.get("video_max_gap_ms"), s["audio_max_gap_ms"], s["restarts"], s["component_exits"]))
        print("          guard %s blocked %s leaks %s | chrome gpu %s %s | page %s"
              % (s["guard_selftest"], json.dumps(s["guard_blocked"], sort_keys=True), s["guard_leaks"],
                 s["chrome_gpu_compositing"], s["chrome_renderer"], json.dumps(s["page_env"], sort_keys=True)))
    y = res["system"]
    print("system: cpu %s%% mean %s%% max | stream cores %s%% + %s%% | mem %s + %s MB | cpu %sC max | nvme %sC | gpu util %s%% enc %s%% %sC %sW | throttle +%s reasons %s"
          % (y["sys_cpu_pct_mean"], y["sys_cpu_pct_max"], y["s1_cpu_pct_mean"], y["s2_cpu_pct_mean"],
             y["s1_mem_mb_max"], y["s2_mem_mb_max"], y["cpu_pkg_c_max"], y["nvme_c_max"], y["gpu_util_mean"],
             y["gpu_enc_mean"], y["gpu_temp_max"], y["gpu_power_mean"], y["throttle_growth"], y["gpu_bad_reasons"]))


if __name__ == "__main__":
    main()
