'use strict';

// v23518 — A DEPLOY MUST BE ABLE TO REACH A RUNNING STREAM.
//
// "It has not restarted", "Nothing is
// fixed". Two independent mechanisms exist so a stream box picks up new code
// without anyone touching the server, and BOTH were dead:
//
//   1. rotate.html's checkSelf() polled for an etag/last-modified. Measured on
//      production, https://fids.orionconnected.com/rotate returns neither —
//      200, cf-cache-status HIT, no validator headers at all. So `sig` was ''
//      and the function returned early on every poll, forever.
//   2. fids-core.js's rescue (a board reloads a rotator that cannot reload
//      itself) was gated on a LITERAL `_rotVer < 23422`, while the deployed
//      rotator publishes 23424. Newer than the bar, so it never fired.
//
// Together those left the running page unreachable by any deploy. These tests
// pin the invariants that keep it reachable.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROTATE = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'rotate.html'), 'utf8');
const CORE = fs.readFileSync(
  path.resolve(__dirname, '..', 'fids-current', 'js', 'fids-core.js'), 'utf8');

test('the rescue bar and the rotator version are the same number', () => {
  const pub = ROTATE.match(/__ocRotatorVer\s*=\s*(\d+)/);
  const bar = CORE.match(/_OC_ROTATOR_MIN\s*=\s*(\d+)/);
  assert.ok(pub, 'rotate.html must publish __ocRotatorVer');
  assert.ok(bar, 'fids-core.js must define _OC_ROTATOR_MIN');
  assert.equal(bar[1], pub[1],
    'if the bar is below the version the rotator publishes, the rescue can never fire — that is the 23422-vs-23424 bug');
  assert.match(CORE, /_rotVer < _OC_ROTATOR_MIN/,
    'the rescue must compare against the constant, never a literal that silently ages out');
});

test('checkSelf does not depend on headers the CDN omits', () => {
  const at = ROTATE.indexOf('function checkSelf()');
  assert.ok(at >= 0);
  const fn = ROTATE.slice(at, ROTATE.indexOf('\n      }', at) + 8);
  assert.doesNotMatch(fn, /method:\s*'HEAD'/,
    'a HEAD gives no body to fall back on when /rotate carries no etag');
  assert.match(fn, /r\.text\(\)/, 'it must be able to signature the body');
  // v23950 — the hashing moved into selfSigOf (see the Cloudflare tests below).
  const sf = ROTATE.slice(ROTATE.indexOf('function selfSigOf('), at);
  assert.match(sf, /charCodeAt/, 'the body fallback must actually hash the bytes');
});

// The rotator's own signature function, sliced out of rotate.html and run as
// is, so these tests cannot drift from what ships.
const SIG_SRC = (() => {
  const a = ROTATE.indexOf('var SELF_END = ');
  const b = ROTATE.indexOf('function checkSelf()');
  assert.ok(a > 0 && b > a, 'rotate.html must define SELF_END and selfSigOf before checkSelf');
  return ROTATE.slice(a, b);
})();
const sig = new Function(SIG_SRC + '\nreturn selfSigOf;')();

test('the body hash changes when the page changes, and only then', () => {
  assert.equal(sig('hello world'), sig('hello world'), 'same bytes must give the same signature');
  assert.notEqual(sig('rotator v1'), sig('rotator v2'), 'a changed page must change the signature');
  // The realistic case: one build tag differs deep inside an otherwise identical page.
  const a = 'x'.repeat(4000) + "__ocRotatorVer = 23518;" + 'y'.repeat(4000);
  const b = 'x'.repeat(4000) + "__ocRotatorVer = 23520;" + 'y'.repeat(4000);
  assert.notEqual(sig(a), sig(b), 'a one-token change mid-file must still be detected');
});

// ═══════════════════════════════════════════════════════════════════════════
// v23950 — CLOUDFLARE EDITS THE PAGE; THE SIGNATURE MUST NOT SEE ITS EDITS.
//
// Measured on production on 2026-10-04. /rotate is served with a script of
// Cloudflare's own appended before </body> (its bot check), carrying a new
// request id and timestamp on every response, to a browser that has not yet
// passed the check — which is the state the page is usually in when its
// first self-check runs at load. So the first 30-minute poll "found a new
// page", the rotator reloaded at the next airport switch, and the tour went
// back to its first airport; for a browser that never passes the check this
// repeats every half hour, and the tour never reaches Ottawa (21st of 26).
// Headless Chrome against production, with the 30-minute poll
// shortened to 20 seconds: the load-time check read 42,871 characters with
// the script, the next read 41,933 without it, reloadPending went true and the
// page reloaded at the first airport switch, starting over at Chicago.
// ═══════════════════════════════════════════════════════════════════════════

