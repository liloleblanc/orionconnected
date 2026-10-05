#!/usr/bin/env node
'use strict';
// ━━ MAIN'S BOARD-LANGUAGES GUARD, RUN ON A CHANGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//   node tests/i18n/as-main.js --change <dir>   this copy IS the guard: the
//                                               checkout it sits in is main,
//                                               <dir> is the change
//   node tests/i18n/as-main.js                  locally: main's copy of this
//                                               script, run on this checkout
//
// A pull request carries its own copy of the guard. On its own, a change
// could loosen a check, delete a test, make this script exit early or teach
// the scanner to look away, and its own `npm test` would pass. So the guard
// that decides is MAIN's, run from main's own checkout:
//
//   .github/workflows/board-languages.yml runs on pull_request_target, so
//   GitHub takes that workflow from main, never from the pull request. It
//   checks out main (this script, main's checks, tests and approvals) and,
//   beside it, the pull request merged into main, and runs
//   `node <main>/tests/i18n/as-main.js --change <the merge>`.
//   checks.yml does the same from a worktree of origin/main.
//
// What runs, in a scratch worktree of main:
//
//   1. main's board-languages tests on main itself, for a baseline count;
//   2. the change's fids-current/, workers/ and worker-entry.js laid over
//      it, with its debt ledger, frozen keys and approvals file (JSON, read
//      as data). Its policy.js is code, so it is never run here: it is read
//      as data by a separate node with no permission to write, spawn or
//      load anything outside the change, and written back as a plain object;
//   3. main's tests again (CI=true, so every "against main" comparison is
//      live), main's `npm run guard`, and in CI main's rendered check;
//   4. the change passes only if every run exits 0, no test fails or is
//      cancelled, and each static test file ran as many tests as it does on
//      main (a file that stops early — process.exit(0) — is a failure).
//
// A change that improves the guard itself is checked by the guard it
// replaces; one that makes the guard stricter passes it trivially.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const HERE = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const gitIn = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });

const changeArg = argOf('--change');
if (!changeArg) delegateToMain();
else runAsGuard(path.resolve(changeArg));

// ── locally (no --change): main's copy of this script decides ────────────
function delegateToMain() {
  let has = false;
  try { gitIn(HERE, ['cat-file', '-e', 'origin/main:tests/i18n/as-main.js']); has = true; } catch (e) { has = false; }
  if (!has) {
    let main = false;
    try { gitIn(HERE, ['rev-parse', '--verify', 'origin/main']); main = true; } catch (e) { main = false; }
    if (!main && process.env.CI) { console.log('::error::no origin/main to run main\'s guard against — fetch with fetch-depth: 0'); process.exit(1); }
    console.log(main ? 'main has no board-languages guard yet: this change introduces it' : 'no origin/main here; main\'s guard runs in CI');
    process.exit(0);
  }
  const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'i18n-guard-'));
  const guard = path.join(dir, 'main');
  let status = 1;
  try {
    gitIn(HERE, ['worktree', 'add', '--detach', guard, 'origin/main']);
    const r = spawnSync(process.execPath, [path.join(guard, 'tests', 'i18n', 'as-main.js'), '--change', HERE], { stdio: 'inherit', env: process.env });
    status = r.status === 0 ? 0 : 1;
  } finally {
    try { gitIn(HERE, ['worktree', 'remove', '--force', guard]); } catch (e) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
  process.exit(status);
}

