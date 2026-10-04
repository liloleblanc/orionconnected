'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE BOARD HEADER: BOTH SIDES WEAR ONE INK, ON GROUNDS THAT MIRROR.
//
// On the Ottawa departures board the title read white on deep purple while
// the clock and date beside it read near-black on the same purple: 2.0:1 and
// 1.6:1. A dark ink meant for the old light band (v23215) had caught every
// palette band. Measured on all 62 live airports at 1680x1050, the title and
// the clock wore different inks on 61 of them, and either side fell under
// 4.5:1 on most.
//
// v23955 made it one rule: the title, the clock and the date all read
// --fids-banner-ink, and the ground under each side is the mirror of the
// other — a band laid out symmetrically about the airport's mark, a silk photo
// that is the mirror of its own left half, and both ends of the palette held
// to one depth.
//
// This file measures that, for every airport's band:
//   - the ink against the painted end colour on each side, for every palette
//     the boards derived on 2026-10-04 (tests/fixtures/header-band.json), the
//     default navy, Moncton's flag, and palettes chosen to be hostile;
//   - the band's stops on real glyph boxes captured from the boards: words on
//     solid colour, the mark on white, the two sides symmetric;
//   - that no other rule in the stylesheet can re-ink one side alone.
//
// The painted model is the measured one. Through the mirrored silk (overlay
// .80, screen .18) a channel was lifted by up to 36 at black, tapering to
// nothing at white, under the brightest tenth of the words' pixels on every
// palette airport. 5.6:1 against that is what kept the date's thin strokes —
// whose anti-aliased cores read about 0.83 of full contrast — above 4.5:1 at
// their weakest tenth on screen.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'header-band.json'), 'utf8'));

const MEASURED_LIFT = 36;       // the silk's lift at black, measured envelope
const PAINTED_FLOOR = 5.6;      // ink vs painted ground, so rendered strokes clear 4.5

// ── the code under test, lifted out of fids-core.js ────────────────────────
function fnSource(name) {
  const at = CORE.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' must exist in fids-core.js');
  let i = CORE.indexOf('{', at), depth = 0;
  for (; i < CORE.length; i++) {
    if (CORE[i] === '{') depth++;
    else if (CORE[i] === '}' && --depth === 0) break;
  }
  return CORE.slice(at, i + 1);
}
function varSource(name) {
  const m = new RegExp('var ' + name + ' = ([^;]+);').exec(CORE);
  assert.ok(m, name + ' must be declared in fids-core.js');
  return 'var ' + name + ' = ' + m[1] + ';';
}
const sandbox = { Math };
vm.createContext(sandbox);
vm.runInContext([
  varSource('_FIDS_BAND_PAD'), varSource('_FIDS_BAND_FADE'),
  varSource('_FIDS_BAND_END_CR'), varSource('_FIDS_SILK_LIFT'),
  fnSource('_relLum'), fnSource('_hex'), fnSource('_fidsSilkPainted'),
  fnSource('_fidsBandEnd'), fnSource('_fidsBandStops'),
].join('\n'), sandbox);
const { _fidsBandEnd, _fidsBandStops } = sandbox;

// ── colour, measured independently of the code ─────────────────────────────
function rgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
  assert.ok(m, 'not a #rrggbb colour: ' + hex);
  return [1, 2, 3].map(i => parseInt(m[i], 16));
}
function lum(c) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const painted = c => c.map(v => v + MEASURED_LIFT * (1 - v / 255));

