'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// NO PERSONAL NAMES AND NO QUOTED CONVERSATION IN THIS REPOSITORY.
//
// Comments must record the DECISION and the REASONING. They must not record who
// said what, or reproduce what they said. A working conversation is not
// documentation, and quoting one is unprofessional regardless of whether the
// repository is public.
//
// This had accumulated to 2,065 occurrences across 43 files over three and a
// half months before it was removed, and it had been raised more than once in
// that time. It kept returning because nothing enforced it — every comment
// explaining the rule was itself just a comment. This test is the enforcement.
//
// If this fails: rewrite the offending comment to state the decision and why,
// with no name and no quotation. See docs/FLIGHT-DATA-PROVIDERS.md for the
// house style.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Text-bearing sources only. SVG path data and base64 blobs throw false
// positives — random character runs inside a `d="..."` attribute matched a
// profanity search the first time this was checked.
const EXTS = ['.js', '.css', '.html', '.md', '.json', '.jsonc', '.sh', '.py', '.yml', '.yaml'];

function trackedTextFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n')
    .filter(Boolean)
    .filter(f => EXTS.includes(path.extname(f)))
    // Asset manifests are generated and list filenames, not prose.
    .filter(f => !f.endsWith('assets/asset-manifest.json'))
    // tests/fixtures/** is captured third-party markup — real airport websites
    // saved verbatim so the parsers can be tested against them. Their wording
    // is evidence and must not be edited; an airport's own disclaimer is not
    // our comment.
    .filter(f => !f.includes('tests/fixtures/'))
    // This file necessarily contains the patterns it forbids.
    .filter(f => !f.endsWith('tests/no-personal-content.test.js'));
}

function scan(re) {
  const hits = [];
  for (const f of trackedTextFiles()) {
    let body;
    try { body = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
    body.split('\n').forEach((line, i) => {
      if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 110)}`);
      re.lastIndex = 0;
    });
  }
  return hits;
}

test('no personal name appears in any tracked source file', () => {
  // The owner's given name. Word-boundary so "Nickel", "nickname" and the like
  // are not caught.
  const hits = scan(/\bNick\b/);
  assert.deepEqual(hits, [],
    'Personal names must not appear in the codebase. State the decision and the ' +
    'reasoning instead — "Reported:", "Decision, <date>:", or simply the fact.');
});

test('no profanity is quoted in any tracked source file', () => {
  const hits = scan(/\b(?:fuck|fucking|fucked|shit|bullshit|attrocious)\b/i);
  assert.deepEqual(hits, [],
    'Quoted conversation does not belong in comments, least of all this. ' +
    'Describe the fault and the fix.');
});

test('no comment quotes conversational speech', () => {
  // Catching this generically is harder than it looks, and the first attempt
  // got it wrong: keying on `<Capitalised>: "..."` flagged four legitimate
  // technical comments — `Catches: "De Havilland Dash 8-400"`, an
  // `"Aircraft Type:"` UI label, a design note reading
  // `Aesthetic: "Airport Operations Console"`. An allowlist of permitted nouns
  // would need extending forever.
  //
  // The real discriminator is not WHO is quoted, it is WHAT the quote sounds
  // like. Technical examples are noun phrases: model names, field labels,
  // literal values. Conversation carries first- and second-person pronouns,
  // contractions, requests and complaints. Key on that instead — it needs no
  // allowlist and it catches a name this test has never heard of.
  // Two bugs cost three iterations of this test and are worth naming, because
  // both make a guard LOOK strict while reporting nonsense:
  //   · "us" as a speech token matched the path /logos/airlines/us-major/...
  //     Generic pronouns must not be so short that code matches them.
  //   · a naive ['"] close matched the apostrophe inside don't / isn't, so the
  //     "quote" began mid-word: `t an ADB airport for us`. A closing quote is
  //     only a closing quote when a letter does not follow it.
  //   · "your" and "my" are PRODUCT COPY here, not speech. The board says
  //     "Your Aircraft | Votre Avion" and "Please remain seated until your zone
  //     is called"; an ad says "Your world awaits"; a default template is called
  //     "My Gate Template". Ten legitimate comments were flagged before those
  //     two tokens came out. A genuine complaint carries "I" or an informal
  //     contraction anyway, so nothing real is lost.
  const SPEECH = /(?:^|[^\w'])(?:I|I'm|I've|me|please|why|wtf|don't|doesn't|didn't|can't|won't|isn't|wasn't|dont|cant|didnt|doesnt|thats|make it|put it|change it|fix it|supposed to)(?:$|[^\w'])/;
  const quoted = /"([^"\n]{15,})"|'([^'\n]{15,})'(?![A-Za-z])/g;
  const hits = [];
  for (const f of trackedTextFiles()) {
    let body;
    try { body = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
    body.split('\n').forEach((line, i) => {
      if (!/(?:\/\/|^\s*\*|<!--|^\s*#)/.test(line)) return;   // comment lines only
      let m;
      quoted.lastIndex = 0;
      while ((m = quoted.exec(line))) {
        const q = m[1] || m[2] || '';
        // Paths, URLs and selectors are values, not speech.
        if (/[/\\]|https?:|^[.#@]|=|\{|\}/.test(q)) continue;
        if (SPEECH.test(q)) {
          hits.push(`${f}:${i + 1}: ${q.slice(0, 90)}`);
          break;
        }
      }
    });
  }
  assert.deepEqual(hits, [],
    'A comment is quoting conversation. Record what was decided and why — not ' +
    'who said it, and not how they phrased it.');
});
