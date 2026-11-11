// v24144: a board is never loaded where nobody can see it, and is repainted when shown.
// Runs the shipped block from fids-core.js against a small fake page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CORE = readFileSync(new URL('../fids-current/js/fids-core.js', import.meta.url), 'utf8');
const start = CORE.indexOf('var _fidsReloadWhenShown = false;');
const end = CORE.indexOf('// ── BUILD WATCHDOG', start);
assert.ok(start > 0 && end > start, 'the block is in fids-core.js');
const BLOCK = CORE.slice(start, end);

function page({ hidden, readyState = 'complete', store = {} }) {
  const docL = {}, winL = {}, frames = [];
  const body = { style: { opacity: '' }, attrs: {}, getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const ctx = {
    reloads: 0,
    document: { hidden, readyState, body, addEventListener: (n, f) => { docL[n] = f; } },
    window: { addEventListener: (n, f) => { winL[n] = f; }, requestAnimationFrame: (f) => frames.push(f) },
    requestAnimationFrame: (f) => frames.push(f),
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    location: { reload() { ctx.reloads++; } },
    Date, setTimeout,
  };
  vm.runInNewContext(BLOCK + '\nthis.shouldReload = _fidsHiddenLoadShouldReload; this.flag = function (v) { _fidsReloadWhenShown = v; };', ctx);
  return { ctx, docL, winL, frames, body, store, show() { ctx.document.hidden = false; docL.visibilitychange(); }, hide() { ctx.document.hidden = true; docL.visibilitychange(); } };
}

test('the rule: only a hidden load reloads, and not twice inside a minute', () => {
  const p = page({ hidden: false });
  assert.equal(p.ctx.shouldReload(false, 0, 1e6), false);
  assert.equal(p.ctx.shouldReload(true, 0, 1e6), true);
  assert.equal(p.ctx.shouldReload(true, 1e6 - 59000, 1e6), false);
  assert.equal(p.ctx.shouldReload(true, 1e6 - 61000, 1e6), true);
});

test('a page loaded in view never reloads; being shown again repaints it for two frames', () => {
  const p = page({ hidden: false });
  p.hide(); p.show();
  assert.equal(p.ctx.reloads, 0);
  assert.equal(p.body.style.opacity, '0.999');
  p.frames.shift()(); p.frames.shift()();
  assert.equal(p.body.style.opacity, '');
  assert.equal(p.body.getAttribute('data-fids-repaint'), null);
});

test('a page that finished loading while hidden reloads once when first shown', () => {
  const p = page({ hidden: true });
  p.show();
  assert.equal(p.ctx.reloads, 1);
  assert.ok(+p.store.fids_hidden_load_reload > 0, 'the session mark is written');
  // the reloaded page, loaded hidden again within the minute, does not loop
  const again = page({ hidden: true, store: p.store });
  again.show();
  assert.equal(again.ctx.reloads, 0);
  assert.equal(again.body.style.opacity, '0.999');
});

test('a page still loading when it is shown is not a hidden load', () => {
  const p = page({ hidden: true, readyState: 'loading' });
  p.ctx.document.hidden = false;
  p.winL.load();
  p.hide(); p.show();
  assert.equal(p.ctx.reloads, 0);
});

test('a build the watchdog held back while hidden loads the moment the page is shown', () => {
  const p = page({ hidden: false });
  p.hide();
  p.ctx.flag(true);
  p.show();
  assert.equal(p.ctx.reloads, 1);
});

test('the watchdog holds a hidden reload, for twenty minutes at most', () => {
  const w = CORE.slice(end, end + 4000);
  assert.match(w, /if \(document\.hidden\) \{\s*if \(!_fidsReloadWhenShown\) \{ _fidsReloadWhenShown = true; _hiddenSince = Date\.now\(\); \}\s*if \(Date\.now\(\) - _hiddenSince < 20 \* 60000\) return;/);
});
