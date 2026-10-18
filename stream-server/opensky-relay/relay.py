#!/usr/bin/env python3
"""OpenSky relay: every OpenSky call from one fixed IPv4 address.

OpenSky whitelists the address the account's calls come from. Cloudflare
Workers have no fixed egress address, so the boards' Worker never calls
OpenSky itself: it asks this relay, through a Cloudflare Tunnel and a Workers
VPC Service, and the relay makes the call from its own server.

It listens on 127.0.0.1:8787 and nowhere else. The tunnel (cloudflared, on the
same server) is the only way in; the server's firewall lets nothing in.

Endpoints (GET only):

  /states?lamin=&lomin=&lamax=&lomax=&icao24=|&callsign=
      For the flights on screen only. Needs the caller key (X-Relay-Key), one
      bounding box of at most 25 square degrees (the 1-credit size), and at
      least one icao24 or callsign: at most 4 values in all. A request with no
      filter is refused (400 filter-required), so the relay never hands out
      the surrounding traffic. Global and icao24-only queries are refused too.
      The box goes upstream and the filter is applied here, so every screen
      asking about the same box shares one upstream call. Repeat a parameter
      or separate values with commas.
      Each matching aircraft comes back reduced to: icao24, callsign, lat, lon,
      baro_altitude, geo_altitude (metres), on_ground, velocity (m/s),
      time_position, last_contact (unix seconds). true_track (degrees) only
      when HEADING=1 in the config. No vertical rate, squawk or anything else.

  /health
      Counts, the stop date, whether a key is set, the last OpenSky answer,
      the public IPv4. No secrets and no positions.

The licence limits it enforces:

  - HARD STOP at STOP_AT from /etc/opensky-relay/relay.conf (root-owned; only
    opensky-extend, typed on the server, moves it). From then on /states
    answers 410 and nothing goes upstream, not even a login. A missing,
    unreadable, unsafe or ambiguous config (two STOP_AT lines) counts as
    stopped. The stop is LATCHED: the first time it is reached, a marker is
    saved in the state directory, so a clock stepped back does not undo it.
    Only a later STOP_AT (opensky-extend) lifts it. A Date header or a data
    'time' from OpenSky at or after STOP_AT is a stop too.
  - A daily cap of 1500 upstream calls per UTC day, paced across the hours
    (hour h may have used at most cap * (h + 1) / 24). The count is saved to
    a small state file before every call, so a restart cannot reset it. A
    clock stepped back to an earlier day does not reset it either: until the
    clock is back on the saved day, the day counts as spent.
  - 429 and X-Rate-Limit-Retry-After-Seconds (or Retry-After) are obeyed, and
    the wait is saved, so a restart obeys it too. A refused key (401 after a
    fresh login) or a refused server (403) holds every call for 10 minutes;
    an OpenSky server error holds every call for a minute.
  - Answers live in memory only: 120 s by default, never more than 300 s, and
    an expired answer is dropped within a second, whether or not anyone asks
    for it again. Identical requests in flight share one upstream call.
  - Outbound connections are IPv4 only, so the whitelisted address always
    matches.
  - Logs carry counts only: one line an hour, plus one at start and one at
    the stop. Never coordinates, callsigns, payloads or the secret.

Secrets come from systemd's LoadCredential, in $CREDENTIALS_DIRECTORY:
  credentials   the OAuth2 client: a client_id line and a client_secret line
  caller-key    the key the boards' Worker sends as X-Relay-Key
The access token lives in memory, is renewed two minutes before its 30-minute
expiry, and once more after a 401.

Python standard library only; runs on Python 3.9 and later.

Command line (root, on the server; used by opensky-key and install.sh):
  relay.py                       run the relay
  relay.py --check-login FILE    one login with the client in FILE, no data call
  relay.py --stopped             exit 0 when the relay is stopped (term ended)
"""

import email.utils
import hmac
import http.client
import http.server
import ipaddress
import json
import math
import os
import re
import signal
import socket
import ssl
import sys
import threading
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlencode, urlsplit

# ── Fixed settings ──────────────────────────────────────────────────────────
LISTEN_HOST = '127.0.0.1'          # loopback only: never all interfaces, never IPv6
LISTEN_PORT = 8787

# From OpenSky's REST documentation (openskynetwork.github.io/opensky-api/rest.html):
# the API root, and the OAuth2 client-credentials token endpoint.
TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
API_BASE = 'https://opensky-network.org/api'
USER_AGENT = 'orion-connected-opensky-relay/1'

