'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23985 — ONE FONT FOR MANY AIRPORTS.
//
// The Airport tab can set the board font at every live airport, at a group
// (a region, the stream tour, everyone on a given font) or at a hand-picked
// list, with a preview, a per-airport report and an undo of the last change.
// The worker writes each airport config's `font` field — the field the
// Customize picker already writes — so boards and streams follow on their
// 10-second config poll.
//
// The worker cases run the real worker (workers/fids-proxy.js) against an
// in-memory KV, with tokens signed the way its createJwt signs them (HS256
// over the per-run secret) and checked by its own verifyJwt at the gate, so
// no credential appears in the repo. The menu cases run the
// pure functions sliced out of menu.js against the real roster, time zones
// and tour list. The board case runs the font block sliced out of
// applyAirportConfigToBoard.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const workerPath = path.join(ROOT, 'workers', 'fids-proxy.js');
const WORKER = fs.readFileSync(workerPath, 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');
const MENU_JS = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'menu.js'), 'utf8');
const MENU_HTML = fs.readFileSync(path.join(ROOT, 'fids-current', 'menu.html'), 'utf8');
const ROTATE = fs.readFileSync(path.join(ROOT, 'fids-current', 'rotate.html'), 'utf8');

// ── the worker, in-process ────────────────────────────────────────────────
function fakeKv() {
  const m = new Map();
  const puts = [];
  return {
    m, puts,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { puts.push(k); m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    async list(o) {
      const p = (o && o.prefix) || '';
      return { keys: [...m.keys()].filter((k) => k.startsWith(p)).sort().map((name) => ({ name })), list_complete: true };
    }
  };
}

// A token as the worker's createJwt makes it: HS256, base64url, iat/exp in
// seconds. The worker's verifyJwt checks only the signature and exp.
function signToken(secret, claims) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const msg = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ ...claims, iat: now, exp: now + 3600 });
  return msg + '.' + crypto.createHmac('sha256', secret).update(msg).digest('base64url');
}

