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
  // The badge says who published the data, in those words.
  assert.match(core, /'FLIGHT DATA PROVIDED BY ' \+ name\.toUpperCase\(\)/);
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

  // The WHOLE name, "International Airport" included. That suffix is what
  // turns the line from a description into an attribution — it names the body
  // that publishes the numbers, which is the reason the badge exists.
  assert.strictEqual(nameOf('YQM'), 'Greater Moncton Roméo LeBlanc International Airport');
  assert.strictEqual(nameOf('LHR'), 'London Heathrow Airport');
  // A period inside a name is part of the name, not a sentence end.
  assert.strictEqual(nameOf('YYT'), "St. John's International Airport");
  assert.strictEqual(nameOf('YTZ'), 'Billy Bishop Toronto City Airport');
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
  // A parenthetical aside is this table's editorial note, not part of the
  // name, and must never reach the badge.
  const asides = codes.filter(c => /[()]/.test(nameOf(c)));
  assert.deepStrictEqual(asides, [], 'aside leaked onto the badge: ' + asides.join(' '));
});

test('the cited site is the airport speaking for itself, never a vendor', () => {
  const m = core.match(/var FIDS_FEED_SITES = \{([\s\S]*?)\n\};/);
  assert.ok(m, 'fids-core must declare FIDS_FEED_SITES');
  const sites = eval('({' + m[1] + '})');
  const codes = Object.keys(sites);
  assert.ok(codes.length > 30, 'expected the generated site table, got ' + codes.length);

  // Someone else's infrastructure. Naming one of these as an airport's own
  // site would be a fresh false claim of the kind this work exists to remove.
  const VENDOR = /(^|\.)(azurewebsites\.net|windows\.net|amazonaws\.com|cloudfront\.net|akamaized\.net|googleapis\.com|azureedge\.net|algolia\.net|flightview\.com|fruition[a-z]*\.com)$/i;
  for (const c of codes) {
    const d = sites[c];
    assert.doesNotMatch(d, VENDOR, c + ' cites a vendor host: ' + d);
    // A bare registrable domain — no scheme, no path, no plumbing sub-label.
    assert.match(d, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, c + ' is not a bare domain: ' + d);
    assert.doesNotMatch(d, /^www\./i, c + ' should not carry www.: ' + d);
    assert.ok(d.split('.').length <= 3, c + ' looks like a sub-host: ' + d);
  }
});

test('an airport with no vouched site still says something true', () => {
  const body = core.slice(
    core.indexOf('function _paintFeedSource'),
    core.indexOf('\n}', core.indexOf('function _paintFeedSource')) + 2
  );
  // The site is appended only when known — never a placeholder, never a guess.
  assert.match(body, /site \? \(' {2}· {2}' \+ site\.toUpperCase\(\)\) : ''/);
  assert.match(body, /FIDS_FEED_SITES\[String\(code \|\| ''\)\.toUpperCase\(\)\] \|\| ''/);
});
