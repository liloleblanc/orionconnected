'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23751 — MEDIA UPLOADS STOPPED WORKING, AND THE CAUSE WAS NOT THE UPLOAD.
//
// The 24h token had aged out, every admin write was 401ing, and the board still
// presented as signed in — so an ended session read as a broken feature.
//
// Three separate things had to be true at once for that to happen, and each
// one is held down here:
//
//   1. The ONLY expiry check lived in auth.js (loadToken). auth.js is loaded
//      by index.html and picker.html — the pages you sign IN on — and by
//      none of fids/gids/bids.html, which is where the media menu runs. So
//      on a board the check never executed.
//   2. _fidsAuthToken() read the token straight out of localStorage with no
//      expiry check and handed the dead thing to callers.
//   3. _fidsSaveAuthRescue() cleared sessionStorage ONLY, while
//      _fidsAuthToken() reads localStorage FIRST — so even where the rescue
//      ran, the next read returned the same expired token. It reported a
//      rescue it had not performed.
//
// And six of the eight admin writes never called the rescue at all, so a 401
// there was a dead end with no prompt and no way back.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'fids-current', 'js', 'fids-core.js'), 'utf8');

// Brace-matched lift of a named function so the harness runs the REAL code.
function lift(name) {
  let at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `fids-core.js must still define ${name}`);
  // Keep the `async` modifier. Slicing from `function` drops it, and the lifted
  // body then throws "await is only valid in async functions" — which reads as
  // a broken test rather than a truncated lift.
  if (SRC.slice(Math.max(0, at - 6), at) === 'async ') at -= 6;
  let depth = 0;
  for (let k = SRC.indexOf('{', at); k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) return SRC.slice(at, k + 1); }
  }
  throw new Error('unterminated ' + name);
}

// A browser-ish sandbox: two independent stores, so a fix that clears only one
// of them fails here exactly as it failed on the device.
function sandbox(initial) {
  const mk = (seed) => {
    const m = new Map(Object.entries(seed || {}));
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      _dump: () => Object.fromEntries(m),
    };
  };
  return { localStorage: mk(initial.local), sessionStorage: mk(initial.session), shown: 0 };
}

