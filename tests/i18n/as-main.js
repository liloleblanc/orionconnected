#!/usr/bin/env node
'use strict';
// ━━ THE GUARD AS MAIN HAS IT, RUN ON THIS CHANGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//   node tests/i18n/as-main.js
//
// A pull request carries its own copy of the guard. On its own, a change
// could loosen a check, delete a test, or teach the scanner to look away,
// and its own `npm test` would pass. So CI also runs MAIN's guard — main's
// tests/board-languages*.test.js and tests/i18n/ code, main's approvals —
// over this change's passenger files and this change's policy, ledger and
// frozen keys, which main's ratchet then holds to main's own:
//
//   1. a detached worktree of the merge base with origin/main;
//   2. this change's fids-current/ and tests/i18n/{policy.js, debt.json,
//      legacy-keys.json, approved-exceptions.json} copied over it;
//   3. main's board-languages tests run there with CI=true (the merge base
//      is its own base, so every "against main" comparison is live).
//
// A change that improves the guard itself is checked by the guard it
// replaces; a change that makes the guard stricter passes it trivially, and
// one that reorganises the guard's own files is reviewed and merged on its
// own, as a change to the guard.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const git = (args, opts) => execFileSync('git', args, Object.assign({ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts || {}));

let base = null;
// I18N_BASE: run the guard of another commit (to try this script locally)
try { base = (process.env.I18N_BASE || git(['merge-base', 'HEAD', 'origin/main'])).trim(); } catch (e) { base = null; }
if (!base) {
  if (process.env.CI) { console.log('::error::no origin/main to run main\'s guard against — fetch with fetch-depth: 0'); process.exit(1); }
  console.log('no origin/main here; main\'s guard runs in CI');
  process.exit(0);
}
let hasGuard = true;
try { git(['cat-file', '-e', `${base}:tests/board-languages.test.js`]); } catch (e) { hasGuard = false; }
if (!hasGuard) { console.log('main has no board-languages guard yet: this change introduces it'); process.exit(0); }

const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'i18n-main-'));
const wt = path.join(dir, 'main');
let status = 1;
try {
  git(['worktree', 'add', '--detach', wt, base]);
  // this change's passenger files and its exception lists, over main's guard
  fs.rmSync(path.join(wt, 'fids-current'), { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'fids-current'), path.join(wt, 'fids-current'), { recursive: true });
  for (const f of ['policy.js', 'debt.json', 'legacy-keys.json', 'approved-exceptions.json']) {
    const src = path.join(ROOT, 'tests', 'i18n', f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(wt, 'tests', 'i18n', f));
  }
  const tests = ['tests/board-languages.test.js', 'tests/board-languages-selftest.test.js', 'tests/board-languages-helpers.test.js']
    .filter((t) => fs.existsSync(path.join(wt, t)));
  console.log(`main's guard (${base.slice(0, 8)}) on this change: ${tests.join(' ')}`);
  const r = spawnSync(process.execPath, ['--test', ...tests], { cwd: wt, encoding: 'utf8', env: Object.assign({}, process.env, { CI: 'true', I18N_AS_MAIN: '1' }), maxBuffer: 256 << 20 });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out.split('\n').filter((l) => /^(✖|ℹ (pass|fail))|^\s+(B\d+|C\d|P\d|L1) |AssertionError|no approval|may only shrink|is frozen|lost files/.test(l)).slice(0, 120).join('\n') + '\n');
  status = r.status === 0 ? 0 : 1;
  if (status) console.log('\nMain\'s board-languages guard fails on this change (above). A change cannot pass by loosening its own copy of the guard.');
  else console.log('main\'s board-languages guard passes on this change');
} finally {
  try { git(['worktree', 'remove', '--force', wt]); } catch (e) {}
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}
process.exit(status);
