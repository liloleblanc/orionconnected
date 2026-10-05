'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE SCREENS, READ: EVERY WORD ON A BOARD IS ONE OF ITS LANGUAGES'.
//
// The static guard (board-languages.test.js) reads the source; what it cannot
// follow — a word that arrives through feed data, a value passed through
// three variables, a slide painted in the languages of an earlier minute —
// this reads off the screen. tests/render/words.mjs puts the gate, the
// departures board and the baggage board in each of the nine languages alone
// and in the pairs that stress them, sweeps the gate's whole centre deck, and
// fails on any word that is not that board's languages' or data, on a
// 12-hour clock on a board that does not lead in English, and on Arabic,
// Japanese or Chinese not marked with its language and direction.
//
// It runs on every pull request (CI sets CI=true) on the boards'
// demonstration data with the network shut off, so it is the same screens on
// every run. Locally it needs Chrome: I18N_RENDER=1 npm test, or
// `node tests/render/words.mjs` (LIVE=1 for the live site's data).
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const RUN = !!(process.env.CI || process.env.I18N_RENDER);
const CHROMES = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const chrome = CHROMES.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });

test('every word on every board is one of its languages\' (rendered, nine languages)', { timeout: 22 * 60 * 1000 }, (t) => {
  if (!RUN) { t.skip('runs in CI; locally: I18N_RENDER=1 npm test, or node tests/render/words.mjs'); return; }
  assert.ok(chrome, 'no Chrome to render the boards with (set CHROME=); in CI this check must run');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'render', 'words.mjs')], {
    encoding: 'utf8', env: Object.assign({}, process.env, { CHROME: chrome, LIVE: '' }), maxBuffer: 64 << 20, timeout: 21 * 60 * 1000
  });
  const out = (r.stdout || '') + (r.stderr || '');
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n**The boards, read in nine languages**\n\n```\n' + out.split('\n').filter((l) => /^[✔✖]/.test(l)).join('\n') + '\n```\n'); } catch (e) {}
  }
  assert.equal(r.status, 0, '\nA board shows a word that is not one of its languages, or one not marked with its language:\n\n'
    + out.split('\n').filter((l) => !/^✔/.test(l)).slice(0, 80).join('\n')
    + '\n\nPut the words in the store (fids-current/js/board-strings.js) and render them with bs()/bsPair();\n'
    + 'mark a half with its language (BoardStrings.half / markHalf). docs/BOARD-LANGUAGES.md.\n');
});