function jwt(expSecondsFromNow) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: 'admin', role: 'admin', exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
  })}.sig`;
}

// Build the real _fidsAuthToken with its real collaborators in a fake browser.
function authToken(env) {
  const fn = new Function(
    'localStorage', 'sessionStorage', 'showLoginModal', 'Auth',
    lift('_fidsTokenExpired') + '\n' + lift('_fidsAuthToken') + '\nreturn _fidsAuthToken;',
  )(env.localStorage, env.sessionStorage, () => { env.shown++; }, undefined);
  return fn();
}

function rescue(env, status) {
  const fn = new Function(
    'localStorage', 'sessionStorage', 'showLoginModal', 'Auth',
    lift('_fidsSaveAuthRescue') + '\nreturn _fidsSaveAuthRescue;',
  )(env.localStorage, env.sessionStorage, () => { env.shown++; }, undefined);
  return fn({ status });
}

const LIVE = jwt(3600);       // an hour left
const DEAD = jwt(-3600);      // an hour past

test('a live token is returned untouched', () => {
  const env = sandbox({ local: { fids_token: LIVE }, session: {} });
  assert.equal(authToken(env), LIVE);
  assert.equal(env.localStorage.getItem('fids_token'), LIVE, 'a valid session must not be cleared');
  assert.equal(env.shown, 0, 'no login prompt for a working session');
});

test('an EXPIRED token is refused, not handed to the caller', () => {
  // The whole bug. Every admin write guards on a falsy token with
  // 'Not authenticated', so returning null turns a doomed 40MB upload into an
  // honest refusal before a byte leaves the machine.
  const env = sandbox({ local: { fids_token: DEAD }, session: {} });
  assert.equal(authToken(env), null, 'an expired token must not be handed out');
});

test('the expired token is cleared from BOTH stores, durable included', () => {
  // The specific defect: localStorage is read FIRST, so clearing only the
  // per-tab mirror leaves the next read returning the same dead token.
  const env = sandbox({ local: { fids_token: DEAD, fids_user: '{}' },
                        session: { fids_token: DEAD, fids_user: '{}' } });
  authToken(env);
  assert.equal(env.localStorage.getItem('fids_token'), null,
    'the DURABLE copy must go — it is the one _fidsAuthToken reads first');
  assert.equal(env.sessionStorage.getItem('fids_token'), null, 'the per-tab mirror must go too');
  // And the read must now stay clean rather than resurrecting it.
  assert.equal(authToken(env), null);
});

test('being refused pops the login modal, so there is a way back', () => {
  const env = sandbox({ local: { fids_token: DEAD }, session: {} });
  authToken(env);
  assert.equal(env.shown, 1, 'the operator must be shown how to sign back in');
});

test('a token with no exp claim is left to the server to judge', () => {
  // Absence of a claim is not evidence of death. The server holds the real
  // answer; guessing here would log people out over a token shape we simply
  // do not recognise.
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const noExp = `${b64({ alg: 'HS256' })}.${b64({ sub: 'admin' })}.sig`;
  const env = sandbox({ local: { fids_token: noExp }, session: {} });
  assert.equal(authToken(env), noExp, 'no exp claim must not be treated as expired');
});

test('a malformed token still gets its one round trip', () => {
  // Unparseable is not the same as expired: let the server's own 401 (and the
  // rescue behind it) be what ends the session, rather than guessing locally.
  const env = sandbox({ local: { fids_token: 'not-a-jwt' }, session: {} });
  assert.equal(authToken(env), 'not-a-jwt');
});

test('the durable copy is preferred over the per-tab mirror', () => {
  const other = jwt(7200);
  const env = sandbox({ local: { fids_token: LIVE }, session: { fids_token: other } });
  assert.equal(authToken(env), LIVE, 'localStorage is the durable copy and wins');
});

test('a session-only token still works when there is no durable copy', () => {
  const env = sandbox({ local: {}, session: { fids_token: LIVE } });
  assert.equal(authToken(env), LIVE);
});

// ── the rescue itself ──────────────────────────────────────────────────────

test('the 401 rescue clears the DURABLE copy, not just the mirror', () => {
  const env = sandbox({ local: { fids_token: DEAD, fids_user: '{}' },
                        session: { fids_token: DEAD, fids_user: '{}' } });
  assert.equal(rescue(env, 401), true);
  assert.equal(env.localStorage.getItem('fids_token'), null,
    'clearing only sessionStorage is why the rescue never actually rescued');
  assert.equal(env.sessionStorage.getItem('fids_token'), null);
  assert.equal(env.shown, 1, 'and it must show the way back');
});

test('the rescue ignores every status that is not 401', () => {
  for (const status of [200, 403, 413, 500]) {
    const env = sandbox({ local: { fids_token: LIVE }, session: {} });
    assert.equal(rescue(env, status), false, `${status} is not an auth failure`);
    assert.equal(env.localStorage.getItem('fids_token'), LIVE,
      `a ${status} must not end the session — 413 in particular is "file too large"`);
  }
});

// ── every admin write has to be covered ────────────────────────────────────

test('EVERY admin write handles a 401, not just the two that used to', () => {
  // Six of eight had no rescue: addYouTube, upload, vecteezySearch,
  // vecteezyImport, updateItem, deleteItem. Uploading ads was one of them,
  // which is how this was reported.
  const missing = [];
  const re = /async function (\w+)\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(SRC))) {
    const name = m[1];
    let depth = 0; let body = null;
    for (let k = SRC.indexOf('{', m.index); k < SRC.length; k++) {
      if (SRC[k] === '{') depth++;
      else if (SRC[k] === '}') { depth--; if (depth === 0) { body = SRC.slice(m.index, k + 1); break; } }
    }
    if (!body || !body.includes('_fidsAuthToken()')) continue;
    if (!body.includes('_fidsSaveAuthRescue')) missing.push(name);
  }
  assert.deepEqual(missing, [],
    'these admin writes send a bearer token but give the operator no way back ' +
    'when it has expired: ' + missing.join(', '));
});

// ── end to end, on the function that was reported ──────────────────────────

// Run the REAL uploadLibraryFile against a fake browser and a fetch that
// records whether it was called at all.
function runUpload(env) {
  const calls = [];
  const fetchStub = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: false, status: 401, json: async () => ({ error: 'Invalid or expired token' }) };
  };
  const fn = new Function(
    'localStorage', 'sessionStorage', 'showLoginModal', 'Auth', 'fetch', 'FIDS_API_BASE',
    lift('_fidsTokenExpired') + '\n' + lift('_fidsAuthToken') + '\n'
      + lift('_fidsSaveAuthRescue') + '\n' + lift('uploadLibraryFile')
      + '\nreturn uploadLibraryFile;',
  )(env.localStorage, env.sessionStorage, () => { env.shown++; }, undefined,
    fetchStub, 'https://example.invalid');
  return { fn, calls };
}

test('an expired session refuses the upload BEFORE spending the bytes', async () => {
  // The point of checking on the read path rather than on the response: a
  // 40MB ad would otherwise be uploaded in full, over a phone tether if that
  // is what the airport has, purely to be told the token died.
  const env = sandbox({ local: { fids_token: DEAD }, session: {} });
  const { fn, calls } = runUpload(env);
  await assert.rejects(
    () => fn({ type: 'image/png' }, 'promo', 'ads'),
    /not authenticated/i,
    'an expired session must fail fast and say what is wrong');
  assert.equal(calls.length, 0, 'nothing may be sent once the token is known to be dead');
  assert.equal(env.shown, 1, 'and the operator is shown the way back');
});

test('a server 401 on a token that still looks live pops the login prompt', async () => {
  // The other order of events: the token has not expired by our clock but the
  // server rejects it anyway (revoked, clock skew, secret rotated). The old
  // code threw a bare 'Upload failed: HTTP 401' with no prompt — which is what
  // made this look like a broken uploader rather than an ended session.
  const env = sandbox({ local: { fids_token: LIVE }, session: {} });
  const { fn, calls } = runUpload(env);
  await assert.rejects(
    () => fn({ type: 'image/png' }, 'promo', 'ads'),
    /login expired/i,
    'a 401 must tell the operator to sign in, not just quote a status code');
  assert.equal(calls.length, 1, 'this one does get sent — we could not know in advance');
  assert.equal(env.shown, 1, 'the login modal must appear');
  assert.equal(env.localStorage.getItem('fids_token'), null, 'and the dead token is dropped');
});

test('the upload still reaches the network when the session is good', async () => {
  const env = sandbox({ local: { fids_token: LIVE }, session: {} });
  const { fn, calls } = runUpload(env);
  await fn({ type: 'image/png' }, 'promo', 'ads').catch(() => {});
  assert.equal(calls.length, 1, 'a valid session must not be blocked');
  assert.match(calls[0].url, /category=ads/, 'and it still asks for the right category');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer ' + LIVE);
});

test('the expiry check is on the read path the boards actually use', () => {
  // auth.js has a perfectly good check in loadToken() — and is loaded by
  // index.html and picker.html only. The media menu runs on fids/gids/bids,
  // where Auth is undefined and loadToken never executes. A check that lives
  // only there cannot fire where the uploads happen.
  for (const page of ['fids.html', 'gids.html', 'bids.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'fids-current', page), 'utf8');
    if (/js\/auth\.js/.test(html)) continue;   // if it is ever added, fine
    assert.match(SRC, /function _fidsAuthToken\(\)[\s\S]{0,900}_fidsTokenExpired/,
      `${page} does not load auth.js, so _fidsAuthToken must do the expiry ` +
      'check itself or nothing on that page ever will');
  }
});
