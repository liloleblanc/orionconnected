#!/usr/bin/env python3
"""OpenSky relay: every OpenSky call from one fixed IPv4 address.

OpenSky whitelists the address the account's calls come from. Cloudflare
Workers have no fixed egress address, so the boards' Worker (fids-proxy)
never calls OpenSky itself. This relay, on its own small server with a fixed
IPv4, does, and it only ever calls OUT: to OpenSky and to the Worker's
/osky/* routes. Nothing calls in to it, it opens no port, and the server's
firewall lets nothing in. There is no tunnel and no token to copy.

What it does, once a minute (a polling client run by systemd; no HTTP server):

  1. Registers: POST /osky/register {relayKey}. The relay key is made on the
     server at install time (secrets.token_urlsafe(32), root only, 0600) and
     reaches the relay through systemd's LoadCredential. The Worker accepts a
     registration only from the address pinned in its secret OSKY_RELAY_IPV4
     (typed in the Cloudflare dashboard from the address Hetzner shows for
     this server), and keeps only the key's sha256 and that address. Until
     the address is pinned the Worker answers 503 "no-pin": the relay calls
     nothing else and asks again every minute.
  2. Heartbeat: GET /osky/report with its counts (calls today, cap, OpenSky's
     last status code, hold seconds, state, puts today, its own stop date).
     The answer says whether OpenSky is switched on (OPENSKY_ON) and gives
     the Worker's stop date.
  3. Only when it is on: GET /osky/creds (the OpenSky client, kept in memory
     only, never written anywhere), GET /osky/wanted (the boxes of at most 25
     sq deg and the flights, at most 4 a box, the boards want).
  4. Per box: GET OpenSky /api/states/all with the box. When every flight in
     the box is named by icao24, the icao24 filter goes upstream too; when
     any is named by callsign (OpenSky has no callsign filter), OpenSky
     answers with every aircraft in the box, which stays in this process's
     memory for at most CACHE_SECONDS (120 s at most) and is filtered here.
     Only the flights asked for, reduced, go on: POST /osky/put.

Every call to the Worker comes from this server's IPv4, the same address
OpenSky whitelists, and every call but the registration carries the relay key
(X-Relay-Key).

The licence limits it enforces:

  - HARD STOP at its own stop date: STOP_AT in /etc/opensky-relay/relay.conf
    (root-owned), or a later one the Worker gave it (below). From then on
    nothing goes to OpenSky, not even a login, and the relay exits. A
    missing, unreadable, unsafe or ambiguous config (two STOP_AT lines)
    counts as stopped. The stop is LATCHED: the first time it is reached, a
    marker is saved in the state directory, so a clock stepped back does not
    undo it. Only a later stop date lifts it. A Date header or a data 'time'
    from OpenSky at or after the stop is a stop too.
  - THE WORKER'S STOP DATE (OSKY_STOP_AT, in every heartbeat answer):
      earlier than the relay's own: obeyed FOR NOW. Past it, and on any 410
      from the Worker, nothing goes to OpenSky and the client is dropped,
      but nothing is latched and the heartbeat goes on, so a corrected date
      in the Worker (a change, no server console) resumes the relay.
      later by at most 40 days: the relay's own stop moves to it, saved in
      the state directory ("extended"), so an extension of the term needs
      only a change to the Worker. The Worker's date has to move BEFORE the
      relay's own stop is reached: a stopped relay has exited.
      later by more than 40 days: ignored (a mistyped year never extends it).
  - A daily cap of 12000 upstream calls per UTC day (the licence allows
    14,400 credits; a box of 25 sq deg or less costs 1), paced across the hours
    (hour h may have used at most cap * (h + 1) / 24). The count is saved to
    a small state file before every call, so a restart cannot reset it. A
    clock stepped back to an earlier day does not reset it either: until the
    clock is back on the saved day, the day counts as spent.
  - 429 and X-Rate-Limit-Retry-After-Seconds (or Retry-After) are obeyed, and
    the wait is saved, so a restart obeys it too. A refused key or a refused
    server (401 after a fresh login, 403) holds every call for 10 minutes;
    an OpenSky server error holds every call for a minute.
  - Answers live in memory only: an identical box asked again within 120 s
    (CACHE_SECONDS, never more: the Worker keeps a put 180 s, and the next
    one has to land before it lapses) shares the earlier call. Nothing is
    archived.
  - Only the reduced fields go to the Worker: icao24, callsign, lat, lon,
    baro_altitude, geo_altitude, on_ground, velocity, time_position,
    last_contact; true_track only when HEADING=1 in the config.
  - Outbound connections are IPv4 only (AF_INET resolution, AF_INET sockets),
    to OpenSky and to the Worker alike, so the Worker sees the address
    OpenSky whitelists.
  - Logs carry counts only: one line an hour, plus one at start, at
    registration and at the stop. Never coordinates, callsigns, payloads,
    the relay key or the OpenSky secret.

Python standard library only; runs on Python 3.9 and later.

Command line (root, on the server; used by install.sh and the opensky-* commands):
  relay.py                    run the relay
  relay.py --make-key FILE    make the relay key in FILE if it has none (0600)
  relay.py --stopped          exit 0 when the relay is stopped (term ended)
"""

import email.utils
import http.client
import json
import math
import os
import re
import secrets
import signal
import socket
import ssl
import sys
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit

# ── Fixed settings ──────────────────────────────────────────────────────────
# From OpenSky's REST documentation (openskynetwork.github.io/opensky-api/rest.html):
# the API root, and the OAuth2 client-credentials token endpoint.
TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
API_BASE = 'https://opensky-network.org/api'
# The boards' Worker. Server-side callers reach fids-proxy on its workers.dev
# name (the site's own /a route does too); fids.orionconnected.com is the
# board site, a different Worker. WORKER_URL= in relay.conf may change it.
DEFAULT_WORKER_URL = 'https://fids-proxy.n-leblanc1984.workers.dev'
# Cloudflare refuses Python's default User-Agent (error 1010); this one passes.
USER_AGENT = 'orion-connected-opensky-relay/2'

