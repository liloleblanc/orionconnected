'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE HOME PC STREAMS (stream-server/home-pc).
//
// These files run as root on a desktop PC and stream two boards to YouTube.
// Their runtime behaviour is proven on the PC itself by the bench and the
// soak; this file guards what a reader of the repository can check:
//   · every script parses;
//   · the units keep their safety settings (unprivileged user, no restart
//     loop on a missing key, the optional override file);
//   · the boards are the same addresses the cloud boxes use;
//   · the stream key never travels through an argument list or the journal;
//   · the network guard lets through only proxy paths that bill nothing;
//   · no address, host name or hardware identifier of the PC is committed.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HOME = path.join(ROOT, 'stream-server', 'home-pc');
const read = rel => fs.readFileSync(path.join(HOME, rel), 'utf8');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const ALL = walk(HOME);
const rel = p => path.relative(HOME, p);
const isShell = p => p.endsWith('.sh') || /^#!.*\b(bash|sh)\b/.test(fs.readFileSync(p, 'utf8').split('\n')[0]);
const SHELL = ALL.filter(p => !p.endsWith('.py') && !p.endsWith('.md') && isShell(p));
const PY = ALL.filter(p => p.endsWith('.py'));

function envValue(text, key) {
  const line = text.split('\n').find(l => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : undefined;
}

test('every shell script parses (bash -n)', () => {
  assert.ok(SHELL.length >= 12, 'expected the home-pc shell scripts, found ' + SHELL.length);
  for (const f of SHELL) {
    try {
      execFileSync('bash', ['-n', f], { stdio: 'pipe' });
    } catch (e) {
      assert.fail(rel(f) + ' does not parse: ' + String(e.stderr));
    }
  }
});

test('every Python script parses', () => {
  assert.ok(PY.length >= 2);
  for (const f of PY) {
    try {
      execFileSync('python3', ['-c', 'import ast, sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])', f],
        { stdio: 'pipe' });
    } catch (e) {
      assert.fail(rel(f) + ' does not parse: ' + String(e.stderr));
    }
  }
});

test('the stream unit runs unprivileged and does not loop on a missing key', () => {
  const u = read('systemd/fids-home-stream@.service');
  assert.match(u, /^User=fidsstream$/m);
  assert.doesNotMatch(u, /^User=root$/m);
  assert.match(u, /^Restart=always$/m);
  assert.match(u, /^RestartPreventExitStatus=78$/m);
  assert.match(u, /^EnvironmentFile=\/etc\/fids-home\/stream-%i\.env$/m);
  assert.match(u, /^EnvironmentFile=-\/etc\/fids-home\/stream-%i\.override\.env$/m);
  assert.match(u, /^Requires=fids-home-rtmp@%i\.service$/m);
  assert.match(u, /^KillMode=control-group$/m);
  const r = read('systemd/fids-home-rtmp@.service');
  assert.match(r, /^ExecStartPre=\/opt\/fids-home\/bin\/rtmp-render %i$/m);
  assert.match(r, /^RuntimeDirectoryMode=0700$/m);
  assert.match(r, /^EnvironmentFile=-\/etc\/fids-home\/stream-%i\.override\.env$/m);
  const t = read('systemd/fids-home-watchdog.timer');
  assert.match(t, /^OnUnitActiveSec=30s$/m);
  assert.match(t, /^WantedBy=timers\.target$/m);
  assert.match(read('bin/stream-run'), /exit 78/);
});

test('the two boards are the addresses the cloud boxes stream', () => {
  const setup = fs.readFileSync(path.join(ROOT, 'stream-server', 'setup.sh'), 'utf8');
  const def = setup.match(/STREAM_URL="\$\{STREAM_URL:-(https:[^}]+)\}"/);
  assert.ok(def, 'setup.sh default STREAM_URL not found');
  assert.equal(envValue(read('config/stream-1.env'), 'STREAM_URL'), def[1]);
  assert.match(def[1], /[?&]stream=1(&|$)/);

  const worker = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');
  const desired = worker.match(/\["MIA", "STREAM_URL", "(https:[^"]+)"\]/);
  assert.ok(desired, 'STREAM_DESIRED MIA STREAM_URL not found in the proxy');
  const two = envValue(read('config/stream-2.env'), 'STREAM_URL');
  assert.equal(two, desired[1]);
  assert.match(two, /[?&]stream=2(&|$)/);
  const miami = setup.match(/^MIAMI_URL="([^"]+)"/m);
  assert.ok(miami && miami[1] === two, 'setup.sh MIAMI_URL and stream-2.env differ');
});