// The script exactly as Cloudflare appended it to a production response of
// /rotate on 2026-10-04 (only the request id and timestamp vary).
const cfScript = (ray, ts) =>
  '<script>(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);' +
  "if(b){var d=b.createElement('script');d.innerHTML=\"window.__CF$cv$params={r:'" + ray + "',t:'" + ts + "'};" +
  "var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';" +
  "document.getElementsByTagName('head')[0].appendChild(a);\";b.getElementsByTagName('head')[0].appendChild(d)}}" +
  "if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';" +
  "a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);" +
  "if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);" +
  "else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);" +
  "'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script>";
// How the edge serves the file: the script goes in just before </body>.
const served = (html, ray, ts) => html.replace(/\n<\/body>/, '\n' + cfScript(ray, ts) + '</body>');

test('Cloudflare\'s appended script does not change the signature', () => {
  const one = served(ROTATE, 'a45732d0b89f39c3', 'MTc5MTE0ODQ5MA==');
  const two = served(ROTATE, 'a45732d1fdb1ebbd', 'MTc5MTE0ODQ5MQ==');
  assert.notEqual(one, ROTATE, 'the fixture must actually insert the script');
  assert.equal(sig(one), sig(ROTATE),
    'the copy served with the bot-check script must sign the same as the copy served without it');
  assert.equal(sig(one), sig(two),
    'and two copies with different request ids must sign the same — this is the reload');
});

test('other Cloudflare insertions are ignored too', () => {
  const beacon = ROTATE.replace(/\n<\/body>/, '\n' +
    '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"x"}\'></script></body>');
  const email = ROTATE.replace(/\n<\/body>/, '\n' +
    '<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script></body>');
  assert.notEqual(beacon, ROTATE);
  assert.equal(sig(beacon), sig(ROTATE), 'the analytics beacon is not part of the page');
  assert.equal(sig(email), sig(ROTATE), 'nor is the email-protection script');
});

test('a real change to the rotator is still seen, with or without the inserted script', () => {
  const changed = ROTATE.replace("'YOW', 'YHZ'", "'YHZ', 'YOW'");
  assert.notEqual(changed, ROTATE, 'the fixture edit must land (TOUR_DEFAULT order)');
  assert.notEqual(sig(changed), sig(ROTATE), 'an edit to the tour list must change the signature');
  assert.notEqual(sig(served(changed, 'a1', 'b1')), sig(served(ROTATE, 'a2', 'b2')),
    'and must still be seen when both copies carry the inserted script');
});

test('the end marker is the last line of the rotator, so all of the rotator is signed', () => {
  // selfSigOf() signs the page up to the LAST occurrence of the marker. If
  // the marker moved up, or code were added below it, a change to that code
  // would never be seen by a running stream.
  const m = ROTATE.match(/var SELF_END = '([^']+)'/);
  assert.ok(m, 'rotate.html must name its end marker');
  const at = ROTATE.lastIndexOf(m[1]);
  const rest = ROTATE.slice(at).split('\n').slice(1).join('\n');
  assert.match(rest, /^(\s*\/\/[^\n]*\n)*\s*<\/script>\s*<\/body>\s*<\/html>\s*$/,
    'only comment lines may follow the marker, then the end of the script and the page');
  const fnAt = ROTATE.indexOf('function checkSelf()');
  const fn = ROTATE.slice(fnAt, ROTATE.indexOf('\n      }', fnAt) + 8);
  assert.match(fn, /r\.text\(\)\.then\(selfSigOf\)/, 'checkSelf must sign with selfSigOf');
  // A change on the rotator's very last line of code is still seen.
  const edited = ROTATE.replace('if anything fails, the first board still shows', 'if anything fails, the first board shows');
  assert.notEqual(edited, ROTATE);
  assert.notEqual(sig(edited), sig(ROTATE), 'the last line of code before the marker is signed');
});

test('a pinned single-airport stream can still reload itself', () => {
  // v23422's fix, re-pinned here: without `aps.length < 2` a stream pinned to
  // one airport never sees an airport switch, so it could never take a deploy.
  assert.match(ROTATE, /reloadPending && \(nextAp !== curAp \|\| aps\.length < 2\)/,
    'pinning Moncton must not cut it off from future deploys');
});
