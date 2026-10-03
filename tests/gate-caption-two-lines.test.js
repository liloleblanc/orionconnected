'use strict';

// WHY THIS EXISTS
//
// The caption under the gate aircraft is the aircraft section of the lower
// right panel, under that panel's "Your Aircraft | Votre Avion" banner. Since
// v23934 it is TWO LINES:
//
//   Mitsubishi CRJ900                          the model, alone
//   C-FUJZ | Operated By:    [Jazz]            the registration, then the
//            Exploité par:                     operator, when there is either
//
// This replaces v23904's one row ("Aircraft: / Appareil:" beside the model,
// then "Operated By" and the mark) for this panel. It was chosen from the
// 2026-10-02 pick sheet with the two lines in view: on one 380px row a model,
// a registration and an operator's mark could not sit above the banner's
// size (19.7px under its 20.16px for a Jazz CRJ900; 11.4px for a PAL-operated
// Dash 8-300 at 1280x720). On a line of its own the model has the panel's
// whole width. The label pair beside the model is gone: the banner says it.
//
// Sizes are measured against the banner's type: the model starts at 1.5x it
// and never goes below 1.25x; the second line (the registration's type and
// the mark's height together, so the mark is never smaller than the type
// beside it) starts at the model's size, never larger, and never below the
// banner's. The real fitter (_fitTypePanel's caption branch) is run below
// against a model of the band at 1680x1050 and 1280x720.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const AT = CSS.indexOf('v23934 — THE LOWER RIGHT PANEL OPENS LIKE A LEFT CARD');
const BLOCK = AT >= 0 ? CSS.slice(CSS.lastIndexOf('/*', AT)) : '';
const RULES = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');
const CAP = '.gad-map-col-v2 > .v2-rc-shelf-illus .v2-rc-acb-cap';

/** Declarations of every rule in the v23934 block whose last selector ends with `tail`. */
function ruleFor(tail) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  const out = [];
  let m;
  while ((m = re.exec(RULES))) {
    const sels = m[1].split(/,\s*\n/).map((s) => s.trim());
    if (sels[sels.length - 1].endsWith(tail)) out.push(m[2]);
  }
  assert.ok(out.length, `no v23934 rule for ${tail}`);
  return out.join('\n');
}
/** The caption builder in _buildV2MapCol: from the model's values to the panel's markup. */
const BUILD = (() => {
  const a = CORE.indexOf('var _acModelVal, _acRegVal = \'\';');
  const b = CORE.indexOf('_aircraftBlock =', a);
  assert.ok(a > 0 && b > a, 'the caption builder is in fids-core.js');
  return CORE.slice(a, b);
})();

test('the caption is two lines: the model alone, then the registration and the operator', () => {
  assert.ok(BLOCK.length > 1000, 'the v23934 block is in display-overrides.css');
  // The model and the registration are separate values now, and the
  // registration leaves line 1 whenever there is a model to leave there.
  assert.match(BUILD, /_acModelVal = _nbw\(_acModel\);\s*_acRegVal = _acReg \? _nbw\(_acReg \+ _acRegTag\) : '';/);
  assert.match(BUILD, /\} else \{\s*_acModelVal = _nbw\(_acReg \+ _acRegTag\);\s*\}/, 'a tail with no type yet leads line 1 itself');
  // An unconfirmed type keeps its 'expected' qualifier on the model.
  assert.match(BUILD, /_acModelVal = _nbw\(_acModel\) \+ _acExpTag;\s*_acRegVal = _nbw\(_acReg \+ _acRegTag\);/);
  assert.match(BUILD, /'<div class="v2-rc-acb-actype v2-rc-actype-val">' \+ \(_acKnown \? _acModelVal : _pendingAircraftText\) \+ '<\/div>'/);
  assert.match(BUILD, /var _acRow2 = \(_acKnown && _acRegVal \? '<span class="v2-rc-acb-reg">' \+ _acRegVal \+ '<\/span>' : ''\)/);
  assert.match(BUILD, /\+ \(_acRow2 \? '<div class="v2-rc-acb-row2">' \+ _acRow2 \+ '<\/div>' : ''\);/, 'the second line only when it has something on it');
  // The band says what it holds (no :has() on the kiosks).
  assert.match(BUILD, /var _capCls = 'v2-rc-acb-cap' \+ \(_acKnown \? '' : ' is-pending'\) \+ \(_opByVal \? ' has-op' : ''\) \+ \(_acRow2 \? ' has-row2' : ''\);/);
  // Drawn as a column of two lines, no separator left on line 1.
  const cap = ruleFor(CAP);
  assert.match(cap, /flex-direction: column !important;/);
  assert.match(cap, /height: var\(--rcl-cap\) !important;/);
  assert.match(ruleFor(CAP + ' > .v2-rc-acb-row2'), /flex-direction: row !important;\s*flex-wrap: nowrap !important;/);
  assert.doesNotMatch(BUILD, /v2-rc-acb-sep/, 'no bar between the model and the registration: they are on two lines');
});