// ── the stylesheet's rules (innermost blocks; @media wrappers fall away) ───
function rules() {
  const out = [];
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}
const RULES = rules();
const ids = sel => (sel.match(/#/g) || []).length;
const inkRule = RULES.find(r => /(^|[;\s])color:\s*var\(--fids-banner-ink\)\s*!important/.test(r.body));
const INK = (() => {
  const m = /--fids-banner-ink:\s*(#[0-9a-f]{6})/i.exec(CSS);
  assert.ok(m, '--fids-banner-ink must be defined in display-overrides.css');
  return rgb(m[1]);
})();

test('one ink: the title, the clock and the date read the same property', () => {
  assert.ok(inkRule, 'a rule must set color: var(--fids-banner-ink) !important');
  for (const part of ['.fids-board-label', '.fids-banner-time-block', '.fids-banner-time', '.fids-banner-date']) {
    assert.ok(inkRule.sel.includes(part), 'the one ink rule must cover ' + part + ' — both sides in one declaration');
  }
  assert.match(inkRule.body, /-webkit-text-fill-color:\s*var\(--fids-banner-ink\)\s*!important/,
    'Blink paints glyphs from -webkit-text-fill-color when it is set, so the fill must follow the same ink');
  assert.ok(/data-fids-banner="silk"/.test(inkRule.sel) && /data-fids-banner="silk-acadian"/.test(inkRule.sel),
    'every silk band, the Acadian flag included');
});

test('no other rule can re-ink one side of the header alone', () => {
  const mine = Math.min(...inkRule.sel.split(/,(?![^(]*\))/).map(ids));
  const parts = /\.fids-board-label|\.fids-banner-time\b|\.fids-banner-time-block|\.fids-banner-date|\.fids-banner-time-text/;
  for (const r of RULES) {
    if (r === inkRule) continue;
    if (!/(^|[;\s])(-webkit-text-fill-)?color:[^;]*!important/.test(r.body)) continue;
    for (const s of r.sel.split(/,(?![^(]*\))/)) {
      if (!parts.test(s) || /fids-portrait|max-width/.test(s)) continue;
      assert.ok(ids(s) < mine,
        'this selector inks a header side with ' + ids(s) + ' id-weights, not fewer than the one ink rule\'s ' +
        mine + ' — it would win and split the sides again:\n  ' + s.slice(0, 200));
    }
  }
});

test('every airport: the ink clears both ends of its own band', () => {
  const grad = RULES.find(r => r.body.includes('var(--fids-band-s1') && r.sel.includes('data-fids-banner="silk"'));
  assert.ok(grad, 'the silk band gradient must read the measured stops');
  const navyHead = rgb(/var\(--fids-band-1,\s*(#[0-9a-f]{6})\)/i.exec(grad.body)[1]);
  const navyTail = rgb(/var\(--fids-band-4,\s*(#[0-9a-f]{6})\)/i.exec(grad.body)[1]);
  const pals = FX.palettes;
  assert.ok(Object.keys(pals).length >= 62, 'the fixture covers every live airport measured on 2026-10-04');
  const report = [];
  for (const [ap, pal] of Object.entries(pals)) {
    let head, tail;
    if (pal === 'acadian') {
      // the flag's brand tones are the lightest ground under its words
      head = rgb('#003DA5'); tail = rgb('#B50E2C');
      assert.ok(CSS.includes('#003DA5 30%') && CSS.includes('#B50E2C 70%'), 'Moncton\'s flag stops moved — re-measure it');
    } else if (pal === null) {
      head = navyHead; tail = navyTail;
    } else {
      head = rgb(_fidsBandEnd(pal[0])); tail = rgb(_fidsBandEnd(pal[3]));
    }
    const l = contrast(INK, painted(head)), r = contrast(INK, painted(tail));
    report.push(ap + ' ' + l.toFixed(2) + '/' + r.toFixed(2));
    assert.ok(l >= PAINTED_FLOOR, ap + ': the title side measures ' + l.toFixed(2) + ':1 against its painted ground');
    assert.ok(r >= PAINTED_FLOOR, ap + ': the clock side measures ' + r.toFixed(2) + ':1 against its painted ground');
  }
  assert.equal(report.length, Object.keys(pals).length);
});

test('a live airport the fixture has not met is held by the same guard', () => {
  const start = CORE.indexOf('const FIDS_LIVE_AIRPORTS = new Set([');
  const end = CORE.indexOf(']);', start);
  const live = CORE.slice(start, end).replace(/\/\/.*$/gm, '').match(/'[A-Z0-9]{3,4}'/g).map(s => s.slice(1, -1));
  const hostile = ['#ffffff', '#ffff00', '#00ffff', '#f2f2f2', '#ff99cc', '#7fff00', '#ffd700', '#87ceeb'];
  for (const ap of live) {
    if (Object.prototype.hasOwnProperty.call(FX.palettes, ap)) continue;
    for (const h of hostile) {
      const c = contrast(INK, painted(rgb(_fidsBandEnd(h))));
      assert.ok(c >= PAINTED_FLOOR, ap + ' (unmeasured) with a ' + h + ' palette end: ' + c.toFixed(2));
    }
  }
  for (const h of hostile) {
    const c = contrast(INK, painted(rgb(_fidsBandEnd(h))));
    assert.ok(c >= PAINTED_FLOOR, 'a ' + h + ' palette end must be held too: ' + c.toFixed(2));
  }
});

test('an end colour is only deepened, never re-hued, and one that already reads is left alone', () => {
  for (const pal of Object.values(FX.palettes)) {
    if (!Array.isArray(pal)) continue;
    for (const hex of [pal[0], pal[3]]) {
      const before = rgb(hex), after = rgb(_fidsBandEnd(hex));
      if (contrast(INK, painted(before)) >= PAINTED_FLOOR) {
        assert.deepEqual(after, before, hex + ' already reads and must keep its exact value');
        continue;
      }
      // same hue: every channel scaled by one factor (to rounding)
      const k = Math.max(...after) / Math.max(...before);
      before.forEach((v, i) => assert.ok(Math.abs(v * k - after[i]) <= 1.5,
        hex + ' -> ' + _fidsBandEnd(hex) + ' changed hue, not depth'));
    }
  }
});

// ── the band's layout on real glyph boxes ──────────────────────────────────
function gradT(g, x, y) {
  const A = 100 * Math.PI / 180, sx = Math.sin(A), sy = -Math.cos(A);
  const L = Math.abs(g.W * sx) + Math.abs(g.H * sy);
  return ((x - g.W / 2) * sx + (y - g.H / 2) * sy) / L * 100 + 50;
}
const corners = r => [[r.l, r.t], [r.r, r.t], [r.l, r.b], [r.r, r.b]];

test('the band mirrors about the mark, and the words sit on solid colour', () => {
  const samples = Object.entries(FX.geometry);
  assert.ok(samples.length >= 8, 'geometry samples: departures, baggage, no logo, other languages, a long date');
  const fadePx = sandbox._FIDS_BAND_FADE;
  for (const [name, g] of samples) {
    const s = _fidsBandStops(g);
    assert.ok(s, name + ': the layout must resolve');
    for (const [a, b] of [['s1', 's2'], ['m1', 'm2'], ['w1', 'w2']]) {
      assert.ok(Math.abs(s[a] + s[b] - 100) <= 0.02, name + ': ' + a + '/' + b + ' must mirror about the centre (' + s[a] + ' + ' + s[b] + ')');
    }
    assert.ok(s.s1 < s.m1 && s.m1 < s.w1 && s.w1 <= s.w2 && s.w2 < s.m2 && s.m2 < s.s2, name + ': stops out of order ' + JSON.stringify(s));
    const L = Math.abs(g.W * Math.sin(100 * Math.PI / 180)) + Math.abs(g.H * Math.cos(100 * Math.PI / 180));
    const fadeW = (s.w1 - s.s1) / 100 * L;
    assert.ok(fadeW >= fadePx - 0.5, name + ': the fade is ' + fadeW.toFixed(1) + 'px, under the ' + fadePx + 'px floor');
    // Where the room ran out the edge is crisp and straddles the two boxes'
    // corners — half the narrowest fade either way, never more. Those corners
    // are the empty end of a line box and the empty margin of a logo.
    const crisp = fadeW <= fadePx + 0.5;
    const tol = crisp ? (fadePx / 2 + 0.5) / L * 100 : 0.05;
    for (const r of g.left) for (const [x, y] of corners(r)) {
      assert.ok(gradT(g, x, y) <= s.s1 + tol, name + ': title glyph box (' + x + ',' + y + ') is off the solid colour');
    }
    for (const r of g.right) for (const [x, y] of corners(r)) {
      assert.ok(gradT(g, x, y) >= s.s2 - tol, name + ': time-block glyph box (' + x + ',' + y + ') is off the solid colour');
    }
    // (yow-departures-long-date overlaps the mark and the date on purpose: the
    // logo fit has not caught up there, and the words win.)
    if (name.includes('long-date')) continue;
    for (const r of g.mark) for (const [x, y] of corners(r)) {
      const t = gradT(g, x, y);
      assert.ok(t >= s.w1 - tol && t <= s.w2 + tol, name + ': the mark (' + x + ',' + y + ') is off the white');
    }
  }
});

test('the stylesheet paints what fids-core measures, through the mirrored silk', () => {
  const grad = RULES.find(r => r.body.includes('var(--fids-band-s1') && r.sel.includes('data-fids-banner="silk"'));
  const order = ['--fids-band-s1', '--fids-band-m1', '--fids-band-w1', '--fids-band-w2', '--fids-band-m2', '--fids-band-s2'];
  let at = -1;
  for (const v of order) {
    const i = grad.body.indexOf('var(' + v);
    assert.ok(i > at, v + ' must appear in the gradient, in mirror order');
    at = i;
  }
  assert.ok(grad.sel.includes('.bidsv2-fids-banner'), 'the baggage banner takes the same band');
  for (const pseudo of ['::before', '::after']) {
    const r = RULES.find(x => x.sel.includes(pseudo) && x.body.includes('banner-silk-mirror.jpg'));
    assert.ok(r, 'the banner ' + pseudo + ' silk must be the mirrored photo');
  }
  const img = path.join(ROOT, 'fids-current', 'logos', 'Backgrounds', 'banner-silk-mirror.jpg');
  assert.ok(fs.statSync(img).size > 10000, 'banner-silk-mirror.jpg must ship');
  const manifest = fs.readFileSync(path.join(ROOT, 'fids-current', 'assets', 'asset-manifest.json'), 'utf8');
  assert.ok(manifest.includes('/logos/Backgrounds/banner-silk-mirror.jpg'), 'run npm run assets:build');
  assert.match(CORE, /_ocEvery\(_fidsBannerBand, \d+\)/, 'the band layout must run on a heartbeat');
});

test('with no logo, the airport\'s own name sits in navy on the white centre', () => {
  const r = RULES.find(x => x.sel.includes('.fids-airport-name') && /color:\s*#0d2440\s*!important/i.test(x.body));
  assert.ok(r, 'the name and code must be inked navy on the silk band');
  const white = RULES.filter(x => /\.fids-airport-(iata|name)/.test(x.sel) && /color:\s*#ffffff\s*!important/i.test(x.body));
  const mine = Math.min(...r.sel.split(/,(?![^(]*\))/).map(ids));
  for (const w of white) {
    for (const s of w.sel.split(/,(?![^(]*\))/)) {
      if (!/\.fids-airport-(iata|name)/.test(s)) continue;
      assert.ok(ids(s) < mine, 'a white rule would put the name back on white at 1.04:1:\n  ' + s);
    }
  }
  assert.ok(contrast(rgb('#0d2440'), painted(rgb('#ffffff'))) >= 4.5);
});
