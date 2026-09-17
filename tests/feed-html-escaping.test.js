// ═══════════════════════════════════════════════════════════════════════════
// FEED TEXT IS NOT MARKUP — AND NEITHER IS A URL PARAMETER.
//
// Four high-severity CodeQL alerts stood open on main, all of one shape: a
// value this project does not control reaching innerHTML as a string.
//
//   js/xss + js/xss-through-dom   the BIDS board (bView.innerHTML)
//   js/xss-through-dom            the empty-board panel
//   js/incomplete-multi-…         the revised-time strike remover
//   js/incomplete-multi-…         the Gander row split in the worker
//
// Each was checked before it was touched, and each was real:
//
//  • #apSel is an <input type="hidden">, NOT a <select>. ?ap= is written to it
//    verbatim at boot, so there is no option list to fall off — and the branch
//    that printed the code back is the no-feed branch, which is exactly the one
//    an injected value lands in, since a payload is never in FIDS_LIVE_AIRPORTS.
//
//  • subScreenVal is only sanitized on the ?belt= / ?gate= URL path
//    (_fidsSafeSub). The value the BIDS belt number actually renders comes from
//    updateSubScreens, which builds its list out of f._belt / f.gate / f.flight
//    — feed strings, unfiltered.
//
//  • _to12h, _bidsTimeForLang and SL() all return their ARGUMENT unchanged when
//    it is not a shape they recognise. Every one of them was standing in for a
//    filter that does not exist.
//
//  • The strike remover was a single non-greedy regex pass over a string with a
//    feed time in the middle of it. A time carrying its own '</span>' ends the
//    match early and the rest of that value survives the strip.
//
// So: escape at the interpolation, build the panel out of nodes, parse instead
// of regexing, and loop the worker's comment strip until it stops changing.
//
// These assertions are largely structural because the failures are DOM-shaped
// and the suite has no DOM. The two that can run for real — the escaper and the
// worker's shared cell reader — do.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const PROXY = fs.readFileSync(path.join(ROOT, 'workers', 'fids-proxy.js'), 'utf8');

// The source these read is one 40k-line file full of regex literals holding
// unbalanced quotes and braces (/"/g, /[^>]*{/ …), so a brace counter walks
// straight past the end of a function. These slice on the function's own
// indentation instead: from its header to the first closing brace at the same
// column. Every function read here is either at column 0 or nested at a known
// depth, and the closer is passed in.
function sliceFn(src, header, closer) {
  const at = src.indexOf(header);
  assert.ok(at >= 0, header.trim() + ' must still exist');
  const end = src.indexOf(closer, at);
  assert.ok(end > at, 'could not find the end of ' + header.trim());
  return src.slice(at, end + closer.length);
}

/** Lift a top-level `function name(...) {...}` out of the source and run it. */
function fn(name, src) {
  const body = sliceFn(src, '\nfunction ' + name + '(', '\n}');
  return new Function(body + '\nreturn ' + name + ';')();
}

