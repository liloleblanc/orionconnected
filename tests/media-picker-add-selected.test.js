'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23752 — "ADD SELECTED" MUST NEVER DISCARD THE SELECTION IN SILENCE.
//
// Reported as the picker ejecting the operator the instant Add Selected was
// pressed: nothing assigned, no message, dialog gone. It was reported first as
// a login problem and then as an upload problem, and it was neither — but
// nothing on screen could distinguish those, which is the actual defect here.
//
// The old body was:
//
//     if (!_currentAirline || !_pickerSlot) return mediaPickerClose();
//
// One missing piece of picker state and it closed the dialog, dropped every
// tick and said nothing. From the outside that is indistinguishable from a
// crash, a logout or a misclick. _onMediaTabOpen() replaces _assignWorking
// wholesale AND sets _currentAirline = null, so anything that re-enters the
// Media tab while the picker is open strands it in exactly that state.
//
// Two rules now hold, and they are what this file tests:
//   1. RECOVER where recovery is possible — re-read the airline from the
//      <select> that is on screen, and rebuild the working entry.
//   2. When it truly cannot proceed, SAY SO and leave the dialog open with the
//      ticks intact, so nothing has to be done twice.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'menu.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'fids-current', 'menu.html'), 'utf8');

// ── a DOM small enough to be obvious, real enough to catch the bug ─────────
function makeDom() {
  const byId = new Map();
  function el(id, style) {
    const node = {
      id,
      textContent: '',
      style: Object.assign({ display: '' }, style || {}),
      children: [],
      parentNode: null,
      _styleAttr: (style && style._attr) || '',
      querySelector(sel) {
        const m = /^#(.+)$/.exec(sel);
        if (m) return this.children.find((c) => c.id === m[1]) || null;
        const s = /^div\[style\*="(.+)"\]$/.exec(sel);
        if (s) return this.children.find((c) => (c._styleAttr || '').includes(s[1])) || null;
        return null;
      },
    };
    if (id) byId.set(id, node);
    return node;
  }
  const modal = el('mlPickerModal');
  modal.style.display = 'none';
  const add = (node) => { node.parentNode = modal; modal.children.push(node); return node; };
  add(el('mlPickerList'));
  const flash = add(el('mlPickerFlash', { display: 'none' }));
  add(el('mlPickerFooter', { _attr: 'margin-top:12px;display:flex;gap:8px;' }));
  const sel = el('mlAssignAirline');
  sel.value = '';

  return {
    byId,
    modal,
    flash,
    select: sel,
    document: {
      getElementById: (id) => byId.get(id) || null,
      createElement: () => el(null),
    },
  };
}

// Lift the real functions and run them against that DOM.
function harness(dom, state) {
  function liftWindow(name) {
    const at = JS.indexOf('window.' + name + ' = function');
    assert.ok(at >= 0, `menu.js must still define ${name}`);
    let d = 0;
    for (let k = JS.indexOf('{', at); k < JS.length; k++) {
      if (JS[k] === '{') d++;
      else if (JS[k] === '}') { d--; if (d === 0) return JS.slice(at, k + 1) + ';'; }
    }
    throw new Error('unterminated ' + name);
  }
  function liftFn(name) {
    const at = JS.indexOf('function ' + name + '(');
    assert.ok(at >= 0, `menu.js must still define ${name}`);
    let d = 0;
    for (let k = JS.indexOf('{', at); k < JS.length; k++) {
      if (JS[k] === '{') d++;
      else if (JS[k] === '}') { d--; if (d === 0) return JS.slice(at, k + 1); }
    }
    throw new Error('unterminated ' + name);
  }

  const src = `
    var _currentAirline = state.currentAirline;
    var _pickerSlot = state.pickerSlot;
    var _pickerSelected = state.selected;
    var _assignWorking = state.working;
    var assignMsg = null;
    function _renderAssignList() {
      // Stands in for anything downstream that can fail — a re-render against
      // a half-built entry, say. Used to drive the catch path, which is
      // otherwise unreachable and therefore untested.
      if (state.explode) throw new Error('render blew up');
    }
    function _assignFlash(m) { assignMsg = m; }
    ${liftFn('_pickerFlash')}
    ${liftFn('_pickerClearFlash')}
    ${liftWindow('mediaPickerClose')}
    ${liftWindow('mediaPickerConfirm')}
    // In the browser these are globals, so mediaPickerConfirm can call
    // mediaPickerClose() by bare name. Inside new Function they are only
    // properties of the fake window, so alias them or every success path
    // throws ReferenceError and the test blames the product for it.
    var mediaPickerClose = window.mediaPickerClose;
    window.mediaPickerConfirm();
    return { working: _assignWorking, selected: _pickerSelected,
             airline: _currentAirline, assignMsg: assignMsg };
  `;
  const win = {};
  const out = new Function('document', 'window', 'state', 'alert', 'console', src)(
    dom.document, win, state, () => {}, { warn() {}, error() {} });
  return out;
}

