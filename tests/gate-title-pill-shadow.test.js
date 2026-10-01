'use strict';

// WHY THIS EXISTS
//
// The gate screen's Your Aircraft title turns into a pill when the inbound
// aircraft is early (green) or delayed (amber): dark navy words on the pill's
// own ground. Those words take their shadow from the carrier's plate token,
// --plate-ink-sh, through the board's "ink follows the plate" rule.
//
// v23926 re-declared --plate-ink-sh on the Your Aircraft lines
// (.v2-rc-shelf-fi) as the lower panel's own soft dark shadow, so the light
// lines read on the new dark ground. The pill sits inside the lines, so it
// inherited that too: on American (YHZ gate 46, an 'Early' pill) the navy
// words went from a crisp 1px light emboss, rgba(255,255,255,.55) 0 1px 0, to
// a 3px dark blur, rgba(0,0,0,.78) 0 1px 3px, which smudged them.
//
// v23927: the column reads the carrier's own token into --rcp-pill-sh BEFORE
// the lines re-declare it, and the pill hands that back to its words. The
// lines keep the panel's shadow. Measured with headless Chrome at 1680x1050:
//   American (YHZ 46) and Lufthansa (YUL A61), early and delayed pills:
//     back to 0 1px 0 rgba(255,255,255,.55), as before v23926;
//   Air Canada, WestJet, Porter, PAL and Delta pills, and every word outside
//   the pill on all seven: pixel-identical to v23926.
// Nothing here can render a board, so these tests pin the rules that do it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const PLAIN = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const AT = CSS.indexOf('v23926 — THE RIGHT COLUMN IS TWO PANELS');
const START = AT >= 0 ? CSS.lastIndexOf('/*', AT) : -1;
const NEXT = AT >= 0 ? CSS.indexOf('/* ══', AT + 10) : -1;
const BLOCK = START >= 0 ? CSS.slice(START, NEXT > AT ? NEXT : undefined) : '';
const RULES = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '');

const EMBOSS = '0 1px 0 rgba(255, 255, 255, 0.55)';
const BLUR = '0 1px 3px rgba(0, 0, 0, 0.78)';

/** Every rule in `css` as { sels: [top-level selectors], body }. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sels = [];
    let depth = 0, cur = '';
    for (const ch of m[1]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { sels.push(cur.trim()); cur = ''; } else cur += ch;
    }
    sels.push(cur.trim());
    out.push({ sels: sels.filter(Boolean), body: m[2] });
  }
  return out;
}
/** A selector with its strings and bracketed arguments taken out: its combinators and compounds only. */
function shape(sel) {
  let s = sel.replace(/"[^"]*"/g, '');
  let prev;
  do { prev = s; s = s.replace(/\([^()]*\)|\[[^\[\]]*\]/g, ''); } while (s !== prev);
  return s.replace(/(:not|:is)+/g, '').replace(/\s+/g, ' ').trim();
}
const decl = (body, name) => {
  const m = body.match(new RegExp(name.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+);'));
  return m ? m[1].trim() : null;
};

const PILL_TAILS = [
  '.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-title.v2-fi-title-warn',
  '.gad-map-col-v2 > .v2-rc-shelf-fi .v2-fi-title.v2-fi-title-good',
];

test('the column reads the carrier\'s own plate shadow before the lines re-declare it', () => {
  assert.ok(BLOCK.length > 1000, 'the v23926 block is in display-overrides.css');
  const at = rules(RULES).filter((r) => decl(r.body, '--rcp-pill-sh') !== null);
  assert.equal(at.length, 1, 'one declaration of --rcp-pill-sh, and no carrier or light-banner variant of it');
  const [r] = at;
  // On the column itself: an ancestor of the lines, so the var() resolves to
  // the carrier's value. Declared on the lines or inside them, it would read
  // the panel's shadow back.
  for (const s of r.sels) assert.equal(shape(s), 'html body .g8-wrap .gad-map-col-v2', s.slice(-60));
  assert.equal(decl(r.body, '--rcp-pill-sh'), `var(--plate-ink-sh, ${BLUR})`);
});

test('the pill gives its words the carrier\'s shadow back, and nothing else', () => {
  const pill = rules(RULES).filter((r) => r.sels.some((s) => PILL_TAILS.some((t) => s.endsWith(t))) && /--plate-ink-sh/.test(r.body));
  assert.equal(pill.length, 1, 'one rule hands the pill its token');
  const [r] = pill;
  assert.deepEqual(r.sels.map((s) => PILL_TAILS.find((t) => s.endsWith(t))).sort(), PILL_TAILS.slice().sort(), 'both pills, early and delayed');
  assert.equal(decl(r.body, '--plate-ink-sh'), 'var(--rcp-pill-sh)');
  // Only the token: a carrier rule that clears the pill's shadow outright
  // (Air Canada's, Porter's) still wins, as it did on v23926.
  for (const r2 of rules(RULES)) {
    if (r2.sels.some((s) => /v2-fi-title-(warn|good)\b/.test(s) && !/:not\(\.v2-fi-title-(warn|good)\)/.test(s))) {
      assert.doesNotMatch(r2.body, /text-shadow/, 'no pill rule in the block sets a text-shadow of its own');
    }
  }
});

test('the light words in the panel keep the panel\'s soft shadow', () => {
  const lines = rules(RULES).filter((r) => r.sels.every((s) => s.endsWith('.gad-map-col-v2 > .v2-rc-shelf-fi')) && /--plate-ink-sh/.test(r.body));
  assert.equal(lines.length, 1);
  assert.equal(decl(lines[0].body, '--plate-ink-sh'), 'var(--rcp-type-sh)');
  assert.equal(decl(RULES, '--rcp-type-sh'), BLUR);
});

test('nothing between the body and the column re-declares the plate shadow', () => {
  // The capture above is only the carrier's value if every other
  // --plate-ink-sh in the stylesheet sits on the body (the per-carrier plate
  // tokens) or on the lines and the pill (this block).
  for (const r of rules(PLAIN)) {
    if (decl(r.body, '--plate-ink-sh') === null) continue;
    for (const s of r.sels) {
      const sh = shape(s);
      const ok = sh === 'html body'
        || sh === 'html body .g8-wrap .gad-map-col-v2 > .v2-rc-shelf-fi'
        || PILL_TAILS.some((t) => sh === 'html body .g8-wrap ' + t);
      assert.ok(ok, `--plate-ink-sh declared below the body, outside the lines: ${s.slice(0, 40)}…${s.slice(-80)}`);
    }
  }
});

test('the carriers whose pill words carried the emboss still have it as their plate shadow', () => {
  // American, Lufthansa and Qatar: dark ink on a light plate, lifted by a
  // crisp light emboss. That is what --rcp-pill-sh brings back to their pills.
  const carriers = { AMERICAN: '"AA"', LUFTHANSA: '"LH"', QATAR: '"QR"' };
  for (const [name, code] of Object.entries(carriers)) {
    const own = rules(PLAIN).filter((r) => decl(r.body, '--plate-ink-sh') !== null
      && r.sels.some((s) => shape(s) === 'html body' && s.includes(`[data-gate-airline=${code}]`) && s.includes(`*="${name}"`)));
    assert.ok(own.length, `${name}'s plate token`);
    for (const r of own) assert.equal(decl(r.body, '--plate-ink-sh'), EMBOSS, name);
  }
});
