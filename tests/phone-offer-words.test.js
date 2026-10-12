'use strict';

// v24042 — the "open the mobile app?" offer (index.html) asks the store for
// its words by their real keys. Since v23995 it asked for 'q', 'yes' and 'no',
// which the store has never held (they are mobileAsk, mobileYes, mobileNo),
// so every phone opening the site or an airport's own address got a blank
// question and two empty buttons.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BS = require('../fids-current/js/board-strings.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'fids-current/index.html'), 'utf8');

test('every key the offer asks for exists in the store, in all nine languages', () => {
  const keys = [...HTML.matchAll(/two\('([A-Za-z]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['mobileAsk', 'mobileYes', 'mobileNo']);
  for (const k of keys) {
    for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']) assert.ok(BS.bs(k, l), k + ' ' + l);
  }
});

test('the offer reads in the airport\'s pair: Moncton English first, Montréal French first', () => {
  const pair = (ap) => BS.pair('mobileAsk', { langs: BS.pairLangs(BS.resolveLangs({ iata: ap }).langs, ap), iata: ap, sep: '', plain: true });
  assert.match(pair('YQM'), /^Open the mobile app\?/);
  assert.match(pair('YUL'), /^Ouvrir l’application mobile/);
});