// ── this copy is main's: run main's guard on the change ──────────────────
function runAsGuard(change) {
  if (!fs.existsSync(path.join(change, 'fids-current'))) { console.log(`::error::${change} is not a checkout of this repository`); process.exit(1); }
  const base = (process.env.I18N_BASE || gitIn(HERE, ['rev-parse', 'HEAD'])).trim();
  const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'i18n-main-'));
  const wt = path.join(dir, 'main');
  const STATIC = ['tests/board-languages.test.js', 'tests/board-languages-selftest.test.js', 'tests/board-languages-helpers.test.js'];
  const RENDER = 'tests/board-languages-render.test.js';
  const env = Object.assign({}, process.env, { CI: 'true', I18N_AS_MAIN: '1' });
  const problems = [];
  const show = (out) => process.stdout.write(out.split('\n').filter((l) => /^(✖|ℹ (tests|pass|fail|cancelled|skipped))|^\s+(B\d+|C\d|P\d|L1|W1) |AssertionError|no approval|may only shrink|is frozen|lost files|Board languages:/.test(l)).slice(0, 120).join('\n') + '\n');
  const counts = (out) => {
    const n = (k) => { const m = new RegExp('^ℹ ' + k + ' (\\d+)', 'm').exec(out); return m ? +m[1] : null; };
    return { tests: n('tests'), pass: n('pass'), fail: n('fail'), cancelled: n('cancelled'), skipped: n('skipped') };
  };
  const runTest = (file) => {
    const r = spawnSync(process.execPath, ['--test', file], { cwd: wt, encoding: 'utf8', env, maxBuffer: 256 << 20 });
    const out = (r.stdout || '') + (r.stderr || '');
    return { status: r.status, out, c: counts(out) };
  };
  try {
    gitIn(HERE, ['worktree', 'add', '--detach', wt, base]);
    const tests = STATIC.filter((t) => fs.existsSync(path.join(wt, t)));
    // 1. the baseline: main's tests on main
    const baseline = {};
    for (const t of tests) baseline[t] = runTest(t).c;

    // 2. the change over main
    for (const d of ['fids-current', 'workers']) {
      fs.rmSync(path.join(wt, d), { recursive: true, force: true });
      if (fs.existsSync(path.join(change, d))) fs.cpSync(path.join(change, d), path.join(wt, d), { recursive: true });
    }
    fs.rmSync(path.join(wt, 'worker-entry.js'), { force: true });
    if (fs.existsSync(path.join(change, 'worker-entry.js'))) fs.copyFileSync(path.join(change, 'worker-entry.js'), path.join(wt, 'worker-entry.js'));
    for (const f of ['debt.json', 'legacy-keys.json', 'approved-exceptions.json']) {
      const src = path.join(change, 'tests', 'i18n', f);
      if (!fs.existsSync(src)) continue;
      JSON.parse(fs.readFileSync(src, 'utf8'));                     // data, or nothing
      fs.copyFileSync(src, path.join(wt, 'tests', 'i18n', f));
    }
    const policySrc = path.join(change, 'tests', 'i18n', 'policy.js');
    const policyDst = path.join(wt, 'tests', 'i18n', 'policy.js');
    if (fs.existsSync(policySrc) && fs.readFileSync(policySrc, 'utf8') !== fs.readFileSync(policyDst, 'utf8')) {
      const data = policyAsData(change);
      fs.writeFileSync(policyDst, "'use strict';\n// The change's tests/i18n/policy.js, read as data by main's guard (tests/i18n/as-main.js).\nmodule.exports = "
        + JSON.stringify(data, null, 1) + ';\n');
    }

    // 3. main's tests on the change
    console.log(`main's guard (${base.slice(0, 8)}) on ${change}: ${tests.join(' ')}`);
    for (const t of tests) {
      const r = runTest(t);
      show(r.out);
      const b = baseline[t];
      if (r.status !== 0) problems.push(`${t} fails`);
      if (r.c.fail !== 0 || r.c.cancelled !== 0) problems.push(`${t}: ${r.c.fail} failed, ${r.c.cancelled} cancelled`);
      if (r.c.tests == null || r.c.tests < b.tests) problems.push(`${t} ran ${r.c.tests} tests where main runs ${b.tests}: it stopped early`);
      else if (r.c.skipped > b.skipped) problems.push(`${t} skipped ${r.c.skipped} tests where main skips ${b.skipped}`);
    }
    const g = spawnSync(process.execPath, ['tests/i18n/gate.js'], { cwd: wt, encoding: 'utf8', env, maxBuffer: 64 << 20 });
    show((g.stdout || '') + (g.stderr || ''));
    if (g.status !== 0 || !/^Board languages: clean/m.test(g.stdout || '')) problems.push('npm run guard (main\'s) fails');
    if (fs.existsSync(path.join(wt, RENDER)) && (process.env.CI || process.env.I18N_RENDER) && process.env.I18N_AS_MAIN_RENDER !== '0') {
      const r = runTest(RENDER);
      show(r.out);
      if (r.status !== 0 || r.c.fail !== 0 || r.c.pass !== 1) problems.push(`${RENDER} (main's rendered check) does not pass: ${r.c.pass} passed, ${r.c.fail} failed, ${r.c.skipped} skipped`);
    }
  } catch (e) {
    problems.push('main\'s guard could not run: ' + e.message);
  } finally {
    try { gitIn(HERE, ['worktree', 'remove', '--force', wt]); } catch (e) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
  if (problems.length) {
    for (const p of problems) console.log('::error::' + p);
    console.log('\nMain\'s board-languages guard fails on this change (above). A change cannot pass by loosening its own copy of the guard.');
    process.exit(1);
  }
  console.log('main\'s board-languages guard passes on this change');
  process.exit(0);
}

// The change's policy.js, as data. It is the change's code, so it runs in a
// node of its own that may read the change and nothing else, and may not
// write, spawn or load a native module: all it can give back is the object
// it prints, which main's ratchet then compares with main's own policy.
function policyAsData(change) {
  const flag = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
  const file = path.join(change, 'tests', 'i18n', 'policy.js');
  const code = 'process.stdout.write(JSON.stringify(require(' + JSON.stringify(file) + ')))';
  const r = spawnSync(process.execPath, [flag, '--allow-fs-read=' + change, '--disallow-code-generation-from-strings', '-e', code],
    { cwd: change, encoding: 'utf8', timeout: 20000, maxBuffer: 16 << 20, env: { PATH: process.env.PATH || '' } });
  if (r.status !== 0) throw new Error('the change\'s policy.js could not be read as data: ' + ((r.stderr || '').split('\n').slice(0, 3).join(' ')));
  let data = null;
  try { data = JSON.parse(r.stdout); } catch (e) { throw new Error('the change\'s policy.js gave back no policy (it printed ' + JSON.stringify(String(r.stdout).slice(0, 60)) + '): it must export one object'); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.LANGS) || !Array.isArray(data.PASSENGER_SCRIPTS))
    throw new Error('the change\'s policy.js does not export a policy');
  return data;
}