CONFIG_DIR = '/etc/opensky-relay'
STATE_DIR = '/var/lib/opensky-relay'   # systemd's StateDirectory=opensky-relay
STOP_MARKER = 'stopped'                # in the state directory: "stopped for <STOP_AT>"
EXTEND_FILE = 'extended'               # in the state directory: "extended to <STOP_AT>", from the Worker
KEY_CREDENTIAL = 'relay-key'           # LoadCredential=relay-key:/etc/opensky-relay/relay-key
LOOP_S = 60
MAX_BOX_SQ_DEG = 25.0              # 25 sq deg or less = 1 credit per call
MAX_DAILY_CAP = 12000              # the config may lower it, never raise it (licence: 14,400 credits/day)
DEFAULT_CACHE_S = 120
MIN_CACHE_S = 10
MAX_CACHE_S = 120                  # the Worker keeps a put 180 s: the next one must land first
MAX_EXTEND_S = 40 * 86400          # the Worker may move the stop later by 40 days at most at a time
MAX_BOXES = 8
MAX_FILTER_VALUES = 4              # icao24 + callsign values together, per box
TOKEN_RENEW_MARGIN_S = 120         # renew 2 minutes before expiry
TOKEN_RETRY_GAP_S = 60             # a login that could not reach OpenSky is retried at most once a minute
CREDS_REFRESH_S = 1800             # the client is asked of the Worker again every 30 minutes
UPSTREAM_TIMEOUT_S = 15
DEFAULT_BACKOFF_S = 300            # a 429 without a usable wait header
MAX_BACKOFF_S = 86400
REFUSED_HOLD_S = 600               # 401 after a fresh login, or 403: no call for 10 minutes
SERVER_ERROR_HOLD_S = 60           # OpenSky 5xx: no call for a minute
REGISTER_RETRY_MIN_S = 30
REGISTER_RETRY_MAX_S = 300
REGISTER_NO_PIN_RETRY_S = 60       # the Worker has no address pinned yet: ask again every minute, nothing else
MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_WORKER_BODY_BYTES = 256 * 1024
MAX_CACHE_ENTRIES = 64

