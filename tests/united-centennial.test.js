'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 100 YEARS OF UNITED ON THE BOARDING STRIP, UNITED GATES, TO 31 DEC 2026.
//
// While a United flight boards, the white strip under the flight facts wears
// United's centenary mark split around the words: United's spinning globe
// (from United's own animation) on the left of "Now Boarding", the Star
// Alliance star as the divider between the two languages, and the
// 100 YEARS OF UNITED lettering on the right. It ends by itself at the
// airport's own midnight going into 1 January 2027.
//
// The traps this guards:
//  · the cut-off counted on the host's or UTC's calendar — at 19:00 on
//    31 December in Chicago it is already 1 January in UTC, and in Guam it
//    is 1 January hours before it is anywhere in North America;
//  · a carrier other than United getting the mark (the express carriers and
//    the alliance partners keep their own strip);
//  · the gate's rebuilds replaying the animation: the builder stamps the time
//    since the strip first appeared and the CSS resumes from it;
//  · an !important background position, which would beat the animation and
//    freeze the globe on its first frame.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const OVR = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const ART = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'us-major');

function bracketed(at, open) {
  let i = CORE.indexOf(open, at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) break;
  }
  return CORE.slice(at, i + 1);
}
function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist in fids-core.js');
  return bracketed(at, '{');
}
function varObjSource(name) {
  const at = CORE.indexOf('var ' + name + ' = {');
  assert.ok(at >= 0, name + ' must be declared in fids-core.js');
  return bracketed(at, '{') + ';';
}

const SRC = [varObjSource('UA_CENTENNIAL'), fnSource('fidsLocalDateKey'), fnSource('_uaCentennialOn')].join('\n');
const box = { Intl, Date, Object, String };
vm.createContext(box);
vm.runInContext(SRC, box);
const { _uaCentennialOn, UA_CENTENNIAL } = box;

// Local wall time → UTC instant, for a fixed winter offset (no airport here
// changes its clocks between late December and early January).
const local = (wall, offsetMin) => Date.parse(wall + 'Z') - offsetMin * 60000;

// Airports United serves, with their winter offsets from UTC in minutes.
const AIRPORTS = [
  ['America/Chicago', -360], ['America/New_York', -300], ['America/Los_Angeles', -480],
  ['America/Denver', -420], ['Pacific/Honolulu', -600], ['America/Toronto', -300],
  ['America/Moncton', -240], ['America/Halifax', -240], ['America/St_Johns', -210],
  ['Pacific/Guam', 600], ['Europe/London', 0], ['Asia/Tokyo', 540],
];

test('the last day is 31 December 2026, on the airport\'s own calendar', () => {
  assert.equal(UA_CENTENNIAL.last, '2026-12-31');
  for (const [tz, off] of AIRPORTS) {
    assert.equal(_uaCentennialOn('UA', tz, local('2026-12-31T23:59:30', off)), true, tz + ': still on at 23:59:30 on 31 December');
    assert.equal(_uaCentennialOn('UA', tz, local('2027-01-01T00:00:30', off)), false, tz + ': off at 00:00:30 on 1 January');
  }
});

test('on today and every day before the end, off every day after', () => {
  for (const [tz, off] of AIRPORTS) {
    for (const day of ['2026-04-06', '2026-10-30', '2026-12-25']) {
      assert.equal(_uaCentennialOn('UA', tz, local(day + 'T12:00:00', off)), true, tz + ' ' + day);
    }
    for (const day of ['2027-01-01', '2027-04-06', '2030-06-01']) {
      assert.equal(_uaCentennialOn('UA', tz, local(day + 'T12:00:00', off)), false, tz + ' ' + day);
    }
  }
});

test('the cut-off does not follow UTC: Chicago at 19:00 on 31 December, Guam at 09:00 on 1 January', () => {
  // 19:00 CST on 31 Dec is 01:00 UTC on 1 Jan: UTC is already past the end.
  assert.equal(_uaCentennialOn('UA', 'America/Chicago', Date.parse('2027-01-01T01:00:00Z')), true);
  // 09:00 on 1 Jan in Guam is still 31 Dec in UTC (23:00): Guam is already past it.
  assert.equal(_uaCentennialOn('UA', 'Pacific/Guam', Date.parse('2026-12-31T23:00:00Z')), false);
});