CONFIG_DIR = '/etc/opensky-relay'
STATE_DIR = '/var/lib/opensky-relay'   # systemd's StateDirectory=opensky-relay
STOP_MARKER = 'stopped'                # in the state directory: "stopped for <STOP_AT>"
MAX_BOX_SQ_DEG = 25.0              # 25 sq deg or less = 1 credit per call
MAX_DAILY_CAP = 1500               # the config may lower it, never raise it
DEFAULT_CACHE_S = 120
MIN_CACHE_S = 10
MAX_CACHE_S = 300
TOKEN_RENEW_MARGIN_S = 120         # renew 2 minutes before expiry
TOKEN_RETRY_GAP_S = 60             # a login that could not reach OpenSky is retried at most once a minute
UPSTREAM_TIMEOUT_S = 15
DEFAULT_BACKOFF_S = 300            # a 429 without a usable wait header
MAX_BACKOFF_S = 86400
REFUSED_HOLD_S = 600               # 401 after a fresh login, or 403: no call for 10 minutes
SERVER_ERROR_HOLD_S = 60           # OpenSky 5xx: no call for a minute
ERROR_HOLD_S = 15                  # any other failure for a box is answered from memory this long
MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_FILTER_VALUES = 4              # icao24 + callsign values together: the flights on screen
MAX_CACHE_ENTRIES = 200
CALLER_HEADER = 'X-Relay-Key'
MIN_CALLER_KEY_LEN = 20
CREDIT = 'Data: OpenSky Network'

ALLOWED_PARAMS = {'lamin', 'lomin', 'lamax', 'lomax', 'icao24', 'callsign'}
CONF_KEYS = ('STOP_AT', 'DAILY_CAP', 'CACHE_SECONDS', 'HEADING')
RE_STOP = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
RE_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
RE_ICAO = re.compile(r'^[0-9a-f]{6}$')
RE_CALLSIGN = re.compile(r'^[A-Z0-9]{1,8}$')
RE_CONF_LINE = re.compile(r'^([A-Z_]+)=(.*)$')
RE_ANY_STOP_LINE = re.compile(r'^\s*stop_at\s*=', re.IGNORECASE)
NEVER = '9999-12-31T23:59:59Z'     # an unreadable stop marker: stopped until opensky-extend removes it

# ── Test mode ───────────────────────────────────────────────────────────────
# The tests run this file against a fake OpenSky on 127.0.0.1. Only in test
# mode may the token URL, API root, port, config directory and clock be
# changed, and only to loopback addresses. Test mode refuses to run as root
# or under the production unit (which sets OSKY_PRODUCTION=1), so it can
# never move the stop date or point the secret anywhere else.
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
        'token_url': TOKEN_URL, 'api_base': API_BASE, 'port': LISTEN_PORT,
        'config_dir': CONFIG_DIR, 'clock_file': None, 'tick': 1.0,
        'state_dir': state_dir or STATE_DIR,
    }
    if not TEST_MODE:
        return rt
    if os.environ.get('OSKY_PRODUCTION') == '1':
        raise Fatal('test mode is not allowed in production')
    if hasattr(os, 'geteuid') and os.geteuid() == 0:
        raise Fatal('test mode is not allowed as root')
    if os.environ.get('OSKY_TEST_TOKEN_URL'):
        rt['token_url'] = _loopback_url('OSKY_TEST_TOKEN_URL')
    if os.environ.get('OSKY_TEST_API_BASE'):
        rt['api_base'] = _loopback_url('OSKY_TEST_API_BASE')
    if rt['token_url'] == TOKEN_URL or rt['api_base'] == API_BASE:
        raise Fatal('test mode needs both OSKY_TEST_TOKEN_URL and OSKY_TEST_API_BASE')
    if os.environ.get('OSKY_TEST_PORT'):
        rt['port'] = int(os.environ['OSKY_TEST_PORT'])
    if os.environ.get('OSKY_TEST_CONFIG_DIR'):
        rt['config_dir'] = os.environ['OSKY_TEST_CONFIG_DIR']
    if os.environ.get('OSKY_TEST_CLOCK_FILE'):
        rt['clock_file'] = os.environ['OSKY_TEST_CLOCK_FILE']
    rt['state_dir'] = state_dir          # never the production directory in test mode
    rt['tick'] = 0.2
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
    # counts and states only; callers never pass request data
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


