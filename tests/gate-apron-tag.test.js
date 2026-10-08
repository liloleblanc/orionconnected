'use strict';
// v24018 — THE OTHER AEROPLANES SAY WHOSE THEY ARE (_gateApronTagHtml).
// At 11:45 Moncton gate 3, waiting for a Dash 8, the map showed "a jet at the
// gate": AC644 from Toronto on gate 4's bridge, drawn lighter with no label.
// Each other aeroplane now carries a tag: the flight it is there to fly and
// where to (else the flight it came in on), and its gate in the board's two
// languages, French first in Québec. These pin the words and the markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'fids-current', 'css', 'display-overrides.css'), 'utf8');
const BS = require('../fids-current/js/board-strings.js');

function fnSource(name) {
  const i = CORE.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' exists');
  let d = 0, j = CORE.indexOf('{', i);
  for (; j < CORE.length; j++) { if (CORE[j] === '{') d++; else if (CORE[j] === '}' && --d === 0) break; }
  return CORE.slice(i, j + 1);
}
const gateEntry = (() => { const m = CORE.match(/\n {2}gate: +(\{[^\n]*\}),\n/); assert.ok(m, 'the gate word'); return new Function('return ' + m[1])(); })();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function tagger(langs, frFirst) {
  return new Function('BoardStrings', 'langs', '_GATE_LBL', '_dispIata', 'fidsEscHtml', 'frFirstAirport',
    [fnSource('_lblEntry'), fnSource('_gateApronTagBuild'), fnSource('_gateApronTagHtml'), 'return _gateApronTagHtml;'].join('\n'))(
    BS, langs, { gate: gateEntry }, (c) => String(c || '').toUpperCase(), esc, () => !!frFirst);
}
const text = (html) => { let o = '', i = 0; for (;;) { const a = html.indexOf('<', i); if (a < 0) return o + html.slice(i); o += html.slice(i, a); const b = html.indexOf('>', a); if (b < 0) return o; i = b + 1; } };

test('the tag names the flight it is there to fly, where to, and its gate in both languages', () => {
  const tag = tagger(['en', 'fr'], false);
  const html = tag({ dflight: 'AC647', flight: 'AC644', dest: 'YYZ', door: '4' }, 'YQM');
  assert.match(html, /^<div class="gate-apron-tag-in">/);
  assert.equal(text(html), 'AC647 · YYZGate 4 | Porte 4');
  assert.match(html, /<span class="gat-g" lang="fr">Porte\u00a04<\/span>/, 'each half carries its language');
});

test('French first in Québec; an aeroplane with no departure yet is named by the flight it came in on', () => {
  const tag = tagger(['en', 'fr'], true);
  assert.equal(text(tag({ dflight: '', flight: 'PD2381', dest: '', door: '3' }, 'YUL')), 'PD2381Porte 3 | Gate 3');
});

test('every board language has the gate word, and a missing door or flight gives no line rather than a guess', () => {
  for (const l of BS.LANGS) assert.ok(gateEntry[l], 'gate in ' + l);
  const tag = tagger(['ja', 'en'], false);
  assert.equal(text(tag({ dflight: 'AC647', dest: 'YYZ', door: '4' }, 'YQM')), 'AC647 · YYZゲート 4 | Gate 4');
  assert.equal(text(tag({ dflight: 'AC647', dest: 'YYZ', door: '—' }, 'YQM')), 'AC647 · YYZ', 'no gate known: no gate line');
  assert.equal(tag({ door: '4' }, 'YQM'), '', 'no flight: no tag');
  assert.equal(tag(null, 'YQM'), '');
});

test('the tag rides its own zero-size marker under the aeroplane, smaller and lighter than the board\'s own label', () => {
  assert.match(CORE, /var tag = _gateApronTagHtml\(it, ap\);\s*if \(tag\) \{\s*layers\.push\(L\.marker\(\[pl\.lat, pl\.lng\], \{ zIndexOffset: -900, interactive: false, keyboard: false,\s*icon: L\.divIcon\(\{ className: 'gate-apron-tag', html: tag, iconSize: \[0, 0\], iconAnchor: \[0, 0\] \}\) \}\)\.addTo\(map\)\);/);
  assert.match(CSS, /\.leaflet-marker-icon\.gate-apron-tag \{[^}]*background: none;[^}]*pointer-events: none;/);
  assert.match(CSS, /\.gate-apron-tag-in \{[^}]*transform: translate\(-50%, calc\(-100% - 20px\)\);[^}]*color: #fff;/, 'above its aeroplane');
  assert.match(CSS, /\.gate-apron-tag-in\.gat-below \{ transform: translate\(-50%, 20px\); \}/, 'under it when above collides');
  assert.match(CSS, /\.gate-apron-tag-in\.gat-hide \{ visibility: hidden; \}/, 'hidden when neither fits');
  assert.match(fnSource('_gateApronTagPlace'), /root\.querySelectorAll\('\.gate-map-note'\)/, 'the board\'s own label wins the space');
  assert.match(fnSource('_gateApronTagHtml'), /try \{ return _gateApronTagBuild\(it, ap\); \} catch \(e\) \{ return ''; \}/, 'a tag never costs the aeroplane');
});