test('United only: UA and UAL; partners, express operators and others keep their strip', () => {
  const ts = local('2026-11-15T12:00:00', -300);
  for (const code of ['UA', 'UAL', 'ua', ' UA ']) assert.equal(_uaCentennialOn(code, 'America/New_York', ts), true, code);
  for (const code of ['AC', 'WS', 'PD', 'DL', 'AA', 'LH', 'NH', 'OO', 'YX', 'G7', 'ZW', 'C5', 'UAX', '', null, undefined]) {
    assert.equal(_uaCentennialOn(code, 'America/New_York', ts), false, String(code));
  }
});

test('the answer does not depend on the machine\'s own time zone', () => {
  const probe = SRC + '\n;process.stdout.write(JSON.stringify(['
    + "_uaCentennialOn('UA','America/Chicago'," + local('2026-12-31T23:59:30', -360) + '),'
    + "_uaCentennialOn('UA','America/Chicago'," + local('2027-01-01T00:00:30', -360) + '),'
    + "_uaCentennialOn('UA','Pacific/Guam'," + local('2026-12-31T23:59:30', 600) + '),'
    + "_uaCentennialOn('UA','Pacific/Guam'," + local('2027-01-01T00:00:30', 600) + ')]))';
  for (const TZ of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC', 'Europe/Helsinki']) {
    const out = execFileSync(process.execPath, ['-e', probe], { env: { ...process.env, TZ } }).toString();
    assert.deepEqual(JSON.parse(out), [true, false, true, false], 'host TZ=' + TZ);
  }
});

test('the strip builder wears it only while boarding, only through the switch', () => {
  const strip = fnSource('_boardWelcomeStripHtml');
  assert.match(strip, /var _u100 = \/\^\(boarding\|finalcall\|final-call\|final\)\$\/\.test\(String\(_stripState \|\| ''\)\)\s*&& \(typeof _uaCentennialOn === 'function'\) && _uaCentennialOn\(airlineCode, tz, Date\.now\(\)\);/,
    'on only while the strip says Now Boarding, and only when _uaCentennialOn says so');
  // every piece of the mark is behind the switch
  const markup = strip.slice(strip.indexOf('var _bwMid;'));
  const onBranch = markup.slice(0, markup.indexOf('} else {'));
  assert.match(onBranch, /if \(_u100\) \{/);
  for (const cls of ['g8-bw-u100"', 'g8-bw-u100-words"']) {
    assert.ok(onBranch.includes(cls), cls + ' is drawn on the United branch');
    assert.equal(markup.split(cls).length - 1, 1, cls + ' is drawn nowhere else');
  }
  assert.match(strip, /_bwMidWords = _gateLbl\('nowBoarding', _frF, function \(w\) \{ return w; \}, ' <span class="g8-bw-sep">\|<\/span> ', true\);/,
    'every strip keeps the bar');
  assert.match(strip, /if \(_u100 && _bwStar\) _bwMidWords = _gateLbl\('nowBoarding', _frF, function \(w\) \{ return w; \}, ' <span class="g8-bw-star g8-bw-star-mid">' \+ _bwStar \+ '<\/span> ', true\);/,
    'the star is the divider only with the mark on');
  // one language has no divider: the star then sits after the words, once
  assert.match(onBranch, /\(_bwStar && !_u100StarMid \? '<span class="g8-bw-star">' \+ _bwStar \+ '<\/span>' : ''\)/);
  // a rebuild resumes: the time since this flight's strip first appeared, per flight
  assert.match(strip, /_u100Seen\[_u100K\] = _u100Now;/);
  assert.match(strip, /var _u100K = _gateRowKey\(currentFlight\)/);
  assert.match(onBranch, /' style="--u100-el:-' \+ _u100El \+ 'ms"'/);
  // no passenger words in the markup: the lettering is the artwork, alt is empty
  assert.match(onBranch, /united-100-years-words\.png\?v=\d+" width="212" height="161" alt="">/);
  // a row filed under UAL has no ALLIANCE_MAP entry: the star is made here
  assert.match(strip, /if \(!_bwStar\) \{\s*_bwStar = '<img class="g8-r1-star g8-r1-alliance-star" src="' \+ ALLIANCE_LOGOS\.star\.replace\('star-3d-tile\.jpg', 'star-3d-symbol\.webp'\)/);
});

function rulesFor(cls) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(OVR))) if (m[1].includes(cls)) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}