CONF_KEYS = ('STOP_AT', 'DAILY_CAP', 'CACHE_SECONDS', 'HEADING', 'WORKER_URL')
RE_STOP = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
RE_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
RE_ICAO = re.compile(r'^[0-9a-f]{6}$')
RE_CALLSIGN = re.compile(r'^[A-Z0-9]{1,8}$')
RE_KEY = re.compile(r'^[A-Za-z0-9_-]{43,128}$')
RE_HOST = re.compile(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
RE_CONF_LINE = re.compile(r'^([A-Z_]+)=(.*)$')
RE_ANY_STOP_LINE = re.compile(r'^\s*stop_at\s*=', re.IGNORECASE)
NEVER = '9999-12-31T23:59:59Z'     # an unreadable stop marker: stopped until opensky-extend removes it

# ── Test mode ───────────────────────────────────────────────────────────────
# The tests run this file against a fake OpenSky and a fake Worker on
# 127.0.0.1. Only in test mode may the token URL, API root, Worker URL, loop
# interval, config directory and clock be changed, and the three URLs only to
# loopback addresses. Test mode refuses to run as root or under the
# production unit (which sets OSKY_PRODUCTION=1), so it can never move the
# stop date or send the relay key anywhere else.
TEST_MODE = os.environ.get('OSKY_TEST_MODE') == '1'


class Fatal(Exception):
    pass


def _loopback_url(name):
    url = os.environ.get(name, '')
    parts = urlsplit(url)
    if parts.scheme not in ('http', 'https') or parts.hostname not in ('127.0.0.1', 'localhost'):
        raise Fatal(name + ' must be a loopback URL in test mode')
    return url.rstrip('/')


def load_runtime():
    """The values test mode may change, checked; production values otherwise."""
    state_dir = (os.environ.get('STATE_DIRECTORY') or '').split(':')[0] or None
    rt = {
        'token_url': TOKEN_URL, 'api_base': API_BASE, 'worker_url': None,
        'config_dir': CONFIG_DIR, 'clock_file': None, 'loop_s': float(LOOP_S),
        'state_dir': state_dir or STATE_DIR,
    }
    if not TEST_MODE:
        return rt
    if os.environ.get('OSKY_PRODUCTION') == '1':
        raise Fatal('test mode is not allowed in production')
    if hasattr(os, 'geteuid') and os.geteuid() == 0:
        raise Fatal('test mode is not allowed as root')
    for key, name in (('token_url', 'OSKY_TEST_TOKEN_URL'), ('api_base', 'OSKY_TEST_API_BASE'),
                      ('worker_url', 'OSKY_TEST_WORKER_URL')):
        if not os.environ.get(name):
            raise Fatal('test mode needs OSKY_TEST_TOKEN_URL, OSKY_TEST_API_BASE and OSKY_TEST_WORKER_URL')
        rt[key] = _loopback_url(name)
    if os.environ.get('OSKY_TEST_CONFIG_DIR'):
        rt['config_dir'] = os.environ['OSKY_TEST_CONFIG_DIR']
    if os.environ.get('OSKY_TEST_CLOCK_FILE'):
        rt['clock_file'] = os.environ['OSKY_TEST_CLOCK_FILE']
    if os.environ.get('OSKY_TEST_LOOP_S'):
        rt['loop_s'] = max(0.05, min(5.0, float(os.environ['OSKY_TEST_LOOP_S'])))
    rt['state_dir'] = state_dir          # never the production directory in test mode
    return rt


def make_clock(clock_file):
    if not clock_file:
        return time.time

    def now():
        try:
            with open(clock_file, 'r', encoding='utf-8') as f:
                return float(f.read().strip())
        except (OSError, ValueError):
            return time.time()
    return now


def log(line):
    # counts and states only; callers never pass request or answer data
    sys.stdout.write('opensky-relay ' + line + '\n')
    sys.stdout.flush()


def utc_iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def utc_date(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime('%Y-%m-%d')


def utc_hour_key(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime('%Y-%m-%dT%HZ')


def date_start(date):
    return datetime.strptime(date, '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp()


def parse_iso(v):
    if not isinstance(v, str) or not RE_STOP.match(v):
        return None
    try:
        return datetime.strptime(v, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


def paced_allowance(cap, t):
    """Calls the UTC day may have used by the end of the current hour."""
    hour = datetime.fromtimestamp(t, timezone.utc).hour
    return min(cap, (cap * (hour + 1) + 23) // 24)


def seconds_to_next_hour(t):
    return max(1, int(3600 - (t % 3600)) + 1)


def seconds_to_next_utc_day(t):
    return max(1, int(86400 - (t % 86400)) + 1)


# ── Config ──────────────────────────────────────────────────────────────────
def _clean(v):
    return v.strip().strip('"').strip("'")


def parse_conf(text):
    """relay.conf, read exactly the way the shell tools read it: only lines that
    start with KEY= (upper case, at the very start of the line) count, as in
    sed -n 's/^STOP_AT=//p'. Returns ({key: [values]}, number of lines that
    look like a STOP_AT line in any spelling, the exact ones included)."""
    vals, any_stop = {}, 0
    for raw in text.split('\n'):        # lines exactly as grep and sed see them
        if RE_ANY_STOP_LINE.match(raw):
            any_stop += 1
        m = RE_CONF_LINE.match(raw)
        if m and m.group(1) in CONF_KEYS:
            vals.setdefault(m.group(1), []).append(_clean(m.group(2)))
    return vals, any_stop


def _int_or(v, default):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return default


def safe_root_file(path):
    """Production: the file and its directory must be root's and not writable by others."""
    st = os.stat(path)
    dst = os.stat(os.path.dirname(path) or '.')
    return st.st_uid == 0 and not (st.st_mode & 0o022) and dst.st_uid == 0 and not (dst.st_mode & 0o022)


def worker_url_ok(url):
    """https://<host> only: no path, no port, no user, no query."""
    parts = urlsplit(url)
    return (parts.scheme == 'https' and parts.hostname is not None and RE_HOST.match(parts.hostname) is not None
            and parts.port is None and parts.username is None and parts.path in ('', '/')
            and not parts.query and not parts.fragment and parts.netloc == parts.hostname)


def read_settings(config_dir):
    """Settings from relay.conf. Anything wrong with the stop means stopped (stop_at = 0)."""
    s = {'stop_at': 0.0, 'stop_iso': None, 'config_ok': False, 'cap': MAX_DAILY_CAP,
         'cache_s': DEFAULT_CACHE_S, 'heading': False, 'worker_url': DEFAULT_WORKER_URL}
    path = os.path.join(config_dir, 'relay.conf')
    try:
        if not TEST_MODE and not safe_root_file(path):
            return s
        with open(path, 'r', encoding='utf-8') as f:
            vals, any_stop = parse_conf(f.read())
    except (OSError, ValueError):
        return s
    stops = vals.get('STOP_AT', [])
    # exactly one STOP_AT line, and no other line that could be read as one
    if len(stops) == 1 and any_stop == 1 and parse_iso(stops[0]) is not None:
        s['stop_at'] = parse_iso(stops[0])
        s['stop_iso'] = stops[0]
        s['config_ok'] = True
    # a repeated setting takes its safest value
    caps = [max(0, min(MAX_DAILY_CAP, _int_or(v, MAX_DAILY_CAP))) for v in vals.get('DAILY_CAP', [])]
    s['cap'] = min(caps) if caps else MAX_DAILY_CAP
    caches = [max(MIN_CACHE_S, min(MAX_CACHE_S, _int_or(v, DEFAULT_CACHE_S))) for v in vals.get('CACHE_SECONDS', [])]
    s['cache_s'] = min(caches) if caches else DEFAULT_CACHE_S
    heads = vals.get('HEADING', [])
    s['heading'] = bool(heads) and all(v == '1' for v in heads)
    urls = vals.get('WORKER_URL', [])
    if urls:
        # one clear https://host, or none: the key never goes anywhere unclear
        s['worker_url'] = urls[0].rstrip('/') if len(set(urls)) == 1 and worker_url_ok(urls[0]) else None
    return s


def read_relay_key():
    d = os.environ.get('CREDENTIALS_DIRECTORY')
    if not d:
        return None
    try:
        with open(os.path.join(d, KEY_CREDENTIAL), 'r', encoding='utf-8') as f:
            k = f.read().strip()
    except (OSError, ValueError):
        return None
    return k if RE_KEY.match(k) else None


def make_key(path):
    """The relay key, made once: a file that already holds one is kept."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            if RE_KEY.match(f.read().strip()):
                os.chmod(path, 0o600)
                return 0
    except FileNotFoundError:
        pass
    except (OSError, ValueError):
        pass
    tmp = '%s.%d.tmp' % (path, os.getpid())
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(secrets.token_urlsafe(32) + '\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
    os.chmod(path, 0o600)
    return 0


# ── The stop marker ─────────────────────────────────────────────────────────
def read_stop_marker(state_dir):
    """The STOP_AT the relay was stopped for, or None. A marker that exists but
    cannot be read stops the relay until opensky-extend removes it."""
    if not state_dir:
        return None
    try:
        with open(os.path.join(state_dir, STOP_MARKER), 'r', encoding='utf-8') as f:
            text = f.read()
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        return NEVER
    m = re.match(r'^stopped for (\S+)\s*$', text)
    return m.group(1) if m and RE_STOP.match(m.group(1)) else NEVER


def read_extension(state_dir):
    """A later stop the Worker gave the relay (saved by it), or None. One
    that cannot be read is None: the earlier stop in relay.conf applies."""
    if not state_dir:
        return None
    try:
        with open(os.path.join(state_dir, EXTEND_FILE), 'r', encoding='utf-8') as f:
            text = f.read()
    except (OSError, ValueError):
        return None
    m = re.match(r'^extended to (\S+)\s*$', text)
    return m.group(1) if m and parse_iso(m.group(1)) is not None else None


def local_stop_iso(settings, extended):
    """The relay's own stop: STOP_AT from relay.conf, or a later one the
    Worker gave it. None when the config is wrong (that is a stop)."""
    if not settings['config_ok']:
        return None
    own = settings['stop_iso']
    return extended if extended is not None and extended > own else own


def is_stopped(settings, now, marker, extended=None):
    """Stopped (for good) when the config is wrong, the relay's own stop has
    passed, or a stop was latched for this stop date (or a later one). The
    Worker's stop date is not part of it: that one is obeyed for now only."""
    local = local_stop_iso(settings, extended)
    if local is None or now >= parse_iso(local):
        return True
    return marker is not None and not (local > marker)


def upstream_clock(hdrs):
    """OpenSky's own clock, from the Date header of its answer, or None."""
    v = hdrs.get('date')
    if not v:
        return None
    try:
        d = email.utils.parsedate_to_datetime(v)
    except Exception:
        return None
    if d is None:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()


# ── Outbound HTTP, IPv4 only ────────────────────────────────────────────────
def resolve_ipv4(host, port):
    """getaddrinfo restricted to AF_INET: an IPv6 address is never tried."""
    infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    out = [i for i in infos if i[0] == socket.AF_INET]
    if not out:
        raise OSError('no IPv4 address')
    return out


def connect_ipv4(host, port, timeout):
    last = None
    for _family, socktype, proto, _canon, addr in resolve_ipv4(host, port):
        # An AF_INET socket can only have an IPv4 source address, so the
        # whitelisted address always matches. No explicit bind is needed.
        sock = socket.socket(socket.AF_INET, socktype, proto)
        try:
            sock.settimeout(timeout)
            sock.connect(addr)
            return sock
        except OSError as e:
            last = e
            sock.close()
    raise last or OSError('connect failed')


class IPv4HTTPConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = connect_ipv4(self.host, self.port, self.timeout)


class IPv4HTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, port=None, timeout=UPSTREAM_TIMEOUT_S):
        self._osky_ctx = ssl.create_default_context()
        super().__init__(host, port, timeout=timeout, context=self._osky_ctx)

    def connect(self):
        raw = connect_ipv4(self.host, self.port, self.timeout)
        self.sock = self._osky_ctx.wrap_socket(raw, server_hostname=self.host)


class Upstream(Exception):
    def __init__(self, code, retry_after=None):
        Exception.__init__(self, code)
        self.code = code
        self.retry_after = retry_after


def http_request(method, url, body=None, headers=None, limit=MAX_BODY_BYTES):
    parts = urlsplit(url)
    if parts.scheme == 'https':
        conn = IPv4HTTPSConnection(parts.hostname, parts.port or 443, timeout=UPSTREAM_TIMEOUT_S)
    elif parts.scheme == 'http' and TEST_MODE:
        conn = IPv4HTTPConnection(parts.hostname, parts.port or 80, timeout=UPSTREAM_TIMEOUT_S)
    else:
        raise Upstream('bad-url')
    target = parts.path or '/'
    if parts.query:
        target += '?' + parts.query
    hdrs_out = {'User-Agent': USER_AGENT}
    hdrs_out.update(headers or {})
    try:
        conn.request(method, target, body=body, headers=hdrs_out)
        resp = conn.getresponse()
        data = resp.read(limit + 1)
        if len(data) > limit:
            raise Upstream('too-large')
        hdrs = {k.lower(): v for k, v in resp.getheaders()}
        return resp.status, hdrs, data
    except socket.timeout:
        raise Upstream('timeout')
    except (OSError, http.client.HTTPException, ssl.SSLError):
        raise Upstream('unreachable')
    finally:
        conn.close()


def retry_after_seconds(hdrs):
    for name in ('x-rate-limit-retry-after-seconds', 'retry-after'):
        v = hdrs.get(name)
        if v is None:
            continue
        try:
            n = int(float(str(v).strip()))
        except ValueError:
            continue
        return max(1, min(MAX_BACKOFF_S, n))
    return DEFAULT_BACKOFF_S


def _json_dict(data):
    try:
        j = json.loads(data.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return None
    return j if isinstance(j, dict) else None


# ── What the Worker wants ───────────────────────────────────────────────────
class Refused(Exception):
    """No upstream call: the cap, a wait, a hold, the stop or a missing key."""

    def __init__(self, code, retry_after=None):
        Exception.__init__(self, code)
        self.code = code
        self.retry_after = retry_after


def _num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return v if math.isfinite(v) else None


def parse_box(e):
    """One /osky/wanted entry: ((lamin, lomin, lamax, lomax), icao24 set,
    callsign set), or None when it is not a box of at most 25 sq deg with one
    to four flights."""
    if not isinstance(e, dict):
        return None
    vals = []
    for n in ('lamin', 'lomin', 'lamax', 'lomax'):
        f = _num(e.get(n))
        if f is None:
            return None
        vals.append(round(f, 4))
    lamin, lomin, lamax, lomax = vals
    if not (-90 <= lamin < lamax <= 90 and -180 <= lomin < lomax <= 180):
        return None
    if (lamax - lamin) * (lomax - lomin) > MAX_BOX_SQ_DEG + 1e-9:
        return None
    icao_in, calls_in = e.get('icao24') or [], e.get('callsign') or []
    if not isinstance(icao_in, list) or not isinstance(calls_in, list):
        return None
    icao = set(str(v).strip().lower() for v in icao_in)
    calls = set(str(v).strip().upper() for v in calls_in)
    if not all(RE_ICAO.match(v) for v in icao) or not all(RE_CALLSIGN.match(v) for v in calls):
        return None
    if not (1 <= len(icao) + len(calls) <= MAX_FILTER_VALUES):
        return None
    return (lamin, lomin, lamax, lomax), frozenset(icao), frozenset(calls)


def reduce_states(payload):
    """OpenSky's state vectors down to the fields the map needs. Bad rows are skipped."""
    if not isinstance(payload, dict):
        raise Upstream('bad-json')
    rows = payload.get('states')
    if rows is None:
        rows = []
    if not isinstance(rows, list):
        raise Upstream('bad-json')
    out = []
    for s in rows:
        if not isinstance(s, list) or len(s) < 17:
            continue
        icao = s[0]
        if not isinstance(icao, str) or not RE_ICAO.match(icao.strip().lower()):
            continue
        lat, lon = _num(s[6]), _num(s[5])
        if lat is None or lon is None:
            continue
        cs = s[1].strip().upper() if isinstance(s[1], str) else ''
        out.append({
            'icao24': icao.strip().lower(),
            'callsign': cs or None,
            'lat': lat,
            'lon': lon,
            'baro_altitude': _num(s[7]),
            'geo_altitude': _num(s[13]),
            'on_ground': s[8] if isinstance(s[8], bool) else None,
            'velocity': _num(s[9]),
            'time_position': _num(s[3]),
            'last_contact': _num(s[4]),
            'true_track': _num(s[10]),
        })
    t = _num(payload.get('time'))
    return (int(t) if t is not None else None), out


def pick_flights(rows, icao, calls, heading):
    """Only the flights asked for; no heading unless HEADING=1."""
    out = []
    for r in rows:
        if not ((icao and r['icao24'] in icao) or (calls and (r['callsign'] or '') in calls)):
            continue
        row = dict(r)
        if not heading:
            row.pop('true_track', None)
        out.append(row)
    return out


# ── The relay ───────────────────────────────────────────────────────────────
class Relay(object):
    def __init__(self, rt):
        self.rt = rt
        self.now = make_clock(rt['clock_file'])
        self.lock = threading.Lock()
        self.done = threading.Event()
        self.key = read_relay_key()
        self.settings = read_settings(rt['config_dir'])
        self._conf_sig = self._config_sig()
        self.state_dir = rt['state_dir']
        self.latched = read_stop_marker(self.state_dir)
        self.extended = read_extension(self.state_dir)
        (self.state_date, self.state_count, self.backoff_until,
         self.state_bad) = self._load_state()
        self.registered = False
        self.register_next = 0.0
        self.register_wait = REGISTER_RETRY_MIN_S
        self.no_pin = False              # the Worker has no address pinned yet
        self.worker_stop = None          # the Worker's stop date, from its heartbeat answer
        self.worker_gone = False         # the Worker answered 410: stopped for now
        self.upstream_now = None         # OpenSky's clock, as last read from its answers
        self.puts_date = utc_date(self.now())
        self.puts_today = 0              # puts the Worker took today (since the relay started)
        self.on = False
        self.worker_ok = False
        self.creds = None                # (client_id, client_secret): memory only
        self.creds_at = 0.0
        self.token = None
        self.token_exp = 0.0
        self.token_fail_at = None
        self.hold_until = 0.0            # 401/403/5xx: no call before this (memory only)
        self.hold_code = None
        self.cache = {}
        self.last_status = 0             # OpenSky's last HTTP status code
        self.state = 'starting'
        self.hour_key = utc_hour_key(self.now())
        self.hour = self._zero_hour()
        self.last_error = None

    @staticmethod
    def _zero_hour():
        return {'ticks': 0, 'heartbeats': 0, 'worker_errors': 0, 'boxes': 0, 'upstream_calls': 0,
                'shared': 0, 'token_calls': 0, 'puts': 0, 'refused': 0, 'errors': 0}

    def count(self, field, code=None):
        with self.lock:
            self.hour[field] += 1
            if code:
                self.last_error = code

    # config, re-read when the file changes
    def _config_sig(self):
        try:
            st = os.stat(os.path.join(self.rt['config_dir'], 'relay.conf'))
            return (st.st_mtime_ns, st.st_size, st.st_uid, st.st_mode)
        except OSError:
            return None

    def refresh_settings(self):
        sig = self._config_sig()
        if sig != self._conf_sig:
            self._conf_sig = sig
            self.settings = read_settings(self.rt['config_dir'])

    def worker_url(self):
        return self.rt['worker_url'] or self.settings['worker_url']

    # the stop, latched on disk the first time it is reached
    def _marker_path(self):
        return os.path.join(self.state_dir, STOP_MARKER) if self.state_dir else None

    def _latch(self, stop_iso):
        if self.latched is not None and self.latched >= stop_iso:
            return
        self.latched = stop_iso
        path = self._marker_path()
        if path:
            try:
                tmp = path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    f.write('stopped for %s\n' % stop_iso)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, path)
            except OSError:
                pass                     # still stopped in memory
        log('stopped: latched for ' + stop_iso)

    def _unlatch(self):
        self.latched = None
        path = self._marker_path()
        if path:
            try:
                os.remove(path)
            except OSError:
                pass
        log('stop lifted: the stop date was moved later')

    def local_stop(self):
        """The relay's own stop date (ISO), or None when the config is wrong."""
        return local_stop_iso(self.settings, self.extended)

    def _forget(self):
        self.creds = None
        self.token = None
        self.cache.clear()

    def stopped(self):
        """Stopped for good: the relay's own stop date has passed (latched)."""
        self.refresh_settings()
        now = self.now()
        local = self.local_stop()
        if local is not None:
            if now >= parse_iso(local):
                self._latch(local)
            elif self.latched is not None and local > self.latched:
                self._unlatch()             # the stop date was moved later
        stop = is_stopped(self.settings, now, self.latched, self.extended)
        if stop:
            self._forget()
        return stop

    def worker_stopped(self):
        """Stopped FOR NOW: the Worker answered 410, or its stop date has
        passed (by this server's clock or OpenSky's). Nothing is latched."""
        t = self.now()
        if self.upstream_now is not None:
            t = max(t, self.upstream_now)
        if self.worker_gone or (self.worker_stop is not None and t >= self.worker_stop):
            self._forget()
            return True
        return False

    def _check_stops(self):
        if self.stopped():
            raise Refused('stopped')
        if self.worker_stopped():
            raise Refused('worker-stopped')

    def _stop_if_upstream_says(self, *times):
        """OpenSky's clock (its Date header, or the data's own 'time') past the
        relay's own stop latches the stop, whatever this server's clock says;
        past the Worker's stop, the relay stops for now."""
        local = self.local_stop()
        for x in times:
            if x is None:
                continue
            self.upstream_now = x if self.upstream_now is None else max(self.upstream_now, x)
            if local is not None and x >= parse_iso(local):
                self._latch(local)
                self._forget()
                raise Refused('stopped')
        if self.worker_stopped():
            raise Refused('worker-stopped')

    def _take_worker_stop(self, ws_iso):
        """The Worker's stop date, from a heartbeat. Earlier than the relay's
        own: obeyed for now (worker_stopped). Later by at most 40 days: the
        relay's own stop moves to it and is saved, so an extension of the
        term needs only a change to the Worker. Later by more: ignored."""
        ws = parse_iso(ws_iso)
        if ws is None:
            return
        self.worker_stop = ws
        local = self.local_stop()
        if local is None or self.latched is not None:
            return
        own = parse_iso(local)
        if not (own < ws <= own + MAX_EXTEND_S):
            return
        self.extended = ws_iso
        if self.state_dir:
            path = os.path.join(self.state_dir, EXTEND_FILE)
            try:
                tmp = path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    f.write('extended to %s\n' % ws_iso)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, path)
            except OSError:
                pass                     # in memory only: after a restart the earlier stop applies
        log('stop moved later by the Worker to ' + ws_iso)

    # the daily count and OpenSky's wait, saved before every call
    def _state_path(self):
        return os.path.join(self.state_dir, 'state.json') if self.state_dir else None

    def _load_state(self):
        t = self.now()
        today = utc_date(t)
        path = self._state_path()
        if not path:
            return today, 0, 0.0, True
        try:
            with open(path, 'r', encoding='utf-8') as f:
                j = json.load(f)
        except FileNotFoundError:
            return today, 0, 0.0, False
        except (OSError, ValueError):
            return today, None, 0.0, True
        if not isinstance(j, dict):
            return today, None, 0.0, True
        date, count, wait = j.get('date'), j.get('count'), j.get('backoff_until', 0)
        if not (isinstance(date, str) and RE_DATE.match(date) and isinstance(count, int)
                and not isinstance(count, bool) and count >= 0):
            return today, None, 0.0, True
        if isinstance(wait, bool) or not isinstance(wait, (int, float)) or not math.isfinite(wait) or wait < 0:
            return today, None, 0.0, True
        # a saved wait never runs longer than OpenSky's longest, from now
        return date, count, float(min(wait, t + MAX_BACKOFF_S)), False

    def _save_state(self):
        path = self._state_path()
        if not path:
            raise OSError('no state directory')
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({'date': self.state_date, 'count': self.state_count,
                       'backoff_until': int(math.ceil(self.backoff_until))}, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)

    def _roll_day(self, t):
        # only FORWARD: a clock stepped back to an earlier day never resets the count
        today = utc_date(t)
        if today > self.state_date:
            self.state_date, self.state_count = today, 0
            self.state_bad = self._state_path() is None

    def _clock_behind(self, t):
        return self.state_date is not None and utc_date(t) < self.state_date

    def reserve_call(self, peek=False):
        """Count one upstream data call, saved first; refuse when capped.
        peek=True only checks (before a login, so a capped day logs in for nothing)."""
        t = self.now()
        with self.lock:
            self._roll_day(t)
            if self.state_bad or self.state_count is None:
                # an unreadable count is treated as a spent day, never as zero
                raise Refused('count-unreadable', seconds_to_next_utc_day(t))
            if self._clock_behind(t):
                # the clock went back to an earlier day: that day counts as spent
                raise Refused('clock-behind', int(max(60, min(86400, date_start(self.state_date) - t))))
            cap = self.settings['cap']
            if self.state_count >= cap:
                raise Refused('daily-cap', seconds_to_next_utc_day(t))
            if self.state_count >= paced_allowance(cap, t):
                raise Refused('hourly-pace', seconds_to_next_hour(t))
            if peek:
                return
            self.state_count += 1
            try:
                self._save_state()
            except OSError:
                self.state_count -= 1
                raise Refused('state-unwritable', 60)

    def _save_backoff(self, until):
        with self.lock:
            self.backoff_until = max(self.backoff_until, until)
            if self.state_count is None or self.state_bad:
                return
            try:
                self._save_state()
            except OSError:
                pass                     # still obeyed in memory

    def _hold(self, seconds, code):
        self.hold_until = max(self.hold_until, self.now() + seconds)
        self.hold_code = code

    # ── the Worker ─────────────────────────────────────────────────────────
    def worker(self, method, path, body=None, query=None, auth=True):
        """One call to the Worker: (status, JSON object or None). Never raises."""
        url = self.worker_url()
        if not url:
            return 0, None
        url += path
        if query:
            url += '?' + urlencode(query)
        headers = {'Accept': 'application/json'}
        data = None
        if body is not None:
            data = json.dumps(body, separators=(',', ':')).encode('utf-8')
            headers['Content-Type'] = 'application/json'
        if auth:
            headers['X-Relay-Key'] = self.key
        try:
            status, _h, raw = http_request(method, url, data, headers, limit=MAX_WORKER_BODY_BYTES)
        except Upstream as e:
            self.count('worker_errors', 'worker-' + e.code)
            return 0, None
        if status >= 500:
            self.count('worker_errors', 'worker-%d' % status)
        return status, _json_dict(raw)

    def _worker_says_stopped(self, status):
        """A 410: the Worker's stop date has passed, or its OSKY_STOP_AT cannot
        be read. Stopped FOR NOW: the client is dropped and nothing goes to
        OpenSky, but nothing is latched and the heartbeat goes on, so a
        corrected date in the Worker resumes the relay without the console."""
        if status == 410:
            self.worker_gone = True
            self._forget()
            raise Refused('worker-stopped')

    def register(self):
        t = self.now()
        if t < self.register_next:
            return False
        status, j = self.worker('POST', '/osky/register', {'relayKey': self.key}, auth=False)
        self._worker_says_stopped(status)
        if status == 200 and j and j.get('registered') is True:
            self.registered, self.no_pin = True, False
            self.register_wait = REGISTER_RETRY_MIN_S
            log('registered with the Worker')
            return True
        if status == 503 and j and j.get('error') == 'no-pin':
            # the Worker has no address pinned yet: call nothing, say so, ask again in a minute
            if not self.no_pin:
                log('waiting for the Worker to pin this server\'s address (OSKY_RELAY_IPV4); no OpenSky calls')
            self.no_pin = True
            self.register_next = t + REGISTER_NO_PIN_RETRY_S
            return False
        self.no_pin = False
        self.register_next = t + self.register_wait
        self.register_wait = min(REGISTER_RETRY_MAX_S, self.register_wait * 2)
        self.count('worker_errors', 'register-%d' % status)
        return False

    def hold_seconds(self):
        t = self.now()
        return int(max(0, self.backoff_until - t, self.hold_until - t))

    def heartbeat(self):
        """GET /osky/report with the counts; True when OpenSky is switched on."""
        with self.lock:
            self._roll_day(self.now())
            calls = self.state_count if self.state_count is not None else 0
            puts = self._puts_roll(self.now())
        q = [('calls', str(calls)), ('cap', str(self.settings['cap'])), ('status', str(self.last_status)),
             ('hold', str(self.hold_seconds())), ('state', self.state), ('puts', str(puts)),
             ('stop', self.local_stop() or '')]
        status, j = self.worker('GET', '/osky/report', query=q)
        self.count('heartbeats')
        self._worker_says_stopped(status)
        self.worker_ok = status == 200 and j is not None
        if status == 403:
            # deleted, or not ours any more: register again, after a short
            # wait (KV can show a just-written registration as absent for a
            # few seconds, and asking at once would only write it again)
            self.registered = False
            self.register_next = max(self.register_next, self.now() + REGISTER_RETRY_MIN_S)
            return False
        if not self.worker_ok:
            return False
        self.worker_gone = False
        self._take_worker_stop(j.get('stop_at'))
        return j.get('on') is True

    def ensure_creds(self):
        """The OpenSky client, from the Worker; kept in memory only. Sets the
        state when there is none to use."""
        t = self.now()
        if self.creds and 0 <= t - self.creds_at < CREDS_REFRESH_S:
            return True
        if self.creds is None and (self.hold_code or '').startswith('login-') and t < self.hold_until:
            # OpenSky refused the client a moment ago: it is asked of the
            # Worker again when the hold ends, not before
            self.state = 'hold'
            return False
        status, j = self.worker('GET', '/osky/creds')
        self._worker_says_stopped(status)
        if status == 200 and j:
            cid, secret = j.get('client_id'), j.get('client_secret')
            if isinstance(cid, str) and isinstance(secret, str) and cid.strip() and secret.strip():
                creds = (cid.strip(), secret.strip())
                if creds != self.creds:
                    self.token = None
                self.creds, self.creds_at = creds, t
                return True
        error = j.get('error') if status == 503 and j else None
        if error in ('no-key', 'off'):
            self.creds, self.token = None, None
            self.state = error
            return False
        if status == 403:
            self.registered = False
            self.state = 'registering'
            return False
        if self.creds is not None:
            return True                  # the Worker had a problem: the client in memory stays in use
        self.state = 'creds-wait'
        return False

    def wanted(self):
        status, j = self.worker('GET', '/osky/wanted')
        self._worker_says_stopped(status)
        if status != 200 or not j or not isinstance(j.get('boxes'), list):
            return []
        out, seen = [], set()
        for e in j['boxes']:
            b = parse_box(e)
            if b and b not in seen:
                seen.add(b)
                out.append(b)
            if len(out) >= MAX_BOXES:
                break
        return out

    def put(self, box, utime, rows):
        body = {'box': {'lamin': box[0], 'lomin': box[1], 'lamax': box[2], 'lomax': box[3]},
                'time': utime, 'states': rows}
        status, _j = self.worker('POST', '/osky/put', body)
        self._worker_says_stopped(status)
        if status == 403:
            self.registered = False
        if status == 200:
            self.count('puts')
            with self.lock:
                self._puts_roll(self.now())
                self.puts_today += 1
            return True
        return status == 409            # no longer wanted: nothing to retry

    def _puts_roll(self, t):
        today = utc_date(t)
        if today > self.puts_date:
            self.puts_date, self.puts_today = today, 0
        return self.puts_today

    # ── OpenSky ────────────────────────────────────────────────────────────
    def get_token(self, stale=None):
        t = self.now()
        if self.token and self.token != stale and t < self.token_exp - TOKEN_RENEW_MARGIN_S:
            return self.token
        self._check_stops()
        if not self.creds:
            raise Refused('no-key')
        if self.token_fail_at is not None and t - self.token_fail_at < TOKEN_RETRY_GAP_S:
            raise Refused('login-wait', max(1, int(TOKEN_RETRY_GAP_S - (t - self.token_fail_at)) + 1))
        cid, secret = self.creds
        body = urlencode({'grant_type': 'client_credentials', 'client_id': cid,
                          'client_secret': secret}).encode('ascii')
        self.count('token_calls')
        self.token = None
        try:
            status, hdrs, data = http_request('POST', self.rt['token_url'], body,
                                              {'Content-Type': 'application/x-www-form-urlencoded'})
        except Upstream:
            self.token_fail_at = t
            raise Upstream('login-unreachable')
        self.last_status = status
        self._stop_if_upstream_says(upstream_clock(hdrs))
        if status != 200:
            code = 'login-%d' % status
            if status in (400, 401, 403):
                # the key or this server was refused: asking again soon will not help,
                # and the client is asked of the Worker again (it may have been fixed)
                self._hold(REFUSED_HOLD_S, code)
                self.creds = None
            else:
                self.token_fail_at = t
            raise Upstream(code)
        j = _json_dict(data) or {}
        tok, exp = j.get('access_token'), _num(j.get('expires_in'))
        if not isinstance(tok, str) or not tok:
            self.token_fail_at = t
            raise Upstream('login-failed')
        self.token_fail_at = None
        self.token = tok
        self.token_exp = t + max(TOKEN_RENEW_MARGIN_S + 60, min(3600, exp if exp else 1800))
        return tok

    def _call_states(self, box, icao, tok):
        q = [('lamin', '%.4f' % box[0]), ('lomin', '%.4f' % box[1]),
             ('lamax', '%.4f' % box[2]), ('lomax', '%.4f' % box[3])]
        q += [('icao24', v) for v in icao]
        self.count('upstream_calls')
        status, hdrs, data = http_request('GET', self.rt['api_base'] + '/states/all?' + urlencode(q),
                                          headers={'Authorization': 'Bearer ' + tok})
        self.last_status = status
        self._stop_if_upstream_says(upstream_clock(hdrs))
        return status, hdrs, data

    def fetch_box(self, box, icao):
        self._check_stops()
        if not self.creds:
            raise Refused('no-key')
        t = self.now()
        if t < self.backoff_until:
            raise Refused('upstream-backoff', max(1, int(self.backoff_until - t) + 1))
        if t < self.hold_until:
            # no call: OpenSky refused, or failed, a moment ago
            raise Refused((self.hold_code or 'upstream') + '-hold', max(1, int(self.hold_until - t) + 1))
        self.reserve_call(peek=True)
        tok = self.get_token()
        self.reserve_call()
        status, hdrs, data = self._call_states(box, icao, tok)
        if status == 401:
            # the token was refused: one fresh login, one retry, no more
            tok = self.get_token(stale=tok)
            self._check_stops()
            self.reserve_call()
            status, hdrs, data = self._call_states(box, icao, tok)
            if status == 401:
                self.token = None
        if status == 429:
            wait = retry_after_seconds(hdrs)
            self._save_backoff(self.now() + wait)
            raise Upstream('upstream-429', wait)
        if status in (401, 403):
            self._hold(REFUSED_HOLD_S, 'upstream-%d' % status)
            raise Upstream('upstream-%d' % status)
        if 500 <= status <= 599:
            self._hold(SERVER_ERROR_HOLD_S, 'upstream-%d' % status)
            raise Upstream('upstream-%d' % status)
        if status != 200:
            raise Upstream('upstream-%d' % status)
        try:
            payload = json.loads(data.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            raise Upstream('bad-json')
        utime, rows = reduce_states(payload)
        self._stop_if_upstream_says(utime)
        return {'at': self.now(), 'time': utime, 'rows': rows, 'put': None}

    def do_box(self, box, icao, calls):
        """One wanted box: an earlier answer within the cache time, or one
        OpenSky call; then the flights asked for go to the Worker."""
        self.count('boxes')
        # OpenSky can filter by icao24 itself; a callsign is matched here
        up_icao = tuple(sorted(icao)) if icao and not calls else ()
        key = (box, up_icao)
        t = self.now()
        ttl = self.settings['cache_s']
        for k in [k for k, e in self.cache.items() if not (0 <= t - e['at'] < ttl)]:
            del self.cache[k]
        entry = self.cache.get(key)
        if entry:
            self.count('shared')
        else:
            entry = self.fetch_box(box, up_icao)
            self.cache[key] = entry
            if len(self.cache) > MAX_CACHE_ENTRIES:
                for k in sorted(self.cache, key=lambda k: self.cache[k]['at'])[:len(self.cache) - MAX_CACHE_ENTRIES]:
                    del self.cache[k]
        heading = self.settings['heading']
        sig = (icao, calls, heading)
        if entry['put'] == sig:
            return                       # already with the Worker
        if self.put(box, entry['time'], pick_flights(entry['rows'], icao, calls, heading)):
            entry['put'] = sig

    # ── one round, once a minute ───────────────────────────────────────────
    REFUSED_STATE = {'daily-cap': 'capped', 'hourly-pace': 'capped', 'upstream-backoff': 'backoff',
                     'no-key': 'no-key', 'count-unreadable': 'count-unreadable', 'clock-behind': 'clock-behind'}

    def tick(self):
        """One round. False once the relay is stopped for good."""
        self.count('ticks')
        self.roll_hour()
        try:
            return self._round()
        except Refused as e:
            if e.code == 'stopped' or self.stopped():
                self.state = 'stopped'
                return False
            if e.code == 'worker-stopped':
                # the Worker's stop: nothing to OpenSky, the heartbeat goes on
                self.state = 'worker-stopped'
                return True
            self.count('refused', e.code)
            return True

    def _round(self):
        if self.stopped():
            self.state = 'stopped'
            return False
        if not self.key:
            self.state = 'no-relay-key'
            return True
        if not self.worker_url():
            self.state = 'bad-worker-url'
            return True
        if not self.registered and not self.register():
            self.state = 'no-pin' if self.no_pin else 'registering'
            return True
        self.on = self.heartbeat()
        if self.stopped():
            self.state = 'stopped'
            return False
        if self.worker_stopped():
            self.state = 'worker-stopped'
            return True
        if not self.registered:
            self.state = 'registering'
            return True
        if not self.on:
            if self.worker_ok:
                # switched off: nothing is kept
                self.creds, self.token = None, None
                self.cache.clear()
                self.state = 'off'
            else:
                # the Worker cannot say this minute: no OpenSky call either
                self.state = 'worker-unreachable'
            return True
        if not self.ensure_creds():
            return True
        boxes = self.wanted()
        self.state = 'ready' if boxes else 'idle'
        for box, icao, calls in boxes:
            try:
                self.do_box(box, icao, calls)
            except Refused as e:
                if e.code in ('stopped', 'worker-stopped'):
                    raise
                self.count('refused', e.code)
                self.state = 'hold' if e.code.endswith('-hold') else self.REFUSED_STATE.get(e.code, self.state)
            except Upstream as e:
                self.count('errors', e.code)
                if e.code == 'upstream-429':
                    self.state = 'backoff'
                elif self.now() < self.hold_until:
                    self.state = 'hold'
        return True

    def roll_hour(self):
        """Once an hour, one line of counts."""
        key = utc_hour_key(self.now())
        with self.lock:
            if key == self.hour_key:
                return
            old_key, old = self.hour_key, self.hour
            self.hour_key, self.hour = key, self._zero_hour()
            line = self.summary_line(old_key, old)
            self.last_error = None
        log(line)

    def summary_line(self, key, hour):
        calls = '?' if self.state_count is None else str(self.state_count)
        line = ('hour=%s ticks=%d heartbeats=%d worker_errors=%d boxes=%d upstream=%d shared=%d tokens=%d '
                'puts=%d refused=%d errors=%d today=%s/%d state=%s'
                % (key, hour['ticks'], hour['heartbeats'], hour['worker_errors'], hour['boxes'],
                   hour['upstream_calls'], hour['shared'], hour['token_calls'], hour['puts'],
                   hour['refused'], hour['errors'], calls, self.settings['cap'], self.state))
        if self.last_error:
            line += ' last_error=' + self.last_error
        return line

    def write_status(self):
        """Counts and states only, for opensky-status on the server."""
        if not self.state_dir:
            return
        t = self.now()
        st = {
            'state': self.state, 'registered': self.registered, 'on': self.on,
            'relay_key_set': bool(self.key), 'opensky_client_in_memory': self.creds is not None,
            'stop_at': self.local_stop(), 'conf_stop_at': self.settings['stop_iso'],
            'worker_stop_at': utc_iso(self.worker_stop) if self.worker_stop else None,
            'stop_latched': self.latched is not None, 'date': self.state_date, 'calls_today': self.state_count,
            'puts_today': self.puts_today,
            'cap': self.settings['cap'], 'last_status': self.last_status, 'hold_seconds': self.hold_seconds(),
            'at': utc_iso(t),
        }
        path = os.path.join(self.state_dir, 'status.json')
        try:
            tmp = path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(st, f)
            os.replace(tmp, path)
        except OSError:
            pass

    def run(self):
        s = self.settings
        log('start: relay key set: %s, stop %s, cap %d/day, cache %d s, heading %s, count today %s'
            % ('yes' if self.key else 'no', self.local_stop() or 'MISSING (stopped)', s['cap'], s['cache_s'],
               'on' if s['heading'] else 'off', 'unreadable' if self.state_count is None else self.state_count))
        while not self.done.is_set():
            try:
                going = self.tick()
            except Exception:
                self.count('errors', 'internal')
                going = True
            self.write_status()
            if not going:
                log('stopped: the term has ended (or the stop date is missing); no OpenSky calls')
                break
            self.done.wait(self.rt['loop_s'])
        with self.lock:
            line = self.summary_line(self.hour_key, self.hour)
        self.creds = None
        self.token = None
        self.cache.clear()
        log('exit: ' + line)


def cli_stopped(rt):
    settings = read_settings(rt['config_dir'])
    now = make_clock(rt['clock_file'])()
    return is_stopped(settings, now, read_stop_marker(rt['state_dir']), read_extension(rt['state_dir']))


def main(argv):
    try:
        rt = load_runtime()
    except Fatal as e:
        sys.stderr.write('opensky-relay: %s\n' % e)
        return 2
    if len(argv) >= 2 and argv[1] == '--make-key':
        if len(argv) != 3:
            sys.stderr.write('usage: relay.py --make-key FILE\n')
            return 2
        if not TEST_MODE and hasattr(os, 'geteuid') and os.geteuid() != 0:
            sys.stderr.write('opensky-relay: --make-key runs as root\n')
            return 2
        return make_key(argv[2])
    if len(argv) >= 2 and argv[1] == '--stopped':
        return 0 if cli_stopped(rt) else 1
    if len(argv) != 1:
        sys.stderr.write('usage: relay.py [--make-key FILE | --stopped]\n')
        return 2
    relay = Relay(rt)

    def on_term(_sig, _frame):
        relay.done.set()
    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)
    relay.run()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
