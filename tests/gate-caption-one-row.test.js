'use strict';

// WHY THIS EXISTS
//
// The caption under the gate aircraft was the model on one line and Operated
// By on a second (v23790), which made it the tallest thing on the shelf. v23904
// makes it one band, the same height with or without an operator:
//
//   Aircraft:   Airbus A319 | C-FTOD        Operated By:    [LOGO]
//   Appareil:                               Exploité par:
//
// Labels stacked, the model at twice the label size, the operator mark as tall
// as its label pair. A long model steps down, then goes to two lines (model
// over registration) rather than being cut. Measured on a 380 px shelf at
// 1680 wide: 50 px band (was ~90 px with an operator).
//
// v23926 made the aircraft picture, this caption and the Your Aircraft lines
// one panel (the lower of the right column's two). The caption keeps the form
// above, one row, now drawn by the v23926 block at the end of
// display-overrides.css (the v23904 block stays in the file underneath it).
// What changed is only the band's size: the panel's extra height goes to the
// one row, 60 px at 1680x1050 (--rcp-cap; v23904's --acb-h was 52.5). The
// row's own scale, --acb-h, starts at the band and the fitter lowers it as far
// as v23904's size while the row does not fit across the panel.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const block = CSS.slice(CSS.indexOf('v23904 — THE CAPTION IS ONE ROW'));
// The rules that draw the caption now: the v23926 block, without comments.
const drawn = CSS.slice(CSS.lastIndexOf('/*', CSS.indexOf('v23926 — THE RIGHT COLUMN IS TWO PANELS'))).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleFor(tail) {
  const at = drawn.indexOf(tail + ' {');
  assert.ok(at >= 0, `no drawing rule for ${tail}`);
  return drawn.slice(at, drawn.indexOf('}', at));
}
const CAP = '.gad-map-col-v2 .v2-rc-shelf-illus .v2-rc-acb-cap';