test('the CSS: scoped to the strip, resumes from --u100-el, background position never !important', () => {
  for (const cls of ['g8-bw-u100', 'g8-bw-star-mid']) {
    const rules = rulesFor(cls);
    assert.ok(rules.length, cls + ' has rules');
    for (const r of rules) assert.match(r.sel, /\.g8-board-welcome /, cls + ' rule is scoped to the boarding strip: ' + r.sel.slice(-80));
  }
  const globe = rulesFor('.g8-bw-u100 ').concat(rulesFor('.g8-bw-u100{')).filter((r) => /\.g8-bw-u100\s*$/.test(r.sel));
  assert.ok(globe.length >= 1, 'the globe rule exists');
  const main = globe.find((r) => /u100Grow/.test(r.body));
  assert.ok(main, 'the globe animates');
  assert.match(main.body, /--u100-f:\s*60ms/, 'half again as slow as United (40 ms a frame)');
  assert.match(main.body, /u100Grow calc\(37 \* var\(--u100-f\)\) steps\(37\) var\(--u100-el, 0ms\) 1 both/);
  assert.match(main.body, /u100Turn calc\(18 \* var\(--u100-f\)\) steps\(18\) calc\(37 \* var\(--u100-f\) \+ var\(--u100-el, 0ms\)\) infinite/);
  assert.match(main.body, /background-size:\s*5500% 100%/, '55 frames in the strip');
  assert.doesNotMatch(main.body, /background(-position)?[^;]*!important/, 'an !important background would beat the animation');
  const words = rulesFor('.g8-bw-u100-words').find((r) => /u100Words/.test(r.body));
  assert.ok(words, 'the lettering slides in');
  assert.match(words.body, /var\(--u100-el, 0ms\)/, 'and resumes from the same clock');
  assert.doesNotMatch(words.body, /(clip-path|transform)[^;]*!important/, 'an !important clip or transform would beat the animation');
  // the boxes are held before the files arrive: the fitter sizes the words
  // beside them once, at the rebuild, and an image takes no room until it loads
  assert.match(words.body, /aspect-ratio: 212 \/ 161 !important;/, 'the lettering keeps its width before it loads');
  const starImg = rulesFor('.g8-bw-star-mid img').find((r) => /height: 1\.3em/.test(r.body));
  assert.ok(starImg && /width: 1\.3em !important;/.test(starImg.body), 'the square star keeps its width before it loads');
  // the row is the height the end star gave it on main, at every screen height
  const mid = rulesFor('.g8-bw-u100-mid').find((r) => /min-height/.test(r.body));
  assert.ok(mid && /min-height: clamp\(48px, 7vh, 82px\) !important;/.test(mid.body), 'the row keeps main\'s height');
  assert.match(OVR, /@keyframes u100Grow \{ from \{ background-position-x: 0%; \} to \{ background-position-x: calc\(37 \/ 54 \* 100%\); \} \}/);
  assert.match(OVR, /@keyframes u100Turn \{ from \{ background-position-x: calc\(37 \/ 54 \* 100%\); \} to \{ background-position-x: calc\(55 \/ 54 \* 100%\); \} \}/);
  // still for anyone who has asked the system to stop moving things
  const blk = OVR.slice(OVR.indexOf('2026-10-30 — 100 YEARS OF UNITED on the boarding strip'));
  const still = blk.slice(blk.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(still.slice(0, 600), /\.g8-board-welcome \.g8-bw-u100 \{ animation: none !important;/);
  // the sign's blocks after it are read to the end of the file by their own
  // tests (nothing moves there, 16 guards each): this block sits before them
  assert.ok(OVR.indexOf('2026-10-30 — 100 YEARS OF UNITED') < OVR.indexOf('v23773 — THE SIGN, TO THE PICTURE'), 'the block comes before the sign blocks');
});

function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [(b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1];
  }
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error('unexpected WebP chunk ' + kind);
}

test('the art: 55 square frames in one strip, the lettering, both in the asset manifest', () => {
  const globe = fs.readFileSync(path.join(ART, 'united-100-globe.webp'));
  const [w, h] = webpSize(globe);
  assert.equal(w, 55 * h, '55 square frames side by side');
  const words = fs.readFileSync(path.join(ART, 'united-100-years-words.png'));
  assert.equal(words.toString('ascii', 1, 4), 'PNG');
  const manifest = fs.readFileSync(path.join(ROOT, 'fids-current', 'assets', 'asset-manifest.json'), 'utf8');
  for (const f of ['united-100-globe.webp', 'united-100-years-words.png']) assert.ok(manifest.includes(f), f + ' is in the asset manifest');
  const note = fs.readFileSync(path.join(ROOT, 'docs', 'licenses', 'united-100-years.md'), 'utf8');
  for (const f of ['united-100-globe.webp', 'united-100-years-words.png', 'united.com']) assert.ok(note.includes(f), 'the art note names ' + f);
});
