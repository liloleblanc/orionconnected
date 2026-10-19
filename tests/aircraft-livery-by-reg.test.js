'use strict';

// WHY THIS EXISTS
//
// October 2026: Air Canada's A220-300 C-GNBN (fin 119) flies in the
// Trans-Canada Air Lines heritage livery, and the supplied drawing shows it.
// The requirement: the TCA picture shows ONLY when the gate's aircraft
// registration is C-GNBN; every other A220 keeps the ordinary Air Canada art (AC/223.png).
//
// AIRCRAFT_LIVERY_BY_REG in fids-core.js holds that registration, and
// aircraftImgTag puts its picture first in the chain when the gate passes the
// tail. These tests run the shipping functions, lifted out of fids-core.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'fids-core.js must define ' + name);
  let d = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
function liftVar(name) {
  const at = SRC.indexOf('var ' + name + ' = {');
  assert.ok(at >= 0, 'fids-core.js must declare ' + name);
  const end = SRC.indexOf('\n};', at);
  return SRC.slice(at, end + 3);
}

function api() {
  const win = { AIRCRAFT_IMG_MISSING: {} };
  const code = [liftVar('BOEING_ENGINE_BY_REG'), liftVar('AIRCRAFT_LIVERY_BY_REG'), liftVar('PLANE_FACING'),
    lift('engineVariantSuffix'), lift('_aircraftRegKey'), lift('aircraftLiveryByReg'),
    lift('aircraftCodeToIata'), lift('aircraftImgTag'), lift('_planeFacingFromSrc')].join('\n');
  return new Function('window', code + '\nreturn { tag: aircraftImgTag, byReg: aircraftLiveryByReg, facing: _planeFacingFromSrc, table: AIRCRAFT_LIVERY_BY_REG };')(win);
}
const srcOf = (html) => (/\ssrc="([^"?]+)/.exec(html) || [])[1] || '';

test('C-GNBN is drawn in its Trans-Canada Air Lines paint, however the tail is written', () => {
  const { tag } = api();
  for (const reg of ['C-GNBN', 'CGNBN', 'c-gnbn', ' C-GNBN ', 'C GNBN']) {
    assert.equal(srcOf(tag('AC', '223', { reg })), 'aircraft/AC/223-tca.png', reg);
  }
  // the feed's own spellings of the type reach the same picture
  for (const eq of ['BCS3', 'Airbus A220-300', 'CS300']) {
    assert.equal(srcOf(tag('AC', eq, { rawModel: eq, reg: 'C-GNBN' })), 'aircraft/AC/223-tca.png', eq);
  }
});

test('every other A220, and an A220 with no tail known, keeps the ordinary Air Canada art', () => {
  const { tag } = api();
  assert.equal(srcOf(tag('AC', '223', { reg: 'C-GUPG' })), 'aircraft/AC/223.png', 'the ordinary drawing, C-GUPG');
  assert.equal(srcOf(tag('AC', '223', { reg: '' })), 'aircraft/AC/223.png', 'no registration');
  assert.equal(srcOf(tag('AC', '223')), 'aircraft/AC/223.png', 'no options at all');
  assert.equal(srcOf(tag('AC', '223', { reg: 'C-GNBNX' })), 'aircraft/AC/223.png', 'a longer tail is another tail');
});

test('the tail never repaints another carrier or another type', () => {
  const { tag, byReg } = api();
  // the picture must still mean the aircraft the label names: an A220-100
  // label keeps its -100 picture, whatever the tail
  assert.equal(srcOf(tag('AC', '221', { reg: 'C-GNBN' })), 'aircraft/AC/221.png');
  assert.equal(srcOf(tag('AC', '320', { reg: 'C-GNBN' })), 'aircraft/AC/320.png');
  // another carrier's A220 is that carrier's
  assert.equal(srcOf(tag('DL', '223', { reg: 'C-GNBN' })), 'aircraft/DL/223.png');
  assert.equal(byReg('B6', '223', 'C-GNBN'), '');
  assert.equal(byReg('AC', '223', 'C-GNBN'), 'AC/223-tca.png');
});