const flashText = (dom) =>
  (dom.flash.style.display !== 'none' ? dom.flash.textContent : '');
const isOpen = (dom) => dom.modal.style.display !== 'none';

test('the airline is recovered from the on-screen select when the state was lost', () => {
  // The exact stranding _onMediaTabOpen creates: working copy replaced,
  // _currentAirline nulled, while the picker is still open with ticks in it.
  const dom = makeDom();
  dom.modal.style.display = 'flex';
  dom.select.value = 'AC';
  const out = harness(dom, {
    currentAirline: null, pickerSlot: 'images',
    selected: { promo1: true }, working: { airlines: {} },
  });
  assert.ok(out.working.airlines.AC, 'the airline entry must be rebuilt, not surrendered');
  assert.deepEqual(out.working.airlines.AC.images.itemIds, ['promo1'],
    'the ticked item must actually be assigned');
  assert.equal(isOpen(dom), false, 'and the dialog closes because it succeeded');
});

test('with no airline anywhere it explains and KEEPS the dialog and the ticks', () => {
  // The heart of it. Closing here is what made the fault unreadable.
  const dom = makeDom();
  dom.modal.style.display = 'flex';
  dom.select.value = '';
  const out = harness(dom, {
    currentAirline: null, pickerSlot: 'images',
    selected: { promo1: true }, working: { airlines: {} },
  });
  assert.equal(isOpen(dom), true,
    'the dialog must stay open — closing it is what looked like being thrown out');
  assert.match(flashText(dom), /No airline is selected/,
    'and it must say why, on screen, not only in the console');
  assert.deepEqual(out.selected, { promo1: true },
    'the selection must survive so nothing has to be ticked twice');
});

test('with no slot it explains rather than closing', () => {
  const dom = makeDom();
  dom.modal.style.display = 'flex';
  dom.select.value = 'AC';
  harness(dom, {
    currentAirline: 'AC', pickerSlot: null,
    selected: { promo1: true }, working: { airlines: {} },
  });
  assert.equal(isOpen(dom), true, 'still open');
  assert.match(flashText(dom), /Pick images or videos first/);
});

test('re-adding something already assigned says so instead of closing blankly', () => {
  // Previously this closed the dialog having changed nothing, which reads
  // exactly like a failure even though the state was already correct.
  const dom = makeDom();
  dom.modal.style.display = 'flex';
  dom.select.value = 'AC';
  harness(dom, {
    currentAirline: 'AC', pickerSlot: 'images', selected: { x: true },
    working: { airlines: { AC: {
      images: { mode: 'rotate', itemIds: ['x'], primaryId: 'x' },
      videos: { mode: 'rotate', itemIds: [], primaryId: null },
    } } },
  });
  assert.equal(isOpen(dom), true);
  assert.match(flashText(dom), /already assigned/);
});

