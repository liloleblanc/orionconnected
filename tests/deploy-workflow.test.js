'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// v23809 — DEPLOYING IS A BUTTON NOW, SO THE BUTTON HAS TO BE RIGHT.
//
// Deploying by hand meant: a local checkout that had drifted forty commits
// behind, wrangler not installed, and unfinished work sitting in the way. None
// of those are mistakes, they are just what a working tree looks like — which
// is exactly why the thing that ships should not be one.
//
// The risk moves rather than disappearing. A deploy workflow that skips the
// tests, ships the wrong branch, or reaches the OTHER Worker is worse than no
// workflow at all, because it looks official while doing it. These pin the
// properties that make it safe to press.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const P = path.join(ROOT, '.github', 'workflows', 'deploy.yml');
const YML = fs.readFileSync(P, 'utf8');

/** The `run:` and `uses:` lines, which are the only lines that DO anything. */
function steps() {
  return YML.split('\n').filter((l) => /^\s*(-\s*)?(run|uses):/.test(l));
}

test('the workflow exists and is a manual button', () => {
  assert.match(YML, /^on:/m, 'a workflow needs triggers');
  assert.match(YML, /workflow_dispatch:/, 'it must be runnable from the Actions tab');
});

test('nothing ships without the tests passing', () => {
  const order = steps().join('\n');
  const test_ = order.indexOf('npm test');
  const check = order.indexOf('npm run assets:check');
  const deploy = order.indexOf('wrangler-action');
  assert.ok(test_ >= 0, 'npm test must run');
  assert.ok(check >= 0, 'the asset manifest check must run');
  assert.ok(deploy >= 0, 'something must actually deploy');
  assert.ok(test_ < deploy, 'the tests must run BEFORE the deploy, not after it');
  assert.ok(check < deploy, 'the manifest check must run BEFORE the deploy');
});

test('it ships main, not whatever triggered it', () => {
  assert.match(YML, /ref:\s*main/,
    'an explicit ref, so the thing deployed is the branch we think it is');
});

test('it never reaches the flight-data Worker', () => {
  // workers/fids-proxy.js is a separate Worker with its own bindings and
  // secrets. Deploying it from here would apply the site config to it.
  //
  // Read with the comments stripped. The file is allowed — encouraged — to
  // SAY that it does not ship the proxy; what must not appear is a line that
  // does.
  const live = YML.split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(live, /fids-proxy/,
    'the proxy Worker is deployed separately — see docs/DEPLOYMENT.md');
  assert.doesNotMatch(live, /--config/,
    'no alternate config: the root wrangler.jsonc is the site Worker and the ' +
    'only thing this may ship');
});

test('the credential is a secret and is never echoed', () => {
  assert.match(YML, /apiToken:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/,
    'the token comes from repository secrets, never from the file');
  // A token pasted into the file would match this too, which is the point.
  assert.doesNotMatch(YML, /CLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/,
    'no literal credential may ever appear here');
  for (const l of YML.split('\n')) {
    if (/^\s*(-\s*)?run:/.test(l) || /^\s*echo /.test(l)) {
      assert.doesNotMatch(l, /secrets\./,
        `a secret must not be passed to a shell command: ${l.trim()}`);
    }
  }
});

test('two deploys cannot race', () => {
  // Overlapping runs land in whichever order they finish, which is not
  // necessarily the order they started.
  assert.match(YML, /concurrency:/, 'a deploy must not overlap another deploy');
  assert.match(YML, /cancel-in-progress:\s*false/,
    'a deploy already talking to Cloudflare must be allowed to finish');
});

test('it proves the site is actually serving afterwards', () => {
  assert.match(YML, /fids\.orionconnected\.com/,
    'a deploy that only proves the upload succeeded has proved nothing');
});

test('it asks before shipping to production', () => {
  assert.match(YML, /inputs\.confirm != 'deploy'/,
    'the button is one click from a live estate — it must be deliberate');
});

test('the YAML is syntactically whole', () => {
  // A malformed workflow does not fail loudly; GitHub just never runs it, and
  // the button quietly is not there.
  const lines = YML.split('\n');
  for (const [i, l] of lines.entries()) {
    if (!l.trim() || l.trim().startsWith('#')) continue;
    assert.ok(!/\t/.test(l), `line ${i + 1} uses a tab — YAML forbids tabs for indentation`);
  }
  assert.match(YML, /^name:\s*\S/m, 'the workflow needs a name to appear in the Actions list');
  assert.match(YML, /^jobs:$/m, 'it needs a jobs block');
});
