#!/usr/bin/env node
'use strict';
// ━━ THE BOARD-LANGUAGES GATE, FOR A DEPLOY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//   npm run guard
//
// The part of the guard that needs nothing but the files: every check in
// tests/i18n/checks.js, held to the debt ledger. Exit 1 on any passenger word
// outside the nine-language store that the ledger does not already list, on
// any finding of a check that is never ledgered, and on a ledger entry that
// claims more than is there.
//
// It is what a deploy runs before it ships: the "Deploy display site"
// workflow runs it inside `npm test`, and the Workers Builds build command
// (Cloudflare dashboard → the fids Worker → Settings → Build) runs it as
// `npm run guard`, so a merge that fails the guard never reaches the
// screens. The comparisons with main (the ledger and the exceptions may only
// shrink) need git history and run in the pull request's checks instead.

const checks = require('./checks');
const ledger = require('./ledger');

const t0 = Date.now();
const { findings } = checks.run();
const entries = ledger.load();
const ledgered = findings.filter((f) => !ledger.NEVER_LEDGERED.has(f.check));
const never = findings.filter((f) => ledger.NEVER_LEDGERED.has(f.check));
const { fresh, over, stale } = ledger.compare(ledgered, entries, checks.id);
const bad = never.concat(fresh, ...over.map((o) => o.found.slice(o.entry.count)));

for (const f of bad.slice(0, 60)) console.log(`  ${f.check} ${f.file}:${f.line}${f.fn ? ' ' + f.fn + '()' : ''}  ${f.msg}`);
if (bad.length > 60) console.log(`  … and ${bad.length - 60} more`);
for (const s of stale.slice(0, 20)) console.log(`  fixed but still ledgered: ${s.entry.id} (ledger ${s.entry.count}, found ${s.found})`);

if (bad.length || stale.length) {
  console.log(`\nBoard languages: ${bad.length} passenger word(s) outside the nine-language store, ${stale.length} stale ledger entr${stale.length === 1 ? 'y' : 'ies'}.`
    + '\nNothing ships until they are fixed: docs/BOARD-LANGUAGES.md.');
  process.exit(1);
}
console.log(`Board languages: clean — ${entries.length} ledgered items open (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