test('no "Aircraft: / Appareil:" beside the model: the banner says it', () => {
  assert.doesNotMatch(BUILD, /_gateLbl\('aircraft'/, 'the caption builds no Aircraft label');
  assert.doesNotMatch(BUILD, /v2-rc-acb-lbl/, 'and emits no label cell');
  // The operator keeps its own label pair, in the airport's language order.
  assert.match(CORE, /var _opByLbl = _gateLbl\('operatedBy', _frF8,/);
});

test('an unknown aircraft shows the pending words, the fallback caption too', () => {
  assert.match(CORE, /var _acKnown = !!\(_acModel \|\| _acReg\);/);
  assert.match(CORE, /'<div class="v2-rc-acb-cap is-pending">'/, 'the fallback caption is pending');
  assert.match(ruleFor(CAP + '.is-pending .v2-rc-acb-actype > span:not(.v2-rc-fi-sep)'), /display: block !important;/, 'one language over the other');
  assert.match(ruleFor(CAP + '.is-pending .v2-rc-acb-actype > .v2-rc-fi-sep'), /display: none !important;/);
});

test('the sizes: the model from 1.5x the banner, the mark as tall as the type beside it', () => {
  const tok = (n) => RULES.match(new RegExp(n.replace(/[-]/g, '\\-') + ':\\s*([^;]+);'))[1].trim();
  assert.equal(tok('--rcl-ban'), 'var(--fi-title-fs)', 'the banner\'s type is the left titles\', by name');
  assert.equal(tok('--rcl-vs'), 'calc(var(--rcl-ban) * 1.5)');
  assert.match(ruleFor(CAP + ' .v2-rc-acb-actype'), /font-size: var\(--rcl-ms, var\(--rcl-vs\)\) !important;/);
  assert.match(ruleFor(CAP + ' .v2-rc-acb-reg'), /font-size: var\(--rcl-r2, var\(--rcl-ms, var\(--rcl-vs\)\)\) !important;/);
  const logo = ruleFor(CAP + ' .v2-rc-opby-logo');
  assert.match(logo, /height: var\(--rcl-r2, var\(--rcl-vs\)\) !important;/, 'the mark is the second line\'s size');
  assert.match(logo, /max-width: none !important;/, 'no width cap to shrink it under the type');
  assert.match(ruleFor(CAP + ' .v2-rc-acb-opby b'), /font-size: var\(--rcl-r2, var\(--rcl-vs\)\) !important;/);
  // The fitter writes the two sizes on the band, on the 1/64px grid.
  assert.match(CORE, /var _setS = function \(v\) \{ _capEl\.style\.setProperty\('--rcl-ms', v \+ 'px'\); \};/);
  assert.match(CORE, /var _setR = function \(v\) \{ _capEl\.style\.setProperty\('--rcl-r2', v \+ 'px'\); \};/);
  assert.match(CORE, /var _sFloor = _up64\(_ban \* 1\.25\), _rFloor = _up64\(_ban\);/);
  // Fitted again when the operator's mark arrives, and when it fails.
  assert.match(CORE, /_logoEl\.addEventListener\('load', _refit, \{ once: true \}\);/);
  assert.match(CORE, /_logoEl\.addEventListener\('error', _refit, \{ once: true \}\);/);
  assert.match(CORE, /gView\.querySelectorAll\('\.v2-rc-acb-cap img'\)\.forEach\(function \(im\) \{\s*if \(im\.complete\) return;/);
});

// ── the real fitter, on a model of the band ──────────────────────────────────
// Widths are char counts times em-widths measured on the board's face (the
// model 0.48-0.51em a character in Bricolage 900; 0.53 is used so the model
// errs toward not fitting), a registration 0.62em, the sub-label 0.5em of its
// own size, a mark its aspect ratio times its height (Jazz 3.7, PAL 6.2).
function fitCaption({ W, H, py, padx, ban, model, reg, op, pending }) {
  const at = CORE.indexOf('function _fitTypePanel(el) {');
  const end = CORE.indexOf("root.querySelectorAll('.gad-map-col-v2 .v2-rc-acb-actype').forEach", at);
  const src = CORE.slice(at, end);
  const vs = ban * 1.5, sl = Math.max(10, ban * 0.655), rg = vs * 0.1, lh = 1.04;
  const style = () => ({ p: {}, setProperty(n, v) { this.p[n] = parseFloat(v); }, removeProperty(n) { delete this.p[n]; }, getPropertyValue(n) { return this.p[n] ? this.p[n] + 'px' : ''; } });
  const cls = new Set(pending ? ['is-pending'] : []);
  const cap = { style: style(), classList: { contains: (c) => cls.has(c) }, clientWidth: W, clientHeight: H };
  const panel = {};
  const banEl = { fs: () => ban };
  const s = () => cap.style.p['--rcl-ms'] || vs;
  const r = () => cap.style.p['--rcl-r2'] || s();
  const pend = () => (el.style.p['font-size'] || ban * 0.82 * (op || reg ? 0.9 : 1));
  const el = { style: style(), isConnected: true, classList: { remove() {}, contains: () => false }, fs: () => (pending ? pend() : s()) };
  const L = padx, R = W - padx, T = py, B = H - py;
  const two = !!(reg || op);
  const subEl = { fs: () => sl };
  const regW = () => (reg ? reg.length * 0.62 * r() : 0);
  const divW = () => (reg && op ? 0.62 * r() + 3 : 0);
  const opW = () => (op ? 13 * 0.5 * sl + 0.25 * r() + op.aspect * r() : 0);
  const textW = () => (pending ? 29 * 0.5 * pend() : model.length * 0.53 * s());
  const line1H = () => (pending ? 2 * 1.08 * pend() : lh * s());
  const line2H = () => (two ? Math.max(lh * r(), op ? r() : 0, op ? 2 * 1.05 * sl : 0) : 0);
  const top = () => (H - (line1H() + (two ? rg + line2H() : 0))) / 2;   // centred in the band
  const row2 = {
    querySelectorAll: () => [
      reg && { getBoundingClientRect: () => ({ left: L, right: L + regW(), width: regW() }) },
      op && { getBoundingClientRect: () => ({ left: L + regW() + divW(), right: L + regW() + divW() + opW(), width: opW() }) },
    ].filter(Boolean),
    getBoundingClientRect: () => ({ top: top() + line1H() + rg, bottom: top() + line1H() + rg + line2H() }),
  };
  const logo = op && op.mark ? { style: style(), complete: true, naturalWidth: 100, dataset: {}, src: 'x' } : null;
  const name = op && !op.mark ? { style: style() } : null;
  cap.closest = (q) => (q === '.v2-rc-shelf-illus' ? panel : null);
  panel.querySelector = (q) => (/v2-rc-lp-banner/.test(q) ? banEl : null);
  cap.querySelector = (q) => ({ '.v2-rc-acb-row2': two ? row2 : null, 'img.v2-rc-opby-logo': logo, '.v2-rc-acb-opby b': name, '.v2-rc-opby-lline': op ? subEl : null })[q] || null;
  cap.getBoundingClientRect = () => ({ left: 0, right: W, top: 0, bottom: H });
  el.closest = (q) => (q === '.v2-rc-acb-cap' ? cap : null);
  Object.defineProperties(el, { clientWidth: { get: () => Math.round(R - L) }, scrollWidth: { get: () => Math.round(Math.max(R - L, textW())) } });
  el.getBoundingClientRect = () => ({ left: L, right: R, top: top(), bottom: top() + line1H() });
  const pad = (x) => (x === cap ? { t: py, l: padx } : { t: 0, l: 0 });
  const win = {
    innerHeight: 1050,
    getComputedStyle: (x) => ({ fontSize: (x.fs ? x.fs() : 0) + 'px', paddingLeft: pad(x).l + 'px', paddingRight: pad(x).l + 'px', paddingTop: pad(x).t + 'px', paddingBottom: pad(x).t + 'px', borderLeftWidth: '0px', borderRightWidth: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }),
  };
  const doc = { createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ left: L, right: L + textW(), width: textW() }) }) };
  // eslint-disable-next-line no-new-func
  const fit = Function('window', 'document', src + '\nreturn _fitTypePanel;')(win, doc);
  win.__acbLastResort = 0;
  fit(el); fit(el);
  const fits = textW() <= R - L + 0.01 && (!two || regW() + divW() + opW() <= R - L + 0.5) && top() >= T - 0.5 && top() + line1H() + (two ? rg + line2H() : 0) <= B + 0.5;
  return { fits, model: s(), row2: two ? r() : null, last: win.__acbLastResort, ban };
}
const B1680 = { W: 380.39, H: 77.47, py: 5.78, padx: 11.76, ban: 20.16 };
const B720 = { W: 288.39, H: 57.05, py: 4, padx: 8.96, ban: 15 };
const B1080 = { W: 435.59, H: 79.67, py: 5.94, padx: 13.44, ban: 20.74 };
const JAZZ = { aspect: 3.7, mark: true }, PAL = { aspect: 6.2, mark: true };