test('the stream key is read hidden and never handled in an argument list', () => {
  const k = read('bin/set-stream-key');
  assert.match(k, /read -rsp "Paste the YouTube stream key/);
  assert.match(k, /<\/dev\/tty/);
  // The only second argument accepted is --clear: a key is never a parameter.
  assert.doesNotMatch(k, /K="\$\{?2/);
  assert.doesNotMatch(k, /\$\{?[3-9]/);

  // A YouTube ingest address appears only where the key is assembled.
  const withIngest = ALL.filter(p => !p.endsWith('.md') && fs.readFileSync(p, 'utf8').includes('rtmp.youtube.com'))
    .map(rel).sort();
  assert.deepEqual(withIngest, ['bin/rtmp-render', 'bin/stream-run']);
  assert.match(read('bin/rtmp-render'), /PUSH="push \$PUSH_BASE\/\$KEY;"/);
  const run = read('bin/stream-run');
  const directOnly = run.split('\n').filter(l => l.includes('rtmp.youtube.com'));
  assert.equal(directOnly.length, 1);
  assert.match(directOnly[0], /DKEY/);
  assert.match(run, /^ {2}direct\)\n/m);

  // The key variables are never echoed or printed to a terminal or the journal.
  for (const f of ['bin/set-stream-key', 'bin/rtmp-render', 'bin/stream-run', 'bin/fids-diag']) {
    const lines = read(f).split('\n');
    for (const l of lines) {
      assert.doesNotMatch(l, /\becho\b[^#]*\$\{?(K|K2|KEY|DKEY|OTHER)\b/, f + ': ' + l.trim());
      if (/\bprintf\b[^#]*\$\{?(K|KEY|DKEY)\b/.test(l)) {
        assert.match(l, /> "\$T"$/, f + ' prints a key other than into the key file: ' + l.trim());
      }
    }
  }
  const diag = read('bin/fids-diag');
  assert.match(diag, /sha256sum < "\$KF" \| cut -c1-8/);
  assert.doesNotMatch(diag, /cat "?\$KF/);
  assert.match(diag, /grep -c -F -f <\(grep -v '\^\$' "\$KF"\)/);
});

test('the network guard lets through only proxy paths that bill nothing', () => {
  const guard = read('bin/cdp-guard.py');
  const list = guard.match(/ALLOW_PATHS = \[([\s\S]*?)\]/);
  assert.ok(list, 'ALLOW_PATHS not found in cdp-guard.py');
  const allow = [...list[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  assert.ok(allow.length > 0);
  for (const a of allow) {
    assert.ok(/^(api\/|accor\/)/.test(a), 'unexpected allowed proxy path ' + a);
    assert.ok(!a.startsWith('api/adb'), 'the ADB passthrough must stay blocked');
  }
  assert.match(guard, /PATTERNS = \["\*\.workers\.dev\/\*"/);

  // Every proxy path the boards name in fids-core.js that reaches a billed
  // provider must fall outside the allow list.
  const core = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
  const billed = ['_ADSB_BASE', '_FLTRACK_BASE', '_ACINFO_BASE', '_FARARR_BASE', '_OPINFO_BASE'];
  for (const name of billed) {
    const m = core.match(new RegExp('var ' + name + " = '[^']*\\.workers\\.dev/([^']*)'"));
    assert.ok(m, name + ' not found in fids-core.js');
    assert.ok(!allow.some(a => m[1].startsWith(a)), name + ' (' + m[1] + ') is on the allow list');
  }
  const literals = [...core.matchAll(/\.workers\.dev(\/[A-Za-z0-9_\-/]*)/g)].map(m => m[1].slice(1));
  for (const p of ['aircrafts/', 'proxy/flights/', 'flights/']) {
    assert.ok(literals.some(l => l.startsWith(p)), p + ' is no longer named in fids-core.js; recheck the guard');
  }
  for (const p of ['aircrafts/', 'proxy/flights/', 'flights/', 'ai/', 'airports/', 'airlines/', 'adsb', 'osky', 'yqm/']) {
    assert.ok(!allow.some(a => p.startsWith(a)), p + ' is on the allow list');
  }
  assert.ok(core.includes("'/oskypos"), 'the OpenSky path moved; recheck the guard');
});

test('no LAN address, local host name or hardware address is committed', () => {
  for (const f of ALL) {
    const body = fs.readFileSync(f, 'utf8');
    const r = rel(f);
    assert.doesNotMatch(body, /\b(?:192\.168|10\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\b/, r + ' has a private IPv4 address');
    assert.doesNotMatch(body, /\b[A-Za-z0-9-]+\.local\b/, r + ' has a .local host name');
    assert.doesNotMatch(body, /\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/i, r + ' has a MAC address');
    assert.doesNotMatch(body, /\benx[0-9a-f]{12}\b/, r + ' has a USB network interface name');
    assert.doesNotMatch(body, /\/home\/[a-z]/, r + ' names a home directory');
    assert.doesNotMatch(body, /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/, r + ' names the proxy host');
  }
});

test('shell comments carry no apostrophes', () => {
  for (const f of SHELL) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (i === 0 && l.startsWith('#!')) return;
      if (/^\s*#/.test(l)) assert.doesNotMatch(l, /'/, rel(f) + ':' + (i + 1) + ': ' + l.trim());
    });
  }
});

test('env files keep comments on their own lines', () => {
  for (const f of ALL.filter(p => p.endsWith('.env'))) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (!l || l.startsWith('#')) return;
      assert.match(l, /^[A-Z_0-9]+=/, rel(f) + ':' + (i + 1));
      assert.doesNotMatch(l, /\s#/, rel(f) + ':' + (i + 1) + ': systemd keeps an inline # as part of the value');
    });
  }
});