test('the happy path adds, closes, and confirms in words', () => {
  const dom = makeDom();
  dom.modal.style.display = 'flex';
  dom.select.value = 'AC';
  const out = harness(dom, {
    currentAirline: 'AC', pickerSlot: 'images', selected: { y: true },
    working: { airlines: { AC: {
      images: { mode: 'rotate', itemIds: ['x'], primaryId: 'x' },
      videos: { mode: 'rotate', itemIds: [], primaryId: null },
    } } },
  });
  assert.deepEqual(out.working.airlines.AC.images.itemIds, ['x', 'y']);
  assert.equal(isOpen(dom), false);
  assert.match(out.assignMsg || '', /Added 1 item to AC/,
    'silence on success is why nobody could tell working from broken');
  assert.match(out.assignMsg || '', /Save Assignments/,
    'and it must say the change is not saved yet — the picker only stages it');
});

test('a missing slot object is rebuilt rather than thrown on', () => {
  // An assignments doc written before a slot existed would otherwise crash
  // on entry.itemIds and take the dialog down with it.
  const dom = makeDom();
  dom.modal.style.display = 'flex';
  dom.select.value = 'AC';
  const out = harness(dom, {
    currentAirline: 'AC', pickerSlot: 'videos', selected: { v: true },
    working: { airlines: { AC: {} } },
  });
  assert.deepEqual(out.working.airlines.AC.videos.itemIds, ['v']);
});

test('an unexpected failure is shown, not swallowed by closing the dialog', () => {
  // The catch is the last line of defence and the one most likely to rot back
  // into `mediaPickerClose()`. If anything downstream throws, the operator must
  // be told what happened and keep their ticks — a vanishing dialog is exactly
  // the symptom that sent this bug chasing logins and uploads for days.
  const dom = makeDom();
  dom.modal.style.display = 'flex';
  dom.select.value = 'AC';
  const out = harness(dom, {
    currentAirline: 'AC', pickerSlot: 'images', selected: { z: true },
    working: { airlines: {} }, explode: true,
  });
  assert.equal(isOpen(dom), true, 'a crash must not close the dialog');
  assert.match(flashText(dom), /Could not add: render blew up/,
    'the reason must reach the screen');
  assert.deepEqual(out.selected, { z: true }, 'and the selection must survive it');
});

test('nothing in this function can close the dialog without saying why', () => {
  // The rule, held structurally: every path that closes must either have
  // added something or have printed a reason first.
  const at = JS.indexOf('window.mediaPickerConfirm = function');
  let d = 0; let body = null;
  for (let k = JS.indexOf('{', at); k < JS.length; k++) {
    if (JS[k] === '{') d++;
    else if (JS[k] === '}') { d--; if (d === 0) { body = JS.slice(at, k + 1); break; } }
  }
  assert.ok(body, 'mediaPickerConfirm must still exist');
  assert.doesNotMatch(body, /return\s+mediaPickerClose\(\)/,
    'a bare `return mediaPickerClose()` is the original defect: it closes the ' +
    'dialog and discards the selection without a word. Report the reason first.');
});

test('the markup carries the flash element and the footer keeps its selector', () => {
  assert.match(HTML, /id="mlPickerFlash"/, 'the picker needs somewhere to speak');
  // menu.js finds the footer with div[style*="margin-top:12px"] to swap its
  // buttons for the library editor. Adding an id is safe; changing that style
  // attribute is not, and would silently break the editor instead.
  const at = HTML.indexOf('id="mlPickerModal"');
  const seg = HTML.slice(at, at + 2600).replace(/<!--[\s\S]*?-->/g, '');
  const hits = seg.split('margin-top:12px').length - 1;
  assert.equal(hits, 1,
    'exactly one ELEMENT in the picker modal may carry margin-top:12px, or the ' +
    "library editor's footer lookup becomes ambiguous");
  assert.match(seg, /id="mlPickerFooter"[^>]*style="margin-top:12px;/,
    'the footer keeps both its new id and its original style attribute');
});