/** Source with comments removed — prose about escaping must not pass for it. */
function code(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

/** The body of a top-level named function, comment-stripped. */
function bodyOf(name, src) {
  return code(sliceFn(src, '\nfunction ' + name + '(', '\n}'));
}

// ── the escaper itself ────────────────────────────────────────────────────

const esc = fn('fidsEscHtml', CORE);

test('fidsEscHtml closes every way out of a text node or an attribute', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
  // The quote forms matter as much as the brackets: the values this guards
  // land inside src="…", alt="…" and data-code="…" as often as between tags.
  assert.equal(esc('" onerror="alert(1)'), '&quot; onerror=&quot;alert(1)');
  assert.equal(esc("' onerror='alert(1)"), '&#39; onerror=&#39;alert(1)');
  // & first, or the escaping escapes its own output.
  assert.equal(esc('&lt;'), '&amp;lt;');
  assert.equal(esc('Montréal & Québec'), 'Montréal &amp; Québec');
  // Null and undefined are empty, not the words.
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('fidsEscHtml output can no longer open a tag or an attribute', () => {
  const payloads = [
    '</span><script>alert(1)</script>',
    '<svg onload=alert(1)>',
    '"><img src=x onerror=alert(1)>',
    "javascript:alert(1)//'",
    '<scr<script>ipt>alert(1)</script>',
  ];
  for (const p of payloads) {
    const out = esc(p);
    assert.ok(!/[<>]/.test(out), `angle bracket survived: ${p}`);
    assert.ok(!/["']/.test(out), `quote survived: ${p}`);
  }
});

// ── the BIDS board (js/xss, js/xss-through-dom) ───────────────────────────

test('every feed value in the BIDS template is escaped at the interpolation', () => {
  const at = CORE.indexOf('bView.innerHTML = `');
  assert.ok(at >= 0, 'the BIDS render must still build its screen as one template');
  const tpl = code(CORE.slice(at, CORE.indexOf('\n\n    // v23329', at)));

  // Feed text, both row designs (b3 and the pre-b3 rows) and the belt panel.
  for (const raw of [
    '${_flightDisp}', '${stTxt}', '${_b3City}', '${_b3Code}',
    '${_bidsTimeForLang(f.time)}',
    "+ _crslNum +", "+ airlineName +",
  ]) {
    assert.ok(!tpl.includes(raw),
      `${raw} is feed text and must not reach innerHTML unescaped`);
  }
  for (const wrapped of [
    '${fidsEscHtml(_flightDisp)}', '${fidsEscHtml(stTxt)}',
    '${fidsEscHtml(_b3City)}', '${fidsEscHtml(_bidsTimeForLang(f.time))}',
    'fidsEscHtml(_crslNum)', 'fidsEscHtml(airlineName)',
  ]) {
    assert.ok(tpl.includes(wrapped), `expected ${wrapped} in the BIDS template`);
  }

  // The airport logo URL is operator input and sits inside src="…".
  assert.ok(tpl.includes("src=\"' + fidsEscHtml(_lg) + '\""),
    'the airport logo URL must be escaped inside its src attribute');
});

test('the city/code split escapes both halves it renders', () => {
  const body = bodyOf('cityCodeSplitHtml', CORE);
  // It is the only caller's markup builder, so the escape lives here.
  assert.ok(!/return str;/.test(body),
    'the raw display string must not be returned as HTML');
  assert.equal((body.match(/fidsEscHtml\(/g) || []).length, 5,
    'the two early returns, the catch, the city half and the code half must ' +
    'all be escaped — every path out of this function is HTML');
});

test('mkLogo escapes the carrier code and name it writes into attributes', () => {
  const body = bodyOf('mkLogo', CORE);
  assert.ok(body.includes('const _cAttr = fidsEscHtml(c)'),
    'the carrier code is feed text on the fallback paths');
  assert.ok(body.includes('const _nameAttr = fidsEscHtml(displayName)'),
    'displayName falls through to the feed spelling for unknown carriers');
  assert.ok(!/data-code="\$\{c\}"/.test(body),
    'no img may still interpolate the bare code into data-code');
  assert.ok(!/alt="\$\{displayName\}"/.test(body),
    'no img may still interpolate the bare name into alt');
});

test('the phone BIDS layout escapes the same values as the wall board', () => {
  // Not one of the four alerts — a different innerHTML statement, reached only
  // under 700px — but it renders the same feed values, built the same way, and
  // a hostile belt/city/flight/status executed here while the wall board was
  // already fixed. Verified in a browser both before and after.
  const body = bodyOf('renderMobileBaggageHtml', CORE);
  for (const wrapped of [
    'fidsEscHtml(stTxt)', 'fidsEscHtml(cityDisplay)',
    "fidsEscHtml(f.flight || '')", "fidsEscHtml(f.time || '')",
    'fidsEscHtml(beltVal)',
  ]) {
    assert.ok(body.includes(wrapped), `expected ${wrapped} in the phone layout`);
  }
  assert.ok(!/\+ stTxt \+/.test(body) && !/\+ cityDisplay \+/.test(body) && !/\+ beltVal \+/.test(body),
    'no feed value may still be concatenated in raw');
});

// ── the empty-board panel (js/xss-through-dom) ────────────────────────────

test('the no-feed panel builds the airport code as text, not as markup', () => {
  const at = CORE.indexOf("var el = document.getElementById('panelEmpty')");
  assert.ok(at >= 0, 'the empty-panel branch must still exist');
  const branch = code(CORE.slice(at, at + 1800));

  assert.ok(!/innerHTML[\s\S]{0,200}String\(ap\)/.test(branch),
    '?ap= must not reach innerHTML — #apSel is a hidden input, so it is ' +
    'whatever the URL said, and the no-feed branch is the one it lands in');
  assert.ok(/_sub\.textContent = String\(ap\)\.toUpperCase\(\)/.test(branch),
    'the code must be set as text on a node the branch builds');
  // The fixed half is our own constant markup and stays markup.
  assert.ok(branch.includes("el.innerHTML = 'NO FLIGHTS IN WINDOW"),
    'the has-feed message is ours and constant');
});

// ── the revised-time strike remover (js/incomplete-multi-…) ───────────────

test('the strike remover parses instead of stripping tags with a regex', () => {
  // Nested six deep inside the flight-info builder, so it closes at that column.
  const body = code(sliceFn(CORE, '      function _stripScheduledStrike(', '\n      }'));
  assert.ok(!/g8-r2-strike\[\^>\]/.test(body) && !body.includes('[^>]*>[\\s\\S]*?<\\/'),
    'the single-pass tag strip must be gone, including from any fallback — ' +
    'a feed time carrying its own </span> defeats it');
  assert.ok(body.includes("createElement('template')"),
    'the string must be parsed');
  assert.ok(body.includes("querySelectorAll('.g8-r2-strike')") && body.includes('.remove()'),
    'the strike must be removed as an element, not matched as text');
});

test('the strike span escapes the scheduled and revised times it wraps', () => {
  const at = CORE.indexOf("depTimeHtml = '<span class=\"g8-r2-strike\">'");
  assert.ok(at >= 0, 'the revised departure builder must still exist');
  const line = CORE.slice(at, CORE.indexOf('\n', at));
  assert.ok(line.includes('fidsEscHtml(_to12h(currentFlight.time)'),
    '_to12h returns its argument unchanged for a non-HH:MM feed time');
  assert.ok(line.includes('fidsEscHtml(_revDepDisp)'),
    'the revised half comes from currentFlight.upd, which is feed text too');
});

// ── the worker (js/incomplete-multi-…) ────────────────────────────────────

test('the Gander row split strips comments until the string stops changing', () => {
  const body = bodyOf('parseYqxPage', PROXY);
  assert.ok(/do \{[\s\S]*?<!--[\s\S]*?\} while \(/.test(body),
    'one pass leaves a comment standing whenever the markers nest, and ' +
    'whatever survives is still fed to the <tr> match');
  assert.ok(!/tm\[0\]\.replace\(\/<!--/.test(body),
    'the single-pass form must be gone');
});

test('a <tr> hidden in nested comments cannot re-enter the Gander row list', async () => {
  const { parseYqxPage } = await import('../workers/fids-proxy.js');
  // The opening marker is SPLIT around a complete comment: "<!-" + "<!-- -->"
  // + "-". One pass removes the inner comment, the two halves close up into a
  // fresh "<!--", and what the page had commented out is now live markup that
  // the <tr> match picks straight up. Verified both ways — a single pass here
  // yields two rows, the loop yields one.
  const page = '<table class="flights-table-departures"><tbody>'
    + '<tr><td>PB921</td><td>PAL Airlines</td><td>04 Sep</td><td>11:00</td>'
    + '<td>11:00</td><td>Gander</td><td>Halifax</td><td>OnTime</td></tr>'
    + '<!-<!-- -->- <tr><td>ZZ999</td><td>Injected</td><td>04 Sep</td>'
    + '<td>12:00</td><td>12:00</td><td>Gander</td><td>Halifax</td>'
    + '<td>OnTime</td></tr> -->'
    + '</tbody></table>';
  const rows = parseYqxPage(page, 'dep', Date.parse('2026-09-04T12:00:00-02:30'));
  assert.ok(rows.some((r) => r.number === 'PB921'), 'the real row still parses');
  assert.ok(!rows.some((r) => r.number === 'ZZ999'),
    'a row the page commented out must not become a flight on the board');
});

test('yhzCellText survives a split tag — it is read by ~15 airport parsers', async () => {
  const { yhzCellText } = await import('../workers/fids-proxy.js');
  // The classic single-pass defeat: the inner tag is consumed and the outer
  // halves close up behind it.
  assert.ok(!/[<>]/.test(yhzCellText('<scr<script>ipt>alert(1)</scr</script>ipt>')),
    'no markup may survive the strip');
  assert.ok(!/[<>]/.test(yhzCellText('<<a>a href="x">Toronto</a>')));
  // And the cells it exists for still read the same.
  assert.equal(yhzCellText('<td class="c3">St. John&#39;s </td>'), "St. John's");
  assert.equal(yhzCellText('Montreal&nbsp;&amp;&nbsp;Quebec'), 'Montreal & Quebec');
  assert.equal(yhzCellText('<span>AC</span><span>8952</span>'), 'AC 8952');
});
