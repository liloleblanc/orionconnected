#!/usr/bin/python3
"""Page monitor and network guard for one board stream, over the Chrome DevTools protocol.

Chrome starts on about:blank with --remote-debugging-port (127.0.0.1 only).
This script then:
  1. attaches to every target (pages, frames, workers) before it runs; with
     --block (test mode) it blocks, in each of them, every proxy path that is
     not on a short allow list, and proves the block with a self-test request;
  2. loads the board and marks it loaded;
  3. keeps watching, and exits (which restarts the stream) when the page
     crashes or goes away, or when it misses two heartbeats in a row: a
     Runtime.evaluate every 10 s that must answer within 5 s. A page whose
     main thread hangs keeps its CSS ticker scrolling on the compositor, so
     the picture alone does not show it;
  4. with --block, stops the stream (exit 4) when a billed request gets a
     response; with --out-dir, records the Chrome GPU status and the
     requestAnimationFrame timing of the top frame for the bench.
The patterns are host agnostic, so no proxy host name is written here.
A request to an allowed path costs one extra round trip through this script.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request
from urllib.parse import urlsplit

import websocket

# Every request to the flight proxy (*.workers.dev) is paused and checked. Only
# these paths are let through: board settings, media lists and hotel offers,
# none of which reaches a billed provider. Everything else on the proxy (flight
# feeds, aircraft and track lookups, the airport feed relays, which can trigger
# billed lookups behind them, and AI images) is answered with BlockedByClient.
# An allow list means a new billed path is blocked before anyone lists it.
ALLOW_PATHS = [
    "api/airport-config", "api/airline-override", "api/media-config", "api/media-library",
    "api/media-assignments", "api/dry-dock", "api/screens/", "accor/",
]
SELFTEST = "__fids_guard_selftest__"
HEARTBEAT_EVERY = 10.0
HEARTBEAT_TIMEOUT = 5.0
HEARTBEAT_MISSES = 2
PATTERNS = ["*.workers.dev/*", "*" + SELFTEST + "*"]
PROXY_RE = re.compile(r"^https?://[^/?#]+\.workers\.dev/")


def allowed(url):
    if not PROXY_RE.match(url):
        return True
    path = PROXY_RE.sub("", url)
    return any(path.startswith(p) for p in ALLOW_PATHS)


RAF_PROBE = """(function () {
  if (window.top !== window || window.__fidsRaf) return;
  var last = 0, iv = [];
  function tick(t) {
    if (last) iv.push(Math.round((t - last) * 10) / 10);
    last = t;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__fidsRaf = { take: function () { var a = iv; iv = []; return a; } };
})();"""

SELFTEST_JS = ("fetch('https://fids.orionconnected.com/" + SELFTEST + "', {mode: 'no-cors', cache: 'no-store'})"
               ".then(function () { return 'reached'; }, function () { return 'blocked'; })")

ENV_JS = ("JSON.stringify({lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,"
          " visibility: document.visibilityState, width: innerWidth, height: innerHeight})")


def log(tag, msg):
    print("[%s] guard: %s" % (tag, msg), flush=True)


class CdpError(Exception):
    pass


class Cdp:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, suppress_origin=True, timeout=10)
        self.seq = 0
        self.waiting = set()
        self.replies = {}
        self.methods = {}
        self.on_event = None
        self.on_error = None

    def send(self, method, params=None, session=None):
        self.seq += 1
        msg = {"id": self.seq, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        self.methods[self.seq] = (method, session)
        self.ws.send(json.dumps(msg))
        return self.seq

    def call(self, method, params=None, session=None, timeout=20.0):
        mid = self.seq + 1
        self.waiting.add(mid)
        self.send(method, params, session)
        end = time.monotonic() + timeout
        while mid not in self.replies:
            left = end - time.monotonic()
            if left <= 0:
                self.waiting.discard(mid)
                raise TimeoutError(method)
            self.pump(left)
        self.waiting.discard(mid)
        reply = self.replies.pop(mid)
        if "error" in reply:
            raise CdpError("%s: %s" % (method, reply["error"].get("message")))
        return reply.get("result", {})

    def pump(self, timeout):
        self.ws.settimeout(max(0.05, min(timeout, 1.0)))
        try:
            raw = self.ws.recv()
        except websocket.WebSocketTimeoutException:
            return
        msg = json.loads(raw)
        if "id" in msg:
            method, session = self.methods.pop(msg["id"], ("?", None))
            if msg["id"] in self.waiting:
                self.replies[msg["id"]] = msg
            elif "error" in msg and self.on_error:
                self.on_error(method, msg["error"], session)
        elif self.on_event:
            self.on_event(msg)


class Guard:
    def __init__(self, cdp, args):
        self.cdp = cdp
        self.args = args
        self.tag = args.tag
        self.blocked = {}
        self.seen = {}
        self.leaks = []
        self.selftest_hits = 0
        self.selftest = "not run"
        self.page = None
        self.page_target = None
        self.loaded = False
        self.page_gone = False
        self.kinds = {}
        self.errors = {}
        self.env = {}
        self.gpu = {}

    @staticmethod
    def key(url):
        parts = [p for p in urlsplit(url).path.split("/") if p]
        if not parts:
            return "/"
        if parts[0] in ("api", "proxy", "ai", "accor", "stream") and len(parts) > 1:
            return parts[0] + "/" + parts[1]
        return parts[0]

    def on_error(self, method, error, session=None):
        name = "%s on %s: %s" % (method, self.kinds.get(session, "browser"), error.get("message"))
        self.errors[name] = self.errors.get(name, 0) + 1
        if self.errors[name] == 1:
            log(self.tag, "not supported here (logged once): " + name)

    def on_event(self, msg):
        method = msg.get("method")
        p = msg.get("params", {})
        sid = msg.get("sessionId")
        if method == "Target.attachedToTarget":
            self.attach(p)
        elif method == "Fetch.requestPaused":
            url = p.get("request", {}).get("url", "")
            if SELFTEST in url:
                self.selftest_hits += 1
            elif allowed(url):
                self.cdp.send("Fetch.continueRequest", {"requestId": p.get("requestId")}, sid)
                return
            else:
                k = self.key(url)
                self.blocked[k] = self.blocked.get(k, 0) + 1
                if sum(self.blocked.values()) <= 5:
                    log(self.tag, "blocked " + k)
            self.cdp.send("Fetch.failRequest", {"requestId": p.get("requestId"), "errorReason": "BlockedByClient"}, sid)
        elif method == "Network.requestWillBeSent":
            url = p.get("request", {}).get("url", "")
            if ".workers.dev/" in url:
                k = self.key(url)
                self.seen[k] = self.seen.get(k, 0) + 1
        elif method == "Network.responseReceived":
            # A billed path is a leak only in test mode, where it should have
            # been blocked; on the real board those requests are the flights.
            url = p.get("response", {}).get("url", "")
            if self.args.block and not allowed(url):
                self.leaks.append(self.key(url))
        elif method == "Page.loadEventFired" and sid == self.page:
            self.loaded = True
        elif method == "Target.detachedFromTarget":
            gone = p.get("sessionId")
            self.kinds.pop(gone, None)
            if gone == self.page:
                self.page_gone = True
        elif method == "Inspector.targetCrashed":
            log(self.tag, "a Chrome target crashed (%s)" % self.kinds.get(sid, "?"))
            if sid == self.page:
                self.page_gone = True
        elif method == "Target.targetCrashed":
            log(self.tag, "a Chrome target crashed (%s, status %s)" % (
                p.get("targetId", "?")[:8], p.get("status", "?")))
            if p.get("targetId") == self.page_target:
                self.page_gone = True

    def attach(self, p):
        sid = p["sessionId"]
        kind = p.get("targetInfo", {}).get("type", "?")
        self.kinds[sid] = kind
        send = self.cdp.send
        if self.args.block:
            send("Fetch.enable", {"patterns": [{"urlPattern": u, "requestStage": "Request"} for u in PATTERNS]}, sid)
        if kind in ("page", "iframe", "worker", "service_worker", "shared_worker"):
            send("Network.enable", {"maxTotalBufferSize": 1048576, "maxResourceBufferSize": 65536}, sid)
            send("Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": True, "flatten": True}, sid)
        if kind == "page" and self.page is None:
            self.page = sid
            self.page_target = p.get("targetInfo", {}).get("targetId")
            send("Page.enable", {}, sid)
            send("Inspector.enable", {}, sid)
            if self.args.out_dir:
                # Only when measuring: the probe keeps every frame interval until read.
                send("Page.addScriptToEvaluateOnNewDocument", {"source": RAF_PROBE}, sid)
        send("Runtime.runIfWaitingForDebugger", {}, sid)

    def counts(self):
        return {
            "tag": self.tag, "updated": int(time.time()), "selftest": self.selftest,
            "blocked": self.blocked, "blocked_total": sum(self.blocked.values()),
            "seen_proxy_paths": self.seen, "leaks": self.leaks, "env": self.env,
            "targets": sorted(set(self.kinds.values())), "command_errors": self.errors,
        }


def write_json(path, data):
    if not path:
        return
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(data, fh, indent=1, sort_keys=True)
    os.replace(tmp, path)


def devtools_version(port, wait):
    end = time.monotonic() + wait
    last = None
    while time.monotonic() < end:
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/json/version" % port, timeout=2) as r:
                return json.load(r)
        except Exception as e:  # Chrome is still starting
            last = e
            time.sleep(0.5)
    raise SystemExit("DevTools on port %d did not answer: %s" % (port, last))


def gpu_summary(info):
    gpu = info.get("gpu", {})
    aux = gpu.get("auxAttributes", {})
    dev = (gpu.get("devices") or [{}])[0]
    fs = gpu.get("featureStatus", {})
    return {
        "gl_renderer": aux.get("glRenderer", ""), "gl_implementation": aux.get("glImplementationParts", ""),
        "device": dev.get("deviceString", ""), "vendor": dev.get("vendorString", ""),
        "driver": dev.get("driverVersion", ""), "gpu_compositing": fs.get("gpu_compositing", ""),
        "rasterization": fs.get("rasterization", ""), "vulkan": fs.get("vulkan", ""),
        "webgl": fs.get("webgl", ""),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--tag", default="stream")
    ap.add_argument("--block", action="store_true", help="block the billed proxy paths (test mode)")
    ap.add_argument("--loaded-file")
    ap.add_argument("--out-dir", help="write guard-N.json, gpu-N.json and raf-N.jsonl here")
    ap.add_argument("--suffix", default="")
    ap.add_argument("--exit-after", type=float, default=0, help="stop after this many seconds (preflight)")
    args = ap.parse_args()
    sfx = ("-" + args.suffix) if args.suffix else ""

    def outp(name, ext):
        return os.path.join(args.out_dir, name + sfx + ext) if args.out_dir else None
    counts_path, gpu_path, raf_path = outp("guard", ".json"), outp("gpu", ".json"), outp("raf", ".jsonl")

    ver = devtools_version(args.port, 40)
    cdp = Cdp(ver["webSocketDebuggerUrl"])
    g = Guard(cdp, args)
    cdp.on_event = g.on_event
    cdp.on_error = g.on_error
    cdp.call("Target.setDiscoverTargets", {"discover": True})
    cdp.call("Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": True, "flatten": True})
    end = time.monotonic() + 15
    while g.page is None and time.monotonic() < end:
        cdp.pump(0.5)
    if g.page is None:
        for t in cdp.call("Target.getTargets").get("targetInfos", []):
            if t.get("type") == "page":
                cdp.call("Target.attachToTarget", {"targetId": t["targetId"], "flatten": True})
                break
        end = time.monotonic() + 10
        while g.page is None and time.monotonic() < end:
            cdp.pump(0.5)
    if g.page is None:
        log(g.tag, "FATAL no page target to guard")
        return 2
    cdp.call("Runtime.evaluate", {"expression": "1", "returnByValue": True}, g.page)

    if args.block:
        r = cdp.call("Runtime.evaluate", {"expression": SELFTEST_JS, "awaitPromise": True, "returnByValue": True},
                     g.page, timeout=15)
        outcome = r.get("result", {}).get("value")
        if outcome != "blocked" or g.selftest_hits < 1:
            g.selftest = "FAILED (%s, %d hits)" % (outcome, g.selftest_hits)
            write_json(counts_path, g.counts())
            log(g.tag, "FATAL self-test " + g.selftest + "; the board is not loaded")
            return 3
        g.selftest = "passed"
        log(g.tag, "self-test passed: proxy paths off the allow list are blocked inside Chrome")

    g.loaded = False
    cdp.call("Page.navigate", {"url": args.url}, g.page)
    end = time.monotonic() + 30
    while not g.loaded and time.monotonic() < end:
        cdp.pump(0.5)
    if args.loaded_file:
        open(args.loaded_file, "w").close()
    log(g.tag, "board %s" % ("loaded" if g.loaded else "still loading after 30 s; carrying on"))

    started = time.monotonic()
    next_beat = started + HEARTBEAT_EVERY
    misses = 0
    next_raf = started + 10
    next_env = started + 5
    next_gpu = started + 15
    next_log = started + 60
    while True:
        cdp.pump(0.5)
        now = time.monotonic()
        if args.block and g.leaks:
            write_json(counts_path, g.counts())
            log(g.tag, "FATAL a billed request reached the network: %s" % ", ".join(sorted(set(g.leaks))))
            return 4
        if g.page_gone:
            write_json(counts_path, g.counts())
            log(g.tag, "the board page crashed or went away; stopping")
            return 1
        if now >= next_beat:
            try:
                cdp.call("Runtime.evaluate", {"expression": "1", "returnByValue": True}, g.page,
                         timeout=HEARTBEAT_TIMEOUT)
                if misses:
                    log(g.tag, "the board page answers again after %d missed heartbeat(s)" % misses)
                misses = 0
            except TimeoutError:
                misses += 1
                log(g.tag, "the board page did not answer within %d s (%d of %d)" % (
                    HEARTBEAT_TIMEOUT, misses, HEARTBEAT_MISSES))
                if misses >= HEARTBEAT_MISSES:
                    write_json(counts_path, g.counts())
                    log(g.tag, "the board page is hung; stopping")
                    return 5
            except CdpError:
                # The page is between two documents (a navigation); it answered.
                misses = 0
            next_beat = time.monotonic() + HEARTBEAT_EVERY
        if now >= next_env:
            next_env = float("inf")
            try:
                r = cdp.call("Runtime.evaluate", {"expression": ENV_JS, "returnByValue": True}, g.page)
                g.env = json.loads(r.get("result", {}).get("value") or "{}")
                log(g.tag, "page lang=%s tz=%s visibility=%s %sx%s" % (
                    g.env.get("lang"), g.env.get("tz"), g.env.get("visibility"), g.env.get("width"), g.env.get("height")))
            except (CdpError, TimeoutError, ValueError) as e:
                log(g.tag, "environment check failed: %s" % e)
        if now >= next_gpu:
            next_gpu = float("inf")
            try:
                info = cdp.call("SystemInfo.getInfo")
                g.gpu = gpu_summary(info)
                write_json(gpu_path, info)
                log(g.tag, "gpu compositing=%s raster=%s renderer=%s" % (
                    g.gpu["gpu_compositing"], g.gpu["rasterization"], g.gpu["gl_renderer"]))
            except (CdpError, TimeoutError) as e:
                log(g.tag, "SystemInfo failed: %s" % e)
            if args.exit_after:
                write_json(counts_path, g.counts())
        if raf_path and now >= next_raf:
            next_raf = now + 10
            try:
                r = cdp.call("Runtime.evaluate", {"expression": "window.__fidsRaf ? window.__fidsRaf.take() : null",
                                                  "returnByValue": True}, g.page, timeout=HEARTBEAT_TIMEOUT)
                iv = r.get("result", {}).get("value")
                with open(raf_path, "a") as fh:
                    fh.write(json.dumps({"t": int(time.time()), "iv": iv if iv is not None else []}) + "\n")
            except (CdpError, TimeoutError) as e:
                with open(raf_path, "a") as fh:
                    fh.write(json.dumps({"t": int(time.time()), "iv": [], "error": str(e)}) + "\n")
            write_json(counts_path, g.counts())
        if now >= next_log:
            next_log = now + 600
            if args.block:
                log(g.tag, "blocked %d so far %s" % (sum(g.blocked.values()), json.dumps(g.blocked, sort_keys=True)))
        if args.exit_after and now - started >= args.exit_after:
            write_json(counts_path, g.counts())
            return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (websocket.WebSocketException, ConnectionError, OSError) as e:
        print("guard: connection to Chrome lost: %s" % e, flush=True)
        sys.exit(1)
