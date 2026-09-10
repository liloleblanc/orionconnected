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
  assert.match(fn, /charCodeAt/, 'the body fallback must actually hash the bytes');
});

test('the body hash changes when the page changes, and only then', () => {
  const at = ROTATE.indexOf('              var h = 0;');
  const end = ROTATE.indexOf('return t.length', at);
  const sig = new Function('t', ROTATE.slice(at, end) + "return t.length + ':' + h;");
  assert.equal(sig('hello world'), sig('hello world'), 'same bytes must give the same signature');
  assert.notEqual(sig('rotator v1'), sig('rotator v2'), 'a changed page must change the signature');
  // The realistic case: one build tag differs deep inside an otherwise identical page.
  const a = 'x'.repeat(4000) + "__ocRotatorVer = 23518;" + 'y'.repeat(4000);
  const b = 'x'.repeat(4000) + "__ocRotatorVer = 23520;" + 'y'.repeat(4000);
  assert.notEqual(sig(a), sig(b), 'a one-token change mid-file must still be detected');
});

test('a pinned single-airport stream can still reload itself', () => {
  // v23422's fix, re-pinned here: without `aps.length < 2` a stream pinned to
  // one airport never sees an airport switch, so it could never take a deploy.
  assert.match(ROTATE, /reloadPending && \(nextAp !== curAp \|\| aps\.length < 2\)/,
    'pinning Moncton must not cut it off from future deploys');
});