def read_settings(config_dir):
    """Settings from relay.conf. Anything wrong means stopped (stop_at = 0)."""
    s = {'stop_at': 0.0, 'stop_iso': None, 'config_ok': False, 'cap': MAX_DAILY_CAP,
         'cache_s': DEFAULT_CACHE_S, 'heading': False}
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
    if len(stops) == 1 and any_stop == 1 and RE_STOP.match(stops[0]):
        try:
            s['stop_at'] = datetime.strptime(stops[0], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp()
            s['stop_iso'] = stops[0]
            s['config_ok'] = True
        except ValueError:
            pass
    # a repeated setting takes its safest value
    caps = [max(0, min(MAX_DAILY_CAP, _int_or(v, MAX_DAILY_CAP))) for v in vals.get('DAILY_CAP', [])]
    s['cap'] = min(caps) if caps else MAX_DAILY_CAP
    caches = [max(MIN_CACHE_S, min(MAX_CACHE_S, _int_or(v, DEFAULT_CACHE_S))) for v in vals.get('CACHE_SECONDS', [])]
    s['cache_s'] = min(caches) if caches else DEFAULT_CACHE_S
    heads = vals.get('HEADING', [])
    s['heading'] = bool(heads) and all(v == '1' for v in heads)
    return s


def read_credentials_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            vals = {}
            for raw in f.read().splitlines():
                key, sep, val = raw.partition('=')
                if sep:
                    vals[key.strip().lower()] = val.strip()
    except (OSError, ValueError):
        return None
    cid, secret = vals.get('client_id', ''), vals.get('client_secret', '')
    return (cid, secret) if cid and secret else None


def read_credentials():
    d = os.environ.get('CREDENTIALS_DIRECTORY')
    return read_credentials_file(os.path.join(d, 'credentials')) if d else None


def normalise_key(v):
    """The caller key compares on its letters and digits only, so dashes,
    spaces or capitals typed into Cloudflare do not matter."""
    return re.sub(r'[^a-z0-9]', '', str(v or '').lower())


def read_caller_key():
    d = os.environ.get('CREDENTIALS_DIRECTORY')
    if not d:
        return None
    try:
        with open(os.path.join(d, 'caller-key'), 'r', encoding='utf-8') as f:
            k = normalise_key(f.read())
    except (OSError, ValueError):
        return None
    return k if len(k) >= MIN_CALLER_KEY_LEN else None


def read_public_ipv4(config_dir):
    try:
        with open(os.path.join(config_dir, 'public-ipv4'), 'r', encoding='utf-8') as f:
            return str(ipaddress.IPv4Address(f.read().strip()))
    except (OSError, ValueError):
        return None


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


def is_stopped(settings, now, marker):
    """Stopped when the config is wrong, the stop time has passed, or a stop
    was latched for this STOP_AT (or a later one)."""
    if not settings['config_ok'] or now >= settings['stop_at']:
        return True
    return marker is not None and not (settings['stop_iso'] > marker)


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
    def __init__(self, code, status=502, retry_after=None):
        Exception.__init__(self, code)
        self.code = code
        self.status = status
        self.retry_after = retry_after


def http_request(method, url, body=None, headers=None):
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
        data = resp.read(MAX_BODY_BYTES + 1)
        if len(data) > MAX_BODY_BYTES:
            raise Upstream('too-large')
        hdrs = {k.lower(): v for k, v in resp.getheaders()}
        return resp.status, hdrs, data
    except socket.timeout:
        raise Upstream('timeout', 504)
    except (OSError, http.client.HTTPException, ssl.SSLError):
        raise Upstream('unreachable', 502)
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


# ── Requests ────────────────────────────────────────────────────────────────
class Refused(Exception):
    def __init__(self, status, code, retry_after=None):
        Exception.__init__(self, code)
        self.status = status
        self.code = code
        self.retry_after = retry_after


def _values(qs, name):
    out = []
    for v in qs.get(name, []):
        out.extend(p.strip() for p in v.split(',') if p.strip())
    return out


def parse_states_query(query):
    try:
        qs = parse_qs(query, keep_blank_values=True, strict_parsing=False, max_num_fields=40)
    except ValueError:
        raise Refused(400, 'bad-query')
    unknown = set(qs) - ALLOWED_PARAMS
    if unknown:
        raise Refused(400, 'unknown-parameter')
    names = ('lamin', 'lomin', 'lamax', 'lomax')
    if not all(n in qs for n in names):
        # icao24-only and global queries both land here
        raise Refused(400, 'box-required')
    vals = []
    for n in names:
        if len(qs[n]) != 1:
            raise Refused(400, 'box-repeated')
        try:
            f = float(qs[n][0])
        except ValueError:
            raise Refused(400, 'box-not-a-number')
        if not math.isfinite(f):
            raise Refused(400, 'box-not-a-number')
        vals.append(round(f, 4))
    lamin, lomin, lamax, lomax = vals
    if not (-90 <= lamin < lamax <= 90 and -180 <= lomin < lomax <= 180):
        raise Refused(400, 'box-out-of-range')
    if (lamax - lamin) * (lomax - lomin) > MAX_BOX_SQ_DEG + 1e-9:
        raise Refused(400, 'box-too-big')
    icao = set(v.lower() for v in _values(qs, 'icao24'))
    calls = set(v.upper() for v in _values(qs, 'callsign'))
    if not icao and not calls:
        # the licence covers the aircraft of the flights being shown, never
        # the surrounding traffic: no filter, no answer
        raise Refused(400, 'filter-required')
    if len(icao) + len(calls) > MAX_FILTER_VALUES:
        raise Refused(400, 'too-many-filters')
    if not all(RE_ICAO.match(v) for v in icao):
        raise Refused(400, 'bad-icao24')
    if not all(RE_CALLSIGN.match(v) for v in calls):
        raise Refused(400, 'bad-callsign')
    return (lamin, lomin, lamax, lomax), icao, calls


def _num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return v if math.isfinite(v) else None


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


class Inflight(object):
    def __init__(self):
        self.event = threading.Event()
        self.result = None
        self.error = None


# ── The relay ───────────────────────────────────────────────────────────────
class Relay(object):
    def __init__(self, rt):
        self.rt = rt
        self.now = make_clock(rt['clock_file'])
        self.lock = threading.Lock()
        self.token_lock = threading.Lock()
        self.creds = read_credentials()
        self.caller_key = read_caller_key()
        self.settings = read_settings(rt['config_dir'])
        self._conf_sig = self._config_sig()
        self._conf_checked = time.monotonic()
        self.state_dir = rt['state_dir']
        self.latched = read_stop_marker(self.state_dir)
        (self.state_date, self.state_count, self.backoff_until,
         self.state_bad) = self._load_state()
        self.token = None
        self.token_exp = 0.0
        self.token_fail_at = None
        self.hold_until = 0.0            # 401/403/5xx: no call before this (memory only)
        self.hold_code = None
        self.cache = {}
        self.errors = {}
        self.inflight = {}
        self.was_stopped = None
        self.hour_key = utc_hour_key(self.now())
        self.hour = self._zero_hour()
        self.last_error = None
        self.upstream_ok_at = None
        self.upstream_error = None
        self.upstream_error_at = None

    @staticmethod
    def _zero_hour():
        return {'requests': 0, 'cache_hits': 0, 'shared': 0, 'upstream_calls': 0,
                'token_calls': 0, 'refused': 0, 'errors': 0}

    # config, re-read when the file changes
    def _config_sig(self):
        try:
            st = os.stat(os.path.join(self.rt['config_dir'], 'relay.conf'))
            return (st.st_mtime_ns, st.st_size, st.st_uid, st.st_mode)
        except OSError:
            return None

    def refresh_settings(self):
        if not TEST_MODE and time.monotonic() - self._conf_checked < 5:
            return
        self._conf_checked = time.monotonic()
        sig = self._config_sig()
        if sig != self._conf_sig:
            self._conf_sig = sig
            self.settings = read_settings(self.rt['config_dir'])

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
        log('stop lifted: STOP_AT was moved later')

    def stopped(self):
        self.refresh_settings()
        s = self.settings
        now = self.now()
        if s['config_ok'] and now >= s['stop_at']:
            self._latch(s['stop_iso'])
        elif s['config_ok'] and self.latched is not None and s['stop_iso'] > self.latched:
            self._unlatch()             # opensky-extend moved the stop later
        stop = is_stopped(s, now, self.latched)
        if stop and self.was_stopped is not True:
            with self.lock:
                self.cache.clear()
                self.errors.clear()
            self.token = None
            if self.was_stopped is False:
                log('stopped: no further OpenSky calls')
        self.was_stopped = stop
        return stop

    def _stop_if_upstream_says(self, *times):
        """OpenSky's clock (its Date header, or the data's own 'time') past
        STOP_AT stops the relay, whatever this server's clock says."""
        s = self.settings
        if not s['config_ok']:
            return
        for x in times:
            if x is not None and x >= s['stop_at']:
                self._latch(s['stop_iso'])
                self.stopped()
                raise Refused(410, 'stopped')

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
                raise Refused(503, 'count-unreadable', seconds_to_next_utc_day(t))
            if self._clock_behind(t):
                # the clock went back to an earlier day: that day counts as spent
                wait = date_start(self.state_date) - t
                raise Refused(503, 'clock-behind', int(max(60, min(86400, wait))))
            cap = self.settings['cap']
            if self.state_count >= cap:
                raise Refused(429, 'daily-cap', seconds_to_next_utc_day(t))
            if self.state_count >= paced_allowance(cap, t):
                raise Refused(429, 'hourly-pace', seconds_to_next_hour(t))
            if peek:
                return
            self.state_count += 1
            try:
                self._save_state()
            except OSError:
                self.state_count -= 1
                raise Refused(503, 'state-unwritable', 60)

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

    def _upstream_failed(self, code):
        with self.lock:
            self.upstream_error, self.upstream_error_at = code, self.now()

    # login
    def get_token(self, stale=None):
        with self.token_lock:
            t = self.now()
            if self.token and self.token != stale and t < self.token_exp - TOKEN_RENEW_MARGIN_S:
                return self.token
            if self.stopped():
                raise Refused(410, 'stopped')
            if not self.creds:
                raise Refused(503, 'no-key')
            if self.token_fail_at is not None and t - self.token_fail_at < TOKEN_RETRY_GAP_S:
                raise Refused(503, 'login-wait', max(1, int(TOKEN_RETRY_GAP_S - (t - self.token_fail_at)) + 1))
            cid, secret = self.creds
            body = urlencode({'grant_type': 'client_credentials', 'client_id': cid,
                              'client_secret': secret}).encode('ascii')
            with self.lock:
                self.hour['token_calls'] += 1
            self.token = None
            try:
                status, hdrs, data = http_request('POST', self.rt['token_url'], body,
                                                  {'Content-Type': 'application/x-www-form-urlencoded'})
            except Upstream:
                self.token_fail_at = t
                raise Upstream('login-unreachable', 502)
            self._stop_if_upstream_says(upstream_clock(hdrs))
            if status != 200:
                code = 'login-%d' % status
                if status in (400, 401, 403):
                    # the key or this server was refused: asking again soon will not help
                    self._hold(REFUSED_HOLD_S, code)
                else:
                    self.token_fail_at = t
                raise Upstream(code, 502)
            tok, exp = None, None
            try:
                j = json.loads(data.decode('utf-8'))
                tok = j.get('access_token') if isinstance(j, dict) else None
                exp = _num(j.get('expires_in')) if isinstance(j, dict) else None
            except (ValueError, UnicodeDecodeError):
                tok = None
            if not isinstance(tok, str) or not tok:
                self.token_fail_at = t
                raise Upstream('login-failed', 502)
            self.token_fail_at = None
            self.token = tok
            self.token_exp = t + max(TOKEN_RENEW_MARGIN_S + 60, min(3600, exp if exp else 1800))
            return tok

    # one upstream /states/all call for a box
    def _call_states(self, box, tok):
        q = urlencode([('lamin', '%.4f' % box[0]), ('lomin', '%.4f' % box[1]),
                       ('lamax', '%.4f' % box[2]), ('lomax', '%.4f' % box[3])])
        with self.lock:
            self.hour['upstream_calls'] += 1
        status, hdrs, data = http_request('GET', self.rt['api_base'] + '/states/all?' + q,
                                          headers={'Authorization': 'Bearer ' + tok})
        self._stop_if_upstream_says(upstream_clock(hdrs))
        return status, hdrs, data

    def _fetch_box(self, box):
        if self.stopped():
            raise Refused(410, 'stopped')
        if not self.creds:
            raise Refused(503, 'no-key')
        t = self.now()
        if t < self.backoff_until:
            raise Refused(429, 'upstream-backoff', max(1, int(self.backoff_until - t) + 1))
        if t < self.hold_until:
            # no call: OpenSky refused, or failed, a moment ago
            raise Refused(503, (self.hold_code or 'upstream') + '-hold', max(1, int(self.hold_until - t) + 1))
        self.reserve_call(peek=True)
        tok = self.get_token()
        self.reserve_call()
        status, hdrs, data = self._call_states(box, tok)
        if status == 401:
            # the token was refused: one fresh login, one retry, no more
            tok = self.get_token(stale=tok)
            if self.stopped():
                raise Refused(410, 'stopped')
            self.reserve_call()
            status, hdrs, data = self._call_states(box, tok)
            if status == 401:
                self.token = None
        if status == 429:
            wait = retry_after_seconds(hdrs)
            self._save_backoff(self.now() + wait)
            raise Refused(429, 'upstream-429', wait)
        if status in (401, 403):
            self._hold(REFUSED_HOLD_S, 'upstream-%d' % status)
            raise Upstream('upstream-%d' % status, 502, REFUSED_HOLD_S)
        if 500 <= status <= 599:
            self._hold(SERVER_ERROR_HOLD_S, 'upstream-%d' % status)
            raise Upstream('upstream-%d' % status, 502, SERVER_ERROR_HOLD_S)
        if status != 200:
            raise Upstream('upstream-' + str(status), 502)
        try:
            payload = json.loads(data.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            raise Upstream('bad-json', 502)
        utime, rows = reduce_states(payload)
        self._stop_if_upstream_says(utime)
        with self.lock:
            self.upstream_ok_at = self.now()
        return {'at': self.now(), 'time': utime, 'rows': rows}

    def purge(self, t):
        """Drop expired answers and error holds. Caller holds self.lock."""
        ttl = self.settings['cache_s']
        for k in [k for k, e in self.cache.items() if not (0 <= t - e['at'] < ttl)]:
            del self.cache[k]
        for k in [k for k, held in self.errors.items() if not (0 <= t - held[0] < ERROR_HOLD_S)]:
            del self.errors[k]

    def states(self, box):
        """Cached answer for a box, or one shared upstream call."""
        t = self.now()
        with self.lock:
            self.purge(t)
            entry = self.cache.get(box)
            if entry:
                self.hour['cache_hits'] += 1
                return entry, True
            held = self.errors.get(box)
            if held:
                raise held[1]
            fl = self.inflight.get(box)
            leader = fl is None
            if leader:
                fl = Inflight()
                self.inflight[box] = fl
        if not leader:
            fl.event.wait(UPSTREAM_TIMEOUT_S * 3 + 5)
            with self.lock:
                self.hour['shared'] += 1
            if fl.error is not None:
                raise fl.error
            if fl.result is None:
                raise Upstream('timeout', 504)
            return fl.result, True
        try:
            entry = self._fetch_box(box)
            fl.result = entry
            with self.lock:
                self.cache[box] = entry
                self.errors.pop(box, None)
                if len(self.cache) > MAX_CACHE_ENTRIES:
                    for k in sorted(self.cache, key=lambda k: self.cache[k]['at'])[:len(self.cache) - MAX_CACHE_ENTRIES]:
                        del self.cache[k]
            return entry, False
        except Upstream as e:
            fl.error = e
            self._upstream_failed(e.code)
            with self.lock:
                self.errors[box] = (self.now(), e)
            raise
        except Refused as e:
            fl.error = e
            if e.code == 'upstream-429':
                self._upstream_failed(e.code)
            raise
        except Exception as e:      # anything else is still answered, never a crash
            fl.error = e
            raise
        finally:
            with self.lock:
                self.inflight.pop(box, None)
            fl.event.set()

    def answer_states(self, query):
        with self.lock:
            self.hour['requests'] += 1
        if self.stopped():
            raise Refused(410, 'stopped')
        box, icao, calls = parse_states_query(query)
        entry, cached = self.states(box)
        heading = self.settings['heading']
        out = []
        for r in entry['rows']:
            # a row is passed on only when it is one of the flights asked for
            if not ((icao and r['icao24'] in icao) or (calls and (r['callsign'] or '') in calls)):
                continue
            row = dict(r)
            if not heading:
                row.pop('true_track', None)
            out.append(row)
        return {'credit': CREDIT, 'time': entry['time'], 'age': max(0, int(self.now() - entry['at'])),
                'cached': cached, 'count': len(out), 'states': out}

    def health(self):
        stopped = self.stopped()
        t = self.now()
        with self.lock:
            self._roll_day(t)
            hour = dict(self.hour)
            calls = self.state_count
            cache_entries = len(self.cache)
            ok_at, err, err_at = self.upstream_ok_at, self.upstream_error, self.upstream_error_at
        s = self.settings
        if stopped:
            state = 'stopped' if s['config_ok'] else 'config-missing'
        elif not self.creds:
            state = 'no-key'
        elif not self.caller_key:
            state = 'no-caller-key'
        elif self.state_bad or calls is None:
            state = 'count-unreadable'
        elif self._clock_behind(t):
            state = 'clock-behind'
        elif t < self.backoff_until:
            state = 'backoff'
        elif t < self.hold_until:
            state = 'hold'
        elif calls >= s['cap']:
            state = 'capped'
        else:
            state = 'ready'
        return {
            'service': 'opensky-relay',
            'state': state,
            'on': state in ('ready', 'backoff', 'hold', 'capped'),
            'key_set': bool(self.creds),
            'caller_key_set': bool(self.caller_key),
            'logged_in': bool(self.token) and t < self.token_exp,
            'stop_at': s['stop_iso'],
            'stopped': stopped,
            'stop_latched': self.latched is not None,
            'date': self.state_date,
            'calls_today': calls,
            'cap': s['cap'],
            'paced_allowance_now': paced_allowance(s['cap'], t),
            'backoff_seconds': max(0, int(self.backoff_until - t)) if t < self.backoff_until else 0,
            'hold_seconds': max(0, int(self.hold_until - t)) if t < self.hold_until else 0,
            'last_ok_at': utc_iso(ok_at) if ok_at else None,
            'last_error': err,
            'last_error_at': utc_iso(err_at) if err_at else None,
            'heading': s['heading'],
            'cache_seconds': s['cache_s'],
            'cache_entries': cache_entries,
            'this_hour': hour,
            'public_ipv4': read_public_ipv4(self.rt['config_dir']),
        }

    def summary_line(self, key, hour):
        calls = '?' if self.state_count is None else str(self.state_count)
        line = ('hour=%s requests=%d cache_hits=%d shared=%d upstream=%d tokens=%d refused=%d errors=%d today=%s/%d'
                % (key, hour['requests'], hour['cache_hits'], hour['shared'], hour['upstream_calls'],
                   hour['token_calls'], hour['refused'], hour['errors'], calls, self.settings['cap']))
        if self.last_error:
            line += ' last_error=' + self.last_error
        return line

    def tick(self):
        """Every tick: drop expired answers and check the stop. Once an hour,
        one line of counts."""
        t = self.now()
        with self.lock:
            self.purge(t)
        self.stopped()
        key = utc_hour_key(t)
        with self.lock:
            if key == self.hour_key:
                return
            old_key, old = self.hour_key, self.hour
            self.hour_key, self.hour = key, self._zero_hour()
            line = self.summary_line(old_key, old)
            self.last_error = None
        log(line)

    def count(self, field, code=None):
        with self.lock:
            self.hour[field] += 1
            if code:
                self.last_error = code

    def caller_ok(self, value):
        if not self.caller_key:
            return False
        return hmac.compare_digest(normalise_key(value).encode('ascii'), self.caller_key.encode('ascii'))


# ── HTTP server, 127.0.0.1 only ─────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'opensky-relay'
    sys_version = ''
    protocol_version = 'HTTP/1.1'
    timeout = 30
    relay = None

    # the default handler logs every request line, which carries the box
    def log_message(self, fmt, *args):
        pass

    def log_request(self, code='-', size='-'):
        pass

    def log_error(self, fmt, *args):
        pass

    def _send(self, status, obj, retry_after=None):
        body = json.dumps(obj, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if retry_after:
            self.send_header('Retry-After', str(int(retry_after)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        relay = self.relay
        try:
            parts = urlsplit(self.path)
            if parts.path == '/health':
                self._send(200, relay.health())
            elif parts.path == '/states':
                # the tunnel is the only way in, and the key proves the caller
                # is the boards' Worker: a hostname or network added to the
                # tunnel by mistake still gets nothing
                if not relay.caller_key:
                    raise Refused(403, 'caller-key-not-set')
                if not relay.caller_ok(self.headers.get(CALLER_HEADER, '')):
                    raise Refused(403, 'caller-key')
                self._send(200, relay.answer_states(parts.query))
            else:
                self._send(404, {'error': 'not-found'})
        except Refused as e:
            relay.count('refused', e.code)
            self._send(e.status, {'error': e.code}, e.retry_after)
        except Upstream as e:
            relay.count('errors', e.code)
            self._send(e.status, {'error': e.code}, e.retry_after)
        except Exception:
            relay.count('errors', 'internal')
            try:
                self._send(500, {'error': 'internal'})
            except Exception:
                pass

    def _not_allowed(self):
        self.relay.count('refused', 'method')
        self._send(405, {'error': 'method-not-allowed'})

    do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = _not_allowed


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    address_family = socket.AF_INET

    def handle_error(self, request, client_address):
        # never a traceback on stderr: it could carry a request
        pass


def serve(rt):
    relay = Relay(rt)
    Handler.relay = relay
    server = Server((LISTEN_HOST, rt['port']), Handler)
    s = relay.settings
    log('start: listening %s:%d, key set: %s, caller key set: %s, stop %s, cap %d/day, cache %d s, heading %s, count today %s'
        % (LISTEN_HOST, rt['port'], 'yes' if relay.creds else 'no', 'yes' if relay.caller_key else 'no',
           s['stop_iso'] or 'MISSING (stopped)', s['cap'], s['cache_s'], 'on' if s['heading'] else 'off',
           'unreadable' if relay.state_count is None else relay.state_count))
    relay.was_stopped = relay.stopped()
    if relay.was_stopped:
        log('stopped: the stop time has passed or the config is missing; no OpenSky calls')

    done = threading.Event()

    def ticker():
        while not done.wait(rt['tick']):
            try:
                relay.tick()
            except Exception:
                pass
    threading.Thread(target=ticker, daemon=True).start()

    def on_term(_sig, _frame):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        done.set()
        with relay.lock:
            line = relay.summary_line(relay.hour_key, relay.hour)
            relay.cache.clear()
        log('exit: ' + line)
        server.server_close()


def cli_stopped(rt):
    settings = read_settings(rt['config_dir'])
    now = make_clock(rt['clock_file'])()
    return is_stopped(settings, now, read_stop_marker(rt['state_dir']))


def check_login(rt, path):
    """opensky-key: one login with the saved client. No data call.
    Exit codes: 0 OK, 1 the key was refused, 3 stopped, 4 no key,
    5 this server was refused (403), 6 OpenSky could not be reached or had a problem."""
    if cli_stopped(rt):
        print('The licence term has ended (or the stop date is missing). No login test was made.')
        return 3
    creds = read_credentials_file(path)
    if not creds:
        print('No key is saved. Type opensky-key again.')
        return 4
    cid, secret = creds
    body = urlencode({'grant_type': 'client_credentials', 'client_id': cid,
                      'client_secret': secret}).encode('ascii')
    try:
        status, _h, data = http_request('POST', rt['token_url'], body,
                                        {'Content-Type': 'application/x-www-form-urlencoded'})
    except Upstream as e:
        print('OpenSky login: not tested. The login server could not be reached (%s). '
              'The key is saved; type opensky-status in a few minutes.' % e.code)
        return 6
    if status == 200:
        try:
            j = json.loads(data.decode('utf-8'))
            if isinstance(j, dict) and isinstance(j.get('access_token'), str) and j['access_token']:
                print('OpenSky login: OK')
                return 0
        except (ValueError, UnicodeDecodeError):
            pass
        print('OpenSky login: not tested. The login server answered, but not with a login. '
              'The key is saved; type opensky-status in a few minutes.')
        return 6
    if status in (400, 401):
        print('OpenSky login: try again. OpenSky did not accept this Client ID and secret (answer %d). '
              'Check both on your OpenSky account page.' % status)
        return 1
    if status == 403:
        print('OpenSky login: refused (answer 403). The key is saved. '
              "Ask OpenSky whether this server's IPv4 is whitelisted.")
        return 5
    print('OpenSky login: not tested. OpenSky answered %d (a problem on its side). '
          'The key is saved; type opensky-status in a few minutes.' % status)
    return 6


def main(argv):
    try:
        rt = load_runtime()
    except Fatal as e:
        sys.stderr.write('opensky-relay: %s\n' % e)
        return 2
    if len(argv) >= 2 and argv[1] == '--check-login':
        if len(argv) != 3:
            sys.stderr.write('usage: relay.py --check-login FILE\n')
            return 2
        return check_login(rt, argv[2])
    if len(argv) >= 2 and argv[1] == '--stopped':
        return 0 if cli_stopped(rt) else 1
    if len(argv) != 1:
        sys.stderr.write('usage: relay.py [--check-login FILE | --stopped]\n')
        return 2
    serve(rt)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