test('the model is clearly larger than the banner in every case, and nothing is cut', () => {
  const cases = [
    { model: 'Mitsubishi CRJ900', reg: 'C-FUJZ', op: JAZZ },
    { model: 'De Havilland Dash 8-400', reg: 'C-GGOK', op: JAZZ },
    { model: 'De Havilland Dash 8-300', reg: 'C-GPAL', op: PAL },
    { model: 'De Havilland Dash 8-300', reg: '', op: PAL },
    { model: 'De Havilland Dash 8-400', reg: '' },
    { model: 'Boeing 737 MAX 8', reg: 'C-FBWS' },
    { model: 'Airbus A220-300', reg: 'C-GJXE' },
  ];
  for (const size of [B1680, B720, B1080]) {
    for (const c of cases) {
      const r = fitCaption({ ...size, ...c });
      const what = `${c.model}${c.reg ? ' | ' + c.reg : ''}${c.op ? ' + mark' : ''} at ${size.W}px`;
      assert.ok(r.fits, `${what}: nothing cut, nothing out of the band`);
      assert.equal(r.last, 0, `${what}: no last resort`);
      assert.ok(r.model >= 1.25 * r.ban - 0.01, `${what}: model ${r.model.toFixed(2)} is at least 1.25x the banner's ${r.ban}`);
      if (r.row2 !== null) {
        assert.ok(r.row2 <= r.model + 0.01, `${what}: the second line (${r.row2}) is never larger than the model (${r.model})`);
        assert.ok(r.row2 >= r.ban - 0.01, `${what}: the second line (${r.row2}) is never under the banner (${r.ban})`);
      }
    }
  }
  // A model that fits stays at the top size, 1.5x the banner.
  const crj = fitCaption({ ...B1680, model: 'Mitsubishi CRJ900', reg: 'C-FUJZ', op: JAZZ });
  assert.ok(Math.abs(crj.model - 20.16 * 1.5) < 0.02, `CRJ900 at ${crj.model}`);
});