async function world(seed = {}) {
  const mod = await import(workerPath);
  const kv = fakeKv();
  const env = { FIDS_USERS: kv, JWT_SECRET: crypto.randomBytes(24).toString('hex') };
  const ctx = { waitUntil() {} };
  async function call(method, p, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await mod.default.fetch(new Request('https://fids-proxy.test' + p, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    }), env, ctx);
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const admin = signToken(env.JWT_SECRET, { sub: 'admin', role: 'admin', name: 'Admin' });
  const viewer = signToken(env.JWT_SECRET, { sub: 'wall', role: 'viewer', name: 'Wall' });
  // What a browser can make on its own: an admin claim it cannot sign.
  const forged = signToken(crypto.randomBytes(24).toString('hex'), { sub: 'admin', role: 'admin', name: 'Admin' });
  // The worker seeds its default admin user on its first request. Make that
  // request here, a read, so the cases below count only their own writes.
  const first = await call('GET', '/api/bulk-font', undefined, admin);
  assert.equal(first.status, 200, 'a token signed with the worker\'s secret is accepted');
  for (const [code, cfg] of Object.entries(seed)) {
    kv.m.set('airport:' + code, typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
  }
  kv.puts.length = 0;
  const cfg = (code) => { const v = kv.m.get('airport:' + code); return v == null ? null : JSON.parse(v); };
  return { mod, kv, env, call, admin, viewer, forged, cfg };
}

const OLD = Date.parse('2026-09-21T12:00:00Z');

test('auth is decided in the worker: no token or a forged admin claim is a 401, a viewer is a 403, and none writes', async () => {
  const w = await world({ ORD: { font: 'ac-nord-text-bold', updatedAt: OLD } });
  const before = JSON.stringify([...w.kv.m]);
  for (const [method, p, body] of [
    ['GET', '/api/bulk-font'],
    ['POST', '/api/bulk-font', { font: '', airports: ['ORD'] }],
    ['POST', '/api/bulk-font/undo', {}]
  ]) {
    assert.equal((await w.call(method, p, body)).status, 401, `${method} ${p} with no token`);
    assert.equal((await w.call(method, p, body, w.forged)).status, 401, `${method} ${p} with an admin claim the worker did not sign`);
    const v = await w.call(method, p, body, w.viewer);
    assert.equal(v.status, 403, `${method} ${p} as a viewer — a valid token is not an admin`);
    assert.equal(v.json.error, 'Admin access required');
  }
  assert.equal(JSON.stringify([...w.kv.m]), before, 'a refused request changes nothing in KV');
  assert.equal(w.kv.puts.length, 0);

  // and the routes live where the gate covers them, each with its own check
  const gate = WORKER.indexOf('if (path.startsWith("/auth/users") || path.startsWith("/api/"))');
  for (const needle of ['return handleGetBulkFont(env, payload, origin)',
    'return handlePostBulkFont(request, env, payload, origin)',
    'return handleUndoBulkFont(request, env, payload, origin)']) {
    const at = WORKER.indexOf(needle);
    assert.ok(at > gate && gate > 0, needle + ' must be registered below the auth gate');
  }
  for (const fn of ['handleGetBulkFont', 'handlePostBulkFont', 'handleUndoBulkFont']) {
    const at = WORKER.indexOf('async function ' + fn + '(');
    assert.match(WORKER.slice(at, at + 300), /if \(!isAdmin\(payload\)\) return jsonResponse\(\{ error: "Admin access required" \}, 403/,
      fn + ' must refuse a non-admin itself — the gate only proves the token is valid');
  }
});

test('a bulk write merges: only font, updatedAt and updatedBy move', async () => {
  const yqm = {
    displayName: 'Greater Moncton', longName: 'Greater Moncton Roméo LeBlanc International',
    theme: 'custom', customColors: { bg: '#0b1f33', text: '#ffffff' },
    presets: [{ id: 'p1', name: 'Night' }], logo: { url: 'https://x.invalid/l.png', position: 'left' },
    langs: ['en', 'fr'], gateBlocks: { order: ['a', 'b'] }, tickerMessage: 'Hello',
    font: 'cabinet-extrabold', updatedAt: OLD, updatedBy: 'someone'
  };
  const w = await world({ YQM: yqm });
  const r = await w.call('POST', '/api/bulk-font', { font: 'bricolage', airports: ['yqm'] }, w.admin);
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  const after = w.cfg('YQM');
  assert.equal(after.font, 'bricolage');
  assert.equal(after.updatedBy, 'admin');
  const strip = (o) => { const c = { ...o }; delete c.font; delete c.updatedAt; delete c.updatedBy; return c; };
  assert.deepEqual(strip(after), strip(yqm), 'every other field is exactly as it was');
  assert.deepEqual(r.json.results, [{ code: 'YQM', ok: true, from: 'cabinet-extrabold', to: 'bricolage', created: false, updatedAt: after.updatedAt }]);
});

test('Default clears the font, the same value the Customize picker\'s Default writes', async () => {
  const w = await world({ ORD: { font: 'ac-nord-display-bold', theme: 'mist', updatedAt: OLD } });
  const r = await w.call('POST', '/api/bulk-font', { font: '', airports: ['ORD', 'YQX'] }, w.admin);
  assert.equal(r.json.success, true);
  assert.equal(w.cfg('ORD').font, '', 'Default is the empty key');
  assert.equal(w.cfg('ORD').theme, 'mist');
  // An airport with no config yet gets one, so its stamp can outrank a font a
  // screen saved for itself.
  assert.equal(w.cfg('YQX').font, '');
  assert.ok(w.cfg('YQX').updatedAt >= Date.now() - 5000);
  assert.equal(r.json.results.find((x) => x.code === 'YQX').created, true);
  // The board treats that empty key as "no airport font": _pref skips only
  // undefined/null, and the font block runs on `if (_font)`.
  assert.match(CORE, /const _font = _urlFontKey \|\| _pref\('font'\);\n  if \(_font\) \{/);
  // and the picker's own Default is the same empty value
  assert.match(MENU_HTML, /<option value="">Default \(Bricolage Grotesque\)<\/option>/);
});

test('the cloud stamp moves past any copy a screen saved, even a stamp from the future', async () => {
  const future = Date.now() + 3600e3;
  const w = await world({ ABC: { font: 'ac-nord-text-bold', updatedAt: OLD }, XYZ: { font: 'possibility', updatedAt: future } });
  const t = Date.now();
  await w.call('POST', '/api/bulk-font', { font: 'cabinet', airports: ['ABC', 'XYZ'] }, w.admin);
  assert.ok(w.cfg('ABC').updatedAt >= t, 'stamped with the server clock');
  assert.equal(w.cfg('XYZ').updatedAt, future + 1, 'never at or below the stamp already there');
  // Same font as before is still written, so a screen holding its own older
  // copy of something else drops it.
  const again = await w.call('POST', '/api/bulk-font', { font: 'cabinet', airports: ['ABC'] }, w.admin);
  assert.equal(again.json.results[0].from, 'cabinet');
  assert.ok(w.cfg('ABC').updatedAt > t);
  // The board side of that rule: a cloud stamp newer than the device's
  // savedAt sheds the device's font.
  assert.match(CORE, /\(\+_userCfg\.savedAt \|\| 0\) < \+_adminCfg\.updatedAt\)/);
  assert.match(CORE, /var _cloudOwned = \['theme', 'themePresetId', 'customColors', 'font',/);
});

test('bad input refuses the whole change before anything is written', async () => {
  const w = await world({ ORD: { font: 'ac-nord-text-bold', updatedAt: OLD } });
  const cases = [
    [{ font: 'comic-sans', airports: ['ORD'] }, /Unknown font/],
    [{ font: 'custom:My Face', airports: ['ORD'] }, /lives on one device/],
    [{ font: null, airports: ['ORD'] }, /font must be a string/],
    [{ airports: ['ORD'] }, /font must be a string/],
    [{ font: '', airports: [] }, /non-empty array/],
    [{ font: '', airports: 'ORD' }, /non-empty array/],
    [{ font: '', airports: ['ORD', 'not a code'] }, /Not airport codes/],
    [{ font: '', airports: new Array(301).fill('ORD') }, /At most 300/]
  ];
  for (const [body, msg] of cases) {
    const r = await w.call('POST', '/api/bulk-font', body, w.admin);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
    assert.match(r.json.error, msg);
  }
  assert.equal(w.kv.puts.length, 0, 'nothing written — not the airports, not an undo record');
  assert.equal(w.cfg('ORD').font, 'ac-nord-text-bold');
});

test('every font the per-airport picker offers is accepted, and only those families', async () => {
  const { _bulkFontKeys } = await import(workerPath);
  const at = MENU_HTML.indexOf('id="cuFontSelect"');
  const sel = MENU_HTML.slice(at, MENU_HTML.indexOf('</select>', at));
  const offered = [...sel.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter((v) => v);
  assert.ok(offered.length > 20, 'the picker list was read');
  for (const k of offered) assert.ok(_bulkFontKeys.has(k), `the picker offers "${k}"; the bulk change must accept it`);
  for (const k of _bulkFontKeys) assert.doesNotMatch(k, /^custom:/);
});

test('an unreadable config is reported and left alone; the rest still change', async () => {
  const w = await world({ ORD: '{not json', DEN: { font: 'ac-nord-display-bold', updatedAt: OLD } });
  const r = await w.call('POST', '/api/bulk-font', { font: '', airports: ['ORD', 'DEN'] }, w.admin);
  assert.equal(r.status, 200);
  assert.equal(r.json.success, false);
  assert.equal(r.json.failed, 1);
  assert.deepEqual(r.json.results.find((x) => x.code === 'ORD'), { code: 'ORD', ok: false, error: 'Config unreadable — left alone' });
  assert.equal(w.kv.m.get('airport:ORD'), '{not json', 'never overwritten');
  assert.equal(w.cfg('DEN').font, '');
});

test('the undo record is written before any airport is touched', async () => {
  const w = await world({ ORD: { font: 'ac-nord-text-bold', updatedAt: OLD }, DEN: { updatedAt: OLD } });
  await w.call('POST', '/api/bulk-font', { font: 'bricolage', airports: ['ORD', 'DEN'] }, w.admin);
  assert.equal(w.kv.puts[0], 'font-bulk-last', 'a run that dies half way can still be undone');
  const rec = JSON.parse(w.kv.m.get('font-bulk-last'));
  assert.equal(rec.font, 'bricolage');
  assert.deepEqual(rec.changes, [
    { code: 'ORD', had: true, prev: 'ac-nord-text-bold', existed: true },
    { code: 'DEN', had: false, prev: null, existed: true }
  ]);
});

test('undo restores the previous fonts, keeps a later choice, and runs once', async () => {
  const w = await world({
    ORD: { font: 'ac-nord-text-bold', theme: 'mist', updatedAt: OLD },
    DEN: { displayName: 'Denver', updatedAt: OLD },             // no font field at all
    SFO: { font: 'ac-nord-display-medium', updatedAt: OLD },
    BOS: { font: '', updatedAt: OLD }
  });
  const applied = await w.call('POST', '/api/bulk-font', { font: '', airports: ['ORD', 'DEN', 'SFO', 'BOS'] }, w.admin);
  const id = applied.json.undo.id;
  // Someone gives SFO another font after the bulk change.
  const sfo = w.cfg('SFO'); sfo.font = 'cabinet-bold'; w.kv.m.set('airport:SFO', JSON.stringify(sfo));

  const listed = await w.call('GET', '/api/bulk-font', undefined, w.admin);
  assert.equal(listed.status, 200);
  assert.equal(listed.json.last.id, id);
  assert.equal(listed.json.last.count, 4);
  assert.equal(listed.json.last.undone, false);
  assert.equal(listed.json.airports.SFO.font, 'cabinet-bold');
  assert.equal(listed.json.airports.DEN.font, '');

  assert.equal((await w.call('POST', '/api/bulk-font/undo', { id: 'not-this-one' }, w.admin)).status, 409,
    'an undo aimed at another change never lands');
  const before = w.cfg('ORD').updatedAt;
  const u = await w.call('POST', '/api/bulk-font/undo', { id }, w.admin);
  assert.equal(u.status, 200);
  assert.equal(u.json.success, true);
  const st = Object.fromEntries(u.json.results.map((r) => [r.code, r.status]));
  assert.deepEqual(st, { ORD: 'restored', DEN: 'unchanged', SFO: 'kept', BOS: 'unchanged' });
  assert.equal(w.cfg('ORD').font, 'ac-nord-text-bold');
  assert.equal(w.cfg('ORD').theme, 'mist');
  assert.ok(w.cfg('ORD').updatedAt > before, 'the undo is newer too, so screens follow it');
  assert.equal(w.cfg('SFO').font, 'cabinet-bold', 'a choice made after the bulk change stays');
  assert.equal(w.cfg('BOS').font, '');

  // DEN had no font field: the bulk change added font:"" — undo of a field
  // that never existed removes it again.
  const w2 = await world({ DEN: { displayName: 'Denver', updatedAt: OLD } });
  const a2 = await w2.call('POST', '/api/bulk-font', { font: 'cabinet', airports: ['DEN'] }, w2.admin);
  await w2.call('POST', '/api/bulk-font/undo', { id: a2.json.undo.id }, w2.admin);
  assert.equal('font' in w2.cfg('DEN'), false);
  assert.equal(w2.cfg('DEN').displayName, 'Denver');

  const twice = await w.call('POST', '/api/bulk-font/undo', { id }, w.admin);
  assert.equal(twice.status, 409);
  assert.match(twice.json.error, /already undone/);
  assert.equal((await w.call('GET', '/api/bulk-font', undefined, w.admin)).json.last.undone, true);
});

// ── the menu: groups, tour, plan ──────────────────────────────────────────
function sliceMenu(startMarker) {
  const at = MENU_JS.indexOf(startMarker);
  assert.ok(at >= 0, 'menu.js must contain ' + startMarker);
  const end = MENU_JS.indexOf('\n}\n', at);
  return MENU_JS.slice(at, end + 3);
}
const fams = MENU_JS.slice(MENU_JS.indexOf('var BF_FAMILIES = ['), MENU_JS.indexOf('];', MENU_JS.indexOf('var BF_FAMILIES = [')) + 2);
const pure = new Function(fams + '\n' + sliceMenu('function bfBuildGroups(ctx) {') + sliceMenu('function bfParseTour(html) {') +
  sliceMenu('function bfPlan(codes, font, fonts) {') + '\nreturn { bfBuildGroups, bfParseTour, bfPlan };')();

const LIVE = (() => {
  const a = CORE.indexOf('const FIDS_LIVE_AIRPORTS = new Set([');
  const body = CORE.slice(a, CORE.indexOf(']);', a)).replace(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/'([A-Z0-9]{3,4})'/g)].map((m) => m[1]);
})();
const TZ = (() => {
  const a = CORE.indexOf('const AP = {');
  const body = CORE.slice(a, CORE.indexOf('\n};', a));
  const out = {};
  for (const m of body.matchAll(/^\s+([A-Z0-9]{3,4}):\{ name:.*?tz:'([^']+)'/gm)) out[m[1]] = m[2];
  return out;
})();
const TOUR = pure.bfParseTour(ROTATE);

test('the stream tour group is read from rotate.html itself', () => {
  assert.ok(Array.isArray(TOUR) && TOUR.length >= 10, 'TOUR_DEFAULT parsed out of rotate.html');
  const lit = ROTATE.slice(ROTATE.indexOf('var TOUR_DEFAULT = ['), ROTATE.indexOf('];', ROTATE.indexOf('var TOUR_DEFAULT = [')));
  assert.deepEqual(TOUR, [...lit.replace(/\/\/[^\n]*/g, '').matchAll(/'([A-Z0-9]{3,4})'/g)].map((m) => m[1]));
  for (const c of TOUR) assert.ok(LIVE.includes(c), c + ' tours, so it is live');
  assert.equal(pure.bfParseTour('<html>no tour here</html>'), null, 'an unreadable page gives no group, not an empty one');
  assert.deepEqual(pure.bfParseTour("var TOUR_DEFAULT = [\n // 'XXX' in a comment\n 'ORD', 'YHZ', 'ORD'\n];"), ['ORD', 'YHZ']);
});

test('the region groups resolve against the real roster and time zones', () => {
  assert.ok(LIVE.length >= 50, 'roster read');
  for (const c of LIVE) assert.ok(TZ[c], c + ' has a time zone in AP');
  const groups = pure.bfBuildGroups({ live: LIVE, tz: TZ, tour: TOUR, fonts: {} });
  const g = Object.fromEntries(groups.map((x) => [x.id, x.codes]));
  // every live airport is in exactly one region
  const regions = ['region:canada', 'region:us', 'region:europe', 'region:auspac'];
  for (const c of LIVE) {
    const hits = regions.filter((r) => (g[r] || []).includes(c));
    assert.equal(hits.length, 1, `${c} (${TZ[c]}) must be in exactly one region, got ${hits.join(',') || 'none'}`);
  }
  for (const c of ['YQM', 'YHZ', 'YYT', 'YSJ', 'YFC', 'YYG', 'YQY']) assert.ok(g['region:atlantic'].includes(c), c + ' is Atlantic Canada');
  for (const c of g['region:atlantic']) assert.ok(g['region:canada'].includes(c));
  for (const c of ['YOW', 'YYZ', 'YUL', 'YYC', 'YEG', 'YZF']) assert.ok(!g['region:atlantic'].includes(c) && g['region:canada'].includes(c), c);
  for (const c of ['ORD', 'JFK', 'SFO', 'MIA', 'PHX']) assert.ok(g['region:us'].includes(c), c + ' is US');
  for (const c of ['LHR', 'DUB', 'EDI', 'KEF', 'ZRH']) assert.ok(g['region:europe'].includes(c), c + ' is Europe');
  assert.deepEqual(g['region:auspac'], ['HBA', 'SYD']);
  assert.deepEqual(g.tour, TOUR);
});

test('the font groups find everyone on a font, including a configured airport with no feed', () => {
  const fonts = {
    ORD: 'ac-nord-text-bold', DEN: 'ac-nord-display-bold', SFO: 'ac-nord-display-bold',
    YQM: 'cabinet-extrabold', YOW: 'bricolage', YVR: 'ac-nord-display-medium', BOS: ''
  };
  const label = (k) => (k ? 'L:' + k : 'Default');
  const groups = pure.bfBuildGroups({ live: LIVE, tz: TZ, tour: null, fonts, label });
  const g = Object.fromEntries(groups.map((x) => [x.id, x]));
  assert.deepEqual(g['family:ac-nord'].codes, ['DEN', 'ORD', 'SFO', 'YVR'], 'every AC Nord weight, YVR included');
  assert.equal(g['family:ac-nord'].label, 'Everyone on AC Nord, any weight');
  assert.deepEqual(g['font:ac-nord-display-bold'].codes, ['DEN', 'SFO']);
  assert.equal(g['font:ac-nord-display-bold'].label, 'Everyone on L:ac-nord-display-bold');
  assert.ok(!g['family:cabinet'], 'one key in use: its own group says it, no family duplicate');
  assert.deepEqual(g['font:cabinet-extrabold'].codes, ['YQM']);
  // no font saved: every live airport without a config, plus BOS ('' saved)
  assert.ok(g['font:'].codes.includes('BOS') && g['font:'].codes.includes('LHR'));
  assert.ok(!g['font:'].codes.includes('ORD') && !g['font:'].codes.includes('YVR'));
  assert.equal(g['font:'].codes.length, LIVE.length - 5, 'the live airports minus the five on a font');
  assert.ok(!g.tour, 'no tour list read: no tour group');
});

test('the plan sends every target, split into changes and those already on the font', () => {
  const p = pure.bfPlan(['ORD', 'yhz', 'ORD', 'bad code', 'YQM'], 'bricolage', { ORD: 'ac-nord-text-bold', YHZ: 'bricolage' });
  assert.deepEqual(p.change, [{ code: 'ORD', from: 'ac-nord-text-bold', to: 'bricolage' }, { code: 'YQM', from: '', to: 'bricolage' }]);
  assert.deepEqual(p.same, [{ code: 'YHZ', from: 'bricolage', to: 'bricolage' }]);
  assert.deepEqual(p.codes, ['ORD', 'YQM', 'YHZ']);
  const d = pure.bfPlan(['BOS'], '', {});
  assert.deepEqual(d.same, [{ code: 'BOS', from: '', to: '' }], 'Default on an airport with no font is "already"');
});

test('the panel reports a refusal and re-reads the server, never shows a change that did not happen', () => {
  const apply = sliceMenu('async function bfApply() {');
  assert.match(apply, /_acFetch\(_ddApi\(\) \+ '\/api\/bulk-font'/);
  assert.match(apply, /_bfRefusal\(res, out, 'Nothing was changed\.'\)/);
  assert.match(apply, /await bfLoad\(true\)/, 'after a write, the list is what the server holds');
  const refusal = sliceMenu('function _bfRefusal(res, out, what) {');
  assert.match(refusal, /res\.status === 403/);
  const undo = sliceMenu('async function bfUndo() {');
  assert.match(undo, /body: JSON\.stringify\(\{ id: _bf\.last\.id \}\)/, 'the undo names the change it means');
  // The picker list is the Customize picker's own, minus device-only uploads.
  const fill = sliceMenu('function _bfFillFonts() {');
  assert.match(fill, /getElementById\('cuFontSelect'\)/);
  assert.match(fill, /cuFontCustomGroup/);
});

test('the stated pickup time is the board\'s real poll', () => {
  assert.match(CORE, /window\._fidsCfgPoll = window\._fidsCfgPoll \|\| setInterval\(function \(\) \{[\s\S]{0,200}refreshAirportConfig\(_code\);[\s\S]{0,40}\}, 10000\);/,
    'boards re-read their airport config every 10 s');
  assert.match(MENU_HTML, /next config check \(every 10&nbsp;s\)/);
});

// ── the board: a cleared font leaves a running board ──────────────────────
test('a board showing an airport font drops it when the font is cleared, with no reload', () => {
  const a = CORE.indexOf("  var _urlFontKey = '';\n  try { _urlFontKey = String(new URLSearchParams(location.search).get('font')");
  const b = CORE.indexOf('  // ── DISPLAY MODE OVERRIDE (v218.6+) ──', a);
  assert.ok(a > 0 && b > a, 'the font block of applyAirportConfigToBoard must be readable');
  const block = CORE.slice(a, b);
  const run = new Function('_pref', 'location', 'document', 'localStorage', 'restoreFontChoice', 'FIDS_FONT_STACKS', block);

  function board(choice) {
    const style = { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } };
    const ovr = { id: 'fids-font-override', textContent: "… font-family: 'AC Nord Display Heavy' …", removed: false, remove() { this.removed = true; } };
    const doc = {
      body: { style, dataset: { fidsFont: 'ac-nord-display-heavy' } },
      head: { appendChild() {} },
      getElementById: (id) => (id === 'fids-font-override' && !ovr.removed ? ovr : null),
      createElement: () => ({})
    };
    const ls = { getItem: (k) => (k === 'fids_font_choice' ? choice : null) };
    const calls = [];
    return { doc, ls, ovr, style, calls, restore: () => calls.push('restore') };
  }
  // The usual board: changeFont() saved a pick at boot.
  const b1 = board('Bricolage Grotesque');
  run(() => '', { search: '' }, b1.doc, b1.ls, b1.restore, {});
  assert.equal(b1.doc.body.dataset.fidsFont, undefined, 'the cleared airport key is gone');
  assert.deepEqual(b1.calls, ['restore'], 'the fall-through runs even though an override was on screen');
  // No saved pick at all: back to the stylesheet default.
  const b2 = board(null);
  run(() => undefined, { search: '' }, b2.doc, b2.ls, b2.restore, {});
  assert.equal(b2.ovr.removed, true);
  assert.equal(b2.doc.body.dataset.fidsFont, undefined);
  assert.deepEqual(b2.calls, []);
});
