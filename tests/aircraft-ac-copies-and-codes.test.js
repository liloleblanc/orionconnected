'use strict';

// WHY THIS EXISTS
//
// October 2026, Air Canada art batch 3. Two things went wrong that nothing
// caught.
//
// 1. One drawing, several files. The 777-300ER is AC/77W.png, AC/77W-ge.png
//    (the TV gate asks for the GE90 file, and every Air Canada -300ER is a
//    GE90) and AC/773.png (Air Canada flies only the -300ER). The E175 is
//    AC/E75.png and AC/E7W.png (the code 'E7W', and the ICAO 'E170', resolve
//    to E7W). The Beech 1900D is AC/BEE.png (a model name like 'Beech 1900D'
//    resolves to BEE) and AC/BEH.png (the IATA code). When the E175 was
//    redrawn only AC/E75.png was replaced, so a flight coded E7W still showed
//    the old drawing, facing the other way. The copies must stay identical.
//
// 2. Codes that drew nothing, or the wrong aeroplane. 'B190' (the Beech's
//    ICAO code) became 'B19' on the boards (no picture) and an Embraer E190
//    jet in the phone app (its /190/ test fired first). 'A321-271NX', an
//    A321neo model number, landed on the A321ceo picture on both. The app
//    knew none of B77W, E75L or A21N. These now resolve to the art we have.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const AC = path.join(ROOT, 'fids-current', 'aircraft', 'AC');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'fids-current', 'app.html'), 'utf8');

function lift(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' must exist');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) break;
  }
  return src.slice(i, j + 1);
}
const boardCode = new Function('return (' + lift(CORE, 'aircraftCodeToIata') + ')')();
const appCode = new Function('return (' + lift(APP, 'acType') + ')')();
// the app's whole picture path: its type, its registration paint, its <img>
const appImg = (() => {
  const at = APP.indexOf('const LIVERY_BY_REG={');
  assert.ok(at >= 0, 'app.html must declare LIVERY_BY_REG');
  const table = APP.slice(at, APP.indexOf('\n};', at) + 3);
  const code = [table, lift(APP, 'acType'), lift(APP, 'liveryByReg'), lift(APP, 'liveryImg')].join('\n');
  return new Function(code + '\nreturn liveryImg;')();
})();
const srcOf = (html) => (/\ssrc="([^"]*)"/.exec(html) || [])[1] || '';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(AC, f))).digest('hex');
const hasArt = (code) => fs.existsSync(path.join(AC, code + '.png'));

test('every copy of one Air Canada drawing is the same file', () => {
  for (const group of [['77W.png', '77W-ge.png', '773.png'], ['E75.png', 'E7W.png'], ['BEE.png', 'BEH.png']]) {
    const want = sha(group[0]);
    for (const f of group.slice(1)) {
      assert.equal(sha(f), want, 'AC/' + f + ' differs from AC/' + group[0] + ': a redraw must replace every copy');
    }
  }
});

test('the Beech 1900D codes and names reach the Air Canada Beech on the boards', () => {
  for (const s of ['BEH', 'B190', 'b190']) assert.equal(boardCode(s), 'BEH', s);
  for (const s of ['Beech 1900D', 'Beechcraft 1900D', 'BEE']) assert.equal(boardCode(s), 'BEE', s);
  assert.ok(hasArt('BEH') && hasArt('BEE'));
});

test('A321neo model numbers reach the A321neo picture on the boards, A321ceo ones do not', () => {
  for (const s of ['A321-271NX', 'A321-253NY', 'A321-251N', 'Airbus A321-271NX', 'Airbus A321XLR', 'A321neo', 'A21N', '32Q']) assert.equal(boardCode(s), '32Q', s);
  for (const s of ['A321-211', 'Airbus A321-231', 'Airbus A321', '321']) assert.equal(boardCode(s), '321', s);
});

test('the phone app resolves the same ICAO codes the boards do, for the types we draw', () => {
  for (const s of ['B77W', 'B773', 'E75L', 'E75S', 'A21N', 'B190']) {
    assert.equal(appCode(s), boardCode(s), s);
    assert.ok(hasArt(appCode(s)), s + ' resolves to AC/' + appCode(s) + '.png, which must exist');
  }
});

test('the phone app draws a Beech for a Beech, and an A321neo for an A321neo', () => {
  for (const s of ['B190', 'BEH', 'Beech 1900D', 'Beechcraft 1900D', 'Raytheon Beech 1900D']) assert.ok(['BEH', 'BEE'].includes(appCode(s)), s + ' -> ' + appCode(s));
  for (const s of ['Embraer E190', 'Embraer 190', 'E190']) assert.equal(appCode(s), 'E90', s);
  for (const s of ['Airbus A321XLR', 'A321-271NX', 'Airbus A321neo', 'A321 NEO', 'A21N']) assert.equal(appCode(s), '32Q', s);
  for (const s of ['Airbus A321', 'A321-211']) assert.equal(appCode(s), '321', s);
  assert.equal(appCode('Boeing 777-300ER'), '77W');
  assert.equal(appCode('Embraer 175'), 'E75');
});

test('on the phone app an Air Canada flight asks for the batch-3 pictures by any of their names', () => {
  const want = {
    '/aircraft/AC/BEH.png': ['BEH', 'B190', 'Beech 1900D', 'Beechcraft 1900D'],
    '/aircraft/AC/77W.png': ['77W', 'B77W', 'Boeing 777-300ER'],
    '/aircraft/AC/773.png': ['773', 'B773'],
    '/aircraft/AC/E75.png': ['E75', 'E75L', 'E175', 'Embraer 175'],
    '/aircraft/AC/32Q.png': ['32Q', 'A21N', 'Airbus A321XLR', 'A321-271NX', 'Airbus A321neo'],
  };
  for (const [src, raws] of Object.entries(want)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', src)), src + ' must exist');
    for (const raw of raws) assert.equal(srcOf(appImg('AC', raw, '', '')), src, raw);
  }
});
