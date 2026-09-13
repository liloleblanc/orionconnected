'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// THE SUPPLIED PORTER CLASS ARTWORK MUST ACTUALLY BE ON SCREEN.
//
// Eight Porter files were supplied. It was reported twice that they were not
// visible, and the second report was the more damning one:
//
//   1st: three VIPorter tier marks rendered NOWHERE. Wired into the priority
//        column -- and reported fixed.
//   2nd: still not visible, because that column only draws its marks while
//        `preActive` is true -- the first five minutes of a boarding window.
//        Technically used. Effectively invisible.
//
// The same mistake twice: putting artwork somewhere that satisfies a grep
// rather than somewhere a passenger looks. "It is referenced in the source" is
// not the bar; "it renders in a state the board is actually in" is.
//
// This test holds the second bar, not the first.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');

const CLASS_MARKS = [
  'viporter_passport_single_line_en.svg',
  'viporter_venture_single_line_en.svg',
  'viporter_first_single_line_en.svg',
  'porter_reserve_logo.svg',
];

test('every class mark exists on disk', () => {
  for (const f of CLASS_MARKS) {
    const p = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'canadian', 'porter', f);
    assert.ok(fs.existsSync(p), `${f} is referenced but missing from the tree`);
  }
});

// v23749 — the tier marks are now built rather than written out: the renderer
// composes '..._' + tier + '_single_line_' + lang + '.svg' so the French art can
// swap in per tier. A literal search therefore finds none of them, which is the
// same blind spot the carrier-branding contract hit with constructed tile paths.
// Resolve the construction instead of grepping for strings.
function renderedMarks() {
  const tiers = [...SRC.matchAll(/_pdMark\('(\w+)'/g)].map((m) => m[1]);
  assert.ok(tiers.length >= 4, `expected the four elite tiers, found ${tiers.length}`);
  const frm = /_PD_MARK_FR = (\{[^}]*\})/.exec(SRC);
  assert.ok(frm, 'the set of tiers with French art must be declared');
  const fr = new Function('return ' + frm[1] + ';')();
  const out = [];
  for (const t of tiers) {
    out.push(`viporter_${t}_single_line_en.svg`);
    if (fr[t]) out.push(`viporter_${t}_single_line_fr.svg`);
  }
  // Plus the ones still written out literally.
  for (const m of SRC.matchAll(/porter\/([\w.-]+\.svg)/g)) out.push(m[1]);
  // The Reserve logo and the base-tier member mark are built the same way, with
  // the language suffix concatenated onto the stem — so the path regex above
  // cannot see either of them.
  if (/porter_reserve_logo'\s*\+/.test(SRC)) {
    out.push('porter_reserve_logo.svg', 'porter_reserve_logo_fr.svg');
  }
  if (/viporter_member_single_line_'\s*\+/.test(SRC)) {
    out.push('viporter_member_single_line_en.svg', 'viporter_member_single_line_fr.svg');
  }
  return [...new Set(out)];
}

test('every class mark is referenced by the renderer', () => {
  const rendered = renderedMarks();
  for (const f of CLASS_MARKS) {
    assert.ok(rendered.includes(f), `${f} is on disk but nothing renders it`);
  }
});

test('every mark the renderer builds is actually on disk', () => {
  // The other direction, and the one that matters more: a constructed path that
  // points at nothing draws nothing, and the tier just disappears from the sign
  // with no error anywhere. That is how Ascent went unnoticed.
  const dir = path.join(ROOT, 'fids-current', 'logos', 'airlines', 'canadian', 'porter');
  const missing = renderedMarks().filter((f) => !fs.existsSync(path.join(dir, f)));
  assert.deepEqual(missing, [], `the renderer builds these paths but the files are absent: ${missing.join(', ')}`);
});

test('the marks are NOT gated on the pre-boarding phase', () => {
  // The whole point. `preActive` is true for about five minutes; a mark drawn
  // only then is one nobody sees.
  const at = SRC.indexOf('var _prioMarks =');
  assert.ok(at >= 0, 'the priority marks must still be built');
  const decl = SRC.slice(at, SRC.indexOf(';', SRC.indexOf('</div>', at)));
  assert.ok(!/_prioMarks\s*=\s*preActive\s*\?/.test(decl),
    '_prioMarks is gated on preActive again — that renders the class artwork for ' +
    'the first five minutes of boarding and nothing after, which is the exact ' +
    'state that was reported as "still not visible".');
});

test('the marks reach the panel in BOTH boarding phases', () => {
  const at = SRC.indexOf('var _prioSub =');
  assert.ok(at >= 0, 'the priority sub-block must still exist');
  const decl = SRC.slice(at, at + 400);
  // A ternary is fine — what matters is that _prioMarks appears on both arms.
  const arms = decl.split('?')[1] || '';
  const [whenPre, whenNot] = arms.split(':');
  assert.ok(/_prioMarks/.test(whenPre || ''),
    'the marks must show during pre-boarding');
  assert.ok(/_prioMarks/.test(whenNot || ''),
    'the marks must ALSO show once general boarding has commenced — lanes 1-2 ' +
    'are the priority queue for the whole window, and that is who the marks name');
});

test('the marks are readable on the sign, not painted into its ground', () => {
  // Every supplied file is dark ink on a #002244 sign. The rule is: never
  // recolour the artwork, give it a treatment it can be read against.
  assert.match(CSS, /\.g8-pd-preboard-marks\s+\.g8-pd-mark\s+img\s*\{[\s\S]*?filter:\s*brightness\(0\)\s*invert\(1\)/,
    'the dark-ink marks need their white treatment or they vanish into the sign');
});
