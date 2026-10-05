'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23994 — THE WELCOME CARD, IN THREE LINES.
//
//      <first language>     Welcome aboard
//      [emblem] <airline>   one line
//      <second language>    Bienvenue à bord
//
// What this file holds:
//   - the layout: the three lines in that order, the airline line never
//     wrapped, no separator left over from the old one-run headline;
//   - the languages: the board's first two, picked by _gateLbl exactly as
//     every other gate label picks them (French first at a Québec airport),
//     never a third, from a table that carries all nine;
//   - the sizes: the logo is never smaller than the text (its letters, not
//     its picture's box), the airline line never shrinks to suit the
//     greeting, it stays within the card's room, nothing is cut.
// The emblem decisions are in welcome-emblem-own-colours.test.js.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'fids-current');
const SRC = fs.readFileSync(path.join(PUB, 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(PUB, 'css', 'display-overrides.css'), 'utf8');

/**
 * The text of a piece of markup: everything outside its tags. Scanned as a
 * browser reads it, each tag running from '<' to the next '>', rather than
 * by a pattern replace, which can leave a tag behind.
 */
function textOf(html) {
  const s = String(html);
  let out = '', i = 0;
  for (;;) {
    const a = s.indexOf('<', i);
    if (a < 0) return out + s.slice(i);
    out += s.slice(i, a);
    const b = s.indexOf('>', a + 1);
    if (b < 0) return out + s.slice(a);
    i = b + 1;
  }
}

/** The text of a brace block starting at `start` (strings and comments skipped). */
function braceFrom(start, what) {
  assert.ok(start >= 0, what + ' must exist in fids-core.js');
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '/' && SRC[i + 1] === '/') { i = SRC.indexOf('\n', i); continue; }
    if (c === '/' && SRC[i + 1] === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < SRC.length; i++) { if (SRC[i] === '\\') { i++; continue; } if (SRC[i] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error('could not find the end of ' + what);
}
const fnSource = (name) => {
  const m = SRC.match(new RegExp('(^|\\n)function ' + name + '\\('));
  assert.ok(m, name + ' must be a top-level function');
  return braceFrom(m.index + (m[1] ? 1 : 0), name) + '\n';
};
const varSource = (decl) => braceFrom(SRC.indexOf(decl), decl) + ';\n';

// The one store for passenger words (board-strings.js): _gateLbl reads
// _GATE_LBL, which is frozen, and falls through to the store for a key it
// does not hold, the greeting among them.
const BS = require(path.join(PUB, 'js', 'board-strings.js'));
/** A sandbox holding the card's own code, as written, with a board's languages. */
function sandbox(langs, extra) {
  const ctx = vm.createContext(Object.assign({ langs, window: {}, BoardStrings: BS }, extra || {}));
  vm.runInContext(varSource('var _GATE_LBL = {') + fnSource('_gateLbl') + fnSource('frFirstAirport')
    + fnSource('_welcomeCardLines') + fnSource('_welcomeCardEsc') + fnSource('_welcomeCardHtml')
    + fnSource('_welcomeCardSizes'), ctx);
  return ctx;
}
/** The greeting as the card would set it: [[lang, text], ...]. */
function lines(langs, frFirst) {
  const ctx = sandbox(langs);
  return JSON.parse(JSON.stringify(vm.runInContext('_welcomeCardLines(' + JSON.stringify(!!frFirst) + ')', ctx)))
    .map((l) => [l.lang, l.text]);
}

const WA = {
  en: 'Welcome aboard', fr: 'Bienvenue à bord', es: 'Bienvenido a bordo', de: 'Willkommen an Bord',
  it: 'Benvenuti a bordo', pt: 'Bem-vindo a bordo', ja: 'ご搭乗ありがとうございます', zh: '欢迎登机',
  ar: 'أهلاً بكم على متن الرحلة'
};

// ── the phrases ──────────────────────────────────────────────────────────────

test('the greeting is in the store, in all nine board languages, and _gateLbl finds it there', () => {
  const ctx = sandbox(['en', 'fr']);
  const row = Object.fromEntries(Object.entries(BS.STR.welcomeAboard).filter(([k]) => !k.startsWith('$')));
  assert.deepEqual(row, WA, 'the same nine strings the card has always carried');
  assert.equal(vm.runInContext('_GATE_LBL.welcomeAboard', ctx), undefined, '_GATE_LBL is frozen: the key lives in the store');
  // and the card no longer keeps a private copy of them
  assert.doesNotMatch(SRC, /var _WA = \{/);
});

// ── the languages ────────────────────────────────────────────────────────────

test('the board\'s first language goes on top, its second underneath', () => {
  assert.deepEqual(lines(['en', 'fr']), [['en', WA.en], ['fr', WA.fr]]);
  assert.deepEqual(lines(['fr', 'en']), [['fr', WA.fr], ['en', WA.en]]);
  assert.deepEqual(lines(['en', 'es']), [['en', WA.en], ['es', WA.es]]);
  assert.deepEqual(lines(['de', 'pt']), [['de', WA.de], ['pt', WA.pt]]);
  assert.deepEqual(lines(['ja', 'ar']), [['ja', WA.ja], ['ar', WA.ar]]);
});

test('French first at a Québec airport, as on every gate label', () => {
  assert.deepEqual(lines(['en', 'fr'], true), [['fr', WA.fr], ['en', WA.en]]);
  // the card asks the same question every gate label asks, of its own airport
  const data = fnSource('_welcomeCardData');
  assert.match(data, /frFirstAirport\(window\._gateIata \|\| ''\)/);
  assert.match(data, /lines: _welcomeCardLines\(frF\)/);
  const ctx = sandbox(['en', 'fr']);
  assert.equal(vm.runInContext('frFirstAirport("YUL")', ctx), true);
  assert.equal(vm.runInContext('frFirstAirport("YQM")', ctx), false);
});

test('never a third language, and no rotation', () => {
  assert.deepEqual(lines(['en', 'fr', 'es', 'de']), [['en', WA.en], ['fr', WA.fr]]);
  assert.deepEqual(lines(['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh', 'ar']), [['en', WA.en], ['fr', WA.fr]]);
  // one language: one line, above the airline
  assert.deepEqual(lines(['en']), [['en', WA.en]]);
  // nothing in the card reads the language rotation
  for (const fn of ['_welcomeCardLines', '_welcomeCardData', '_welcomeCardHtml']) {
    assert.doesNotMatch(fnSource(fn), /langIdx|_gateLbl1\(|\bTL\(/, fn + ' must not follow the rotating language');
  }
});

test('the pick is _gateLbl\'s own, for every pair of board languages', () => {
  const codes = Object.keys(WA);
  for (const a of codes) {
    for (const b of codes) {
      for (const fr of [false, true]) {
        const ctx = sandbox([a, b]);
        // (_gateLbl marks each half it wraps with its language, markHalf: the
        // pick is the languages and the words, not that markup)
        const viaLbl = textOf(vm.runInContext('_gateLbl("welcomeAboard", ' + fr + ', function (w, i, l) { return l + "=" + w; }, "|")', ctx));
        const got = lines([a, b], fr).map(([l, t]) => l + '=' + t).join('|');
        assert.equal(got, viaLbl, a + ',' + b + (fr ? ' (Québec)' : ''));
      }
    }
  }
});

// ── the layout ───────────────────────────────────────────────────────────────

function html(ad) {
  const ctx = sandbox(['en', 'fr']);
  return vm.runInContext('_welcomeCardHtml(' + JSON.stringify(ad) + ')', ctx);
}
const AD = {
  adLayout: 'welcome-card', code: 'AF', bg: 'linear-gradient(135deg,#1a1a2e 0%,#0c0c1e 100%)',
  lines: [{ text: WA.fr, lang: 'fr' }, { text: WA.en, lang: 'en' }],
  emblem: '/logos/airlines/european/air-france-emblem.svg?v=2', emblemKind: 'own',
  wordmark: '/logos/airlines/european/air-france-wordmark-light.svg', wordmarkScale: 1, name: 'Air France'
};

test('three lines: the first phrase, the emblem and the airline on one line, the second phrase', () => {
  const h = html(AD);
  const top = h.indexOf('gwc-ph gwc-ph-top'), mid = h.indexOf('class="gwc-mid"'), bot = h.indexOf('gwc-ph gwc-ph-bottom');
  assert.ok(top > 0 && mid > top && bot > mid, 'top phrase, then the airline line, then the bottom phrase');
  assert.match(h.slice(top, mid), /lang="fr">Bienvenue à bord</);
  assert.match(h.slice(bot), /lang="en">Welcome aboard</);
  const line = h.slice(mid, bot);
  const e = line.indexOf('class="gwc-emb"'), w = line.indexOf('class="gwc-wm"');
  assert.ok(e > 0 && w > e, 'the emblem, then the airline\'s name, in the one line');
  assert.match(line, /alt="Air France"/);
  // no separator: the old headline's "·" was stranded when its run wrapped
  assert.doesNotMatch(h, /·|g8-pair-sep|g8-pair-h/);
  // the card keeps its colours: the airline's gradient as its ground
  assert.match(h, /class="gwc gwc-pending"[^>]*style="background:linear-gradient\(135deg,#1a1a2e 0%,#0c0c1e 100%\);"/);
});

test('a card with no emblem is the phrase, the airline\'s lettering, the phrase', () => {
  const h = html(Object.assign({}, AD, { emblem: '', emblemKind: 'none', code: 'PD', name: 'Porter Airlines',
    wordmark: '/logos/airlines/canadian/porter-wordmark-light.svg' }));
  assert.doesNotMatch(h, /gwc-emb/);
  assert.match(h, /data-emblem="none"/);
  assert.match(h, /<div class="gwc-mid"><img class="gwc-wm" src="\/logos\/airlines\/canadian\/porter-wordmark-light\.svg"/);
  // a typed name where there is no lettering
  const t = html(Object.assign({}, AD, { wordmark: '', name: 'Norwegian' }));
  assert.match(t, /<span class="gwc-name">Norwegian<\/span>/);
});

test('Arabic is set right to left; every phrase carries its language', () => {
  const h = html(Object.assign({}, AD, { lines: [{ text: WA.ja, lang: 'ja' }, { text: WA.ar, lang: 'ar' }] }));
  assert.match(h, /<div class="gwc-ph gwc-ph-top" lang="ja">/);
  assert.match(h, /<div class="gwc-ph gwc-ph-bottom" lang="ar" dir="rtl">/);
});

test('the lettering carries its letters\' share for the fitter', () => {
  const h = html(Object.assign({}, AD, { code: '3H', emblem: '', emblemKind: 'none', name: 'Air Inuit',
    wordmark: '/logos/airlines/canadian-regional/airinuit-wordmark-light.svg', letterHeight: 0.42 }));
  assert.match(h, /<img class="gwc-wm" [^>]*data-letters="0\.42"/);
  assert.doesNotMatch(html(AD), /data-letters/, 'none where the letters fill the art');
});

test('names and paths are escaped', () => {
  const h = html(Object.assign({}, AD, { name: 'A "B" <C>', wordmark: '' }));
  assert.match(h, /A &quot;B&quot; &lt;C&gt;/);
});

/** The body of the newest stylesheet rule for a selector ending in `tail`. */
function rule(tail) {
  let at = -1, from = 0;
  for (;;) {
    const i = CSS.indexOf(' ' + tail + ' {', from);
    if (i < 0) break;
    at = i; from = i + 1;
  }
  assert.ok(at > 0, tail + ' must be styled');
  return CSS.slice(at, CSS.indexOf('\n}', at));
}

test('the stylesheet: centred lines, the airline line never wraps, a phrase wraps rather than being cut', () => {
  const card = rule('.gwc');
  assert.match(card, /flex-direction: column !important/);
  assert.match(card, /align-items: center !important; justify-content: center !important/);
  assert.match(card, /text-align: center !important/);
  const mid = rule('.gwc .gwc-mid');
  assert.match(mid, /flex-direction: row !important; flex-wrap: nowrap !important/);
  const ph = rule('.gwc .gwc-ph');
  assert.match(ph, /white-space: nowrap !important/);
  assert.doesNotMatch(ph, /text-overflow|overflow: hidden/, 'a phrase is never clipped');
  const wrap = rule('.gwc .gwc-ph.gwc-wrap');
  assert.match(wrap, /white-space: normal !important/);
  assert.match(wrap, /overflow-wrap: break-word !important/);
  // nothing animates
  const block = CSS.slice(CSS.indexOf('v23994 — THE WELCOME CARD, IN THREE LINES'));
  assert.doesNotMatch(block, /animation|transition|@keyframes/);
});

test('the deck builds the card, the renderer draws it, and every paint fits it', () => {
  const list = fnSource('_buildGateAdSlideList');
  assert.match(list, /deck = \[\{ type: 'ad', data: _welcomeCardData\(code\) \}\];/);
  assert.match(fnSource('buildGateAdHtml'), /if \(ad && ad\.adLayout === 'welcome-card'\) return _welcomeCardHtml\(ad\);/);
  const r = fnSource('renderGateAd');
  const paint = r.indexOf('el.innerHTML = html');
  const fit = r.indexOf('_welcomeCardFit(el)');
  assert.ok(paint > 0 && fit > paint, 'the fit runs after the paint, in the same task');
});

// ── the sizes ────────────────────────────────────────────────────────────────

const SIZER = sandbox(['en', 'fr']);
function sizes(o) {
  return JSON.parse(JSON.stringify(vm.runInContext('_welcomeCardSizes(' + JSON.stringify(o) + ')', SIZER)));
}
const AT1680 = { W: 770, base: 78, gap: 28 };

test('Air Canada at 1680x1050: the roundel, the lettering and the greeting as approved', () => {
  // AIR CANADA's light cut is 11 times as wide as it is tall
  const s = sizes(Object.assign({}, AT1680, { emblem: true, emblemAspect: 1.02, wordmarkAspect: 11 }));
  assert.equal(s.phrase, 78, 'the greeting keeps its size');
  assert.ok(s.wordmark >= 0.72 * 78, 'the lettering is at least the greeting\'s capital height: ' + s.wordmark);
  assert.ok(s.emblem >= 1.25 * 78, 'the emblem is bigger than the greeting');
});

test('a very wide wordmark brings the greeting down; the airline line keeps its size (British Airways)', () => {
  const s = sizes(Object.assign({}, AT1680, { emblem: true, emblemAspect: 4.2, wordmarkAspect: 11.05 }));
  assert.ok(s.wordmark < 0.72 * 78, 'the lettering is width-bound: ' + s.wordmark);
  assert.ok(s.phrase < 78, 'so the greeting comes down: ' + s.phrase);
  assert.ok(0.72 * s.phrase <= s.wordmark + 1e-9, 'until its capital height matches the lettering');
  assert.equal(s.emblem, 1.25 * 78, 'the emblem stays at its floor, sized from the board, not from the greeting');
  assert.equal(s.emblemAspect, 2.2, 'a flat emblem runs at most 2.2 times as wide as it is tall');
});

test('the logo is never smaller than the text, at any size and shape', () => {
  for (const W of [420, 560, 770, 1000]) {
    for (const base of [44, 60, 78]) {
      for (const emblem of [false, true]) {
        for (const ea of [0.6, 1, 2.2, 4]) {
          for (const a of [1.5, 2.3, 3, 5, 8, 11, 16]) {
            for (const f of [1, 0.84, 0.58, 0.43, 0.22]) {
              for (const room of [0, 1.1 * base, 2.4 * base, 6 * base]) {
                const s = sizes({ W, base, gap: 0.36 * base, emblem, emblemAspect: ea, wordmarkAspect: a, letterHeight: f, room });
                const tag = JSON.stringify({ W, base, emblem, ea, a, f, room, s });
                assert.ok(s.phrase <= base, 'the greeting never grows: ' + tag);
                assert.ok(Math.abs(s.letters - s.wordmark * f) < 1e-9, 'the letters are their share of the lettering: ' + tag);
                assert.ok(0.72 * s.phrase <= s.letters + 1e-9, 'the letters are never under the greeting\'s capital height: ' + tag);
                assert.ok(s.wordmark <= 3 * base + 1e-9, 'never past three times the greeting: ' + tag);
                if (room > 0) assert.ok(s.wordmark <= Math.max(1.23 * base, room) + 1e-9, 'never taller than the room the card has: ' + tag);
                if (emblem) {
                  assert.ok(s.emblem >= 1.25 * base - 1e-9 && s.emblem <= 1.8 * base + 1e-9, 'the emblem: ' + tag);
                  if (room > 0) assert.ok(s.emblem <= Math.max(1.25 * base, room) + 1e-9, 'the emblem fits the room: ' + tag);
                  assert.ok(s.emblem > s.phrase, 'the emblem is bigger than the greeting: ' + tag);
                }
                const width = (emblem ? s.emblem * s.emblemAspect + 0.36 * base : 0) + s.wordmark * a;
                assert.ok(width <= W + 0.5, 'the airline line fits on its one line: ' + tag);
              }
            }
          }
        }
      }
    }
  }
});

test('letters, not pictures: lettering whose letters fill a fraction of it is drawn taller (Air Inuit, North Star)', () => {
  // At 1680x1050 the card has about 760 px across and 400 px of height left
  // for the airline line once its two phrases are set.
  const room = 400;
  // Air Inuit: syllabics over "Air Inuit". Before, its padded board cut was
  // drawn 96 px tall and its letters came out 22 px against the greeting's
  // 56 px capitals. Its cropped cut (aspect 2.13), letters 42% of it:
  const before = sizes(Object.assign({}, AT1680, { emblem: false, wordmarkAspect: 1.5 }));
  assert.ok(before.wordmark * 0.23 < 0.72 * 78, 'the old reading of Air Inuit: ' + before.wordmark);
  const inuit = sizes(Object.assign({}, AT1680, { emblem: false, wordmarkAspect: 2.13, letterHeight: 0.42, room }));
  assert.ok(Math.abs(inuit.letters - 0.8 * 78) < 0.01, 'its letters at 0.8 em: ' + JSON.stringify(inuit));
  assert.equal(inuit.phrase, 78, 'and the greeting keeps its size');
  // North Star: NORTHSTAR beside a roundel the full height of the art. Its
  // letters would need the art 3.6 em tall; it stops at 3 em and the greeting
  // comes down to its letters instead.
  const ns = sizes(Object.assign({}, AT1680, { emblem: false, wordmarkAspect: 2.38, letterHeight: 0.22, room }));
  assert.equal(ns.wordmark, 3 * 78, 'drawn at three times the greeting, its ceiling');
  assert.ok(ns.letters >= 0.72 * ns.phrase - 1e-9 && ns.phrase >= 68 && ns.phrase < 78, JSON.stringify(ns));
  assert.ok(ns.wordmark * 2.38 <= AT1680.W, 'on its one line');
  // American Airlines' two lines, and Spirit's lower case, reach the target
  // (0.8 em, a little over the greeting's 0.72 em capitals) with the greeting
  // left at its size
  for (const [a, f] of [[2.61, 0.43], [3.02, 0.47]]) {
    const x = sizes(Object.assign({}, AT1680, { emblem: false, wordmarkAspect: a, letterHeight: f, room }));
    assert.equal(x.phrase, 78, JSON.stringify(x));
    assert.ok(Math.abs(x.letters - 0.8 * 78) < 0.01, JSON.stringify(x));
  }
  // a lettering whose letters fill it (Air Canada) is untouched by any of this
  const ac = sizes(Object.assign({}, AT1680, { emblem: true, emblemAspect: 1.02, wordmarkAspect: 11, room }));
  const acOld = sizes(Object.assign({}, AT1680, { emblem: true, emblemAspect: 1.02, wordmarkAspect: 11 }));
  assert.deepEqual(ac, acOld);
});

test('the room the card has left caps the airline line, never below its usual size', () => {
  const tight = sizes(Object.assign({}, AT1680, { emblem: true, emblemAspect: 1, wordmarkAspect: 1.5, letterHeight: 0.23, room: 110 }));
  assert.equal(tight.wordmark, 110, 'as tall as the room allows');
  assert.equal(tight.emblem, 110, 'the emblem too (1.8 em would be 140)');
  assert.ok(0.72 * tight.phrase <= tight.letters + 1e-9, 'and the greeting comes down to its letters: ' + tight.phrase);
  const none = sizes(Object.assign({}, AT1680, { emblem: false, wordmarkAspect: 2.28, wordmarkScale: 1.4, room: 40 }));
  assert.equal(none.wordmark, 1.23 * 78, 'a card with almost no room keeps the usual size, as before');
});

test('how tall each lettering\'s letters are: measured, in range, and found under either code', () => {
  const ctx = vm.createContext({});
  vm.runInContext(varSource('var WELCOME_CARD_LETTER_HEIGHT = {') + varSource('var _FB_WM_ICAO = {')
    + fnSource('_welcomeCardPick') + varSource('var WELCOME_CARD_LETTERING_SCALE = {'), ctx);
  const T = JSON.parse(JSON.stringify(vm.runInContext('WELCOME_CARD_LETTER_HEIGHT', ctx)));
  // the four the cross-check measured short, and the rest of the art whose
  // letters fill less than three quarters of it
  for (const c of ['3H', 'NSA', 'WT', 'VB', 'AA2', 'NK']) assert.ok(T[c] > 0, c + ' is measured');
  for (const [c, f] of Object.entries(T)) assert.ok(f > 0.15 && f < 1, c + ': ' + f);
  assert.ok(T.NSA < 0.3, 'North Star: letters a quarter of the art, beside the roundel');
  assert.ok(T['3H'] < 0.5 && T.AA2 < 0.5, 'two lines of letters: under half the art each');
  // the scale table's carriers are measured too, so rule 1 holds for them when space is short
  for (const c of ['RV', 'QR', 'PD', 'QK']) assert.ok(T[c] > 0, c);
  // an ICAO-coded feed finds its twin's entries
  const pick = (t, c) => vm.runInContext('_welcomeCardPick(' + t + ', ' + JSON.stringify(c) + ')', ctx);
  assert.equal(pick('WELCOME_CARD_LETTER_HEIGHT', 'JZA'), T.QK);
  assert.equal(pick('WELCOME_CARD_LETTER_HEIGHT', 'POE'), T.PD);
  assert.equal(pick('WELCOME_CARD_LETTER_HEIGHT', 'PCO'), T['8P']);
  assert.equal(pick('WELCOME_CARD_LETTERING_SCALE', 'JZA'), 1.3, "Jazz's taller lettering under JZA too");
  assert.equal(pick('WELCOME_CARD_LETTERING_SCALE', 'POE'), 1.3);
  assert.equal(pick('WELCOME_CARD_LETTER_HEIGHT', 'AC'), undefined, 'letters that fill their art are not listed');
  // and the card's data carries both
  const data = fnSource('_welcomeCardData');
  assert.match(data, /wordmarkScale: _welcomeCardPick\(WELCOME_CARD_LETTERING_SCALE, code\) \|\| 1/);
  assert.match(data, /letterHeight: _welcomeCardPick\(WELCOME_CARD_LETTER_HEIGHT, code\) \|\| 1/);
});

test('the lettering may be drawn taller where its letters fill little of its height (Rouge)', () => {
  const plain = sizes(Object.assign({}, AT1680, { emblem: false, wordmarkAspect: 2.28 }));
  const tall = sizes(Object.assign({}, AT1680, { emblem: false, wordmarkAspect: 2.28, wordmarkScale: 1.4 }));
  assert.ok(Math.abs(tall.wordmark - 1.4 * plain.wordmark) < 0.01, tall.wordmark + ' vs ' + plain.wordmark);
  const ctx = vm.createContext({});
  vm.runInContext(varSource('var WELCOME_CARD_LETTERING_SCALE = {'), ctx);
  assert.deepEqual(Object.keys(vm.runInContext('WELCOME_CARD_LETTERING_SCALE', ctx)).sort(), ['PD', 'QK', 'QR', 'QTR', 'ROU', 'RV']);
});

test('the fitter: a typed name holds the same rule, and a phrase shrinks then wraps, never cut', () => {
  const one = fnSource('_welcomeCardFitOne');
  assert.match(one, /if \(nf < phrase\) phrase = Math\.floor\(nf \* 10\) \/ 10;/, 'a typed name smaller than the greeting brings the greeting down');
  assert.match(one, /letterHeight: wm \? \(parseFloat\(wm\.getAttribute\('data-letters'\)\) \|\| 1\) : 1,/, 'the letters\' share comes from the markup');
  assert.match(one, /var room = H - phs\.length \* \(1\.08 \+ 0\.42\) \* HB - 0\.1 \* HB;/, 'the room is the card less its phrases and their gaps');
  assert.match(one, /room: room > 0 \? room : 0 \}\);/);
  assert.match(one, /var HB = parseFloat\(getComputedStyle\(first \|\| card\)\.fontSize\) \|\| 78;/, 'sized from the stylesheet\'s own greeting size');
  const ph = fnSource('_welcomeCardFitPhrases');
  assert.match(ph, /Math\.max\(size \* 0\.62, size \* W \/ w - 0\.5\)/, 'shrinks to 62% at most');
  assert.match(ph, /classList\.add\('gwc-wrap'\)/, 'then wraps');
  // the card is never left hidden
  assert.match(fnSource('_welcomeCardFit'), /classList\.remove\('gwc-pending'\); \} catch \(e\) \{\} \}, 3000\)/);
});
