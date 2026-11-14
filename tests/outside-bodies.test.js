'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// A BODY FROM ANOTHER HOST IS NEVER A PAGE ON OUR ADDRESS.
//
// The board Worker (worker-entry.js) fetches some bodies elsewhere and hands
// them back from our own origin: airport logos, map tiles, city pictures, the
// map engine, the stream installers, and whatever the bundled proxy answers.
// As an image, a script or a fetch such a body is data. Opened in the address
// bar it is a page load, and an SVG is a document: its script would run on
// our address, where script reads the admin sign-in (storage, and the cookie
// that carries the sign-in across the zone, tests/zone-sign-in.test.js).
//
// /logoimg did exactly that. It took any https address whose host ended in
// .r2.cloudflarestorage.com, which is the storage endpoint of every account
// and not ours alone, and answered with the upstream Content-Type and no
// header that would stop a browser from rendering it.
//
// Now: /logoimg asks our own bucket and no other host; every route that
// hands back an outside body sends
//     Content-Security-Policy: default-src 'none'; sandbox
//     X-Content-Type-Options: nosniff
// and no route repeats the Content-Type an upstream states.
//
// These tests run the REAL handler, with fetch stubbed to play the upstream.
// Nothing here is a real key, token or address of anyone else: the other
// account, the other bucket and the key are made up.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ENTRY = rd('worker-entry.js');
const PROXY = rd('workers/fids-proxy.js');
const CORE = rd('fids-current/js/fids-core.js');

const CSP = "default-src 'none'; sandbox";
/** The public address of our own bucket, read from where the proxy gives it to every upload. */
const OURS = (/^const R2_PUBLIC_BASE = "(https:\/\/[^"]+)";$/m.exec(PROXY) || [])[1];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>document.title = document.cookie</script>'
  + '<path fill="#003DA6" d="M0 0h5v5H0z"/><path fill="#0082CA" d="M5 0h5v5H5z"/><path style="fill:#EE7623" d="M0 5h5v5H0z"/><path fill="#DB0032" d="M5 5h5v5H5z"/></svg>';
const HTML = '<!doctype html><script>document.title = document.cookie</script>';
/** What a browser sends with every request to the zone; made up, and never to be passed on. */
const VISITOR = { Cookie: '__Secure-fids_signin=made.up.value', Authorization: 'Bearer made.up.value' };
const ZONE_HOSTS = ['yqm.orionconnected.com', 'fids.orionconnected.com', 'www.orionconnected.com', 'anything.orionconnected.ca', 'yul.orionconnected.app'];

let MOD = null;
/**
 * The Worker in-process. `upstream(url, init)` plays every outside host and
 * returns a Response; each call is recorded with the headers it carried.
 */
async function world(upstream, envExtra) {
  if (!MOD) MOD = await import(path.join(ROOT, 'worker-entry.js'));
  const asked = [];
  const env = Object.assign({ ASSETS: { fetch: async () => new Response('asset', { status: 200, headers: { 'Content-Type': 'text/plain' } }) } }, envExtra || {});
  const ask = async (address) => {
    const real = globalThis.fetch;
    globalThis.fetch = async (u, init) => {
      const h = new Headers(u instanceof Request ? u.headers : undefined);
      if (init && init.headers) new Headers(init.headers).forEach((v, k) => h.set(k, v));
      const url = String(u instanceof Request ? u.url : u);
      asked.push({ url, headers: Object.fromEntries(h) });
      return upstream(url, init);
    };
    try {
      return await MOD.default.fetch(new Request(address, { headers: VISITOR }), env, { waitUntil() {} });
    } finally { globalThis.fetch = real; }
  };
  return { ask, asked, env };
}
/** An upstream that answers `body` under the stated type ('' states none: bytes, so that no type is added for it). */
const answer = (body, type, status) => new Response(type ? body : new TextEncoder().encode(body), { status: status || 200, headers: type ? { 'Content-Type': type } : {} });
const plays = (body, type, status) => async () => answer(body, type, status);
/** An answer no browser will run as a page, whatever is in it. */
function assertInert(res, what) {
  assert.equal(res.headers.get('Content-Security-Policy'), CSP, what + ': Content-Security-Policy');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff', what + ': X-Content-Type-Options');
}
/** Nothing of the visitor went to the upstream. */
function assertNothingPassedOn(asked) {
  for (const a of asked) {
    assert.deepEqual(Object.keys(a.headers).filter((k) => /cookie|authorization/i.test(k)), [], a.url);
    assert.ok(!a.url.includes('made.up.value'), a.url);
  }
}
function lift(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head + ' must exist');
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('no end for ' + head);
}

