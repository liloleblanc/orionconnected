'use strict';

// WHY THIS EXISTS
//
// November 2026: a KLM 787-10 showed the plain white 787-10 on the gate,
// although KLM has its own 787-10 drawing. The boards ask for an airline
// drawing by the IATA type code (B78X becomes 78J), and the KLM file was
// named KL/78X.png, a code nothing ever asks for; its E195-E2 was KL/29E.png
// where the boards ask for 295. Both are renamed to the codes the boards use.
// This holds that every airline drawing is named by a type code the boards
// know (IATA_AIRCRAFT), or is one of the files named for a variant listed
// below, so a new drawing cannot hide behind a wrong name again. The phone
// app, which has its own resolver, now gives the 787-10, the A350 and the E2
// jets their own codes too (it drew a 787-9 for a 787-10 and nothing for an
// A350).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'fids-current', 'aircraft');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'fids-current', 'app.html'), 'utf8');

/** Brace-matched slice from the first '{' after `decl`. */
function block(src, decl) {
  const at = src.indexOf(decl);
  assert.ok(at >= 0, decl + ' must exist');
  const from = src.indexOf('{', at);
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('could not close ' + decl);
}

const TYPES = new Set([...block(CORE, 'const IATA_AIRCRAFT = {').matchAll(/'([0-9A-Z]{3})'\s*:\s*'/g)].map((m) => m[1]));

// Files named for a variant rather than a bare type code: an engine (cfm, iae,
// ge), Rouge paint (r), one registration in its own paint (223-tca), a retired
// drawing, an extra drawing (DH4-Extra), or a code outside the IATA type table.
// Each predates this guard; a new name needs a line here and a reason.
const VARIANTS = new Set([
  '5T/73P.png', '5T/ATR.png',
  'AA/319-cfm.png', 'AA/319-iae.png', 'AA/320-cfm.png', 'AA/320-iae.png', 'AA/321-cfm.png', 'AA/321-iae.png',
  'AA/CAN.png', 'AA/RJ1.png',
  'AC/223-tca.png', 'AC/319r.png', 'AC/319retired.png', 'AC/320r.png', 'AC/321r.png', 'AC/737r.png',
  'AC/73Hr.png', 'AC/77L-ge.png', 'AC/77W-ge.png', 'AC/7M8r.png', 'AC/BEE.png',
  'PD/DH4-Extra.png'
]);

test('every airline drawing is named by a type code the boards ask for, or is a listed variant', () => {
  assert.ok(TYPES.size > 100, TYPES.size + ' type codes');
  const wrong = [];
  for (const al of fs.readdirSync(ART)) {
    const dir = path.join(ART, al);
    if (al === 'heritage' || !fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.png'))) {
      const rel = al + '/' + f;
      if (!TYPES.has(f.slice(0, -4)) && !VARIANTS.has(rel)) wrong.push(rel);
    }
  }
  assert.deepEqual(wrong, []);
  // every listed variant still exists (a removed file leaves the list)
  for (const v of VARIANTS) assert.ok(fs.existsSync(path.join(ART, v)), v);
});

test('KLM: the 787-10 is KL/78J.png and the E195-E2 is KL/295.png, the codes the boards resolve to', () => {
  for (const f of ['78J.png', '295.png']) assert.ok(fs.existsSync(path.join(ART, 'KL', f)), 'KL/' + f);
  for (const f of ['78X.png', '29E.png']) assert.ok(!fs.existsSync(path.join(ART, 'KL', f)), 'KL/' + f + ' is gone');
  assert.match(CORE, /'B78X':'78J'/);
  assert.match(CORE, /'E295':'295'/);
  // the facing table names the files as they are
  assert.match(CORE, /'KL\/78J\.png':'R'/);
  assert.match(CORE, /'KL\/295\.png':'R'/);
  assert.doesNotMatch(CORE, /'KL\/(78X|29E)\.png'/);
  // the KLM A350-900 (KL/359.png, new November 2026) is drawn nose left
  assert.ok(fs.existsSync(path.join(ART, 'KL', '359.png')), 'KL/359.png');
  assert.match(CORE, /'KL\/359\.png':'L'/);
});

test('the phone app gives the 787-10, the A350 and the E2 jets their own codes', () => {
  const acType = new Function(block(APP, 'function acType(raw){') + '\nreturn acType;')();
  const want = {
    B78X: '78J', 'Boeing 787-10': '78J', B789: '789', 'Boeing 787-9': '789', B788: '788', 'Boeing 787-8': '788',
    A359: '359', 'Airbus A350-900': '359', A35K: '351', 'Airbus A350-1000': '351',
    E295: '295', 'Embraer E195-E2': '295', E290: '290', 'Embraer E190-E2': '290',
    'Embraer 190': 'E90', E195: 'E95', 'Boeing 777-300ER': '77W', 'Airbus A320': '320'
  };
  for (const [raw, code] of Object.entries(want)) assert.equal(acType(raw), code, raw);
  // each of those codes has a picture to fall back on
  for (const code of new Set(Object.values(want))) assert.ok(fs.existsSync(path.join(ART, code + '.png')), code + '.png');
});
