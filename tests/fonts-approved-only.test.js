'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v24038 — ONLY THE APPROVED FONTS.
//
// The boards, the operator pages and the stream draw with the families the
// site serves itself and holds a licence for: Bricolage Grotesque (the board
// default, SIL OFL), Cabinet Grotesk (ITF Free Font License), Possibility
// (bought: Commercial Use and Webfont) and AC Nord. From Google Fonts only
// the Noto script faces load, so Japanese, Chinese and Arabic render.
//
// Gone: Geist, Inter, Manrope, Space Grotesk, DM Sans and JetBrains Mono
// (Google imports), Cinzel (a link nothing used), and the Airport / Airport X
// trial cuts (tour.html's arrival card now takes the board face). Code and
// figures that used JetBrains Mono take the system's monospace.
//
// The hotel ads' brand faces (Fairmont: The Seasons, Montserrat, Franklin
// Gothic; Sofitel: its property-name face and Rebelton) are licensed and
// stay; they draw only inside the ads (.axr). The two Season Serif TRIAL
// files that sat beside them, used by nothing, are gone.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'fids-current');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'logos' || e.name === 'node_modules' ? [] : walk(p);
    return [p];
  });
}
const CODE = walk(SITE).filter((f) => /\.(html|css|js)$/.test(f) && !/\.min\.js$/.test(f));

const RETIRED = ['Geist', 'Inter', 'Manrope', 'Space Grotesk', 'DM Sans', 'JetBrains Mono', 'Cinzel', 'Airport', 'Airport X'];

test('from Google Fonts, only the Noto script faces load', () => {
  for (const f of CODE) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/fonts\.googleapis\.com\/css2?\?([^"')\s]+)/g)) {
      const fams = [...m[1].matchAll(/family=([^:&;]+)/g)].map((x) => decodeURIComponent(x[1].replace(/\+/g, ' ')));
      for (const fam of fams) assert.match(fam, /^Noto Sans (JP|SC|Arabic)$/, path.relative(ROOT, f) + ' loads ' + fam);
    }
    assert.doesNotMatch(src, /@import\s+url\(['"]?https?:/, path.relative(ROOT, f) + ' imports a remote stylesheet');
  }
});

test('no stylesheet, page or script names a retired family', () => {
  for (const f of CODE) {
    const src = fs.readFileSync(f, 'utf8');
    for (const fam of RETIRED) {
      // 'Airport' is also a word the console uses ('Airport' tab), so it is
      // only a font where it opens a stack: 'Airport', …
      const quoted = fam === 'Airport' ? /(['"]|&apos;)Airport\1\s*,\s*(['"]|&apos;|system-ui|-apple-system|sans-serif)/ : new RegExp(`(['"]|&apos;)${fam}\\1`);
      const bare = new RegExp(`font(-family)?:[^;"]*\\b${fam}\\s*,`);
      assert.ok(!quoted.test(src), `${path.relative(ROOT, f)} names '${fam}'`);
      assert.ok(!bare.test(src), `${path.relative(ROOT, f)} sets ${fam} in a font stack`);
    }
  }
});

test('the trial cuts are gone: Airport / Airport X and their stylesheet, Season Serif', () => {
  assert.ok(!fs.existsSync(path.join(SITE, 'css/airport-fonts.css')));
  assert.ok(!fs.existsSync(path.join(SITE, 'fonts/AirportX_RevolverType')));
  for (const f of fs.readdirSync(path.join(SITE, 'fonts'))) assert.doesNotMatch(f, /season\.otf$|season-medium\.otf$|trial/i, f);
  const tour = rd('fids-current/tour.html');
  assert.match(tour, /<link rel="stylesheet" href="css\/font\.css\?v=\d+">/, 'the tour card loads the board faces');
  assert.match(tour, /font-family: 'Bricolage Grotesque', 'AC Nord Text', system-ui/);
});

test('the font tables offer only served families', () => {
  const core = rd('fids-current/js/fids-core.js');
  const menu = rd('fids-current/js/menu.js');
  for (const k of ['geist', 'inter', 'manrope', 'space-grotesk', 'mono']) {
    const key = new RegExp(`^\\s*'${k}':\\s`, 'm');
    assert.doesNotMatch(core, key, `fids-core.js still offers '${k}'`);
    assert.doesNotMatch(menu, key, `menu.js still offers '${k}'`);
  }
  const designer = rd('fids-current/js/designer.js');
  const list = designer.slice(designer.indexOf('const FONT_FAMILIES = ['), designer.indexOf('];', designer.indexOf('const FONT_FAMILIES = [')));
  const offered = [...list.matchAll(/v: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(offered, ['Bricolage Grotesque', 'AC Nord Display', 'AC Nord Text', 'Cabinet Grotesk', 'Possibility', 'system']);
});

test('a family a device remembers from an older picker draws the board default, not the system face', () => {
  const core = rd('fids-current/js/fids-core.js');
  const m = core.match(/var FIDS_SERVED_FONT = (\/.+\/);/);
  assert.ok(m, 'FIDS_SERVED_FONT must exist');
  const served = new Function('return ' + m[1])();
  for (const ok of ['Bricolage Grotesque', 'Bricolage Grotesque Cond', 'Cabinet Grotesk Bold', 'Possibility', 'AC Nord Display', 'AC Nord Text Heavy']) assert.ok(served.test(ok), ok);
  for (const gone of RETIRED.concat(['', 'Roboto', 'Bricolage'])) assert.ok(!served.test(gone), gone);
  assert.match(core, /function changeFont\(f\) \{\n  if \(!FIDS_SERVED_FONT\.test\(String\(f \|\| ''\)\)\) f = FIDS_FONT_STACKS\.bricolage\.split\("'"\)\[1\];/);
  const stacks = core.match(/'bricolage': "([^"]+)"/)[1];
  assert.equal(stacks.split("'")[1], 'Bricolage Grotesque');
  for (const pg of ['fids', 'gids', 'bids']) {
    assert.match(rd(`fids-current/${pg}.html`), /else changeFont\(''\); \} catch\(e\) \{\}/, pg + '.html falls back through changeFont');
  }
});

test('code and figures use the system monospace', () => {
  for (const [file, re] of [
    ['fids-current/css/shared.css', /--font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;/],
    ['fids-current/css/menu.css', /--font-mono:\s+ui-monospace, 'SF Mono', Menlo, Consolas, monospace;/],
  ]) assert.match(rd(file), re, file);
});