// ── /logoimg: our own bucket, and no other host ────────────────────────────

test('/logoimg asks our own bucket only: a host on another account is refused, and never asked', async () => {
  assert.match(OURS, /^https:\/\/pub-[0-9a-f]{32}\.r2\.dev$/, 'the address the proxy gives every upload');
  const ours = new URL(OURS).hostname;
  // the route names that one host, whole, and no suffix any account shares
  const route = lift(ENTRY, "if (path === '/logoimg') {");
  assert.equal((/const LOGO_HOST = '([^']+)';/.exec(route) || [])[1], ours, 'worker-entry.js and the proxy name the same bucket');
  assert.match(route, /const hostOk = target\.protocol === 'https:' && target\.hostname === LOGO_HOST\s*&& !target\.port && !target\.username && !target\.password;/);
  assert.doesNotMatch(route, /endsWith|startsWith|indexOf|includes|\.test\(target|cloudflarestorage/, 'an exact host, not a pattern');
  assert.match(route, /await fetch\('https:\/\/' \+ LOGO_HOST \+ target\.pathname \+ target\.search, /, 'the address asked is rebuilt from the path and the query');
  for (const line of ENTRY.split('\n')) {
    if (/cloudflarestorage/.test(line)) assert.match(line, /^\s*\/\//, 'the storage endpoint of every account is named in a comment only');
  }
  const outside = [
    'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/some-bucket/x.svg?X-Amz-Signature=made-up',   // a bucket on another account, signed link
    'https://some-bucket.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/x.svg',
    'https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com/some-bucket/x.svg',
    'https://pub-0123456789abcdef0123456789abcdef.r2.dev/x.svg',                                                    // another public bucket
    'https://' + ours + '.example.com/x.svg', 'https://x.' + ours + '/x.svg', 'https://' + ours + './x.svg', 'https://' + ours.replace('pub-', 'pub') + '/x.svg',
    'https://' + ours + ':8443/x.svg', 'https://user:made-up@' + ours + '/x.svg', 'https://' + ours + '@example.com/x.svg',
    'http://' + ours + '/x.svg', 'ftp://' + ours + '/x.svg', 'https://example.com/?' + ours, 'https://example.com/' + ours + '/x.svg', 'https://r2.dev/x.svg',
    'https://fids.orionconnected.com/logos/x.svg', 'https://127.0.0.1/x.svg', 'https://localhost/x.svg'
  ];
  const w = await world(plays(SVG, 'image/svg+xml'));
  for (const host of ZONE_HOSTS) {
    for (const u of outside) {
      const res = await w.ask('https://' + host + '/logoimg?u=' + encodeURIComponent(u));
      assert.equal(res.status, 403, host + ' ' + u);
      assert.equal(await res.text(), 'Host not allowed');
      assert.equal(res.headers.get('Cache-Control'), 'no-store');
    }
    for (const u of ['', '//' + ours + '/x.svg', '/logos/x.svg', 'not a url']) {
      const res = await w.ask('https://' + host + '/logoimg?u=' + encodeURIComponent(u));
      assert.equal(res.status, 400, host + ' ' + JSON.stringify(u));
    }
    for (const u of ['javascript:alert(1)', 'data:image/svg+xml,' + encodeURIComponent(SVG), 'blob:https://' + ours + '/x', 'file:///x.svg']) {
      const res = await w.ask('https://' + host + '/logoimg?u=' + encodeURIComponent(u));
      assert.equal(res.status, 403, host + ' ' + u);
    }
  }
  assert.deepEqual(w.asked, [], 'no upstream was asked for any of them');
});

test('/logoimg: a logo from our bucket comes through, an SVG included, and cannot run as a page', async () => {
  const w = await world(plays(SVG, 'image/svg+xml; charset=utf-8'));
  // the address exactly as the board builds it (fids-core.js _extractLogoPalette) from the address the proxy stored
  const logo = OURS + '/airports/yqm/logo.svg?v=1700000000000';
  assert.match(CORE, /if \(lu\.origin !== location\.origin\) src = '\/logoimg\?u=' \+ encodeURIComponent\(lu\.toString\(\)\);/);
  for (const host of ZONE_HOSTS) {
    w.asked.length = 0;
    const res = await w.ask('https://' + host + '/logoimg?u=' + encodeURIComponent(new URL(logo).toString()));
    assert.equal(res.status, 200, host);
    assert.equal(res.headers.get('Content-Type'), 'image/svg+xml', 'our word for the type, without what the upstream added');
    assertInert(res, host + ' /logoimg');
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*', 'the canvas read and the fetch of the board still may');
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=86400');
    assert.equal(await res.text(), SVG, 'the bytes are the logo, untouched');
    assert.deepEqual(w.asked.map((a) => a.url), [logo], 'our bucket was asked, by path and query');
    assertNothingPassedOn(w.asked);
  }
  // the four raster types an upload can be
  for (const [stated, sent] of [['image/png', 'image/png'], ['IMAGE/JPEG', 'image/jpeg'], ['image/webp', 'image/webp'], ['image/gif;q=1', 'image/gif']]) {
    const r = await (await world(plays('BYTES', stated))).ask('https://yqm.orionconnected.com/logoimg?u=' + encodeURIComponent(OURS + '/airports/yqm/logo.png'));
    assert.equal(r.status, 200, stated);
    assert.equal(r.headers.get('Content-Type'), sent);
    assertInert(r, stated);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  }
  // a path that climbs, a fragment, an odd query: still our bucket, still only its path and query
  const odd = await world(plays('BYTES', 'image/png'));
  await odd.ask('https://yqm.orionconnected.com/logoimg?u=' + encodeURIComponent(OURS + '/a/../../b/logo.png?v=1&x=https://example.com/#frag'));
  assert.deepEqual(odd.asked.map((a) => a.url), [OURS + '/b/logo.png?v=1&x=https://example.com/']);
});

test('/logoimg: what the board does with a logo still works: the colours an SVG declares, and an image for the canvas', async () => {
  const w = await world(plays(SVG, 'image/svg+xml'));
  const src = '/logoimg?u=' + encodeURIComponent(new URL(OURS + '/airports/tpa/logo.svg?v=1').toString());
  // 1. fetch(src) and read the text (the vector path of _extractLogoPalette)
  const res = await w.ask('https://tpa.orionconnected.com' + src);
  assert.equal(res.ok, true);
  const declared = new Function(lift(CORE, 'function _rgbToHsl(') + '\n' + lift(CORE, 'function _relLum(') + '\n' + lift(CORE, 'function _svgDeclaredPalette(') + '\nreturn _svgDeclaredPalette;')();
  const pal = declared(await res.text());
  assert.deepEqual(pal.map((c) => [c.r, c.g, c.b]), [[0, 61, 166], [0, 130, 202], [238, 118, 35], [219, 0, 50]], 'the four colours the logo declares');
  // 2. an <img crossorigin="anonymous"> drawn into a canvas: an image type, and the read allowed
  const img = await w.ask('https://tpa.orionconnected.com' + src);
  assert.match(img.headers.get('Content-Type'), /^image\//);
  assert.equal(img.headers.get('Access-Control-Allow-Origin'), '*');
  const use = lift(CORE, 'function _extractLogoPalette(');
  assert.match(use, /var img = new Image\(\);\s*img\.crossOrigin = 'anonymous';/);
  assert.match(use, /fetch\(src, \{ cache: 'force-cache' \}\)\s*\.then\(function \(r\) \{ return r\.ok \? r\.text\(\) : null; \}\)/);
  assert.match(use, /cx\.drawImage\(img, 0, 0, N, N\);\s*var d = cx\.getImageData\(0, 0, N, N\)\.data;/);
  // it is the one caller of the route in the site
  const callers = [];
  const walk = (dir) => {
    for (const n of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + '/' + n.name;
      if (n.isDirectory()) walk(rel);
      else if (/\.(js|html|css)$/.test(n.name) && /\/logoimg\?/.test(rd(rel))) callers.push(rel);
    }
  };
  walk('fids-current');
  assert.deepEqual(callers, ['fids-current/js/fids-core.js']);
});

test('/logoimg: an upstream that is not one of our image types is refused: text/html, XML, an unknown image type, none', async () => {
  for (const stated of ['text/html', 'text/html; charset=utf-8', 'application/xhtml+xml', 'text/xml', 'application/xml', 'image/svg+xml-compressed', 'image/x-icon', 'image/avif',
                        'text/html, image/png', 'application/octet-stream', 'text/plain', 'application/pdf', '']) {
    const w = await world(plays(HTML, stated));
    const res = await w.ask('https://yqm.orionconnected.com/logoimg?u=' + encodeURIComponent(OURS + '/airports/yqm/logo.svg'));
    assert.equal(res.status, 415, JSON.stringify(stated));
    assert.equal(await res.text(), 'Not an image');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(res.headers.get('Content-Type') || '', /html|xml|svg/i);
  }
  // an upstream that fails is a 502 with our own words, never its body
  const res = await (await world(plays(HTML, 'text/html', 404))).ask('https://yqm.orionconnected.com/logoimg?u=' + encodeURIComponent(OURS + '/gone.svg'));
  assert.equal(res.status, 502);
  assert.equal(await res.text(), 'Logo upstream 404');
});

// ── the tiles ──────────────────────────────────────────────────────────────

test('the tile routes: an image for the map, inert as a page, and never the type an upstream states', async () => {
  const PROVIDERS = new Function(lift(ENTRY, 'const TILE_PROVIDERS = ').replace('const TILE_PROVIDERS = ', 'return ') + ';')();
  assert.deepEqual(Object.keys(PROVIDERS).sort(), ['citylabels', 'dark', 'osm', 'positron', 'satellite', 'topo', 'voyager']);
  // /maptiles and /demtiles state PNG themselves, whatever came back
  for (const [p, host] of [['/maptiles/5/9/11.png', 'a.basemaps.cartocdn.com'], ['/maptiles/5/9/11@2x.png', 'a.basemaps.cartocdn.com'], ['/demtiles/5/9/11.png', 'elevation-tiles-prod.s3.amazonaws.com']]) {
    for (const stated of ['image/png', 'text/html', 'image/svg+xml', '']) {
      const w = await world(plays(stated === 'image/png' ? 'PNG' : HTML, stated));
      const res = await w.ask('https://yqm.orionconnected.com' + p);
      assert.equal(res.status, 200, p);
      assert.equal(res.headers.get('Content-Type'), 'image/png', p + ' when the upstream says ' + JSON.stringify(stated));
      assertInert(res, p);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
      assert.equal(new URL(w.asked[0].url).hostname, host);
      assertNothingPassedOn(w.asked);
    }
  }
  // /tiles/<provider>: each provider at its own fixed host; PNG or JPEG through, with our word for the type
  for (const name of Object.keys(PROVIDERS)) {
    const w = await world(plays('TILE', name === 'satellite' ? 'image/jpeg' : 'image/png; charset=binary'));
    const res = await w.ask('https://yqm.orionconnected.com/tiles/' + name + '/5/9/11.png');
    assert.equal(res.status, 200, name);
    assert.equal(res.headers.get('Content-Type'), name === 'satellite' ? 'image/jpeg' : 'image/png');
    assertInert(res, '/tiles/' + name);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=86400');
    assert.equal(await res.text(), 'TILE');
    assert.equal(w.asked.length, 1);
    assert.equal(new URL(w.asked[0].url).origin, new URL(PROVIDERS[name]).origin, name + ' is asked of its own host');
    assertNothingPassedOn(w.asked);
  }
  // a provider that states no type is a PNG, as before
  let res = await (await world(plays('TILE', ''))).ask('https://yqm.orionconnected.com/tiles/osm/5/9/11.png');
  assert.deepEqual([res.status, res.headers.get('Content-Type')], [200, 'image/png']);
  assertInert(res, 'no stated type');
  // one that states anything but a raster image has not sent a tile: refused, and not cached
  for (const stated of ['text/html', 'image/svg+xml', 'application/xml', 'text/plain', 'application/json']) {
    res = await (await world(plays(HTML, stated))).ask('https://yqm.orionconnected.com/tiles/osm/5/9/11.png');
    assert.equal(res.status, 502, stated);
    assert.equal(await res.text(), 'Tile upstream type');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
  // no caller can name a host: an unknown provider, or a path that is not a tile
  const w = await world(plays('TILE', 'image/png'));
  assert.equal((await w.ask('https://yqm.orionconnected.com/tiles/example/5/9/11.png')).status, 404);
  assert.equal((await w.ask('https://yqm.orionconnected.com/tiles/osm/5/9/x.png')).status, 400);
  assert.equal((await w.ask('https://yqm.orionconnected.com/maptiles/5/9/..%2F11.png')).status, 400);
  assert.deepEqual(w.asked, []);
  // the layers of the boards ask in exactly these shapes
  assert.ok(CORE.includes("L.tileLayer('/maptiles/{z}/{x}/{y}{r}.png', { maxZoom: 10, subdomains: 'abcd' })"));
  assert.ok(CORE.includes("L.tileLayer('/tiles/osm/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '', zIndex: 1 })"));
  assert.ok(CORE.includes("L.tileLayer('/tiles/photo/' + ap + '/{z}/{x}/{y}', {"));
});

test('our own photo tiles (storage, not another host): the same two headers, and JPEG or PNG only', async () => {
  const stored = { 'maptiles/geonb-yqm/18/83967/93139': 'image/jpeg', 'maptiles/geonb-yqm/14/5247/5820': 'image/png', 'maptiles/geonb-yqm/15/1/1': 'image/svg+xml', 'maptiles/geonb-yqm/15/1/2': 'text/html' };
  const bucket = { FIDS_ASSETS: { get: async (k) => (stored[k] ? { body: 'IMG', httpEtag: '"e1"', httpMetadata: { contentType: stored[k] } } : null) } };
  const w = await world(async () => { throw new Error('no outside host is asked for a photo tile'); }, bucket);
  for (const [p, type] of [['18/83967/93139', 'image/jpeg'], ['14/5247/5820', 'image/png'], ['15/1/1', 'image/jpeg'], ['15/1/2', 'image/jpeg']]) {
    const res = await w.ask('https://yqm.orionconnected.com/tiles/photo/YQM/' + p);
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('Content-Type'), type, p + ' is stored as ' + stored['maptiles/geonb-yqm/' + p]);
    assertInert(res, p);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(res.headers.get('Cache-Control'), /max-age=2592000/);
    assert.equal(await res.text(), 'IMG');
  }
  const miss = await w.ask('https://yqm.orionconnected.com/tiles/photo/YQM/18/1/1');
  assert.equal(miss.status, 404, 'a tile the photo does not reach: the street map shows through');
  assertInert(miss, 'a missing photo tile');
  assert.deepEqual(w.asked, []);
});

// ── the city pictures ──────────────────────────────────────────────────────

function cityKv(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    m,
    get: async (k) => (m.has(k) ? m.get(k).value : null),
    getWithMetadata: async (k) => (m.has(k) ? { value: m.get(k).value, metadata: m.get(k).metadata || null } : { value: null, metadata: null }),
    put: async (k, v, o) => { m.set(k, { value: v, metadata: (o && o.metadata) || null }); }
  };
}
/** Pixabay, played: one hit tagged with the city, then the picture under the stated type. */
const pixabay = (type, body) => async (url) => (/^https:\/\/pixabay\.com\/api\//.test(url)
  ? new Response(JSON.stringify({ hits: [{ id: 1, tags: 'moncton, new brunswick, skyline', largeImageURL: 'https://pixabay.com/get/made-up_1280.jpg' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  : answer(body, type));

test('/citypic: a photograph for the weather card, inert as a page, under a photograph type or not at all', async () => {
  // the address exactly as the card builds it (fids-core.js _wxCityPic), used as a CSS background
  assert.match(CORE, /return '\/citypic\?iata=' \+ _wxEnc\(k\) \+ \(q \? '&q=' \+ _wxEnc\(q\) : ''\);/);
  const address = 'https://yqm.orionconnected.com/citypic?iata=YQM&q=' + encodeURIComponent('Moncton');
  for (const [stated, sent] of [['image/jpeg', 'image/jpeg'], ['image/png; charset=binary', 'image/png'], ['image/webp', 'image/webp'], ['image/gif', 'image/gif']]) {
    const kv = cityKv();
    const w = await world(pixabay(stated, 'PHOTO'), { CITY_BG_CACHE: kv, PIXABAY_KEY: 'made-up-key' });
    const res = await w.ask(address);
    assert.equal(res.status, 200, stated);
    assert.equal(res.headers.get('Content-Type'), sent);
    assertInert(res, '/citypic ' + stated);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=86400');
    assert.equal(await res.text(), 'PHOTO');
    assert.equal(kv.m.get('citypic:v2:YQM:moncton').metadata.type, sent, 'and it is kept under our word for the type');
    assert.deepEqual([...new Set(w.asked.map((a) => new URL(a.url).hostname))], ['pixabay.com']);
    assertNothingPassedOn(w.asked);
    // the copy kept here answers the next board the same way, with no upstream
    w.asked.length = 0;
    const again = await w.ask(address);
    assert.deepEqual([again.status, again.headers.get('Content-Type')], [200, sent]);
    assertInert(again, 'the kept copy');
    assert.deepEqual(w.asked, []);
  }
  // a download that is not a photograph is an upstream fault: nothing served, nothing kept
  for (const stated of ['image/svg+xml', 'text/html', 'application/xml', 'image/x-icon', '']) {
    const kv = cityKv();
    const res = await (await world(pixabay(stated, SVG), { CITY_BG_CACHE: kv, PIXABAY_KEY: 'made-up-key' })).ask(address);
    assert.equal(res.status, 502, JSON.stringify(stated));
    assert.match(await res.text(), /^citypic upstream image( type| 200)$/);
    assert.equal(kv.m.has('citypic:v2:YQM:moncton'), false);
    assert.doesNotMatch(res.headers.get('Content-Type') || '', /svg|html|xml/i);
  }
  // a copy kept before this, under a type that is not a photograph's, is never served as that type
  for (const old of ['image/svg+xml', 'text/html']) {
    const kv = cityKv({ 'citypic:v2:YQM:moncton': { value: new TextEncoder().encode(SVG).buffer, metadata: { type: old } } });
    const res = await (await world(pixabay('image/jpeg', 'PHOTO'), { CITY_BG_CACHE: kv })).ask(address);   // no key: nothing to look up again
    assert.equal(res.status, 404, old);
    assert.doesNotMatch(res.headers.get('Content-Type') || '', /svg|html/i);
  }
  // one kept with no type at all is a JPEG, as before
  const kv = cityKv({ 'citypic:v2:YQM:moncton': { value: new TextEncoder().encode('PHOTO').buffer } });
  const res = await (await world(pixabay('image/jpeg', 'PHOTO'), { CITY_BG_CACHE: kv })).ask(address);
  assert.deepEqual([res.status, res.headers.get('Content-Type')], [200, 'image/jpeg']);
  assertInert(res, 'a kept copy with no type');
});

// ── the map engine and the installers: text, under a type fixed here ────────

test('/mapcdn and the installers: the type is ours whatever the upstream states, and the answer is inert as a page', async () => {
  for (const [p, type] of [['/mapcdn/leaflet.js', 'application/javascript'], ['/mapcdn/leaflet-arc.js', 'application/javascript'], ['/mapcdn/leaflet.css', 'text/css'],
                           ['/a', 'text/plain; charset=utf-8'], ['/s', 'text/plain; charset=utf-8'], ['/t', 'text/plain; charset=utf-8'], ['/o', 'text/plain; charset=utf-8']]) {
    for (const stated of ['text/html', 'image/svg+xml', 'application/javascript', '']) {
      const w = await world(plays(HTML, stated));
      const res = await w.ask('https://fids.orionconnected.com' + p);
      assert.equal(res.status, 200, p);
      assert.equal(res.headers.get('Content-Type'), type, p + ' when the upstream says ' + JSON.stringify(stated));
      assertInert(res, p);
      assert.equal(w.asked.length, 1, p + ' asks one fixed address');
      assertNothingPassedOn(w.asked);
    }
  }
  // the types a <script src> and a stylesheet are accepted under with nosniff
  assert.match(ENTRY, /const ct = file\.endsWith\('\.css'\) \? 'text\/css'\s*: file\.endsWith\('\.js'\)  \? 'application\/javascript'\s*: 'application\/octet-stream';/);
  const w = await world(plays(HTML, 'text/html'));
  assert.equal((await w.ask('https://fids.orionconnected.com/mapcdn/other.js')).status, 404, 'only the files listed');
  assert.deepEqual(w.asked, []);
  // the boards load the engine as scripts
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = rd('fids-current/' + page);
    assert.match(html, /<script src="\/mapcdn\/leaflet\.js\?v=\d+"><\/script>\s*<script src="\/mapcdn\/leaflet-arc\.js\?v=\d+"><\/script>/, page);
  }
});

// ── the bundled proxy, on a label of our zones ─────────────────────────────

test('the bundled proxy: whatever it answers on a fids-proxy label leaves the board Worker inert', async () => {
  assert.equal((ENTRY.match(/proxy\.fetch\(/g) || []).length, 1);
  assert.match(ENTRY, /if \(url\.hostname\.startsWith\("fids-proxy"\)\) \{\s*return inert\(await proxy\.fetch\(request, env, ctx\)\);\s*\}/);
  const kv = { get: async () => JSON.stringify({ role: 'admin' }), put: async () => {}, list: async () => ({ keys: [] }) };
  const w = await world(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }), { FIDS_USERS: kv, FIDS_LIVE_FLIGHTS: kv });
  for (const host of ['fids-proxy.orionconnected.com', 'fids-proxy.orionconnected.ca', 'fids-proxyx.orionconnected.com', 'fids-proxy.example.workers.dev']) {
    for (const [p, status, type] of [['/health', 200, 'application/json'], ['/stream/agent.sh', 200, 'text/plain; charset=utf-8'], ['/stream/control', 200, 'application/json'],
                                     ['/auth/users', 401, 'application/json'], ['/no-such-route', null, null]]) {
      const res = await w.ask('https://' + host + p);
      if (status) assert.equal(res.status, status, host + p);
      if (type) assert.equal(res.headers.get('Content-Type'), type, host + p + ': the answer of the proxy itself, unchanged');
      assertInert(res, host + p);
      if (status === 200) assert.ok(res.headers.get('Access-Control-Allow-Origin'), host + p + ': and its own headers are kept');
      await res.arrayBuffer();
    }
  }
  // the helper itself: the two headers are set, everything else of the answer is kept
  const inert = new Function('Headers', 'Response', lift(ENTRY, 'const INERT = ') + ';\n' + lift(ENTRY, 'function inert(') + '\nreturn inert;')(Headers, Response);
  const made = inert(new Response('<svg/>', { status: 203, headers: { 'Content-Type': 'image/svg+xml', 'X-Kept': 'yes', 'Content-Security-Policy': 'script-src *' } }));
  assert.deepEqual([made.status, made.headers.get('Content-Type'), made.headers.get('X-Kept'), made.headers.get('Content-Security-Policy'), made.headers.get('X-Content-Type-Options'), await made.text()],
    [203, 'image/svg+xml', 'yes', CSP, 'nosniff', '<svg/>'], 'a weaker policy of the upstream is replaced, not joined');
  assert.equal(inert(null), null);
});

// ── the census: a new passthrough is noticed here ──────────────────────────

test('in the source: every outside fetch of the board Worker is one of these, and no answer repeats an upstream Content-Type', () => {
  const code = ENTRY.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  // the two headers, exactly, defined once
  assert.match(ENTRY, /^const INERT = \{ 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff' \};$/m);
  assert.match(ENTRY, /^const RASTER_TYPES = \['image\/png', 'image\/jpeg', 'image\/webp', 'image\/gif'\];$/m);
  assert.match(ENTRY, /^const LOGO_TYPES = RASTER_TYPES\.concat\(\['image\/svg\+xml'\]\);$/m);
  // the image types are the ones the upload controls of the site accept
  assert.match(rd('fids-current/menu.html'), /accept="video\/mp4,video\/webm,image\/png,image\/jpeg,image\/webp,image\/gif,image\/svg\+xml,\.svg"/);
  // every fetch of another host, by the route it belongs to
  const fetches = (code.match(/await fetch\(([^,)]*)/g) || []).map((f) => f.replace('await fetch(', ''));
  assert.match(fetches[0], /^'https:\/\/fids-proxy\.[a-z0-9-]+\.workers\.dev\/stream\/agent\.sh'$/, '/a: the installer script of our own proxy, one fixed address');
  assert.deepEqual(fetches.slice(1), [
    'src',                                                               // /s /t /o
    'upstream',                                                          // /mapcdn
    'sunUrl',                                                            // /wxsun      (the answer is rebuilt JSON)
    'u',                                                                 // /citypic    (the search: JSON, read here)
    'hit.largeImageURL',                                                 // /citypic    (the picture)
    'om',                                                                // /wxdaily, /wxcurrent (rebuilt JSON)
    "'https://' + LOGO_HOST + target.pathname + target.search",          // /logoimg
    'upstream',                                                          // /miafids    (rebuilt JSON)
    'TILE_BASE + rest',                                                  // /maptiles
    'DEM_BASE + rest',                                                   // /demtiles
    'upstream'                                                           // /tiles/<provider>
  ], 'a new outside fetch belongs in this list, and its answer in the tests above');
  // each answer that carries an outside body is built with INERT; the proxy and the photo tiles go through inert()
  assert.equal((code.match(/\.\.\.INERT\b/g) || []).length, 8, '/a, the installers, /mapcdn, /citypic, /logoimg, /maptiles, /demtiles, /tiles');
  assert.deepEqual((code.match(/\binert\(/g) || []).length, 3, 'the helper, the bundled proxy, the photo tiles');
  for (const m of code.matchAll(/new Response\((r\.body|body|bytes|hit\.value), \{([\s\S]*?)\}\);/g)) {
    assert.match(m[2], /\.\.\.INERT\b|picHead\(/, 'an outside body answered without INERT: new Response(' + m[1] + ', …)');
  }
  assert.match(code, /const picHead = \(type, age\) => \(\{ 'Content-Type': type, 'Cache-Control': 'public, max-age=' \+ age, 'Access-Control-Allow-Origin': '\*', \.\.\.INERT \}\);/);
  // a Content-Type read off an answer is never sent on as it is: it is pinned, or only looked at
  const reads = code.split('\n').filter((l) => /headers\.get\('Content-Type'\)/.test(l)).map((l) => l.trim());
  assert.deepEqual(reads, [
    "const type = (img.headers.get('Content-Type') || '').split(';')[0].trim();",
    "const ct = pinnedType(r.headers.get('Content-Type'), LOGO_TYPES);",
    "const stated = r.headers.get('Content-Type');",
    "|| (res.headers.get('Content-Type') || '').indexOf('text/html') !== -1;"
  ]);
  assert.match(code, /const kind = pinnedType\(type, RASTER_TYPES\);\s*if \(!kind\) return faulted\('image type', false\);/);
  assert.match(code, /const ct = stated \? pinnedType\(stated, RASTER_TYPES\) : 'image\/png';\s*if \(!ct\) return new Response\('Tile upstream type', \{ status: 502, headers: NO_STORE \}\);/);
  assert.doesNotMatch(code, /'Content-Type':\s*[^,\n]*headers\.get/, 'no header of an answer is a header of an upstream');
  assert.deepEqual(code.match(/picHead\([^)]*\)/g), ['picHead(kept, 86400)', 'picHead(kind, 86400)'], 'a city picture is sent under a pinned type only');
});
