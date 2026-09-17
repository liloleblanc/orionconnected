const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'fids-current');
const core = fs.readFileSync(path.join(root, 'js', 'fids-core.js'), 'utf8');
const BOARDS = ['fids.html', 'gids.html', 'bids.html'];

// Strip // and /* */ comments so these assertions speak about what a VIEWER can
// see, not about what the source says. The provider name is still allowed in
// commentary — the ban tests need it, and the history of why a feed is shaped
// the way it is has to survive somewhere.
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map(l => l.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');
}

test('no board puts a flight-data vendor name on screen', () => {
  for (const file of BOARDS.concat(['app.html'])) {
    const visible = codeOnly(fs.readFileSync(path.join(root, file), 'utf8'));
    assert.doesNotMatch(
      visible, /aerodatabox/i,
      `${file} must not name that provider anywhere a viewer can read it`
    );
  }
  assert.doesNotMatch(
    codeOnly(core), /['"]AERODATABOX['"]/i,
    'fids-core must not write that provider name into any element'
  );
});

test('the source badge ships empty and is filled in by the board', () => {
  for (const file of BOARDS) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    // Empty in the markup on purpose: a name baked into the HTML is on screen
    // before any code runs, and stays there if the paint never happens. That is
    // how a wrong one survived for so long.
    assert.match(
      html, /<span class="ctrl-info" id="apiLabel"><\/span>/,
      `${file} must ship #apiLabel empty`
    );
  }
  assert.match(core, /function _feedSourceName\(/);
  assert.match(core, /function _paintFeedSource\(/);
  // Repainted when the airport changes, or a tour shows the previous airport's
  // source under the next airport's flights.
  assert.match(core, /_paintFeedSource\(iata\)/);
});

test('the badge credits the airport, and never guesses', () => {
  const body = core.slice(
    core.indexOf('function _feedSourceName'),
    core.indexOf('\n}', core.indexOf('function _feedSourceName')) + 2
  );
  const AP = {
    YQM: { name: 'Greater Moncton Roméo LeBlanc International Airport' },
    YYT: { name: "St. John's International Airport" },
    LHR: { name: 'London Heathrow Airport' },
    YTZ: { name: 'Billy Bishop Toronto City Airport' },
    ZZZ: { name: '' }
  };
  const nameOf = new Function('AP', body + '; return _feedSourceName;')(AP);

  // "International Airport" and a trailing "Airport" are the words every entry
  // shares, so they carry no information and cost the badge its whole width.
  assert.strictEqual(nameOf('YQM'), 'Greater Moncton Roméo LeBlanc');
  assert.strictEqual(nameOf('LHR'), 'London Heathrow');
  // A period inside a name is part of the name, not a sentence end.
  assert.strictEqual(nameOf('YYT'), "St. John's");
  // A name that is a person plus a place keeps both — it is how the airport
  // is actually known, and trimming it would sever the phrase.
  assert.strictEqual(nameOf('YTZ'), 'Billy Bishop Toronto City');
  // No name means say nothing. An empty badge is honest; a wrong one is what
  // this replaced.
  assert.strictEqual(nameOf('ZZZ'), '');
  assert.strictEqual(nameOf(''), '');
  assert.strictEqual(nameOf(undefined), '');
  assert.strictEqual(nameOf('QQQ'), '');
});

test('every live airport can name its own source', () => {
  const i = core.indexOf('const AP = {');
  assert.ok(i > 0, 'fids-core must declare AP');
  let depth = 0;
  const start = core.indexOf('{', i);
  let end = start;
  for (; end < core.length; end++) {
    const c = core[end];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) { end++; break; } }
  }
  const AP = eval('(' + core.slice(start, end) + ')');
  const body = core.slice(
    core.indexOf('function _feedSourceName'),
    core.indexOf('\n}', core.indexOf('function _feedSourceName')) + 2
  );
  const nameOf = new Function('AP', body + '; return _feedSourceName;')(AP);

  const live = core.match(/const FIDS_LIVE_AIRPORTS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(live, 'fids-core must declare FIDS_LIVE_AIRPORTS');
  const codes = [...new Set([...live[1].matchAll(/[A-Z]{3}/g)].map(m => m[0]))]
    .filter(c => AP[c]);
  assert.ok(codes.length > 40, 'expected the live roster, got ' + codes.length);

  const blank = codes.filter(c => !nameOf(c));
  assert.deepStrictEqual(
    blank, [],
    'these live airports would show an empty source badge: ' + blank.join(' ')
  );
  // Nothing should still be saying the word the trim exists to remove.
  const untrimmed = codes.filter(c => /\bairport$/i.test(nameOf(c)));
  assert.deepStrictEqual(untrimmed, [], 'untrimmed: ' + untrimmed.join(' '));
});
