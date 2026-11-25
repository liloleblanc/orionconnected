'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE HOME PC RECEIVER AND THE POWER KEY RECORDER (stream-server/home-pc).
//
// The receiver listens to aircraft on the PC that streams the boards. This file
// guards what a reader of the repository can check:
//   · the program has no network, gets no position and cannot power the antenna;
//   · it yields to the streams;
//   · it is built from one pinned, checked download;
//   · the installer brings no web server and restarts nothing of the streams;
//   · fids-planes reads what readsb writes, and says so when there is nothing;
//   · the recorder hands over power keys only and the rule ignores one key only.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOME = path.join(path.resolve(__dirname, '..'), 'stream-server', 'home-pc');
const RX = path.join(HOME, 'receiver');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const code = text => text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');

const UNIT = read(RX, 'systemd', 'fids-receiver.service');
const value = (text, key) => text.split('\n').filter(l => l.startsWith(key + '=')).map(l => l.slice(key.length + 1));

test('the receiver unit has no network and one device', () => {
  assert.deepEqual(value(UNIT, 'PrivateNetwork'), ['yes']);
  assert.deepEqual(value(UNIT, 'RestrictAddressFamilies'), ['AF_UNIX AF_NETLINK']);
  assert.deepEqual(value(UNIT, 'DevicePolicy'), ['closed']);
  assert.deepEqual(value(UNIT, 'DeviceAllow'), ['char-usb_device rw']);
  assert.deepEqual(value(UNIT, 'DynamicUser'), ['yes']);
  assert.deepEqual(value(UNIT, 'CapabilityBoundingSet'), ['']);
  assert.deepEqual(value(UNIT, 'User'), [], 'a fixed user would keep files behind');
  const start = value(UNIT, 'ExecStart');
  assert.equal(start.length, 1);
  assert.doesNotMatch(start[0], /--net|--lat|--lon|--uuid|bias|--dump-beast|--write-globe|--write-state/);
  assert.doesNotMatch(start[0], /--stats/, 'it would print a full statistics block on every retry without a stick');
  assert.match(start[0], /--json-location-accuracy 0/);
});

test('the receiver yields to the streams', () => {
  assert.ok(Number(value(UNIT, 'Nice')[0]) >= 5);
  assert.ok(Number(value(UNIT, 'CPUWeight')[0]) < 100, 'the streams run at the default weight of 100');
  assert.ok(Number(value(UNIT, 'IOWeight')[0]) < 100);
  assert.match(value(UNIT, 'MemoryMax')[0], /^\d+M$/);
  assert.deepEqual(value(UNIT, 'CPUSchedulingPolicy'), []);
  assert.deepEqual(value(UNIT, 'Restart'), ['always']);
  assert.ok(Number(value(UNIT, 'RestartSec')[0]) >= 10, 'an unplugged stick must not fill the log');
});

