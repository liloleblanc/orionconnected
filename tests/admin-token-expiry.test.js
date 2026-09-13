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
    lift('_fidsTokenExpired') + '\n' + lift('_fidsSaveAuthRescue')
      + '\nreturn _fidsSaveAuthRescue;',
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
  // Deliberately run these with an EXPIRED token. With a live one the newer
  // token check would decline the rescue anyway, and the test would pass
  // without the status guard doing any work at all — it would still be green
  // with `status !== 401` widened to `status < 400`. An expired token removes
  // that cover, so only the status guard can keep the session.
  for (const status of [200, 403, 413, 500]) {
    const env = sandbox({ local: { fids_token: DEAD, fids_user: '{}' }, session: {} });
    assert.equal(rescue(env, status), false, `${status} is not an auth failure`);
    assert.equal(env.localStorage.getItem('fids_token'), DEAD,
      `a ${status} must not trigger the session teardown — 413 in particular is ` +
      '"file too large", and losing an admin session over an oversized ad is absurd');
    assert.equal(env.shown, 0, `a ${status} must not pop the login modal`);
  }
});

test('a 401 on a token that has NOT expired leaves the session alone', () => {
  // Reported: uploading a file works, then assigning it to an airline throws
  // the operator out. saveMediaAssignments already called this rescue, and the
  // rescue ended the session on ANY 401 — so a refusal raised for reasons that
  // have nothing to do with the token (a permission the account lacks, a
  // transient upstream failure, an endpoint wanting a different credential)
  // logged the operator out mid-edit and lost the assignment.
  //
  // _acFetch (menu.js:1207) learned this in v23170. This is the same rule.
  const env = sandbox({ local: { fids_token: LIVE, fids_user: '{}' },
                        session: { fids_token: LIVE, fids_user: '{}' } });
  assert.equal(rescue(env, 401), false,
    'a live token means the 401 was about this request, not the session');
  assert.equal(env.localStorage.getItem('fids_token'), LIVE,
    'the session must survive — losing it here is the "it throws me out" report');
  assert.equal(env.sessionStorage.getItem('fids_token'), LIVE);
  assert.equal(env.shown, 0, 'and no login modal, because the login is fine');
});

test('a 401 with no token at all still counts as a dead session', () => {
  // Nothing readable to judge: the session is already gone, so prompt.
  const env = sandbox({ local: {}, session: {} });
  assert.equal(rescue(env, 401), true);
  assert.equal(env.shown, 1);
});

test('widening the rescue cannot cost a session it could not cost before', () => {
  // The six writes that gained the rescue must be no more dangerous than the
  // two that always had it. With a live token every one of them declines to
  // end the session, so a bad 401 anywhere is a message, never a logout.
  for (const tok of [LIVE, jwt(1)]) {
    const env = sandbox({ local: { fids_token: tok }, session: {} });
    assert.equal(rescue(env, 401), false);
    assert.equal(env.localStorage.getItem('fids_token'), tok);
  }
});

// ── every admin write has to be covered ────────────────────────────────────

test('EVERY admin write handles a 401, not just the two that used to', () => {
  // Six of eight had no rescue: addYouTube, upload, vecteezySearch,
  // vecteezyImport, updateItem, deleteItem. Uploading ads was one of them,
  // which is how this was reported.
  // attemptLogin is not an admin write. A 401 there means the password was
  // wrong, and the rescue's job is to POP the login modal — which is already
  // open, and which the operator is typing into. Sending it through the rescue
  // would clear the token they are in the middle of replacing.
  const NOT_A_WRITE = new Set(['attemptLogin']);
  const missing = [];
  const re = /async function (\w+)\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(SRC))) {
    const name = m[1];
    if (NOT_A_WRITE.has(name)) continue;
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

test('a server 401 on a LIVE token reports the refusal without ending the session', async () => {
  // The other order of events: the server refuses while our token is still
  // good by its own clock. That is a refusal of this request, not of the
  // session — a permission the account lacks, a transient upstream failure —
  // and the operator must keep their login and their unsaved work.
  const env = sandbox({ local: { fids_token: LIVE }, session: {} });
  const { fn, calls } = runUpload(env);
  await assert.rejects(
    () => fn({ type: 'image/png' }, 'promo', 'ads'),
    /Upload failed: HTTP 401/,
    'report what the server said rather than blaming the session');
  assert.equal(calls.length, 1, 'this one does get sent — we could not know in advance');
  assert.equal(env.shown, 0, 'no login modal: the login is not the problem');
  assert.equal(env.localStorage.getItem('fids_token'), LIVE,
    'the session must survive a refusal that was never about the token');
});

test('the upload still reaches the network when the session is good', async () => {
  const env = sandbox({ local: { fids_token: LIVE }, session: {} });
  const { fn, calls } = runUpload(env);
  await fn({ type: 'image/png' }, 'promo', 'ads').catch(() => {});
  assert.equal(calls.length, 1, 'a valid session must not be blocked');
  assert.match(calls[0].url, /category=ads/, 'and it still asks for the right category');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer ' + LIVE);
});

// ── the loop that made it unrecoverable ────────────────────────────────────

test('signing in on a board writes BOTH copies, not just the one nobody reads first', () => {
  // The loop behind the repeated ejections, and behind signing in again never
  // helping. The board's own login wrote sessionStorage alone, while
  // _fidsAuthToken() reads localStorage FIRST (v23492). A stale durable token —
  // left by an earlier sign-in on index.html or picker.html, where auth.js DOES
  // write localStorage — outranked every fresh login done on the board. So:
  //   sign in -> fresh token into sessionStorage
  //   next admin write -> _fidsAuthToken returns the OLD localStorage token
  //   401 -> thrown back to the modal -> sign in again -> identical outcome
  // Refreshing the copy nobody reads first cannot break that cycle.
  // Anchor on the login POST itself. 'LIVE_MODE = true' appears earlier in the
  // file (the session-restore block), so slicing to its first occurrence ran
  // backwards and searched an empty string — the test failed while the code was
  // correct, which is its own kind of useless.
  const at = SRC.indexOf("/auth/login'");
  assert.ok(at >= 0, 'the board login POST must still exist');
  const src = SRC.slice(at, at + 2000);
  assert.match(src, /localStorage\.setItem\('fids_token'/,
    'the board login must write the DURABLE copy — it is the one read first, ' +
    'so a login that skips it can be outranked by an expired token forever');
  assert.match(src, /sessionStorage\.setItem\('fids_token'/,
    'and the per-tab mirror, which thirteen direct readers still use');
});

test('a fresh login beats a stale durable token', () => {
  // End to end over the two real functions: the expired durable copy must not
  // be able to shadow a good session.
  const env = sandbox({ local: { fids_token: DEAD, fids_user: '{}' }, session: {} });
  // _fidsAuthToken clears the dead durable copy rather than returning it...
  assert.equal(authToken(env), null);
  assert.equal(env.localStorage.getItem('fids_token'), null);
  // ...so a subsequent login writing both copies is what the next read sees.
  env.localStorage.setItem('fids_token', LIVE);
  env.sessionStorage.setItem('fids_token', LIVE);
  assert.equal(authToken(env), LIVE, 'the fresh token must win once the dead one is gone');
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