test('a model too long for its floor comes down further rather than being cut, and says so', () => {
  const r = fitCaption({ ...B720, model: 'Bombardier Challenger 650 Executive', reg: '' });
  assert.ok(r.fits, 'it fits');
  assert.ok(r.model < 1.25 * r.ban, 'below the floor');
  assert.ok(r.last > 0, 'counted as a last resort for the harness');
});

test('the pending words keep their size; the operator\'s mark beside them is never under the banner', () => {
  for (const size of [B1680, B720]) {
    const r = fitCaption({ ...size, model: '', pending: true, reg: '', op: PAL });
    assert.ok(r.fits, `pending + PAL at ${size.W}px fits`);
    assert.ok(r.row2 >= r.ban - 0.01, `the mark (${r.row2}) is at least the banner (${r.ban})`);
  }
});

test('an operator under the marketing carrier\'s own name, with no mark of its own, is left out', () => {
  // AC313 at YQB gate 23: operator 9M, name 'AIR CANADA', no mark on file.
  assert.match(CORE, /var _opSameName6 = !_opLogo6 && !!_mktNm6 && String\(_opNm6\)\.trim\(\)\.toUpperCase\(\) === _mktNm6;/);
  assert.match(CORE, /if \(!_opSameName6\) \{\s*_opByVal = _opLogo6/);
  assert.match(CORE, /'9M':'AIR CANADA'/, 'the board names 9M Air Canada on purpose');
});