test('readsb is built from one pinned download, checked before it is opened, without a network', () => {
  const b = read(RX, 'bin', 'receiver-build');
  const commit = b.match(/^COMMIT=([0-9a-f]{40})$/m);
  assert.ok(commit, 'a full commit id');
  assert.match(b, /^SHA256=[0-9a-f]{64}$/m);
  assert.match(b, /^VERSION=\d+\.\d+\.\d+$/m);
  assert.ok(read(RX, 'README.md').includes('readsb ' + b.match(/^VERSION=(.*)$/m)[1]), 'README names the same version');
  const body = code(b);
  const at = s => { const i = body.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('sha256sum -c') < at('systemd-run'), 'checked before the build');
  assert.ok(at('sha256sum -c') < at('tar xz'), 'checked before it is unpacked');
  assert.match(body, /PrivateNetwork=yes/);
  assert.match(body, /DynamicUser=yes/);
  assert.match(body, /HAVE_BIASTEE=no/);
  // readsb prints its version on stderr, and systemd-run starts only a program
  // that exists outside the sandbox.
  assert.match(body, /\/bin\/sh -c 'exec \/run\/readsb-new --version 2>&1'/);
  assert.equal((b.match(/https?:\/\//g) || []).length, 1, 'one address');
  assert.doesNotMatch(body, /curl[^\n]*\|\s*(ba)?sh|git clone/);
});

test('the installer brings no web server, opens nothing and restarts nothing of the streams', () => {
  const s = code(read(RX, 'install.sh'));
  assert.doesNotMatch(s, /nginx|lighttpd|apache|tar1090|piaware|fr24feed|ufw|iptables/);
  assert.doesNotMatch(s, /fids-home|journald|logind|NetworkManager/);
  assert.match(s, /NEEDRESTART_SUSPEND=1/);
  assert.match(s, /--no-upgrade/);
  for (const m of s.matchAll(/systemctl (?:restart|stop|start|enable|disable|reload)[^\n]*/g)) {
    assert.match(m[0], / fids-receiver(\.service)?\b/, m[0]);
  }
  const black = code(read(RX, 'config', 'adsb-stick.conf')).split('\n').filter(Boolean);
  assert.deepEqual(black, ['blacklist dvb_usb_rtl28xxu', 'blacklist rtl2832_sdr']);
});

function planes(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fids-planes-'));
  for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), typeof v === 'string' ? v : JSON.stringify(v));
  const r = spawnSync('python3', ['-I', path.join(RX, 'bin', 'fids-planes'), dir], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.stderr, '', r.stderr);
  return r;
}

test('fids-planes shows what is heard and is honest when nothing is', () => {
  const now = Date.now() / 1000;
  const full = planes({
    'aircraft.json': { now, messages: 1234, aircraft: [
      { hex: 'abc123', flight: 'TEST12  ', alt_baro: 36000, gs: 451.2, lat: 46.1, lon: -64.8, rssi: -21.4, seen: 0.4 },
      { hex: '~12345', alt_baro: 'ground', seen: 12 },
      { hex: 'def456' },
      'not an aircraft',
    ] },
    'stats.json': { gain_db: 49.6, last15min: { messages_valid: 88, local: { signal: -20.1, noise: -33.2, samples_lost: 0, samples_dropped: 65536 } } },
  });
  assert.equal(full.status, 0);
  assert.match(full.stdout, /^3 aircraft heard, 1 with a position, 1234 messages/);
  assert.match(full.stdout, /abc123 +TEST12 +36000 +451 +46\.1000 +-64\.8000 +-21\.4 +0s/);
  assert.match(full.stdout, /~12345 .*ground/);
  assert.match(full.stdout, /last 15 min: 88 messages, signal -20\.1 dB, noise -33\.2 dB, gain 49\.6 dB, samples lost 0, dropped \(PC too busy\) 65536/);

  const none = planes({});
  assert.equal(none.status, 1);
  assert.match(none.stdout, /not running/);
  const broken = planes({ 'aircraft.json': '{"now": 1,' });
  assert.equal(broken.status, 1);
  const stale = planes({ 'aircraft.json': { now: now - 600, messages: 5, aircraft: [{ hex: 'abc123' }] } });
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /Stale/);
  assert.doesNotMatch(stale.stdout, /abc123/, 'old aircraft are not shown as heard now');
  const empty = planes({ 'aircraft.json': { now, messages: 0, aircraft: [] } });
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /^0 aircraft heard/);
});

test('the recorder hands over power keys only, and only one key is ignored', () => {
  const src = read(HOME, 'bin', 'power-key-log');
  const names = src.match(/^NAMES = \{([^}]*)\}/m);
  assert.ok(names);
  assert.deepEqual([...names[1].matchAll(/(\d+):/g)].map(m => Number(m[1])), [116, 142, 143, 205, 408]);
  const open = src.slice(src.indexOf('def open_masked'), src.indexOf('def main'));
  assert.match(open, /EVIOCSMASK/);
  assert.match(open, /except OSError:\s+os\.close\(fd\)\s+raise/, 'a device without a mask is not read');
  assert.match(src, /if [^\n]*not owns_key\(ev\)/);
  assert.doesNotMatch(src, /or path in refused/, 'a device refused once is asked again');
  const unit = read(HOME, 'systemd', 'fids-powerkey-log.service');
  assert.deepEqual(value(unit, 'PrivateNetwork'), ['yes']);
  assert.deepEqual(value(unit, 'DynamicUser'), ['yes']);
  assert.deepEqual(value(unit, 'DeviceAllow'), ['char-input r']);
  const rule = code(read(HOME, 'config', 'logind-60-power-key.conf')).split('\n').filter(Boolean);
  assert.deepEqual(rule, ['[Login]', 'HandlePowerKey=ignore']);
  const inst = code(read(HOME, 'install.sh'));
  assert.equal((inst.match(/\$\{POWER_KEY:-0\}/g) || []).length, 2, 'opt in, both times');
  assert.ok(inst.indexOf('logind-60-power-key') > inst.indexOf('${POWER_KEY:-0}'));
});