test('the caption has an Aircraft / Appareil label pair beside the model', () => {
  assert.match(CORE, /aircraft:\s*\{ en:'Aircraft',\s*fr:'Appareil'/, 'the label lives in _GATE_LBL');
  assert.match(CORE, /_gateLbl\('aircraft', _frF8,/, 'it follows the airport language order, French first in Québec');
  assert.match(CORE, /'<div class="v2-rc-acb-ac' \+ \(_acKnown \? '' : ' is-pending'\) \+ '">'/);
});

test('an unknown aircraft shows the pending text, not empty labels', () => {
  assert.match(CORE, /var _acKnown = !!\(_acModel \|\| _acReg\);/);
  assert.match(CORE, /\(_acKnown \? _acTypeVal : _pendingAircraftText\)/);
});

test('one band, the same height with or without an operator', () => {
  assert.ok(block.length > 0, 'the v23904 block exists');
  // v23904's band, still the size the row may come down to.
  assert.match(block, /--acb-h: clamp\(30px, min\(5vh, 7\.6vw\), 54px\);/);
  // The band that draws it now: the merged panel's one row.
  assert.match(drawn, /--rcp-cap: clamp\(32px, min\(5\.7vh, 3\.6vw\), 64px\);/);
  const cap = ruleFor(CAP);
  assert.match(cap, /--acb-h: var\(--rcp-cap\);/);
  assert.match(cap, /display: flex !important;/);
  assert.match(cap, /flex-direction: row !important;/);
  assert.match(cap, /flex-wrap: nowrap !important;/);
  assert.match(cap, /height: var\(--rcp-cap\) !important;/);
  assert.doesNotMatch(block, /flex-direction: column !important;\s*align-items: center !important;\s*justify-content: center !important;\s*gap: clamp\(1px/,
    'the two-row caption is not reintroduced');
  // Nor a second row: no grid, and nothing placed on a row of its own.
  assert.doesNotMatch(cap, /display: grid/);
  const capAt = drawn.indexOf(CAP + ' {');
  const caption = drawn.slice(capAt, drawn.indexOf('.v2-rc-shelf-fi {', capAt));
  assert.doesNotMatch(caption, /grid-row/, 'the label pair, the model and the operator share one row');
  // No second height for the band anywhere in the block.
  assert.doesNotMatch(drawn, /\.v2-rc-acb-cap(\.[\w-]+|:not\([^)]*\))* \{[^}]*[^-]height: (?!var\(--rcp-cap\))/);
});

test('the model is twice its label, the operator mark never smaller than the text', () => {
  assert.match(ruleFor(CAP + ' .v2-rc-acb-actype'), /font-size: calc\(var\(--acb-h\) \* 0\.52\) !important;/, 'model');
  // v23962 — and never under the readable floor (--fx-floor)
  assert.match(ruleFor(CAP + ' .v2-rc-opby-lline'), /font-size: max\(var\(--fx-floor, 12px\), calc\(var\(--acb-h\) \* 0\.24\)\) !important;/, 'label');
  assert.match(ruleFor(CAP + ' .v2-rc-opby-logo'), /height: calc\(var\(--acb-h\) \* 0\.62\) !important;/, 'mark taller than the model text');
  // When the fitter brings the mark down with the model, it never goes under
  // the model's own type, and its height is rounded UP to the 1/64px layout
  // grid (a mark set equal to a 12.48px model measured 12.47).
  // v23986 — nor under its own 'Operated By:' label beside it (Rouge's mark
  // was 10px beside 12px labels at 1280x720), and with no model yet it keeps
  // its own height on the one row: the operator goes under the aircraft
  assert.match(CORE, /if \(_k\) _setLh\(Math\.max\(_mk\(px\), Math\.min\(_lh, px \* _k\)\)\);/);
  assert.match(CORE, /while \(_lh > _up64\(_mk\(_fs\)\) && !_fits\(\)\) _setLh\(Math\.max\(_mk\(_fs\), _lh - 1\)\);/);
  // v24004 — with no model yet the mark is held (_hold) until the words
  // and the row's spacing have given what they can, then comes down to this
  // same floor: it never goes under the words or its label. And the floor is
  // read on the mark's LETTERS (OPBY_MARK_LETTER_H): a lockup's letters (Air
  // Canada Express: AIR CANADA over EXPRESS, a third of its file each) stand
  // as tall as the capitals beside them (0.7 of the type), as well as its box
  // being no smaller than the type. tests/gate-caption-render.test.js holds
  // the screen to it, measuring the letters off the drawn file.
  assert.match(CORE, /var _mk = function \(px\) \{\s*var ref = Math\.max\(px, _opLbl\(\)\), need = Math\.max\(ref, _hold\);/);
  assert.match(CORE, /need = Math\.max\(need, padV \+ _CAP \* ref \/ _frac\);/);
  assert.match(CORE, /var _CAP = 0\.75;/);
  assert.match(CORE, /var _frac = \(_logoEl && typeof _opbyLetterH === 'function'\) \? _opbyLetterH\(_logoEl\.getAttribute\('src'\)\) : 1;/);
  assert.match(CORE, /_hold = _capEl\.classList\.contains\('is-pending'\) \? _lh0 : 0;/);
  assert.doesNotMatch(CORE, /_setLh\(Math\.max\(_fs, /, 'every floor of the mark goes through _mk');
  assert.match(CORE, /var _up64 = function \(v\) \{ return Math\.ceil\(v \* 64 - 1e-6\) \/ 64; \};/);
});

test('a long model steps down, then goes to two lines instead of being cut', () => {
  assert.match(CORE, /el\.classList\.add\('is-2line'\);/);
  // v23925 — the caption refits when its operator mark finishes loading (the
  // mark takes no room until it does, so the first fit measured too wide) —
  // in the frame the mark takes its size, before that frame is painted, not
  // on its load event a frame later (tests/fit-no-subpixel-cut.test.js)
  assert.match(CORE, /_fxRefitWhenArtLands\(gView\.querySelectorAll\('\.v2-rc-acb-cap img'\), function \(\) \{\s*if \(window\._gateFitGeneration !== _fitGeneration\) return;/);
  assert.match(CORE, /function _fxRefitWhenArtLands\(imgs, refit\) \{[\s\S]*?if \(imgs\[i\] && !imgs\[i\]\.complete\) list\.push\(imgs\[i\]\);[\s\S]*?im\.addEventListener\('load', go, \{ once: true \}\);/);
  // v23925 — with no registration there is no second line to take: the model
  // keeps stepping down to the label's own size instead of being clipped at
  // the 1.25x floor ('Airbus A3' on a Rouge A321 at YQM gate 4).
  // v23926 keeps that guarantee as the LAST resort (step 6): first the row
  // comes down with the model held at 1.25x its label (step 5), because going
  // straight to the label's size left 'De Havilland Dash 8-300' at 6.7px on a
  // 1024x768 Québec board.
  assert.match(CORE, /if \(!_fits\(\)\) \{\s*try \{ window\.__acbLastResort = \(window\.__acbLastResort \|\| 0\) \+ 1; \} catch \(e6\) \{\}\s*while \(_fs > _lblPx && !_fits\(\)\) \{\s*_fs = Math\.max\(_lblPx, _fs - 0\.5\);/);
  assert.match(CORE, /_fs = Math\.min\(_fs, _mFloor\(_lblPx\)\);/, 'step 5 holds the model at its floor over the label');
  assert.match(CORE, /<span class="v2-rc-acb-sep">\|<\/span>/, 'the separator is addressable so two lines can drop it');
  assert.match(block, /\.is-2line \.v2-rc-acb-sep \{\s*display: none !important;/);
  assert.match(block, /\.is-2line > span:not\(\.v2-rc-reg-expected\):not\(\.v2-rc-acb-sep\)/,
    'the hidden expected qualifier stays hidden in two-line form');
  // Two lines only with a registration (the separator exists only then); a
  // model without one steps on down to the label size on one line.
  assert.match(CORE, /if \(!_fits\(\) && el\.querySelector\('\.v2-rc-acb-sep'\)\) \{\s*el\.classList\.add\('is-2line'\);/);
  assert.match(CORE, /return \(_pending \|\| el\.classList\.contains\('is-2line'\)\) \? lbl : Math\.round\(lbl \* 1\.25 \* 100\) \/ 100;/);
  assert.match(CORE, /_fs = Math\.max\(_lblPx, _fs - 1\)/, 'never below the label size');
});

test('the row comes down as one before the model does, as far as v23904', () => {
  assert.match(CORE, /var _u = _bandH, _uMin = Math\.round\(_bandH \* 0\.875\);/);
  assert.match(CORE, /_capEl\.style\.setProperty\('--acb-h', _u \+ 'px', 'important'\)/);
  // Only the widest rows go further: the row again, with the model held at
  // its floor over the label, never below 0.7 of the band.
  assert.match(CORE, /var _uFloor = Math\.round\(_bandH \* 0\.7\);/);
  // Fitted again when the operator's mark arrives: its width is unknown until
  // the file loads, and a late wordmark otherwise pushes the row out. And when
  // it fails: the onerror fallback puts the operator's name in its place.
  assert.match(CORE, /_logoEl\.addEventListener\('load', _refit, \{ once: true \}\);/);
  assert.match(CORE, /_logoEl\.addEventListener\('error', _refit, \{ once: true \}\);/);
});

test('the band says what it holds: the pending words never sit under the operator', () => {
  // (v23940 adds two more states after these, has-reg and has-widemark;
  // tests/gate-lower-two-colours.test.js pins them.)
  assert.match(CORE, /var _capCls = 'v2-rc-acb-cap' \+ \(_acKnown \? '' : ' is-pending'\) \+ \(_opByVal \? ' has-op' : ''\)\n(?:[ \t]*\/\/[^\n]*\n)*[ \t]*\+ /);
  assert.match(CORE, /'<div class="' \+ _capCls \+ '">' \+ _typeCellHtml \+ '<\/div>'/);
  assert.match(CORE, /'<div class="v2-rc-acb-cap is-pending">'/, 'the fallback caption is pending too');
  // One language over the other, no bar, and laid out by class (no :has()).
  assert.match(ruleFor(CAP + '.is-pending .v2-rc-acb-actype > span:not(.v2-rc-fi-sep)'), /display: block !important;/);
  assert.match(ruleFor(CAP + '.is-pending .v2-rc-acb-actype > .v2-rc-fi-sep'), /display: none !important;/);
  assert.match(ruleFor(CAP + ':not(.has-op)'), /justify-content: center !important;/);
  const op = ruleFor(CAP + ' .v2-rc-acb-opby');
  assert.match(op, /flex: 0 0 auto !important;/, 'the operator half is never squeezed under the words');
  assert.match(op, /border-left: 2px solid /, 'the vertical rule between the halves');
  assert.doesNotMatch(drawn, /:has\(/);
});

// ── v23926: an operator shown by NAME ──────────────────────────────────────
//
// An operator with no mark on file, or whose mark fails to load (the onerror
// fallback), is shown as <b>Name</b>. An older rule held that at a fixed
// 2.7vh (28.35px at 1680x1050), which the fitter could not move, so a long
// name ('Air Wisconsin Airlines') cut the model off. It is drawn on the row's
// scale now, and the fitter brings it down after the model, never below the
// model's own size.

test('an operator shown by name is drawn on the row\'s scale, on one line', () => {
  const name = ruleFor(CAP + ' .v2-rc-acb-opby b');
  const k = (decl) => Number(decl.match(/calc\(var\(--acb-h\) \* ([\d.]+)\)/)[1]);
  const nameK = k(name.match(/font-size: [^;]+;/)[0]);
  assert.match(name, /white-space: nowrap !important;/);
  // Between the label and the model: an operator's name is not the headline.
  assert.ok(nameK > k(ruleFor(CAP + ' .v2-rc-opby-lline')) && nameK < k(ruleFor(CAP + ' .v2-rc-acb-actype')));
  // The fitter finds it, clears its own write before each pass, brings it
  // down after the model, never below the model's size, and with the row.
  assert.match(CORE, /var _nameEl = _logoEl \? null : _capEl\.querySelector\('\.v2-rc-acb-opby b'\);/);
  assert.match(CORE, /if \(_nameEl\) \['font-size', 'white-space', 'display', 'text-wrap', 'line-height', 'max-width'\]\.forEach\(function \(p\) \{ _nameEl\.style\.removeProperty\(p\); \}\);/);
  assert.match(CORE, /while \(_nm > _fs && !_fits\(\)\) \{\s*_nm = Math\.max\(_fs, _nm - 1\);/);
  assert.match(CORE, /_nm = Math\.min\(_nm, Math\.max\(_fs, _nm - 1\)\);/);
});

// The caption branch of the real fitter, run against a model of the band's
// flex row at 1680x1050 (380px wide, 60px high). Widths come from em-widths
// measured on the board's face (the model about 0.51em a character, a name
// 0.45 to 0.58, the labels 0.46); 0.53 is used for both the model and the
// name, a little wide of the average, so the model errs toward not fitting.
function fitCaption({ model, reg, op, nameFixedPx }) {
  const at = CORE.indexOf('function _fitTypePanel(el) {');
  const end = CORE.indexOf("root.querySelectorAll('.gad-map-col-v2 .v2-rc-acb-actype').forEach", at);
  const src = CORE.slice(at, end);
  const style = () => ({ p: {}, setProperty(n, v) { this.p[n] = parseFloat(v); }, removeProperty(n) { delete this.p[n]; } });
  const W = 380, H = 60;
  const capCls = new Set();
  const capEl = { style: style(), classList: { add: (c) => capCls.add(c), remove: (c) => capCls.delete(c), contains: (c) => capCls.has(c) }, clientWidth: W, clientHeight: H, offsetHeight: H };
  const u = () => capEl.style.p['--acb-h'] || H;
  const lblEl = { fs: () => 0.24 * u() };
  const nameEl = { style: style(), fs() { return nameFixedPx || this.style.p['font-size'] || 0.34 * u(); } };
  const cls = new Set();
  const el = {
    style: style(), isConnected: true,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    closest: (s) => (s === '.v2-rc-acb-cap' ? capEl : null),
    querySelector: (s) => (s === '.v2-rc-acb-sep' && reg ? {} : null),
    fs() { return this.style.p['font-size'] || 0.52 * u(); },
  };
  const lay = () => {
    const U = u(), lbl = lblEl.fs();
    const opbyW = 0.2 * U + 2 + 13 * 0.46 * lbl + 0.16 * U + op.length * 0.53 * nameEl.fs();
    const fixed = 2 * 0.16 * U + 9 * 0.46 * lbl + 0.16 * U + 0.2 * U + opbyW;
    const two = cls.has('is-2line');
    const text = (two ? Math.max(model.length, reg.length) : (model + (reg ? ' | ' + reg : '')).length) * 0.53 * el.fs();
    const box = Math.max(0, W - fixed);
    return { box, text, band: Math.max(W, fixed), h: (two ? 2 * 1.08 : 1.02) * el.fs() };
  };
  // Whole pixels for scrollWidth and clientWidth, as a browser reports them;
  // the boxes themselves, the text runs (a Range) and the row's items at
  // their fractional positions.
  const padU = () => 0.16 * u();
  const modelLeft = () => padU() + 9 * 0.46 * lblEl.fs() + 0.16 * u();
  Object.defineProperties(el, {
    clientWidth: { get: () => Math.round(lay().box) }, scrollWidth: { get: () => Math.round(Math.max(lay().box, lay().text)) },
    offsetHeight: { get: () => lay().h },
  });
  el.getBoundingClientRect = () => ({ left: modelLeft(), right: modelLeft() + lay().box, width: lay().box });
  capEl.getBoundingClientRect = () => ({ left: 0, right: W, width: W });
  Object.defineProperty(capEl, 'scrollWidth', { get: () => Math.round(lay().band) });
  Object.defineProperty(capEl, 'children', { get: () => [
    { getBoundingClientRect: () => ({ left: padU(), right: modelLeft() + lay().box, width: 1 }) },
    { getBoundingClientRect: () => ({ left: modelLeft() + lay().box + 0.2 * u(), right: lay().band - padU(), width: 1 }) },
  ] });
  capEl.querySelector = (s) => (s === '.v2-rc-opby-lline' ? lblEl : s === '.v2-rc-acb-opby b' ? nameEl : null);
  const pad = (x) => (x === capEl ? padU() : 0) + 'px';
  const win = { getComputedStyle: (x) => ({ fontSize: (x.fs ? x.fs() : 0) + 'px', paddingLeft: pad(x), paddingRight: pad(x), borderLeftWidth: '0px', borderRightWidth: '0px' }) };
  const doc = { createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ left: modelLeft(), right: modelLeft() + lay().text, width: lay().text }) }) };
  // eslint-disable-next-line no-new-func
  const fit = Function('window', 'document', src + '\nreturn _fitTypePanel;')(win, doc);
  fit(el); fit(el);
  const L = lay();
  return {
    // Exact, not to the whole pixel: overflow:hidden cuts a fraction too.
    fits: L.text <= L.box + 0.01 && L.band <= W + 0.5 && L.h <= H,
    model: el.fs(), name: nameEl.fs(), label: lblEl.fs(), nameSet: 'font-size' in nameEl.style.p, u: u(),
  };
}

test('a long operator name gives way; the model is never cut', () => {
  const cases = [
    { model: 'Bombardier CRJ200', reg: 'N438AW', op: 'Air Wisconsin Airlines', long: true },
    { model: 'Beechcraft 1900D', reg: 'C-GCMJ', op: 'Central Mountain Air', long: true },
    { model: 'Mitsubishi CRJ900', reg: '', op: 'Jazz Aviation LP', long: true },
    { model: 'De Havilland Dash 8-100', reg: 'C-FPAE', op: 'PAL Airlines', long: true },
    { model: 'Embraer E175', reg: 'N21144', op: 'CommuteAir' },
  ];
  for (const c of cases) {
    // At the old fixed 28.35px a long name leaves the row no way to fit.
    if (c.long) assert.equal(fitCaption({ ...c, nameFixedPx: 28.35 }).fits, false, `${c.op}: the fixed name is the fault`);
    const r = fitCaption(c);
    assert.ok(r.fits, `${c.model} beside ${c.op}: nothing cut, nothing out of the band`);
    assert.ok(r.model >= r.label - 0.01, `${c.op}: the model stays at or over its label`);
    if (r.nameSet) assert.ok(r.name >= r.model - 0.01, `${c.op}: the name is never brought below the model (${r.name} < ${r.model})`);
  }
  // A short name is left on the row's scale: the fitter never writes it.
  for (const c of [{ model: 'Airbus A320', reg: '', op: 'Jazz' }, { model: 'Dash 8', reg: '', op: 'Jazz' }]) {
    const r = fitCaption(c);
    assert.ok(r.fits && !r.nameSet && Math.abs(r.name - 0.34 * r.u) < 0.01, `${c.model} beside ${c.op}`);
  }
  assert.equal(fitCaption({ model: 'Dash 8', reg: '', op: 'Jazz' }).u, 60, 'and a row that fits stays at the band');
});

test('a model without a registration holds at 1.25x its label while the row comes down', () => {
  // Each of these needs the row below v23904's size (step 5) in this model.
  for (const c of [
    { model: 'Mitsubishi CRJ900', reg: '', op: 'Jazz Aviation LP' },
    { model: 'Bombardier CRJ200', reg: '', op: 'Air Wisconsin' },
    { model: 'Embraer E175', reg: '', op: 'Air Wisconsin Airlines' },
  ]) {
    const r = fitCaption(c);
    assert.ok(r.fits, `${c.model} beside ${c.op}: nothing cut`);
    assert.ok(r.u < 52.5, `${c.model} beside ${c.op}: the row came down past v23904's size (${r.u})`);
    assert.ok(r.model >= 1.25 * r.label - 0.01, `${c.model}: model ${r.model.toFixed(2)} over label ${r.label.toFixed(2)}`);
  }
});

test('an operator under the marketing carrier\'s own name, with no mark of its own, is left out', () => {
  // AC313 at YQB gate 23: operator 9M, name 'AIR CANADA', no mark on file.
  assert.match(CORE, /var _opSameName6 = !_opLogo6 && !!_mktNm6 && String\(_opNm6\)\.trim\(\)\.toUpperCase\(\) === _mktNm6;/);
  assert.match(CORE, /if \(!_opSameName6\) \{\s*_opByVal = _opLogo6/);
  assert.match(CORE, /'9M':'AIR CANADA'/, 'the board names 9M Air Canada on purpose');
});

// ── v24004: ONE ROW, ALWAYS, AND THE ART IN THE SKY THE BAND LEAVES ─────────
//
// YOW gate 25, 1680x1050, en+fr, Air Canada Express with no aircraft yet: the
// fitter's step 7a put the operator under the aircraft whenever the row could
// not hold the operator's mark at its full height. The band went to two
// full-width rows (121px over 60) and covered the foot of the roundel above
// it. The caption is one row now in every language, and the art's box ends
// on the band's real top.

const fitSrc = () => {
  const at = CORE.indexOf('function _fitTypePanel(el) {');
  return CORE.slice(at, CORE.indexOf("root.querySelectorAll('.gad-map-col-v2 .v2-rc-acb-actype').forEach", at));
};

test('the caption is never stacked: no step puts the operator under the aircraft', () => {
  const src = fitSrc();
  assert.doesNotMatch(src, /acb-stack/, 'step 7a is gone');
  assert.doesNotMatch(src, /setProperty\('flex-direction'/);
  assert.doesNotMatch(CSS, /\.acb-stack/, 'and so is its layout');
  // nothing lays the band out as a column, or wraps it onto a second row
  // (the rules that draw it: v23926 and after; an older :has() rule that
  // stacked it, v23790, is out-ranked by them and dropped on the kiosks)
  const capRules = drawn.split('}').filter((r) => /\.v2-rc-acb-cap(\.[\w-]+|:not\([^)]*\))* \{/.test(r));
  assert.ok(capRules.length >= 3, 'the band\'s own rules: ' + capRules.length);
  for (const r of capRules) {
    assert.doesNotMatch(r, /flex-direction: column/, 'no rule stacks the band: ' + r.split('{')[0].slice(-80));
    assert.doesNotMatch(r, /flex-wrap: wrap/, 'no rule wraps the band: ' + r.split('{')[0].slice(-80));
  }
  // what goes into two tiers is INSIDE a half: the operator's labels over
  // its mark, a model's labels over the model; never the halves themselves
  const tail = CSS.slice(CSS.indexOf('v24004 — THE CAPTION IS ONE ROW, AND THE ART SITS IN THE SKY IT LEAVES'));
  const tiers = tail.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter((r) => /flex-direction: column/.test(r)).map((r) => r.split('{')[0].trim().split(' ').slice(-2).join(' '));
  assert.deepEqual(tiers, ['.v2-rc-acb-cap.acb-opstack .v2-rc-acb-opby', '.v2-rc-acb-cap.acb-acstack .v2-rc-acb-ac']);
  // the condensed width (75%) is gone: the words read visibly smaller in it
  assert.doesNotMatch(src + tail, /acb-cond/);
  // the order after the sizes: with no model yet the held mark comes down
  // to rule 1's floor and then the row narrows; with a model the row
  // narrows and the model opens between maker and type; then the operator's
  // labels stand over its mark, a model's labels over the model, the
  // pending words open, an operator's name opens, and only then the mark
  // under rule 1 (reported), and a word broken (reported)
  const order = [
    "if (_pending && !_fits() && _logoEl) {\n                _hold = 0;",
    "if (_pending && !_fits()) _capEl.classList.add('acb-narrow');",
    "if (!_pending && !_fits()) {\n                _capEl.classList.add('acb-narrow');",
    "el.style.setProperty('white-space', 'normal', 'important');",
    "_capEl.classList.add('acb-opstack');",
    "_capEl.classList.add('acb-acstack');",
    "el.classList.add('acb-open');",
    "_nameEl.style.setProperty('text-wrap', 'balance', 'important');",
    "_capEl.setAttribute('data-acb-r1', 'short');",
    "el.setAttribute('data-fx-over', '1');",
  ].map((t) => src.indexOf(t));
  assert.ok(order.every((i) => i > 0) && order.every((i, k) => !k || i > order[k - 1]), 'S1 to S6 in that order: ' + order);
  // nothing is ever left drawn over the other half
  assert.doesNotMatch(src, /setProperty\('overflow', 'visible', 'important'\);\s*try \{ console\.warn\('\[fit\] aircraft caption/);
  // each is cleared before the next pass
  assert.match(src, /el\.classList\.remove\('acb-open'\);/);
  assert.match(src, /\['acb-narrow', 'acb-opstack', 'acb-acstack', 'acb-grown'\]\.forEach\(function \(c\) \{ _capEl\.classList\.remove\(c\); \}\);/);
  assert.match(src, /_capEl\.removeAttribute\('data-acb-r1'\)/);
});

test('every mark\'s lettering share is a share, and the lockups are on file', () => {
  const at = CORE.indexOf('var OPBY_MARK_LETTER_H = {');
  assert.ok(at > 0, 'the table exists');
  const body = CORE.slice(at, CORE.indexOf('};', at));
  const rows = [...body.matchAll(/'([^']+)':\s*([\d.]+)/g)].map((m) => [m[1], +m[2]]);
  for (const [f, k] of rows) {
    assert.ok(k > 0 && k < 1, f + ': ' + k);
    assert.ok(fs.existsSync(path.join(root, 'fids-current', f)), f + ' is on disk');
  }
  const has = new Map(rows);
  // the reported lockup and the others measured under 0.7 of their files
  assert.ok(has.get('/logos/airlines/canadian-regional/aircanada-express-wordmark-light.svg') <= 0.35);
  assert.ok(has.get('/logos/airlines/canadian-regional/pal-airlines-wordmark-light.svg') <= 0.66);
  assert.ok(has.get('/logos/airlines/us-regional/endeavor-air-monochrome-white.svg') <= 0.23);
  // every caption mark on file (both halves of every pair, and the base
  // wordmarks) that the table names is one the caption can draw
  const caption = new Set();
  for (const name of ['OPERATOR_WORDMARKS', 'OPBY_WORDMARKS_THEMED']) {
    const a = CORE.indexOf('var ' + name + ' = {');
    (CORE.slice(a, CORE.indexOf('\n};', a)).match(/\/logos\/[^'"]+\.(svg|png)/g) || []).forEach((x) => caption.add(x));
  }
  for (const [f] of rows) assert.ok(caption.has(f), f + ' is a caption mark');
  // and the fitter reads it
  const fn = CORE.slice(CORE.indexOf('function _opbyLetterH(src) {'), CORE.indexOf('function _opbyLetterH(src) {') + 300);
  assert.match(fn, /OPBY_MARK_LETTER_H\[p\]/);
});

test('the art ends on the band\'s real top, so a taller band never covers it', () => {
  const tail = CSS.slice(CSS.indexOf('v24004 — THE CAPTION IS ONE ROW, AND THE ART SITS IN THE SKY IT LEAVES'));
  assert.ok(tail.length > 100, 'the v24004 block exists');
  const rule = (sel) => {
    const at = tail.indexOf(sel + ' {');
    assert.ok(at >= 0, 'no v24004 rule for ' + sel);
    const line = tail.slice(tail.lastIndexOf('\n', at) + 1, at);
    // it out-ranks every earlier rule on these elements (255 ids, then classes)
    assert.ok((line.match(/:not\(\._\)/g) || []).length >= 13 && (line.match(/:not\(#_\)/g) || []).length >= 255, sel);
    return tail.slice(at, tail.indexOf('}', at));
  };
  assert.match(rule('.gad-map-col-v2 > .v2-rc-shelf-illus > .v2-rc-aircraft-hold'),
    /height: calc\(100% - var\(--rcp-cap-live, var\(--rcp-cap\)\) - var\(--rcp-sheet\)\) !important;/);
  assert.match(rule('.gad-map-col-v2 > .v2-rc-shelf-illus > .v2-rc-aircraft-img'),
    /bottom: calc\(var\(--rcp-cap-live, var\(--rcp-cap\)\) \+ var\(--rcp-sheet\)\) !important;/);
  // the emblem is held inside its box, whatever its own height asks for
  assert.match(rule('.gad-map-col-v2 > .v2-rc-shelf-illus > .v2-rc-aircraft-hold > .v2-rc-aircraft-hold-logo'), /max-height: 100% !important;/);
  // the fitter writes the band's real height after every pass, after the fit
  const src = fitSrc();
  assert.match(src, /var _liveH = _capEl\.getBoundingClientRect\(\)\.height;\s*if \(_liveH > 0\) _illusEl\.style\.setProperty\('--rcp-cap-live', \(Math\.ceil\(_liveH \* 64\) \/ 64\) \+ 'px'\);/);
  assert.ok(src.indexOf("'--rcp-cap-live'") > src.indexOf("console.warn('[fit] aircraft caption does not fit"));
  // (Where the art lands is judged on the screen: the emblem drawn between
  // the panel's top and the band's top, and the aircraft at every point of
  // its float, by tests/gate-caption-render.test.js, which fails on a band
  // the art does not follow.)
  assert.ok(fs.existsSync(path.join(__dirname, 'gate-caption-render.test.js')));
});