test('if the TCA picture fails, the chain steps to the ordinary A220, and it is never remembered as missing', () => {
  const { tag } = api();
  const html = tag('AC', '223', { reg: 'C-GNBN' });
  const fb = /var fbs=(\[[^\]]*\])/.exec(html.replace(/&quot;/g, '"'));
  assert.ok(fb, 'the picture carries its fallback chain');
  assert.equal(JSON.parse(fb[1])[0], 'aircraft/AC/223.png', 'the next picture is the same type in the ordinary paint');
  // the onerror remembers ENGINE variants only (a transient blip must not
  // drop a real livery file for the whole session)
  const re = /if\(\/(.+?)\/i\.test\(_p\)\)\{try\{\(window\.AIRCRAFT_IMG_MISSING/.exec(html);
  assert.ok(re, 'the missing-file rule is in the handler');
  const rx = new RegExp(re[1].replace(/\\\\/g, '\\'), 'i');
  assert.ok(!rx.test('aircraft/AC/223-tca.png'), 'the registration livery is never marked missing');
  assert.ok(rx.test('aircraft/AC/77W-ge.png') && rx.test('aircraft/AA/321-iae.png') && rx.test('aircraft/AC/32N-leap.png'), 'engine variants still are');
});

test('every registration livery is on disk, faces the way the table says, and is in the table every surface reads', () => {
  const { table, facing } = api();
  const keys = Object.keys(table);
  assert.ok(keys.includes('CGNBN'), 'C-GNBN is listed');
  for (const k of keys) {
    assert.match(k, /^[A-Z0-9]+$/, 'keys are written without separators: ' + k);
    const e = table[k];
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', 'aircraft', e.file)), e.file + ' is on disk');
    assert.ok(fs.existsSync(path.join(ROOT, 'fids-current', 'aircraft', e.folder, e.eq + '.png')), 'the ordinary ' + e.eq + ' picture it stands in for exists');
    assert.ok(facing('aircraft/' + e.file), e.file + ' has a facing entry');
  }
});

test('every gate surface that draws the aircraft picture passes the registration', () => {
  // the desktop aircraft column, the shelf in the map column and the phone
  // layout all go through aircraftImgTag; each must hand it the tail
  const calls = [...SRC.matchAll(/(?<!function )aircraftImgTag\(([^;{]*?)\{([\s\S]*?)\}\)/g)];
  assert.ok(calls.length >= 3, 'found ' + calls.length + ' calls');
  for (const c of calls) assert.match(c[2], /\breg:/, 'a call without the registration: ' + c[0].slice(0, 80));
});

// ── THE COMPANION APP ──────────────────────────────────────────────────────
// Every real phone is sent to app.html, which does not load fids-core.js: its
// flight detail draws the aircraft with its own liveryImg under the 'Reg'
// line it prints. Without the same rule there, a phone showed the ordinary
// A220 under 'Reg C-GNBN'.
const APP = fs.readFileSync(path.join(ROOT, 'fids-current', 'app.html'), 'utf8');
function liftFrom(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'app.html must define ' + name);
  let d = 0;
  for (let k = src.indexOf('{', at); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
function appApi() {
  const at = APP.indexOf('const LIVERY_BY_REG={');
  assert.ok(at >= 0, 'app.html must declare LIVERY_BY_REG');
  const table = APP.slice(at, APP.indexOf('\n};', at) + 3);
  const code = [table, liftFrom(APP, 'acType'), liftFrom(APP, 'liveryByReg'), liftFrom(APP, 'liveryImg')].join('\n');
  return new Function(code + '\nreturn { img: liveryImg, table: LIVERY_BY_REG };')();
}
const attrOf = (html, a) => (new RegExp('\\s' + a + '="([^"]*)"').exec(html) || [])[1] || '';

test('the companion app holds the same registration liveries as the boards', () => {
  assert.deepEqual(appApi().table, api().table);
});

test('the companion app draws C-GNBN in its TCA paint, every other A220 in the ordinary art', () => {
  const { img } = appApi();
  for (const reg of ['C-GNBN', 'CGNBN', 'c-gnbn', ' C GNBN ']) {
    for (const raw of ['223', 'BCS3', 'Airbus A220-300', 'CS300']) {
      const h = img('AC', raw, '', reg);
      assert.equal(attrOf(h, 'src'), '/aircraft/AC/223-tca.png', reg + ' / ' + raw);
      assert.equal(attrOf(h, 'data-fb'), '/aircraft/AC/223.png', 'a failed load steps to the ordinary A220');
    }
  }
  assert.equal(attrOf(img('AC', '223', '', 'C-GUPG'), 'src'), '/aircraft/AC/223.png', 'C-GUPG');
  assert.equal(attrOf(img('AC', '223', '', ''), 'src'), '/aircraft/AC/223.png', 'no registration');
  assert.equal(attrOf(img('AC', '223', ''), 'src'), '/aircraft/AC/223.png', 'no registration argument');
  assert.equal(attrOf(img('AC', 'BCS1', '', 'C-GNBN'), 'src'), '/aircraft/AC/221.png', 'an A220-100 label keeps its picture');
  assert.equal(attrOf(img('AC', '320', '', 'C-GNBN'), 'src'), '/aircraft/AC/320.png', 'another type keeps its picture');
  assert.equal(attrOf(img('DL', '223', '', 'C-GNBN'), 'src'), '/aircraft/DL/223.png', 'another carrier keeps its picture');
  assert.equal(attrOf(img('AC', '320', 'Air Canada Rouge', 'C-FXYZ'), 'src'), '/aircraft/AC/320r.png', 'Rouge unchanged');
});

test('the companion app hands the flight detail picture the registration it prints', () => {
  const m = /\+liveryImg\(([^)]*)\)\+/.exec(APP);
  assert.ok(m, 'the flight detail draws the livery');
  const args = m[1].split(',').map((x) => x.trim());
  assert.equal(args[3], 'reg', 'the fourth argument is the printed registration');
  assert.match(APP, /const aci=ACI\[key\]\|\|null, acRaw=[^;]*, reg=f\.reg\|\|\(aci&&aci\.reg\)\|\|''/, 'the same reg the Reg line prints');
});

test('the phone gate layout never lets a history tail choose the paint', () => {
  // the TV gate's aircraft and map columns drop history-sourced tails before
  // the picture; the <700 px layout must too, or the two disagree
  const at = SRC.indexOf('function renderMobileGateHtml(');
  const call = SRC.indexOf('aircraftImgTag(', at);
  const body = SRC.slice(call, SRC.indexOf('});', call));
  const reg = /\breg:([\s\S]*?),\s*\n\s*className:/.exec(body);
  assert.ok(reg, 'the phone gate passes a registration');
  assert.match(reg[1], /\/\^history\/i?\.test\(String\(currentFlight\._regSource/, 'a history tail is withheld');
  const f = new Function('currentFlight', 'return (' + reg[1] + ');');
  assert.equal(f({ _reg: 'C-GNBN', _regSource: 'history:fr24' }), '');
  assert.equal(f({ _reg: 'C-GNBN', _regSource: 'feed' }), 'C-GNBN');
  assert.equal(f({ _registration: 'C-GNBN' }), 'C-GNBN');
});
